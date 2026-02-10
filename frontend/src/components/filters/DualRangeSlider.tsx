import React, { useCallback } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  step: number;
  values: [number, number];
  onChange: (v: [number, number]) => void;
  formatLabel: (v: number) => string;
}

export default function DualRangeSlider({
  min,
  max,
  step,
  values,
  onChange,
  formatLabel,
}: DualRangeSliderProps) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const handleMin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChange([Math.min(v, values[1] - step), values[1]]);
    },
    [values, step, onChange],
  );

  const handleMax = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChange([values[0], Math.max(v, values[0] + step)]);
    },
    [values, step, onChange],
  );

  return (
    <div className="py-3">
      {/* Edge labels */}
      <div className="mb-2 flex justify-between text-xs text-slate-400">
        <span>{formatLabel(min)}</span>
        <span>{formatLabel(max)}</span>
      </div>

      {/* Track + thumbs */}
      <div className="relative h-2">
        {/* Background track */}
        <div className="absolute inset-0 rounded-full bg-slate-200" />

        {/* Active range fill */}
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500"
          style={{
            left: `${pct(values[0])}%`,
            width: `${pct(values[1]) - pct(values[0])}%`,
          }}
        />

        {/* Min range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={values[0]}
          onChange={handleMin}
          className="dual-range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
          style={{ zIndex: values[0] > max - step ? 5 : 3 }}
        />

        {/* Max range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={values[1]}
          onChange={handleMax}
          className="dual-range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
}
