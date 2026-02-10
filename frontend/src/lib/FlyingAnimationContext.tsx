"use client";

import React, { createContext, useContext, useCallback, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type IconType = "heart" | "bell";

interface FlyingElement {
  id: number;
  icon: IconType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  createdAt: number;
}

interface FlyingAnimationContextValue {
  registerTarget: (name: string, getRect: () => DOMRect | null) => void;
  flyTo: (targetName: string, sourceRect: DOMRect, icon: IconType) => void;
}

const FlyingAnimationContext = createContext<FlyingAnimationContextValue | null>(null);

export function useFlyingAnimation() {
  return useContext(FlyingAnimationContext);
}

export function FlyingAnimationProvider({ children }: { children: React.ReactNode }) {
  const targets = useRef<Map<string, () => DOMRect | null>>(new Map());
  const [elements, setElements] = useState<FlyingElement[]>([]);
  const flyIdRef = useRef(0);

  // Safety cleanup: remove flying elements older than 2s in case onAnimationComplete fails
  useEffect(() => {
    if (elements.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      setElements((prev) => prev.filter((e) => now - e.createdAt < 2000));
    }, 2000);
    return () => clearTimeout(timer);
  }, [elements]);

  const registerTarget = useCallback((name: string, getRect: () => DOMRect | null) => {
    targets.current.set(name, getRect);
  }, []);

  const flyTo = useCallback((targetName: string, sourceRect: DOMRect, icon: IconType) => {
    const getRect = targets.current.get(targetName);
    if (!getRect) return;
    const targetRect = getRect();
    if (!targetRect) return;

    const id = ++flyIdRef.current;
    const el: FlyingElement = {
      id,
      icon,
      startX: sourceRect.left + sourceRect.width / 2,
      startY: sourceRect.top + sourceRect.height / 2,
      endX: targetRect.left + targetRect.width / 2,
      endY: targetRect.top + targetRect.height / 2,
      createdAt: Date.now(),
    };
    setElements((prev) => [...prev, el]);
  }, []);

  // On arrival, pulse the target icon via CSS class toggle on [data-fly-target] elements
  const handleComplete = useCallback((id: number, targetName: string, icon: IconType) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    const targetEl = document.querySelector(`[data-fly-target="${targetName}"]`);
    if (targetEl) {
      const colorClass = icon === "heart" ? "animate-target-catch-heart" : "animate-target-catch-bell";
      targetEl.classList.add(colorClass);
      setTimeout(() => targetEl.classList.remove(colorClass), 500);
    }
  }, []);

  return (
    <FlyingAnimationContext.Provider value={{ registerTarget, flyTo }}>
      {children}
      {/* Portal for flying elements */}
      <div className="pointer-events-none fixed inset-0 z-[100]">
        <AnimatePresence>
          {elements.map((el) => {
            const targetName = el.icon === "heart" ? "favorites" : "notifications";
            // Gentle arc: control point offset slightly left of the straight line
            // and 30% of the way from start to end vertically
            const midX = el.startX + (el.endX - el.startX) * 0.3 - 40;
            const midY = el.startY + (el.endY - el.startY) * 0.3;
            return (
              <motion.div
                key={el.id}
                initial={{ x: el.startX - 10, y: el.startY - 10, scale: 1, opacity: 1 }}
                animate={{
                  x: [el.startX - 10, midX - 10, el.endX - 10],
                  y: [el.startY - 10, midY - 10, el.endY - 10],
                  scale: [1, 0.7, 0.4],
                  opacity: 1,
                }}
                transition={{ duration: 0.5, ease: [0.32, 0, 0.24, 1] }}
                onAnimationComplete={() => handleComplete(el.id, targetName, el.icon)}
                className="absolute h-5 w-5"
              >
                {el.icon === "heart" ? (
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clipRule="evenodd" />
                  </svg>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </FlyingAnimationContext.Provider>
  );
}
