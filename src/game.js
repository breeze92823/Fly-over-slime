import { Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3, AdditiveBlending, DoubleSide } from 'three'
import {
  CHANNEL,
  CHEST,
  EGGS,
  FLIGHT,
  FLY_ZONE,
  BOOSTS,
  DAILY,
  INDEX_LUCK,
  PLAYTIME,
  PASSES,
  PLATFORMS,
  SKILL_PACKS,
  SLINGSHOTS,
  SPAWN,
  STAND_PETS,
  TRAILS,
  skipRebirthPrice,
  TRAIN,
  WORLD2_SKILL,
  rebirthCost,
} from './config.js'
import { inputState, onKey } from './input.js'
import { player, resetPlayer, setPlayerOverride } from './player.js'
import { syncYawToPlayer } from './camera.js'
import * as bloxity from './bloxity.js'
import { buildSlingshot, fmtShort, makeSign } from './props.js'
import { animatePet, buildPet } from './petModels.js'
import { createFlight } from './flight.js'
import { createTraining } from './training.js'
import { createEggs } from './eggs.js'
import { petThumb } from './hud.js'
import { sfx, setMusicOn, setSfxOn } from './audio/index.js'
import {
  addPet,
  addSkill,
  dailyClaimable,
  petLook,
  titleOwned,
  titleById,
  rollDaily,
  rebirthLevel,
  petStorage,
  nextStoragePrice,
  nextSlotPrice,
  canRebirth,
  changed,
  equipBest,
  hasPass,
  nextRebirthCost,
  petById,
  petSlots,
  platformUnlocked,
  rebirthMult,
  skillPerClick,
  slingById,
  state,
  trailById,
  winsMult,
} from './state.js'

// Gameplay: training clicks, slingshot pads, training tables, eggs + hatching,
// limited pet stands, the flight over the slime, rebirths, passes / packs /
// trails, the rewards chest and playtime gifts, pets following the player,
// the held slingshot, name tag and leaderboards. Driven once per frame by main.js.

const fmt = (n) => Math.round(n).toLocaleString('en-US')
const BOT_NAMES = ['SlimeSurfer', 'SkyHopper', 'BrickBaron', 'NovaKid', 'PixelPilot', 'JellyJumper', 'TurboTomas', 'CloudRider', 'StudMaster', 'GreenGlider', 'ZoomZebra', 'MintyMoss']
const BOT_COLORS = ['#ff6a6a', '#5fb4ff', '#ffd23a', '#7dff7d', '#c98cff', '#ff9a3a', '#6ff0ff', '#ff8fd8', '#a8ff5a', '#f2f2f2', '#3a8cff', '#ffb6c8']

