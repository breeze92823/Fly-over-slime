import {
  BOOSTS,
  DAILY,
  EGGS,
  EXTRA_SLOT_PRICES,
  GAME_SETTINGS,
  INDEX_LUCK,
  LEVEL,
  LIMITED_PETS,
  LIMITED_SLINGSHOTS,
  PASSES,
  PET_SLOTS,
  PET_STORAGE,
  PET_TIERS,
  PLATFORMS,
  SAVE_KEY,
  SLINGSHOTS,
  STAND_PETS,
  TITLES,
  TRAILS,
  rebirthCost,
} from './config.js'

// The player's progress: one plain object, saved to localStorage (debounced)
// on every change, plus the derived numbers (multipliers, level, costs).

const DEFAULT = () => ({
  v: 2,
  wins: 0,
  skill: 0, // current Skill (reset by rebirth)
  bestSkill: 0,
  totalSkill: 0, // Skill this rebirth, drives Level (reset by rebirth)
  rebirths: 0,
  tokens: 0,
  slingshots: ['twig'],
  equippedSling: 'twig',
  platforms: [], // bought "All Worlds" tables
  pets: [], // { uid, id, tier: '' | 'g' | 'd', equipped }
  nextUid: 1,
  discovered: [], // Index keys: pet id + tier ('pup', 'pup:g', 'pup:d')
  indexClaims: 0, // Index Luck rewards claimed (+1% luck each)
  trails: [],
  trail: '', // '' = none
  passes: {},
  extraSlots: 0, // pet slots bought with the Inventory "+"
  storageBuys: 0, // pet storage upgrades bought
  hatchMax: 1, // eggs one Open Max hatches (EGG_HATCH.upgrades: 3 / 8 / 16)
  autoRebirth: false,
  autoFly: false,
  playTime: 0, // s, lifetime
  flights: 0,
  bestDistance: 0,
  chestAt: 0, // epoch ms when the chest can be opened again
  claimedGifts: [], // Playtime Rewards indices claimed this session
  potions: { skill: 0, wins: 0, luck: 0 }, // boost potions owned
  boostLeft: { skill: 0, wins: 0, luck: 0 }, // s of active boost left
  daily: { unlocked: 0, last: -1, claimed: [] }, // days unlocked this cycle, local day index of the last unlock
  title: 'newbie',
  gear: {}, // Flight Gear levels by GEAR id (config.js)
  stats: { hatched: 0, mythics: 0, longFlights: 0, dailyClaims: 0, chests: 0, spent: 0, dodges: 0, closeCalls: 0, laneHits: 0, boosts: 0 },
  settings: Object.fromEntries(GAME_SETTINGS.map((s) => [s.key, s.def])),
})

const listeners = new Set()
let saveTimer = 0

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return DEFAULT()
}
// Older saves: fill new fields, map removed trails / tier-less pets.
function migrate(saved) {
  const d = DEFAULT()
  const s = { ...d, ...saved, claimedGifts: [] }
  for (const k of ['potions', 'boostLeft', 'daily', 'stats', 'settings', 'gear']) s[k] = { ...d[k], ...(saved[k] ?? {}) }
  s.pets = (s.pets ?? []).filter((p) => petById(p.id)).map((p) => ({ ...p, tier: p.tier ?? '' }))
  s.trails = (s.trails ?? []).filter((id) => TRAILS.some((t) => t.id === id))
  if (!s.trails.includes(s.trail)) s.trail = ''
  if (!TITLES.some((t) => t.id === s.title)) s.title = 'newbie'
  s.v = 2
  return s
}
export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}
export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function changed() {
  for (const fn of listeners) fn(state)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 400)
}
// The server's saved progress (net.js `progress`) over this one, in place so every module's
// `state` reference stays valid. Session-only fields (claimedGifts) are kept.
export function hydrate(doc) {
  const next = migrate(doc ?? {})
  next.claimedGifts = state.claimedGifts
  Object.assign(state, next)
  save()
  for (const fn of listeners) fn(state)
}
// What net.js sends as `saveProgress` (backend sanitize.ts): the whole state plus the Level.
export function snapshot() {
  const { claimedGifts, ...rest } = state
  return { ...rest, level: levelInfo().level }
}
// Which account the local copy belongs to ('' = a guest / nobody), so one account's cache is
// never uploaded as another's first save.
const OWNER_KEY = `${SAVE_KEY}-owner`
export const getOwner = () => {
  try {
    return localStorage.getItem(OWNER_KEY) || ''
  } catch {
    return ''
  }
}
export const setOwner = (id) => {
  try {
    localStorage.setItem(OWNER_KEY, id)
  } catch {
    /* ignore */
  }
}
export function resetSave() {
  Object.assign(state, DEFAULT())
  changed()
}

