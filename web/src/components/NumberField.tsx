import { useEffect, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/** Number input that only reports valid values and lets the user type freely in between. */
export function NumberField({ label, value, min, max, step = 0.1, unit, onChange }: NumberFieldProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => setText(String(value)), [value]);

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-dim">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input
        className="field tabular-nums"
        type="number"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value === '' || !Number.isFinite(parsed)) return;
          if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) return;
          onChange(parsed);
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}
