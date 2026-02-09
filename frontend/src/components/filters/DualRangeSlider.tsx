import React, { useRef, useCallback, useEffect } from "react";

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
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"min" | "max" | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const snap = (raw: number) => Math.max(min, Math.min(max, Math.round(raw / step) * step));

  const handleMove = useCallback(
    (clientX: number) => {
      if (!trackRef.current || !draggingRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + fraction * (max - min);
      const snapped = snap(raw);
      const cur = valuesRef.current;

      let next: [number, number];
      if (draggingRef.current === "min") {
        next = [Math.min(snapped, cur[1] - step), cur[1]];
      } else {
        next = [cur[0], Math.max(snapped, cur[0] + step)];
      }
      valuesRef.current = next;
      onChange(next);
    },
    [min, max, step, onChange],
  );

  useEffect(() => {
    if (!draggingRef.current) return;

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    };
    const onUp = () => { draggingRef.current = null; };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  });

  function startDrag(thumb: "min" | "max") {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      draggingRef.current = thumb;
    };
  }

  function handleTrackClick(e: React.MouseEvent) {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const raw = min + fraction * (max - min);
    const snapped = snap(raw);
    const distToMin = Math.abs(snapped - values[0]);
    const distToMax = Math.abs(snapped - values[1]);
    if (distToMin <= distToMax) {
      onChange([Math.min(snapped, values[1] - step), values[1]]);
    } else {
      onChange([values[0], Math.max(snapped, values[0] + step)]);
    }
  }

  return (
    <div className="py-3">
      {/* Edge labels */}
      <div className="mb-2 flex justify-between text-xs text-slate-400">
        <span>{formatLabel(min)}</span>
        <span>{formatLabel(max)}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer rounded-full bg-slate-200"
        onClick={handleTrackClick}
      >
        {/* Active range fill */}
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500"
          style={{
            left: `${pct(values[0])}%`,
            width: `${pct(values[1]) - pct(values[0])}%`,
          }}
        />

        {/* Min thumb */}
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-cyan-500 bg-white shadow-md transition-transform hover:scale-110 active:scale-110 active:cursor-grabbing"
          style={{ left: `${pct(values[0])}%` }}
          onMouseDown={startDrag("min")}
          onTouchStart={startDrag("min")}
        />

        {/* Max thumb */}
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-cyan-500 bg-white shadow-md transition-transform hover:scale-110 active:scale-110 active:cursor-grabbing"
          style={{ left: `${pct(values[1])}%` }}
          onMouseDown={startDrag("max")}
          onTouchStart={startDrag("max")}
        />
      </div>
    </div>
  );
}
