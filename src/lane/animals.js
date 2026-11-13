import { ANIMALS_A } from './animalsA.js'
import { ANIMALS_B } from './animalsB.js'
import { BOSSES, ENCOUNTERS_C } from './bossesHelpers.js'

// Registry of every lane model (hazards.js spawns them; stats live in config.js LANE).
//
// ENCOUNTER MODEL CONTRACT (animals, projectiles, helpers)
//   build(opts) -> model
//     opts = { scale: number (1 = default size), region: RIVER_REGIONS index, fx }
//   model = {
//     root: THREE.Group      hazards.js adds it to the scene and removes it at the end;
//                            the model sets root.position / rotation / scale itself
//                            (WORLD space) in every update().
//     update(s)              every frame while alive. `s` (read-only except noted):
//       s.phase    'tell' | 'attack' | 'hold' | 'recover'
//       s.k        0..1 within the phase ('attack' reaches 1 exactly at the strike)
//       s.phaseT   s into the phase, s.phaseDur = its length
//       s.t        s since spawn, s.dt frame dt, s.time global clock
//       s.hit      true once the strike connected (hold / recover), false = missed
//       s.home     Vector3 world: where the animal lives / starts (engine picks it)
//       s.target   Vector3 world: where the player will be at the strike moment
//       s.player   Vector3 world: the player's feet now
//       s.surface  slime surface y;  s.halfWidth lane half width (30)
//       s.side     -1 | 1: which bank it comes from (flyers / chargers / side sitters)
//       s.gap      { x0, x1 }: safe gap in world x (wall kinds)
//       s.length   z length of an area (bees, snail trail), centred on target.z
//       s.carry    m a carrier (pelican) drags the player back (+Z) during 'hold'
//       s.fx       particles: s.fx.burst(n, opts) (see fx.js)
//     grabPoint(out) -> out  world point where a held player's feet go (grab / carry / trap)
//     dispose?()
//   }
//
// BOSS MODEL CONTRACT
//   build(opts) -> boss = { root, update(b), muzzle(out) -> out (where projectiles leave) }
//     b.phase  'intro' | 'fight' | 'windup' | 'outro'   b.k 0..1 within the phase
//     b.player Vector3 (feet), b.vel Vector3 (player velocity), b.side -1 | 1,
//     b.surface, b.halfWidth, b.t, b.dt, b.time, b.aim Vector3 (the next attack's target), b.fx,
//     b.escaped (outro: true = player survived the boss, false = the flight ended first)

export const BUILDERS = { ...ANIMALS_A, ...ANIMALS_B, ...ENCOUNTERS_C }
export const BOSS_BUILDERS = BOSSES
