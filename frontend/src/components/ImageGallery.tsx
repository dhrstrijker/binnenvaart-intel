"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import type { Vessel } from "@/lib/supabase";

interface ImageGalleryProps {
  imageUrl: string | null;
  imageUrls: Vessel["image_urls"];
}

export default function ImageGallery({ imageUrl, imageUrls }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imgError, setImgError] = useState<Set<number>>(new Set());

  const images = useMemo(() => {
    const result: string[] = [];
    if (imageUrls && imageUrls.length > 0) {
      for (const item of imageUrls) {
        if (typeof item === "string") {
          if (item) result.push(item);
        } else if (item && typeof item === "object") {
          const url = item.original || item.thumbnail;
          if (url) result.push(url);
        }
      }
    }
    if (result.length === 0 && imageUrl) {
      result.push(imageUrl);
    }
    return result;
  }, [imageUrl, imageUrls]);

  const handleError = (index: number) => {
    setImgError((prev) => new Set(prev).add(index));
  };

  const currentSrc = images[selectedIndex];
  const hasError = imgError.has(selectedIndex);

  return (
    <div>
      {/* Main image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        {currentSrc && !hasError ? (
          <Image
            src={currentSrc}
            alt="Vessel photo"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 560px"
            priority={selectedIndex === 0}
            onError={() => handleError(selectedIndex)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-20 w-20 text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={`relative h-[60px] w-[80px] shrink-0 overflow-hidden rounded-lg bg-slate-100 transition-all ${
                i === selectedIndex
                  ? "ring-2 ring-cyan-500 ring-offset-1"
                  : "ring-1 ring-slate-200 hover:ring-slate-300"
              }`}
            >
              <Image
                src={src}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
                onError={() => handleError(i)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
