import { useEffect, type RefObject } from "react";

export function useOutsideClick(
  ref: RefObject<HTMLElement | null>,
  callback: () => void,
  active = true,
  ignoreRefs?: RefObject<HTMLElement | null>[],
): void {
  useEffect(() => {
    if (!active) return;
    function handleClick(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (ignoreRefs?.some((r) => r.current?.contains(e.target as Node))) {
          return;
        }
        callback();
      }
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [ref, callback, active, ignoreRefs]);
}
