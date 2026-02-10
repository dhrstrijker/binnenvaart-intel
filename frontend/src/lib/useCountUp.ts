import { useEffect, useRef, useState } from "react";

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Animates a number from ~80% of the target to the target value.
 * Starts when `enabled` becomes true, runs once.
 */
export function useCountUp(
  target: number,
  options?: { duration?: number; enabled?: boolean }
): number {
  const duration = options?.duration ?? 800;
  const enabled = options?.enabled ?? false;
  const [value, setValue] = useState(target);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!enabled || hasRun.current || target <= 0) {
      setValue(target);
      return;
    }

    hasRun.current = true;
    const startValue = Math.round(target * 0.8);
    const range = target - startValue;
    let startTime: number | null = null;
    let rafId: number;

    function tick(timestamp: number) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      setValue(Math.round(startValue + range * eased));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, target, duration]);

  return value;
}
