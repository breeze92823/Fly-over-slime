// Game audio, the one import the rest of the game uses:
//   import { sfx, installAudio, setSfxOn, setMusicOn } from './audio/index.js'
// installAudio() once at boot (the context starts on the first gesture). Every
// button press anywhere gets its click here (one capture-phase listener), so
// windows only add the result sounds (buy, deny, equip, claim...).
import { installAudio as installCore, setDucked, setMusicEnabled, setSfxEnabled } from './core.js'
import * as sfx from './sfx.js'
import { startMusic } from './music.js'

export { sfx, setDucked }
export { setAdMuted, setMusicLevel, setVolume } from './core.js'
export const setSfxOn = setSfxEnabled
export const setMusicOn = setMusicEnabled

function onPress(e) {
  if (e.button > 0) return
  const b = e.target.closest?.('button, [role="button"]')
  if (!b || b.disabled || b.dataset.silent != null) return
  const pan = Math.max(-0.6, Math.min(0.6, (e.clientX / window.innerWidth - 0.5) * 1.2))
  if (b.classList.contains('rw-tab')) sfx.tab()
  else if (b.classList.contains('rw-tile') || b.closest('.rw-grid')) sfx.tick(pan)
  else if (b.classList.contains('mbtn') || b.classList.contains('side-btn')) sfx.press(pan)
  else if (b.classList.contains('toggle')) sfx.toggle(!b.classList.contains('on'))
  else sfx.click(pan)
}

export function installAudio() {
  installCore()
  window.addEventListener('pointerdown', onPress, { capture: true, passive: true })
  startMusic()
}
