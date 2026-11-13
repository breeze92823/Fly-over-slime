// Colyseus link to Fly-over-slime-backend (room "world"): loads and saves the player's progress and
// shares the room, so everyone sees everyone else. Never throws and never blocks play: with no
// server (or an unreachable one) the game runs solo on its localStorage copy.
//
// Saving: a signed-in player's server document is the real save. On join the server answers
// `progress` (its copy replaces this tab's cache) or `noProgress` (a new account: this tab's
// progress becomes the first save, unless the cache belongs to another account). Nothing is
// saved until that answer arrived (`net.hydrated`), and a `serverError` (the save could not be
// read) keeps saving off so it is never overwritten. Guests are never saved server-side.
//
// Presence: this player's pose / animation state goes out as `pose` (~10/s), the equipped gear as
// `loadout` and the Bloxity look as `setAvatar`; remotePlayers.js draws the others from the room
// state (net.players).
import { Client } from '@colyseus/sdk'
import { DEV_MODE, NET, SERVER_URL } from './config.js'
import {
  authState,
  canResolveServer,
  getEquippedAvatar,
  getPfp,
  getToken,
  registerPlayWithFriends,
  getProportions,
  getSkinTextureUrl,
  launchRef,
  launchRoomId,
  locateRoom,
  onAvatarChanged,
  onProportionsChanged,
  resolveServerEndpoint,
  subscribeAuth,
  updateRoom,
} from './bloxity.js'
import { friends, getOwner, hydrate, onChange, resetSave, setOwner, snapshot, state, titleById, titleOwned } from './state.js'

export const net = {
  room: null,
  connected: false,
  hydrated: false, // a progress / noProgress answer arrived: saving is allowed
  leaderboard: null, // the last `leaderboard` message
  get sessionId() {
    return this.room?.sessionId ?? null
  },
  get players() {
    return this.room?.state?.players ?? null
  },
}

const listeners = {} // type -> Set(fn): 'hydrated', 'leaderboard', 'connection'
function emit(type, msg) {
  for (const fn of listeners[type] ?? []) {
    try {
      fn(msg)
    } catch (err) {
      console.warn('[net] listener threw', type, err)
    }
  }
}
export function onNet(type, fn) {
  ;(listeners[type] ??= new Set()).add(fn)
  return () => listeners[type].delete(fn)
}

// --- Identity ----------------------------------------------------------------
// Signed-in players use their Bloxity id; everyone else a per-browser guest id (never saved).
// Dev mode (no SDK) plays as a persistent dev account; `?as=2` gives a second tab its own.
const rand = () => Math.random().toString(36).slice(2, 8)
function stored(key, make) {
  try {
    let id = localStorage.getItem(key)
    if (!id) localStorage.setItem(key, (id = make()))
    return id
  } catch {
    return make()
  }
}
const GUEST = stored('fos-guest', () => `guest-${rand()}`)
const DEV_AS = (() => {
  try {
    return new URLSearchParams(location.search).get('as') || ''
  } catch {
    return ''
  }
})()

function identity() {
  if (DEV_MODE) {
    const id = `dev-${DEV_AS || 'main'}`
    return { userId: id, username: DEV_AS ? `Dev ${DEV_AS}` : 'Dev', token: '' }
  }
  const u = authState.user
  const id = u && (u._id || u.id || u.userId || u.uid)
  // A deployed server trusts only the verified `token` (backend bloxity.ts); `userId` is for local dev.
  if (!id) return { userId: GUEST, username: authState.guest?.displayName || authState.guest?.username || 'Guest', token: '' }
  return { userId: String(id), username: String(u.displayName || u.username || u.name || 'Player'), token: getToken() }
}
const isGuestId = (id) => id.startsWith('guest-')

let sentId = '' // identity the server currently attributes saves to
let loadedId = '' // identity whose saved progress this tab already loaded

// --- Saving ------------------------------------------------------------------
let lastSaved = ''
let saveTimer = 0
let firstDirty = 0

export function saveNow() {
  clearTimeout(saveTimer)
  saveTimer = 0
  firstDirty = 0
  if (!net.connected || !net.hydrated || isGuestId(sentId)) return
  const snap = JSON.stringify(snapshot())
  if (snap === lastSaved) return
  lastSaved = snap
  send('saveProgress', JSON.parse(snap))
}

function scheduleSave() {
  if (!net.connected || !net.hydrated || isGuestId(sentId)) return
  const now = performance.now()
  if (!firstDirty) firstDirty = now
  clearTimeout(saveTimer)
  const wait = Math.min(NET.saveDebounce * 1000, Math.max(0, firstDirty + NET.saveMaxWait * 1000 - now))
  saveTimer = setTimeout(saveNow, wait)
}

