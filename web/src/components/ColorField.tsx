import { useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

const HEX = /^#[0-9a-fA-F]{6}$/;

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

/** A swatch with the hex value; clicking it unfolds the picker in place. */
export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-dim">{label}</span>
        <input
          className="field !w-24 tabular-nums"
          aria-label={`${label} hex value`}
          value={text}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            if (HEX.test(event.target.value)) onChange(event.target.value.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
        <button
          type="button"
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-line"
          style={{ background: value }}
          aria-label={`${open ? 'Close' : 'Open'} ${label} picker`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
      </div>
      {open && (
        <div className="mt-2">
          <HexColorPicker color={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
