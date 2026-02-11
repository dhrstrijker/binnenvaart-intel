import React, { useState, useRef, useEffect, useCallback, useId } from "react";
import DualRangeSlider from "./DualRangeSlider";

interface RangePopoverProps {
  id?: string;
  title: string;
  cfg: { min: number; max: number; step: number };
  presets: { label: string; min: number; max: number }[];
  currentMin: string;
  currentMax: string;
  formatLabel: (v: number) => string;
  formatDisplay: (v: number) => string;
  onApply: (min: string, max: string) => void;
  onClose: () => void;
}

export default function RangePopover({
  id,
  title,
  cfg,
  presets,
  currentMin,
  currentMax,
  formatLabel,
  formatDisplay,
  onApply,
  onClose,
}: RangePopoverProps) {
  const [values, setValues] = useState<[number, number]>([
    currentMin ? Number(currentMin) : cfg.min,
    currentMax ? Number(currentMax) : cfg.max,
  ]);
  const titleId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valuesRef = useRef<[number, number]>(values);

  const commitValues = useCallback(
    (v: [number, number]) => {
      onApply(
        v[0] === cfg.min ? "" : String(v[0]),
        v[1] === cfg.max ? "" : String(v[1]),
      );
    },
    [cfg.min, cfg.max, onApply],
  );

  const flushPending = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      commitValues(valuesRef.current);
    }
  }, [commitValues]);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  function applyValues(v: [number, number]) {
    setValues(v);
    valuesRef.current = v;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commitValues(v);
      debounceRef.current = null;
    }, 200);
  }

  function handlePreset(preset: { min: number; max: number }) {
    flushPending();
    const v: [number, number] = [preset.min, preset.max];
    setValues(v);
    valuesRef.current = v;
    commitValues(v);
  }

  function handleClear() {
    flushPending();
    setValues([cfg.min, cfg.max]);
    valuesRef.current = [cfg.min, cfg.max];
    onApply("", "");
    onClose();
  }

  const isDefault = values[0] === cfg.min && values[1] === cfg.max;

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="absolute left-1/2 top-full z-50 mt-3 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
    >
      {/* Title */}
      <h3 id={titleId} className="mb-5 text-center text-base font-semibold text-slate-800">
        {title}
      </h3>

      {/* Slider */}
      <div className="mb-4 px-2">
        <DualRangeSlider
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          values={values}
          onChange={applyValues}
          formatLabel={formatLabel}
        />
      </div>

      {/* Current range display */}
      <div className="mb-5 text-center">
        <span className="inline-block rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
          {isDefault
            ? "Alle"
            : `${formatDisplay(values[0])} – ${formatDisplay(values[1])}`}
        </span>
      </div>

      {/* Presets */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {presets.map((p) => {
          const active = values[0] === p.min && values[1] === p.max;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={handleClear}
          className={`text-sm font-medium transition ${
            isDefault ? "text-slate-300 cursor-default" : "text-slate-500 underline hover:text-slate-700"
          }`}
          disabled={isDefault}
        >
          Wis filters
        </button>
        <button
          type="button"
          onClick={() => {
            flushPending();
            onClose();
          }}
          className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Toon resultaten
        </button>
      </div>
    </div>
  );
}
