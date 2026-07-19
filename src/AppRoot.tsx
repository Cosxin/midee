import { Show } from 'solid-js'
import { SHOW_FPS } from './env'
import { ModeSwitch } from './modes/ModeSwitch'
import { PiPage } from './pi/PiPage'
import { isPiPage } from './pi/piRoute'
import { FpsOverlay } from './ui/FpsOverlay'

// The Raspberry Pi LED verification surface lives on its own page (`?pi=1`),
// built off the normal player UI. The default page carries no Pi/LED chrome.
// Solid-owned root. Hosts <ModeSwitch/> (mode shells return null until
// T5–T8 fill them); <Portal/> + <Toast/> land with T17.
export function AppRoot() {
  return (
    <>
      <ModeSwitch />
      <Show when={isPiPage()}>
        <PiPage />
      </Show>
      <Show when={SHOW_FPS}>
        <FpsOverlay />
      </Show>
    </>
  )
}
