// The Bloxity (Legion) SDK facade. Every SDK call goes through here. Nothing
// here may throw when the SDK is missing: a blocked sdk.bloxity.io leaves the
// game fully playable on the default avatar and keyboard controls.
// Docs: https://docs.bloxity.io/#html5
import { GAME_SLUG, GAME_TITLE, SETTINGS, DEV_MODE, coerceSetting } from './config.js'

// Biggest party the room can seat (backend ROOM_MAX_CLIENTS is 50; parties are 2..100).
const MAX_PARTY = 8
// Hosted leaderboards (Legion.SDK.leaderboard). Ids are permanent and must match the backend's
// LB_BOARDS (constants.ts), which reports the scores from each signed-in player's save.
export const LEADERBOARDS = [
  { id: 'level', label: 'Level', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'skill', label: 'Best Skill', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'wins', label: 'Wins', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'distance', label: 'Longest Flight (m)', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
  { id: 'rebirths', label: 'Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]

export function sdk() {
  if (DEV_MODE) return null
  return (typeof window !== 'undefined' && window.Legion && window.Legion.SDK) || null
}

// --- State --------------------------------------------------------------
export const settings = {}
for (const key of Object.keys(SETTINGS)) settings[key] = coerceSetting(key, SETTINGS[key].def)

// `user` is only written from onUserChanged (re-reading getUser()). `ready`
// flips once auth has settled so the signed-in avatar load isn't pre-empted.
export const authState = { ready: false, user: null, guest: null }

let latestEquipped = null
let latestProportions = null
const avatarListeners = new Set()
const proportionListeners = new Set()
const authListeners = new Set()
const settingListeners = new Set()
const respawnListeners = new Set()
const emoteListeners = new Set()
const chatListeners = new Set()
const adBreakListeners = new Set()
const unsubscribers = []

function emit(listeners, ...args) {
  for (const fn of listeners) {
    try {
      fn(...args)
    } catch (err) {
      console.warn('[bloxity] listener threw', err)
    }
  }
}

// Fires on any customizer change (may fire twice: optimistic, then confirmed;
// keep handlers idempotent). Each returns an unsubscribe.
export function onAvatarChanged(fn) {
  avatarListeners.add(fn)
  return () => avatarListeners.delete(fn)
}
export function onProportionsChanged(fn) {
  proportionListeners.add(fn)
  return () => proportionListeners.delete(fn)
}
export function subscribeAuth(fn) {
  authListeners.add(fn)
  fn(authState)
  return () => authListeners.delete(fn)
}
// fn(key, value) on every change of a SETTINGS key (already coerced).
export function onSetting(fn) {
  settingListeners.add(fn)
  return () => settingListeners.delete(fn)
}
// The portal's own pause-menu "Respawn" button.
export function onRespawnRequest(fn) {
  respawnListeners.add(fn)
  return () => respawnListeners.delete(fn)
}
// The portal's emote wheel picked emote `id` (Legion.SDK.player 'play_emote'): fn(id).
export function onEmote(fn) {
  emoteListeners.add(fn)
  return () => emoteListeners.delete(fn)
}
// Every Bloxity chat message: fn({ userId, username, text, isLocalPlayer }), `text` already made
// safe for a bubble (chat.bubbleText: a GIF reads "sent a GIF").
export function onChat(fn) {
  chatListeners.add(fn)
  return () => chatListeners.delete(fn)
}
// Ad breaks (Bloxity rule: pause gameplay and mute while one plays): fn(true) at the start, fn(false) after.
export function onAdBreak(fn) {
  adBreakListeners.add(fn)
  return () => adBreakListeners.delete(fn)
}

// --- Auth ---------------------------------------------------------------
// The SDK fires onUserChanged immediately with a null user, then again once the
// portal handshake answers; a null user only settles auth after a grace period.
const GUEST_SETTLE_MS = 2500
let settleTimer = null

function settleAuth() {
  settleTimer = null
  if (authState.ready) return
  authState.ready = true
  emit(authListeners, authState)
}

function onUser() {
  const SDK = sdk()
  const user = SDK ? SDK.auth.getUser() : null
  latestEquipped = null // a different account's equip event must not linger
  latestProportions = null

  if (user || authState.ready) {
    if (settleTimer) clearTimeout(settleTimer)
    settleTimer = null
    authState.ready = true
  } else if (!settleTimer) {
    settleTimer = setTimeout(settleAuth, GUEST_SETTLE_MS)
  }
  authState.user = user
  try {
    authState.guest = user || typeof SDK.auth.getGuest !== 'function' ? null : SDK.auth.getGuest()
  } catch {
    authState.guest = null
  }
  emit(authListeners, authState)
}

// Name for the HUD badge.
export function displayName() {
  const u = authState.user
  if (u) return u.displayName || u.username || u.name || 'Player'
  const g = authState.guest
  if (g) return g.displayName || g.username || g.name || 'Guest'
  return sdk() ? 'Guest' : 'Offline'
}

// The player's Bloxity profile picture (user, else the guest's derived one) as an absolute
// http(s) URL, '' when there is none. Relative paths resolve against the CDN (staticUrl).
export function getPfp() {
  const raw = authState.user?.pfp || authState.guest?.pfp
  if (typeof raw !== 'string' || !raw) return ''
  try {
    let base = 'https://static.bloxity.io'
    try {
      base = sdk()?.environment?.()?.staticUrl || base
    } catch {
      // Older SDK builds have no environment().
    }
    const url = new URL(raw, base)
    return /^https?:$/.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// --- Init ---------------------------------------------------------------
let initialised = false

export function init() {
  if (initialised) return
  initialised = true

  const SDK = sdk()
  if (!SDK) {
    if (DEV_MODE) console.info('[bloxity] VITE_DEV_MODE=true: skipping SDK/CDN, running on the default avatar')
    else console.info('[bloxity] SDK not loaded: running offline on the default avatar')
    authState.ready = true
    emit(authListeners, authState)
    return
  }

  try {
    const onLocalhost = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    SDK.init(onLocalhost ? { gameSlug: GAME_SLUG, portalUrl: 'https://bloxity.io' } : { gameSlug: GAME_SLUG })
    SDK.game.loadingStep(`Loading ${GAME_TITLE}`)

    // Party play (before the first matchmaker request): friends who launch together land in one room.
    try {
      SDK.party?.enable?.({ maxPartySize: MAX_PARTY })
    } catch (err) {
      console.warn('[bloxity] party.enable failed', err)
    }
    // Leaderboards: declared here so the portal shows its trophy button; the game server reports
    // the scores (backend bloxity.ts) from each player's saved progress.
    try {
      SDK.leaderboard?.define?.(LEADERBOARDS)
    } catch (err) {
      console.warn('[bloxity] leaderboard.define failed', err)
    }
    // Emotes from the portal's emote wheel: main.js plays them on our avatar, net.js relays them.
    try {
      SDK.game.registerFeature?.('emotes')
    } catch {
      // Older SDK build.
    }
    // Ad breaks pause and mute the game. Screens declared, no gameplay banners.
    try {
      SDK.ads?.onBreakStart?.(() => emit(adBreakListeners, true))
      SDK.ads?.onBreakEnd?.(() => emit(adBreakListeners, false))
      SDK.ads?.declareScreens?.({ menu: {}, results: {}, gameplay: {} })
    } catch (err) {
      console.warn('[bloxity] ads setup failed', err)
    }
    // Chat: a bubble over whoever said it (main.js / remotePlayers.js).
    try {
      const off = SDK.chat?.onMessage?.((m) => {
        if (!m || typeof m !== 'object') return
        let text = ''
        try {
          text = SDK.chat.bubbleText ? SDK.chat.bubbleText(m) : ''
        } catch {
          text = ''
        }
        if (!text) text = m.isGif ? 'sent a GIF' : String(m.text ?? '')
        if (text) emit(chatListeners, { userId: String(m.userId ?? ''), username: String(m.username ?? ''), text, isLocalPlayer: !!m.isLocalPlayer })
      })
      if (typeof off === 'function') unsubscribers.push(off)
    } catch {
      // No chat in this SDK build.
    }

    for (const key of Object.keys(SETTINGS)) {
      const off = SDK.settings.listen(key, (raw) => {
        const next = coerceSetting(key, raw)
        if (settings[key] === next) return
        settings[key] = next
        emit(settingListeners, key, next)
      })
      if (typeof off === 'function') unsubscribers.push(off)
    }
    SDK.settings.triggerAll?.()

    unsubscribers.push(SDK.auth.onUserChanged(onUser))

    if (typeof SDK.avatar?.onAvatarChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onAvatarChanged((equipped) => {
          // The event payload wins over getEquipped(), which can lag the event.
          if (equipped && typeof equipped === 'object') latestEquipped = equipped
          emit(avatarListeners)
        }),
      )
    }
    if (typeof SDK.avatar?.onProportionsChanged === 'function') {
      unsubscribers.push(
        SDK.avatar.onProportionsChanged((proportions) => {
          if (proportions && typeof proportions === 'object') latestProportions = proportions
          emit(proportionListeners)
        }),
      )
    }

    unsubscribers.push(
      SDK.player.onEvent((event, data) => {
        if (event === 'respawn_request') emit(respawnListeners)
        else if (event === 'play_emote' && typeof data === 'string' && data) emit(emoteListeners, data)
      }),
    )

    SDK.game.loadingStep('Building the island')
  } catch (err) {
    console.warn('[bloxity] init failed; running without the SDK', err)
    authState.ready = true
    emit(authListeners, authState)
  }
}

export function loadingStep(text) {
  try {
    sdk()?.game.loadingStep(text)
  } catch {
    // Non-fatal.
  }
}

let announcedFirstFrame = false

// Call once the scene has rendered: tells the portal loading is done.
export function notifyFirstFrame() {
  if (announcedFirstFrame) return
  announcedFirstFrame = true
  const SDK = sdk()
  if (!SDK) return
  try {
    SDK.game.loadingEnd()
    SDK.game.gameplayStart()
    SDK.ads?.screen?.('gameplay')
  } catch {
    // Non-fatal.
  }
}

export function teardown() {
  for (const off of unsubscribers.splice(0)) {
    try {
      off()
    } catch {
      // Tearing down anyway.
    }
  }
  try {
    sdk()?.game.gameplayEnd()
  } catch {
    // Non-fatal.
  }
}

// --- Avatar accessors (null when the SDK is unavailable or the call throws) ---
export function getEquippedAvatar() {
  if (latestEquipped) return latestEquipped
  try {
    return sdk()?.avatar.getEquipped() ?? null
  } catch {
    return null
  }
}

// { height, shoulderWidth, armLength, legOffsetX, torsoScaleX, neckHeight,
// headScale }, normalised around 1.0; loader.js applyProportions() consumes it.
export function getProportions() {
  try {
    const current = sdk()?.avatar.getProportions()
    return latestProportions ? { ...current, ...latestProportions } : current ?? null
  } catch {
    return latestProportions
  }
}

// Skin texture URL with the worn face, shirt and pants already drawn on.
export function getSkinTextureUrl() {
  try {
    const url = sdk()?.avatar?.getSkinTextureUrl?.()
    return typeof url === 'string' && url ? url : null
  } catch {
    return null
  }
}

export const canCustomize = () => typeof sdk()?.avatar?.toggleCustomizer === 'function'

// Opens / closes the portal's avatar editor; edits come back through onAvatarChanged.
export function toggleCustomizer() {
  try {
    sdk()?.avatar.toggleCustomizer()
  } catch {
    // Ignore.
  }
}

// --- Game server ------------------------------------------------------
// Bloxity hosting has no fixed socket URL: the matchmaker picks a pod with room (or wakes one) and
// the SDK returns its endpoint (the dev channel reaches the dev backend, prod the prod one). Each
// endpoint is pinned to one pod, so net.js builds a new Client per resolve.
export function canResolveServer() {
  try {
    return typeof sdk()?.net?.resolveEndpoint === 'function'
  } catch {
    return false
  }
}
// { endpoint, relayRoomId }: relayRoomId is the matchmaker relay pinning the pod (the endpoint is
// {playUrl}/v1/ws/<relayRoomId>). Rejects (net.js retries with backoff) when the matchmaker can't answer.
export async function resolveServerEndpoint(userId) {
  const { endpoint, roomId, cold } = await sdk().net.resolveEndpoint(GAME_SLUG, userId ? { userId } : undefined)
  if (cold) console.info('[net] waking up a server...')
  return { endpoint, relayRoomId: roomId }
}

// The ?roomId= the page was opened with: the game page's Open Rooms Join button (a bare Colyseus
// room id) or a friend invite (what updateRoom() reported: "<relayRoomId>~<colyseusRoomId>").
export function launchRoomId() {
  try {
    return new URLSearchParams(location.search).get('roomId') || ''
  } catch {
    return ''
  }
}

// Where a launch room lives: { endpoint, roomId, relayRoomId }, or null when it is gone, full or
// can't be found. A bare id needs the matchmaker's cross-pod directory (a plain joinById through
// any relay would usually land on another pod); a relay~room id is joined through its relay.
export async function locateRoom(id) {
  const playUrl = (() => {
    try {
      return sdk()?.environment?.()?.playUrl
    } catch {
      return '' // Older SDK builds have no environment().
    }
  })()
  if (!playUrl || !id) return null
  const base = playUrl.replace(/\/$/, '')
  const [relay, roomId] = id.includes('~') ? id.split('~', 2) : ['', id]
  if (relay) return { endpoint: `${base.replace(/^http/i, 'ws')}/v1/ws/${encodeURIComponent(relay)}`, roomId, relayRoomId: relay }
  const res = await fetch(`${base}/v1/dir/${encodeURIComponent(GAME_SLUG)}/list`)
  const rooms = res.ok ? (await res.json())?.rooms ?? [] : []
  const r = rooms.find((r) => r.colyseusRoomId === roomId && !r.locked && r.players < r.maxPlayers)
  return r ? { endpoint: r.joinUrl, roomId: r.colyseusRoomId, relayRoomId: r.relayRoomId } : null
}

// Reports the room this player is in ('' = not in a joinable room), so the portal's friend invites
// land in it.
export function updateRoom(roomId) {
  try {
    sdk()?.game?.updateRoom?.(roomId)
  } catch {
    // Ignore.
  }
}

// --- Portal -----------------------------------------------------------
export function showMenu() {
  try {
    sdk()?.portal.showMenu(true)
  } catch {
    // Ignore.
  }
}

// Where Boxity draws its own controls over the game: the toolbar in the top-left corner and
// the chat feed under it, as [{ id, left, top, width, height }] in CSS px. fn runs now and on
// every change (resize, toolbar change). Without the SDK (dev mode, blocked CDN) it gets the
// default footprint the SDK itself assumes until the portal reports, so the HUD is laid out
// the same everywhere. Returns an unsubscribe.
export function onReservedAreas(fn) {
  try {
    const off = sdk()?.ui?.onReservedAreasChange?.((areas) => fn(Array.isArray(areas) ? areas : []))
    if (typeof off === 'function') return off
  } catch {
    // Fall back to the estimate below.
  }
  const update = () => fn(estimatedReservedAreas(window.innerWidth, window.innerHeight))
  window.addEventListener('resize', update)
  update()
  return () => window.removeEventListener('resize', update)
}

// The SDK's estimate (legion-sdk ui.estimatedAreas): an 8 px margin round one row of buttons,
// the whole width on narrow phones, and the chat feed under it.
function estimatedReservedAreas(w, h) {
  const compact = w < 640 || h <= 500
  const toolbarHeight = 16 + (w < 640 ? 32 : w < 768 ? 40 : 44)
  const chatWidth = compact ? Math.min(w * 0.7, 260) : Math.min(w * 0.8, 360)
  return [
    { id: 'toolbar', left: 0, top: 0, width: Math.min(w, w < 480 ? w : 330), height: toolbarHeight },
    { id: 'chat', left: 0, top: toolbarHeight, width: Math.round(chatWidth + 8), height: compact ? 140 : 180 },
  ]
}

// The player's Bloxity game token: the server verifies it (POST /v1/auth/game-token/verify) and trusts
// only the account id that comes back, never a client-sent id. '' for a guest / without the SDK.
export function getToken() {
  try {
    return sdk()?.auth?.getToken?.() || ''
  } catch {
    return ''
  }
}

// Tells the portal friends can join our room (invites / Open Rooms land in it). Once, after a join.
let friendsFeature = false
export function registerPlayWithFriends() {
  if (friendsFeature || !sdk()) return
  friendsFeature = true
  try {
    sdk().game?.registerFeature?.('play_with_friends')
  } catch {
    // Ignore.
  }
}

// Someone else entered the room (the portal's join feed / chat).
export function playerJoined(name) {
  try {
    if (name) sdk()?.game?.playerJoined?.(name)
  } catch {
    // Ignore.
  }
}

// Rewarded ads (Legion.SDK.ads): `rewardedReady()` is whether the portal can show one now (kept fresh
// in the background, so the UI can decide synchronously); `showRewarded(placement)` plays it and
// resolves true ONLY when the player watched it to the end (status 'completed'), the one case a
// reward may be granted. Placement names: lowercase letters, digits, hyphens.
let adReady = false
async function refreshAdReady() {
  try {
    adReady = !!(await sdk()?.ads?.isAvailable?.())
  } catch {
    adReady = false
  }
}
export const rewardedReady = () => adReady
export async function showRewarded(placement) {
  try {
    const r = await sdk()?.ads?.showRewarded?.(placement)
    return r?.status === 'completed'
  } catch {
    return false
  } finally {
    refreshAdReady()
  }
}
if (typeof window !== 'undefined') {
  setTimeout(refreshAdReady, 3000)
  setInterval(refreshAdReady, 30000)
}

// Which screen the player is on, for the portal's screen ads ('panel' while a menu window is open,
// 'gameplay' otherwise). A new call replaces the previous one.
export function adsScreen(type) {
  try {
    sdk()?.ads?.screen?.(type)
  } catch {
    // Ignore.
  }
}

// The Bloxity emote catalogue as Map(id -> clip { len, loop, tracks }), fetched once
// (GET {apiUrl}/v1/avatar/emotes). Empty without the SDK.
let emoteCatalog = null
export function emoteClips() {
  emoteCatalog ||= (async () => {
    const out = new Map()
    try {
      const api = sdk()?.environment?.()?.apiUrl
      if (!api) return out
      const res = await fetch(`${String(api).replace(/\/$/, '')}/v1/avatar/emotes`)
      const body = res.ok ? await res.json() : null
      for (const e of body?.emotes ?? []) if (e && typeof e.id === 'string' && e.clip?.tracks) out.set(e.id, e.clip)
    } catch (err) {
      console.warn('[bloxity] emote catalogue failed', err)
      emoteCatalog = null // try again next time
    }
    return out
  })()
  return emoteCatalog
}

// Opens the portal's leaderboard panel on board `id` (false when it can't).
export function openLeaderboard(id = LEADERBOARDS[0].id) {
  try {
    return !!sdk()?.leaderboard?.open?.(id)
  } catch {
    return false
  }
}

export function requestFullscreen(on) {
  try {
    const SDK = sdk()
    if (!SDK) return
    if (on) SDK.portal.requestFullscreen()
    else SDK.portal.exitFullscreen()
  } catch {
    // Ignore.
  }
}
