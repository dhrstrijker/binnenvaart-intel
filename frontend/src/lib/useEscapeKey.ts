import { useEffect } from "react";

export function useEscapeKey(callback: () => void): void {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") callback();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [callback]);
}
