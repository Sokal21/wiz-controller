import { useEffect } from 'react';
import { activeScene, flashPad, select, tapBeat, toggleLook, useStore } from './store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Keyboard control for playing live: digits toggle looks, the pad keys flash, space taps the beat. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;

      const scene = activeScene(useStore.getState().app);
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        select([]);
      } else if (key === ' ') {
        // Space would also press whichever button has focus.
        event.preventDefault();
        tapBeat();
      } else if (scene && /^[1-9]$/.test(key)) {
        const look = scene.looks[Number(key) - 1];
        if (look) toggleLook(look.id);
      } else {
        const pad = scene?.pads.find((candidate) => candidate.key === key);
        if (pad) flashPad(pad.color);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