// --- Lookups -------------------------------------------------------------------------
export const ALL_PETS = [
  ...EGGS.flatMap((e) => e.pets.map((p) => ({ ...p, egg: e.id, eggName: e.name }))),
  ...STAND_PETS.map((p) => ({ ...p, egg: 'stand', eggName: 'Limited Stand' })),
  ...LIMITED_PETS.map((p) => ({ ...p, egg: 'limited', eggName: p.source })),
]
export const petById = (id) => ALL_PETS.find((p) => p.id === id)
export const tierById = (id) => PET_TIERS.find((t) => t.id === (id ?? '')) ?? PET_TIERS[0]
export const ALL_SLINGSHOTS = [...SLINGSHOTS, ...LIMITED_SLINGSHOTS]
export const slingById = (id) => ALL_SLINGSHOTS.find((s) => s.id === id)
export const trailById = (id) => TRAILS.find((t) => t.id === id)
export const titleById = (id) => TITLES.find((t) => t.id === id)
export const hasPass = (id) => !!state.passes[id]
export const passById = (id) => PASSES.find((p) => p.id === id)
// Pet look with the tier's colours (golden / diamond).
export function petLook(id, tier = '') {
  const base = petById(id)?.look ?? {}
  const t = tierById(tier)
  return t.look ? { ...base, ...t.look } : base
}
export const indexKey = (id, tier = '') => (tier ? `${id}:${tier}` : id)

// Loaded here: migrate() needs the lookups above.
export const state = load()

// Index Master needs every Basic pet except the Secret ones.
const INDEX_MASTER_PETS = () => ALL_PETS.filter((p) => p.rarity !== 'Secret')

// --- Titles ----------------------------------------------------------------------------
// Progress toward a title's requirement (n = target).
export function titleStat(stat) {
  if (stat === 'flights') return state.flights
  if (stat === 'bestDistance') return state.bestDistance
  if (stat === 'rebirths') return state.rebirths
  if (stat === 'playTime') return Math.floor(state.playTime)
  if (stat === 'indexBasic') return INDEX_MASTER_PETS().filter((p) => state.discovered.includes(p.id)).length
  return state.stats[stat] ?? 0
}
export function titleTarget(t) {
  if (!t.req) return 0
  return t.req.n < 0 ? INDEX_MASTER_PETS().length : t.req.n
}
export function titleOwned(t) {
  if (!t || t.special) return false
  if (!t.req) return true
  return titleStat(t.req.stat) >= titleTarget(t)
}
export function titleBonus(kind) {
  const t = titleById(state.title)
  return titleOwned(t) ? (t.bonus?.[kind] ?? 0) : 0
}