// --- Presence ----------------------------------------------------------------
let poseAt = 0
let lastPose = ''
const cm = (n) => Math.round(n * 100) / 100

// { x, y, z, yaw, speed, vy, grounded, flying, pitch, roll, training }: at most every NET.poseEvery s
// and only when something changed (the server keeps the last one).
export function sendPose(p) {
  if (!net.connected) return
  const now = performance.now()
  if (now - poseAt < NET.poseEvery * 1000) return
  const msg = { x: cm(p.x), y: cm(p.y), z: cm(p.z), yaw: cm(p.yaw), speed: cm(p.speed), vy: cm(p.vy), grounded: !!p.grounded, flying: !!p.flying, pitch: cm(p.pitch), roll: cm(p.roll), training: !!p.training }
  const key = Object.values(msg).join()
  if (key === lastPose) return
  poseAt = now
  lastPose = key
  send('pose', msg)
}

// Equipped gear the others draw: slingshot, trail, title and the equipped pets.
function loadout() {
  const t = titleById(state.title)
  return {
    sling: state.equippedSling,
    trail: state.trail,
    title: t && titleOwned(t) ? t.id : '',
    pets: state.pets.filter((p) => p.equipped).map((p) => ({ id: p.id, tier: p.tier })),
  }
}
let sentLoadout = ''
function syncLoadout() {
  if (!net.connected) return
  const l = loadout()
  const key = JSON.stringify(l)
  if (key === sentLoadout) return
  sentLoadout = key
  send('loadout', l)
}

// The signed-in player's Bloxity look for the others' copy of them: { equipped, proportions, skin } as
// JSON ('' = guest / signed out: the default character). The skin URL is dropped if the payload would
// pass the server's cap (backend AVATAR_MAX_LEN).
const AVATAR_MAX = 3000
function avatarJson() {
  const equipped = authState.user ? getEquippedAvatar() : null
  if (!equipped) return ''
  const look = { equipped, proportions: getProportions() ?? null, skin: getSkinTextureUrl() }
  let json = JSON.stringify(look)
  if (json.length > AVATAR_MAX) json = JSON.stringify({ ...look, skin: null })
  return json.length > AVATAR_MAX ? '' : json
}
let sentAvatar = ''
function syncAvatar() {
  if (!net.connected) return
  const json = avatarJson()
  if (json === sentAvatar) return
  send('setAvatar', { avatar: (sentAvatar = json) })
}

// An emote started from the portal's wheel ('' = stopped), relayed so the others play it too.
export function sendEmote(id) {
  send('emote', { id: id || '' })
}

// The server's clock (ms), measured on the load answer: emote start times are server time.
let clockOffset = 0
export const serverNow = () => Date.now() + clockOffset

// A direct Bloxity invite we sent to friend `friendId` (the server credits them when they join).
export function sendInvited(friendId) {
  send('invited', { friendId })
}
// Re-read the friends-joined count (a friend may have been credited in another room).
export function refreshInvites() {
  send('inviteRefresh', {})
}

export function send(type, payload) {
  try {
    net.room?.send(type, payload)
  } catch (err) {
    console.warn('[net] send failed', type, err)
  }
}

