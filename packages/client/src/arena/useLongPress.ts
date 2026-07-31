// Langes Druecken erkennen, ohne den normalen Tap zu stoeren.

import { useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { LONG_PRESS_MS } from './fx';

/** Langes Drücken (Touch oder Maus) erkennen, ohne den normalen Tap zu stören. */
export function useLongPress(onLongPress: (() => void) | undefined, ms = LONG_PRESS_MS) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    fired,
    handlers: {
      onPointerDown: () => {
        if (!onLongPress) return;
        fired.current = false;
        clear();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, ms);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onContextMenu: (e: ReactMouseEvent) => {
        if (onLongPress) e.preventDefault();
      }
    }
  };
}