// --- Derived -------------------------------------------------------------------------
export const rebirthMult = () => state.rebirths + 1
export const petSlots = () => PET_SLOTS + (hasPass('petslot') ? 1 : 0) + state.extraSlots
export const nextSlotPrice = () => EXTRA_SLOT_PRICES[state.extraSlots] ?? null
export const petStorage = () => PET_STORAGE.base + PET_STORAGE.step * state.storageBuys
export const nextStoragePrice = () => PET_STORAGE.prices[state.storageBuys] ?? null
export const boostActive = (kind) => state.boostLeft[kind] > 0
export const boostMult = (kind) => (boostActive(kind) ? BOOSTS[kind].mult : 1)
export const petPower = (p) => (petById(p.id)?.boost ?? 0) * tierById(p.tier).mult
export function petBoost() {
  let b = 0
  for (const p of state.pets) if (p.equipped) b += petPower(p)
  return 1 + b
}
// Flight Gear (config GEAR, the Gear window): level 0 = not bought.
export const gearLevel = (id) => Math.max(0, Math.floor(state.gear?.[id] ?? 0))
export const trailMult = () => trailById(state.trail)?.mult ?? 1
export const winsMult = () => trailMult() * (hasPass('wins2x') ? 2 : 1) * (1 + titleBonus('wins')) * boostMult('wins')
export const indexLuck = () => state.indexClaims * INDEX_LUCK.pct
export const luckMult = () => (1 + titleBonus('luck') + indexLuck()) * boostMult('luck')
export function platformUnlocked(p) {
  if (p.price) return state.platforms.includes(p.id)
  return state.rebirths >= p.rebirths
}
export const platformById = (id) => PLATFORMS.find((p) => p.id === id)
// Skill per training click (platformMult = the table you stand on).
export function skillPerClick(platformMult = 1) {
  const sl = slingById(state.equippedSling) ?? SLINGSHOTS[0]
  return sl.skill * platformMult * rebirthMult() * petBoost() * (hasPass('skill2x') ? 2 : 1) * (1 + titleBonus('skill')) * boostMult('skill')
}
export const nextRebirthCost = () => rebirthCost(state.rebirths)

// Level from Skill earned this rebirth: cost of L -> L+1 is a + b*L.
function levelFor(T) {
  const { a, b } = LEVEL
  const A = b / 2
  const B = a - b / 2
  let L = Math.floor((-B + Math.sqrt(B * B + 4 * A * T)) / (2 * A))
  const cum = (n) => a * n + (b * n * (n - 1)) / 2
  while (cum(L + 1) <= T) L++
  while (L > 0 && cum(L) > T) L--
  return { L, base: cum(L), need: a + b * L }
}
export function levelInfo() {
  const T = state.totalSkill
  const { L, base, need } = levelFor(T)
  return { level: L + 1, progress: Math.min(1, (T - base) / need) }
}
// Rebirth needs a Level: the level that the old Skill cost reached (same economy).
export const rebirthLevel = (r = state.rebirths) => levelFor(rebirthCost(r)).L + 1
export const canRebirth = () => levelInfo().level >= rebirthLevel()
export const rebirthProgress = () => Math.min(1, levelInfo().level / rebirthLevel())

export function addSkill(n) {
  state.skill += n
  state.totalSkill += n
  if (state.skill > state.bestSkill) state.bestSkill = state.skill
}
export function discover(id, tier = '') {
  const k = indexKey(id, tier)
  if (!state.discovered.includes(k)) state.discovered.push(k)
}
export function addPet(id, tier = '') {
  const pet = { uid: state.nextUid++, id, tier, equipped: false }
  state.pets.push(pet)
  discover(id, tier)
  // auto-equip into a free slot, or replace the weakest if this is better
  const eq = state.pets.filter((p) => p.equipped)
  if (eq.length < petSlots()) pet.equipped = true
  else {
    const weakest = eq.reduce((a, b) => (petPower(a) <= petPower(b) ? a : b))
    if (petPower(pet) > petPower(weakest)) {
      weakest.equipped = false
      pet.equipped = true
    }
  }
  return pet
}
export function equipBest() {
  for (const p of state.pets) p.equipped = false
  const sorted = [...state.pets].sort((a, b) => petPower(b) - petPower(a))
  sorted.slice(0, petSlots()).forEach((p) => (p.equipped = true))
}

// --- Daily Rewards (local calendar days) ----------------------------------------------------
export const localDay = (ms = Date.now()) => {
  const d = new Date(ms)
  return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000)
}
// Unlock today's day if a new day began. Returns true if something changed.
export function rollDaily() {
  const d = state.daily
  const today = localDay()
  if (d.last === today) return false
  if (d.claimed.length >= DAILY.length) {
    d.claimed = []
    d.unlocked = 0
  }
  d.unlocked = Math.min(DAILY.length, d.unlocked + 1)
  d.last = today
  return true
}
export const dailyClaimable = () => Array.from({ length: state.daily.unlocked }, (_, i) => i).filter((i) => !state.daily.claimed.includes(i))
export function msToNextDay() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next - now
}