export function createGame({ scene, camera, fx, props, hud }) {
  const sessionStart = performance.now()
  const sessionMinutes = () => (performance.now() - sessionStart) / 60000
  let windowOpen = false

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------
  function spend(price) {
    if (state.wins < price) {
      hud.toast(`Not enough Wins! Need ${fmtShort(price - state.wins)} more`, '#ff6a6a')
      sfx.deny()
      return false
    }
    state.wins -= price
    state.stats.spent += price
    return true
  }
  function celebrate(color = ['#ffd23a', '#5fe0ff', '#ff6ad5', '#7dff7d']) {
    const p = player.position
    fx.burst(40, { x: p.x, y: p.y + 2, z: p.z, spread: 1, speed: 7, up: 1.2, gravity: -14, drag: 1, life: 1.4, size: 0.35, color, additive: false, shape: 'square' })
    fx.burst(18, { x: p.x, y: p.y + 1.5, z: p.z, spread: 1.5, speed: 3, life: 0.9, size: 0.7, color: '#ffffff', shape: 'star' })
  }
  function doRebirth() {
    state.skill = 0
    state.totalSkill = 0
    state.rebirths++
    sfx.rebirth()
    hud.toast(`Rebirth ${state.rebirths}! Now x${rebirthMult()} Skill`, '#6fd4ff')
    const p = player.position
    fx.burst(70, { x: p.x, y: p.y + 1, z: p.z, spread: 0.5, speed: 9, up: 0.3, drag: 2, life: 1.2, size: 0.6, color: ['#ff3b4e', '#2f9bff', '#ffffff'], shape: 'star' })
    ringPulse(p.x, p.y + 0.2, p.z, '#6fd4ff')
    changed()
    hud.refreshWindow()
  }
  // Daily / Playtime reward payout: { boost, n } | { pet } | { sling }.
  function grant(r) {
    if (r.boost) {
      state.potions[r.boost] += r.n ?? 1
      sfx.gift('potion')
      hud.toast(`+${r.n ?? 1} ${BOOSTS[r.boost].name}${(r.n ?? 1) > 1 ? 's' : ''}! (Inventory > Items)`, BOOSTS[r.boost].color)
    } else if (r.pet) {
      addPet(r.pet)
      rebuildPets()
      sfx.gift('pet')
      hud.toast(`${petById(r.pet).name} joined you!`, '#ff8fd8')
    } else if (r.sling) {
      if (!state.slingshots.includes(r.sling)) state.slingshots.push(r.sling)
      state.equippedSling = r.sling
      sfx.gift('bolt')
      hud.toast(`${slingById(r.sling).name} unlocked! +${fmtShort(slingById(r.sling).skill)} Skill per click`, '#c98cff')
    }
  }
  // The Settings window: sound, music, effects, HUD and pets visibility.
  function applySettings() {
    const st = state.settings
    setSfxOn(st.sfx)
    setMusicOn(st.music)
    fx.setEnabled?.(st.effects)
    petRoot.visible = !st.hidePets
    document.body.classList.toggle('hide-hud', !!st.hideHud)
  }
  function refreshBadge() {
    const mins = sessionMinutes()
    hud.setBadge(PLAYTIME.filter((g, i) => mins >= g.at && !state.claimedGifts.includes(i)).length)
  }
  const actions = {
    sessionMinutes,
    windowOpened: (on) => (windowOpen = on),
    toggle(key) {
      state[key] = !state[key]
      if (key === 'autoFly' && state.autoFly && !fl.active()) teleportToZone()
      changed()
    },
    buyPass(id) {
      if (hasPass(id)) return hud.toast('Already owned!', '#ffd23a')
      const p = PASSES.find((x) => x.id === id)
      if (!spend(p.price)) return
      state.passes[id] = true
      if (id === 'starter') {
        addSkill(2500 * rebirthMult())
        state.tokens += 10
        addPet('fox')
        rebuildPets()
      }
      if (id === 'petslot') equipBest()
      sfx.purchase()
      hud.toast(`${p.name} unlocked!`, '#7dff7d')
      celebrate()
      changed()
      hud.refreshWindow()
    },
    buyPack(id) {
      const p = SKILL_PACKS.find((x) => x.id === id)
      if (!spend(p.price)) return
      addSkill(p.amount)
      sfx.purchase()
      hud.toast(`+${fmt(p.amount)} Skill!`, '#5fe0ff')
      celebrate(['#5fe0ff', '#ffffff', '#3f8cff'])
      changed()
    },
    buyStand(id) {
      const sp = STAND_PETS.find((x) => x.id === id)
      if (!spend(sp.price)) return
      addPet(sp.id)
      sfx.purchase()
      hud.toast(`${sp.name} joined you!`, '#ff8fd8')
      celebrate()
      rebuildPets()
      changed()
      hud.refreshWindow()
    },
    rebirth() {
      if (!canRebirth()) {
        sfx.deny()
        return hud.toast(`Reach Level ${fmt(rebirthLevel())} to rebirth`, '#ff6a6a')
      }
      doRebirth()
    },
    skipRebirth() {
      if (canRebirth()) return doRebirth()
      if (!spend(skipRebirthPrice(state.rebirths))) return
      doRebirth()
    },
    togglePet(uid) {
      const pet = state.pets.find((p) => p.uid === uid)
      if (!pet) return
      if (!pet.equipped && state.pets.filter((p) => p.equipped).length >= petSlots()) {
        sfx.deny()
        return hud.toast(`Only ${petSlots()} pets can be equipped`, '#ff6a6a')
      }
      pet.equipped = !pet.equipped
      sfx.pop(pet.equipped)
      rebuildPets()
      changed()
      hud.refreshWindow()
    },
    equipBest() {
      equipBest()
      sfx.equip()
      rebuildPets()
      changed()
      hud.refreshWindow()
    },
    unequipAll() {
      for (const p of state.pets) p.equipped = false
      sfx.pop(false)
      rebuildPets()
      changed()
      hud.refreshWindow()
    },
    deletePet(uid) {
      const pet = state.pets.find((p) => p.uid === uid)
      if (!pet) return
      if (pet.equipped) {
        sfx.deny()
        return hud.toast('Unequip a pet before deleting it', '#ff6a6a')
      }
      state.pets = state.pets.filter((p) => p.uid !== uid)
      sfx.trash()
      changed()
      hud.refreshWindow()
    },
    deleteUnequipped() {
      const n = state.pets.filter((p) => !p.equipped).length
      state.pets = state.pets.filter((p) => p.equipped)
      sfx.trash()
      hud.toast(`Removed ${n} pets`, '#ffffff')
      changed()
      hud.refreshWindow()
    },
    buySlot() {
      const price = nextSlotPrice()
      if (price == null) return hud.toast('Pet slots are maxed!', '#ffd23a')
      if (!spend(price)) return
      state.extraSlots++
      sfx.purchase()
      hud.toast(`+1 Pet Slot! (${petSlots()} equipped)`, '#7dff7d')
      changed()
      hud.refreshWindow()
    },
    buyStorage() {
      const price = nextStoragePrice()
      if (price == null) return hud.toast('Storage is maxed!', '#ffd23a')
      if (!spend(price)) return
      state.storageBuys++
      sfx.purchase()
      hud.toast(`Pet storage is now ${petStorage()}!`, '#7dff7d')
      changed()
      hud.refreshWindow()
    },
    buyTrail(id) {
      const t = TRAILS.find((x) => x.id === id)
      if (!t || state.trails.includes(id)) return
      if (!spend(t.price)) return
      state.trails.push(id)
      state.trail = id
      sfx.purchase()
      hud.toast(`${t.name} unlocked! x${t.mult} Wins`, '#7dff7d')
      celebrate(t.colors)
      changed()
      hud.refreshWindow()
    },
    equipTrail(id) {
      if (id && !state.trails.includes(id)) return
      state.trail = id
      if (id) sfx.equip()
      else sfx.pop(false)
      changed()
      hud.refreshWindow()
    },
    equipSling(id) {
      if (!state.slingshots.includes(id) || state.equippedSling === id) return
      state.equippedSling = id
      sfx.equip()
      hud.toast(`Equipped ${slingById(id).name}`, '#7dff7d')
      changed()
      hud.refreshWindow()
    },
    useBoost(kind) {
      const b = BOOSTS[kind]
      if (!state.potions[kind]) {
        sfx.deny()
        return hud.toast(`No ${b.name}s left! Get them from Daily and Playtime Rewards`, '#ff6a6a')
      }
      state.potions[kind]--
      state.boostLeft[kind] += b.minutes * 60
      sfx.drink()
      hud.toast(`${b.name} active! x${b.mult} for ${b.minutes} min`, b.color)
      changed()
      hud.refreshWindow()
      hud.tick()
    },
    equipTitle(id) {
      const t = id ? titleById(id) : null
      if (t && !titleOwned(t)) return sfx.deny()
      state.title = id
      if (t) sfx.fanfare()
      else sfx.pop(false)
      updateNameTag()
      changed()
      hud.refreshWindow()
    },
    setSetting(key, value) {
      state.settings[key] = value
      applySettings()
      changed()
      hud.refreshWindow()
    },
    claimIndexLuck() {
      const earned = Math.floor(state.discovered.length / INDEX_LUCK.every)
      if (earned <= state.indexClaims) return sfx.deny()
      const n = earned - state.indexClaims
      state.indexClaims = earned
      sfx.gift('clover')
      hud.toast(`Index Luck +${Math.round(n * INDEX_LUCK.pct * 100)}%!`, '#7dff5a')
      celebrate(['#7dff5a', '#ffffff', '#2fbf3a'])
      changed()
      hud.refreshWindow()
    },
    claimDaily(i) {
      rollDaily()
      if (i >= state.daily.unlocked || state.daily.claimed.includes(i)) return sfx.deny()
      state.daily.claimed.push(i)
      state.stats.dailyClaims++
      const r = DAILY[i]
      if (r.sling && state.slingshots.includes(r.sling)) {
        for (const x of r.again) grant(x)
        hud.toast('Day 7 again: 3 of every Boost!', '#ffd23a')
      } else grant(r)
      celebrate()
      changed()
      hud.refreshWindow()
    },
    claimPlaytime(i) {
      const g = PLAYTIME[i]
      if (state.claimedGifts.includes(i) || sessionMinutes() < g.at) return
      if (g.egg && !actions.hatch(g.egg, 1, { free: true })) return
      state.claimedGifts.push(i)
      if (g.wins) {
        state.wins += g.wins * rebirthMult()
        sfx.gift('trophy')
        hud.toast(`+${fmt(g.wins * rebirthMult())} Wins!`, '#ffd23a')
      }
      if (g.skill) {
        addSkill(g.skill * rebirthMult())
        sfx.gift('bolt')
        hud.toast(`+${fmt(g.skill * rebirthMult())} Skill!`, '#5fe0ff')
      }
      if (g.boost) grant({ boost: g.boost, n: 1 })
      if (!g.egg) celebrate()
      changed()
      hud.refreshWindow()
      refreshBadge()
    },
    openItems() {
      hud.openInventoryTab?.('items')
    },
    hatch(eggId, n = 1, opts) {
      return eggs.hatch(eggId, n, opts)
    },
    trainHold(on) {
      trainHeld = on
    },
  }

  // ---------------------------------------------------------------------------
  // Training
  // ---------------------------------------------------------------------------
  let trainHeld = false
  let keyTrain = false
  let trainTimer = 0
  let currentTable = null
  // pops, sounds, streak, level ups, table effects, arm spring: training.js
  // Every trampoline landing on a training table counts as one training click.
  const onBounce = () => {
    if (!fl.active() && !windowOpen && !eggs.busy()) train(true)
  }
  const training = createTraining({ scene, camera, fx, player, tables: props.tables, onBounce })
  const slingPos = new Vector3()
  function train(bounce = false) {
    const mult = currentTable && platformUnlocked(currentTable.data) ? currentTable.data.mult : 1
    const gain = skillPerClick(mult)
    addSkill(gain)
    training.shot({ gain, mult, table: currentTable, bounce, from: !bounce && heldSling ? heldSling.getWorldPosition(slingPos) : null })
    if (state.autoRebirth && canRebirth()) actions.rebirth()
    changed()
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.target?.tagName === 'CANVAS' && e.button === 0 && e.pointerType === 'mouse') trainHeld = true
  })
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') trainHeld = false
  })
  window.addEventListener('blur', () => {
    trainHeld = false
    keyTrain = false
  })

  // E: buy at a prompt / else hold to train. At an egg, eggs.js owns E / R / T.
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (e.code === 'KeyE') {
      if (eggs.near()) return
      if (buyInfo?.onBuy) buyInfo.onBuy()
      else keyTrain = true
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') keyTrain = false
  })

  // ---------------------------------------------------------------------------
  // Held slingshot, name tag, arm pose
  // ---------------------------------------------------------------------------
  let avatar = null
  let animator = null
  let heldSling = null
  let heldStyle = null
  let playerGroup = null
  let armBinding = null
  const holdQ = new Quaternion()
  const nameTag = makeSign(0.42)
  function attachSling() {
    if (!playerGroup) return
    const style = slingById(state.equippedSling)?.style ?? 'twig'
    if (heldSling && heldStyle === style && heldSling.parent) return
    heldSling?.parent?.remove(heldSling)
    heldStyle = style
    heldSling = buildSlingshot(style)
    heldSling.traverse((o) => (o.castShadow = true))
    const arm1 = avatar?.nodes?.ArmR1
    const arm2 = avatar?.nodes?.ArmR2
    armBinding = animator?.rig?.bindings?.find((b) => b.bone === arm1) ?? null
    if (arm1 && arm2 && armBinding) {
      // Solve the attach once in the hold pose so the slingshot then follows the arm.
      animator.rig.resetToBindPose()
      armBinding.bone.quaternion.premultiply(holdQ.setFromAxisAngle(armBinding.axisX, -1.25))
      playerGroup.updateMatrixWorld(true)
      const inv = new Matrix4().copy(playerGroup.matrixWorld).invert()
      const m1 = new Matrix4().multiplyMatrices(inv, arm1.matrixWorld)
      const m2 = new Matrix4().multiplyMatrices(inv, arm2.matrixWorld)
      const p1 = new Vector3().setFromMatrixPosition(m1)
      const p2 = new Vector3().setFromMatrixPosition(m2)
      const hand = p2.clone().add(p2.clone().sub(p1).multiplyScalar(0.95))
      const desired = new Matrix4().compose(hand.add(new Vector3(0, -0.25, 0.05)), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25), new Vector3(0.48, 0.48, 0.48))
      const local = new Matrix4().copy(m2).invert().multiply(desired)
      heldSling.matrixAutoUpdate = false
      heldSling.matrix.copy(local)
      arm2.add(heldSling)
    } else {
      heldSling.position.set(0.45, 0.75, 0.45)
      heldSling.scale.setScalar(0.48)
      playerGroup.add(heldSling)
    }
  }
  function setAvatar(group, av, anim) {
    playerGroup = group
    avatar = av
    animator = anim
    heldSling = null
    attachSling()
    if (!nameTag.parent) {
      nameTag.position.set(0, 2.75, 0)
      group.add(nameTag)
    }
  }
  function titleFor() {
    const t = titleById(state.title)
    return t && titleOwned(t) ? [t.name, t.color] : null
  }
  function updateNameTag() {
    const tt = titleFor()
    if (!tt) return nameTag.set([{ text: bloxity.displayName?.() || 'Player', size: 0.75 }])
    const [title, color] = tt
    nameTag.set([{ text: title, color, size: 1 }, { text: bloxity.displayName?.() || 'Player', size: 0.75 }])
  }

  // ---------------------------------------------------------------------------
  // Pads, tables, labels
  // ---------------------------------------------------------------------------
  function refreshPads() {
    for (const pad of props.pads) {
      const sl = SLINGSHOTS[pad.index]
      pad.setState(state.equippedSling === sl.id ? 'equipped' : state.slingshots.includes(sl.id) ? 'owned' : 'unlocked')
    }
  }
  function refreshTables() {
    for (const t of props.tables) {
      const p = t.data
      const open = platformUnlocked(p)
      const lines = []
      if (p.price) {
        lines.push({ text: 'All Worlds', size: 0.55 })
        lines.push({ text: fmtShort(p.price), icon: 'trophy', pill: true, size: 0.6 })
      } else lines.push({ text: `${p.rebirths}`, icon: 'rebirth', pill: true, size: 0.9 })
      lines.push({ text: open ? 'Unlocked' : 'Locked', color: open ? '#4dff4d' : '#ff4848', size: 0.6 })
      lines.push({ text: `${p.mult}x Skill`, size: 1 })
      t.sign.set(lines)
    }
  }
  let padInside = -1
  function checkPads() {
    const p = player.position
    let inside = -1
    for (const pad of props.pads) {
      if (Math.abs(p.x - pad.x) < pad.half && Math.abs(p.z - pad.z) < pad.half && p.y > pad.y - 0.2 && p.y < pad.y + 1.5) inside = pad.index
    }
    if (inside !== padInside && inside >= 0) {
      const sl = SLINGSHOTS[inside]
      if (state.slingshots.includes(sl.id)) {
        if (state.equippedSling !== sl.id) {
          state.equippedSling = sl.id
          hud.toast(`Equipped ${sl.name}`, '#7dff7d')
          training.equipSling()
          changed()
        }
      } else if (state.wins >= sl.price) {
        state.wins -= sl.price
        state.slingshots.push(sl.id)
        state.equippedSling = sl.id
        hud.toast(`Bought ${sl.name}! +${fmt(sl.skill)} Skill per click`, '#7dff7d')
        celebrate()
        training.buySling()
        changed()
      } else {
        hud.toast(`${sl.name} costs ${fmt(sl.price)} Wins`, '#ff6a6a')
        training.cantAfford()
      }
    }
    padInside = inside
  }
  let tableInside = null
  let tableToastAt = 0
  function checkTables(now) {
    const p = player.position
    let on = null
    for (const t of props.tables) {
      const d = Math.hypot(p.x - t.x, p.z - t.z)
      if (d < t.radius + 0.4 && p.y > t.topY - 0.5 && p.y < t.topY + TRAIN.bounceHeight * TRAIN.bounceBoost * 2 + 1.5) on = t
    }
    if (on !== tableInside) {
      tableInside = on
      training.enterTable(on)
      if (on && !platformUnlocked(on.data) && now - tableToastAt > 1500) {
        tableToastAt = now
        hud.toast(on.data.price ? `Locked: ${fmtShort(on.data.price)} Wins to unlock` : `Locked: needs ${on.data.rebirths} Rebirths`, '#ff6a6a')
      }
    }
    currentTable = on
    // ring glow under the player while training on an unlocked table
    if (on && platformUnlocked(on.data) && Math.random() < 0.3) fx.burst(1, { x: p.x, y: p.y + 0.1, z: p.z, spread: 1.5, speed: 1.2, lift: 2, life: 0.8, size: 0.3, color: '#ffd23a', shape: 'star' })
  }

  // ---------------------------------------------------------------------------
  // Eggs, stands, chest, portal (proximity prompts)
  // ---------------------------------------------------------------------------
  // Egg panel, hatching, Auto, the +3/+8/+16 upgrades: eggs.js.
  const eggs = createEggs({ camera, fx, props, hud, spend, celebrate, onPets: () => rebuildPets() })
  let nearEgg = null
  let buyInfo = null
  function checkNear() {
    const p = player.position
    nearEgg = eggs.near()?.data ?? null
    buyInfo = null
    if (fl.active()) {
      hud.showEggPrompt(null)
      return
    }
    if (!nearEgg) {
      for (const s of props.stands) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < 3.8) {
          const sp = s.data
          buyInfo = { key: sp.id, title: sp.name, img: petThumb(sp.id), text: `${sp.rarity} pet · +${fmt(sp.boost * 100)}% Skill`, price: sp.price, onBuy: () => actions.buyStand(sp.id) }
        }
      }
      if (tableInside && !platformUnlocked(tableInside.data) && tableInside.data.price) {
        const t = tableInside.data
        buyInfo = { key: t.id, title: `${t.mult}x Skill Table`, text: 'Unlock this training table for all worlds.', price: t.price, onBuy: () => buyTable(t) }
      }
    }
    if (buyInfo && !nearEgg) hud.showBuy(buyInfo)
    else hud.showEggPrompt(null)
  }
  function buyTable(t) {
    if (state.platforms.includes(t.id) || !spend(t.price)) return
    state.platforms.push(t.id)
    hud.toast(`${t.mult}x Skill table unlocked!`, '#7dff7d')
    celebrate()
    changed()
  }
  let chestNear = false
  function checkChest(nowMs) {
    const c = props.chest
    const p = player.position
    const near = Math.hypot(p.x - c.x, p.z - c.z) < 4.2
    const ready = nowMs >= state.chestAt
    if (near && !chestNear) {
      if (ready) {
        const w = CHEST.wins * rebirthMult()
        state.wins += w
        state.chestAt = nowMs + CHEST.cooldown * 1000
        state.stats.chests++
        sfx.gift('trophy')
        hud.toast(`Free Rewards! +${fmt(w)} Wins`, '#ffd23a')
        celebrate(['#ffd23a', '#ff3b3b', '#ffffff'])
        changed()
      } else hud.toast('Chest refills soon!', '#ffffff')
    }
    chestNear = near
  }
  let portalNear = false
  function checkPortal() {
    const p = player.position
    const near = Math.hypot(p.x - props.portal.x, p.z - props.portal.z) < 5
    if (near && !portalNear) hud.toast(state.bestSkill >= WORLD2_SKILL ? 'World 2 opens in the next update!' : `World 2 needs ${fmtShort(WORLD2_SKILL)} Skill`, '#ffd23a')
    portalNear = near
  }

  // ---------------------------------------------------------------------------
  // Flight over the slime: the whole sequence lives in flight.js (FLY button,
  // giant slingshots, arc, skips, reward, river regions, flight sounds).
  // ---------------------------------------------------------------------------
  const fl = createFlight({
    scene,
    fx,
    ringPulse: (...a) => ringPulse(...a),
    blocked: () => windowOpen || eggs.busy(),
    onDone: () => updateNameTag(),
  })
  const teleportToZone = () => fl.teleportToZone()

  // Expanding glow ring (launch, splash, rebirth).
  const rings = []
  function ringPulse(x, y, z, color, size = 6) {
    const m = new Mesh(new RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
    m.position.set(x, y, z)
    scene.add(m)
    rings.push({ m, t: 0, size })
  }
  function updateRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.t += dt
      const k = r.t / 0.8
      r.m.scale.setScalar(1 + k * r.size)
      r.m.material.opacity = 0.9 * (1 - k)
      if (k >= 1) {
        scene.remove(r.m)
        r.m.geometry.dispose()
        r.m.material.dispose()
        rings.splice(i, 1)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pets following the player
  // ---------------------------------------------------------------------------
  const petRoot = new Group()
  scene.add(petRoot)
  let petModels = [] // { uid, mesh, pos }
  function rebuildPets() {
    const eq = state.pets.filter((p) => p.equipped)
    const key = eq.map((p) => p.uid).join(',')
    if (petRoot.userData.key === key) return
    petRoot.userData.key = key
    for (const pm of petModels) petRoot.remove(pm.mesh)
    petModels = eq.map((p) => {
      const mesh = buildPet(petById(p.id).look)
      mesh.scale.setScalar(1.05)
      const pos = new Vector3(player.position.x, player.position.y, player.position.z + 2)
      mesh.position.copy(pos)
      petRoot.add(mesh)
      return { uid: p.uid, mesh, pos }
    })
  }
  const tmpV = new Vector3()
  function updatePets(dt, t) {
    const n = petModels.length
    const p = player.renderPosition
    const f = player.facing
    petModels.forEach((pm, i) => {
      // fan out behind the player
      const spread = (i - (n - 1) / 2) * 1.8
      const back = 2.4 + Math.abs(spread) * 0.3
      const bx = p.x - Math.sin(f) * back + Math.cos(f) * spread
      const bz = p.z - Math.cos(f) * back - Math.sin(f) * spread
      const fly = petById(state.pets.find((q) => q.uid === pm.uid)?.id)?.look?.wings
      const by = p.y + (fly ? 1.2 : 0) + Math.abs(Math.sin(t * 6 + i)) * (fl.active() ? 0 : 0.25)
      tmpV.set(bx, by, bz)
      if (pm.pos.distanceToSquared(tmpV) > 60 * 60) pm.pos.copy(tmpV)
      pm.pos.lerp(tmpV, 1 - Math.exp(-(fl.active() ? 14 : 7) * dt))
      pm.mesh.position.copy(pm.pos)
      pm.mesh.rotation.y = f
      animatePet(pm.mesh, t + i, true)
    })
  }

  // ---------------------------------------------------------------------------
  // Leaderboards, signs, gifts
  // ---------------------------------------------------------------------------
  function boardRows(myValue, unitFmt, scale) {
    const rows = BOT_NAMES.slice(0, 11).map((name, i) => ({ name, raw: scale * Math.pow(0.82, i) * (1 + (i * 37) % 7 * 0.01), color: BOT_COLORS[i] }))
    rows.push({ name: bloxity.displayName?.() || 'You', raw: myValue, color: '#7dff7d', me: true })
    rows.sort((a, b) => b.raw - a.raw)
    return rows.slice(0, 11).map((r) => ({ ...r, value: unitFmt(r.raw) }))
  }
  const hm = (s) => `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  function refreshBoards() {
    const lv = Math.floor(Math.sqrt(state.totalSkill / 0.8))
    props.boards[0].set(boardRows(state.bestSkill, fmtShort, 8.2e9))
    props.boards[1].set(boardRows(state.playTime, hm, 4.3e5))
    props.boards[2].set(boardRows(lv, fmt, 19091))
    props.boards[3].set(boardRows(state.wins, fmtShort, 6.2e9))
  }
  function refreshSigns(nowMs) {
    const left = Math.max(0, state.chestAt - nowMs) / 1000
    props.chest.sign.set([{ text: 'Free Rewards!', color: '#ffd23a', size: 1 }, { text: left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : 'Ready!', color: left > 0 ? '#ffffff' : '#7dff7d', size: 0.7 }])
    const d = new Date()
    const toMidnight = 86400 - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds())
    const hh = String(Math.floor(toMidnight / 3600)).padStart(2, '0')
    const mm = String(Math.floor((toMidnight % 3600) / 60)).padStart(2, '0')
    const ss = String(toMidnight % 60).padStart(2, '0')
    props.updateSign.set([{ text: 'Next Update!', size: 1 }, { text: `${hh}:${mm}:${ss}`, icon: 'clock', color: '#ffd23a', size: 0.8 }])
    refreshBadge()
    if (rollDaily()) {
      changed()
      if (hud.openId === 'daily') hud.refreshWindow()
    }
    hud.tick()
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  let secAcc = 1
  let boardAcc = 0
  let lastEquipped = null
  function update(dt, t) {
    const now = performance.now()
    const nowMs = Date.now()
    state.playTime += dt
    for (const k in state.boostLeft) {
      if (state.boostLeft[k] > 0) {
        state.boostLeft[k] = Math.max(0, state.boostLeft[k] - dt)
        if (state.boostLeft[k] === 0) {
          hud.toast(`${BOOSTS[k].name} ran out`, '#ffffff')
          changed()
        }
      }
    }

    // training (not while flying, hatching or in a window)
    const trainingNow = (trainHeld || keyTrain) && !fl.active() && !windowOpen && !eggs.busy()
    trainTimer -= dt
    if (trainingNow && trainTimer <= 0) {
      train()
      trainTimer = TRAIN.interval
    }

    lastDt = dt
    if (!fl.active()) {
      checkPads()
      checkTables(now)
      checkChest(nowMs)
      checkPortal()
    }
    eggs.update(dt, t, { blocked: fl.active() || windowOpen })
    checkNear()
    fl.update(dt, t)

    if (state.equippedSling !== lastEquipped) {
      lastEquipped = state.equippedSling
      refreshPads()
      attachSling()
    }
    if (heldSling) heldSling.visible = !fl.active()

    updatePets(dt, t)
    updateRings(dt)
    training.update(dt, { table: currentTable, active: !fl.active() })

    secAcc += dt
    if (secAcc >= 1) {
      secAcc = 0
      refreshSigns(nowMs)
      refreshTables()
    }
    boardAcc -= dt
    if (boardAcc <= 0) {
      boardAcc = 20
      refreshBoards()
    }
  }
  // After the animator: raise the right arm to hold the slingshot (with a pull-back on each shot).
  let lastDt = 1 / 60
  function afterAnimator() {
    if (playerGroup) fl.applyPose(playerGroup, lastDt)
    if (!armBinding || fl.active()) return
    armBinding.bone.quaternion.premultiply(holdQ.setFromAxisAngle(armBinding.axisX, -1.25 + training.armPull() * 0.5))
  }

  // initial state
  rollDaily()
  applySettings()
  rebuildPets()
  refreshPads()
  refreshTables()
  updateNameTag()
  bloxity.subscribeAuth?.(() => updateNameTag())

  return { actions, update, afterAnimator, setAvatar, isFlying: () => fl.active(), flight: fl, eggs }
}
