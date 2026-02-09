import { useEffect } from "react";

export function useBodyScrollLock(): void {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
}
