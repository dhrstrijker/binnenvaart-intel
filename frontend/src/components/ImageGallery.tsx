"use client";

import React, { useState } from "react";
import Image from "next/image";

interface ImageGalleryProps {
  imageUrl: string | null;
}

export default function ImageGallery({ imageUrl }: ImageGalleryProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="min-w-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100">
        {imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt="Vessel photo"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 560px"
            priority
            onError={() => setImgError(true)}
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
    </div>
  );
}
