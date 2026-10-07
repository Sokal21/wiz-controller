import { useEffect, useRef } from 'react';
import { lampColors, onLampColors, toCss } from '../lib/lampColors';

/** A swatch showing the live color of a lamp. Repaints itself without going through React. */
export function LampDot({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const paint = () => {
      if (ref.current) ref.current.style.background = toCss(lampColors.get(id));
    };
    paint();
    return onLampColors(paint);
  }, [id]);

  return <span ref={ref} className="h-3.5 w-3.5 shrink-0 rounded-full border border-line" aria-hidden />;
}