// --- Connection --------------------------------------------------------------
function attach(room) {
  net.room = room
  net.connected = true
  lastPose = ''
  sentLoadout = JSON.stringify(loadout()) // sent with the join options
  room.onMessage('progress', (doc) => {
    if (typeof doc?.serverTime === 'number') clockOffset = doc.serverTime - Date.now()
    net.hydrated = true
    lastSaved = ''
    // A reconnect under the same identity: this tab is newer than the save (it may hold changes the
    // debounce had not sent yet), so push it rather than load over it.
    if (loadedId === sentId || !doc) return saveNow()
    loadedId = sentId
    if (!isGuestId(sentId)) setOwner(sentId)
    hydrate(doc)
    lastSaved = JSON.stringify(snapshot()) // what the server holds: do not echo it back
    emit('hydrated')
  })
  room.onMessage('noProgress', (msg) => {
    if (typeof msg?.serverTime === 'number') clockOffset = msg.serverTime - Date.now()
    net.hydrated = true
    lastSaved = ''
    loadedId = sentId
    emit('noProgress')
    if (!isGuestId(sentId)) {
      // A new account. This tab's progress becomes its first save, unless that progress belongs to a
      // different account (never carry one player's cache into another's save).
      const owner = getOwner()
      if (owner && owner !== sentId) {
        resetSave()
        emit('hydrated')
      }
      setOwner(sentId)
      saveNow()
    }
  })
  room.onMessage('serverError', () => {
    // The save exists but could not be read: never overwrite it.
    net.hydrated = false
    console.warn('[net] the server could not read the saved progress; saving is off for this session')
  })
  // Invites (backend invite.ts): how many friends joined through our invites (the Friend Boost), a
  // friend who just joined, and who invited us.
  room.onMessage('invite', (m) => {
    friends.joined = Math.max(0, Number(m?.joined) || 0)
    friends.sent = Math.max(0, Number(m?.sent) || 0)
    friends.guest = !!m?.guest
    emit('invite', m)
  })
  room.onMessage('friendJoined', (m) => emit('friendJoined', m))
  room.onMessage('invitedBy', (m) => emit('invitedBy', m))
  room.onMessage('leaderboard', (msg) => {
    net.leaderboard = msg ?? null
    emit('leaderboard', net.leaderboard)
  })
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.hydrated = false
    emit('connection', false)
    updateRoom('')
    setTimeout(connect, 3000) // keep trying; solo play is unaffected meanwhile
  })
  emit('connection', true)
}

// A configured SERVER_URL wins; otherwise the Bloxity matchmaker picks the pod (the dev channel
// reaches the dev backend, prod the prod one). A friend invite / Open Rooms link (?roomId=) joins
// that room when it can be found.
async function open(id) {
  if (SERVER_URL) return { client: new Client(SERVER_URL), roomId: '', relay: '' }
  const want = launchRoomId()
  if (want) {
    const found = await locateRoom(want).catch(() => null)
    if (found) return { client: new Client(found.endpoint), roomId: found.roomId, relay: found.relayRoomId }
  }
  const { endpoint, relayRoomId } = await resolveServerEndpoint(isGuestId(id.userId) ? '' : id.userId)
  return { client: new Client(endpoint), roomId: '', relay: relayRoomId }
}

let connecting = false
let getPoseOnJoin = null
async function connect() {
  if (!(SERVER_URL || canResolveServer()) || connecting || net.connected) return
  connecting = true
  try {
    const id = identity()
    sentId = id.userId
    const { client, roomId, relay } = await open(id)
    const options = { ...id, ref: launchRef(), pfp: getPfp(), avatar: (sentAvatar = avatarJson()), loadout: loadout(), pose: getPoseOnJoin?.() }
    const room = roomId ? await client.joinById(roomId, options) : await client.joinOrCreate('world', options)
    attach(room)
    // The portal's invites and Open Rooms land in this room.
    // The plain Colyseus room id: the one Bloxity's room directory lists (api.bloxity.io/v1/games/<slug>/rooms)
    // and puts in ?roomId= links. (The "<relay>~<room>" form is only for CrazyGames invites.)
    updateRoom(room.roomId)
    console.info('[net] joined room', room.roomId, relay ? `(relay ${relay})` : '', 'as', id.userId)
    registerPlayWithFriends()
  } catch (err) {
    console.info('[net] could not reach the server; playing solo', err?.message ?? err)
    setTimeout(connect, NET.retry * 1000)
  } finally {
    connecting = false
  }
}

// `pose()` returns this player's current pose (sent with the join so the others draw the newcomer at
// once). Safe to call without a server configured.
export function initNet({ pose } = {}) {
  getPoseOnJoin = pose ?? null
  if (!SERVER_URL && !canResolveServer()) return console.info('[net] no server configured; playing solo')
  onChange(() => {
    scheduleSave()
    syncLoadout()
  })
  setInterval(() => {
    saveNow() // playtime and boost timers change without a state change
    syncLoadout()
  }, NET.saveEvery * 1000)
  // The first ready call connects; later ones are sign-in / sign-out.
  subscribeAuth((s) => {
    if (!s.ready) return
    if (!net.connected) return void connect()
    syncAvatar()
    const id = identity()
    if (id.userId === sentId) return send('identify', { username: id.username, pfp: getPfp() })
    saveNow() // under the old id, before switching
    net.hydrated = false
    sentId = id.userId
    send('identify', { ...id, pfp: getPfp() }) // incl. the token the server verifies
  })
  onAvatarChanged(syncAvatar)
  onProportionsChanged(syncAvatar)
  window.addEventListener('beforeunload', saveNow)
  window.addEventListener('pagehide', saveNow)
  document.addEventListener('visibilitychange', () => document.hidden && saveNow())
}
