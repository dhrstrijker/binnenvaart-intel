"use client";

interface MarineTrafficMapProps {
  mmsi?: string;
  className?: string;
}

export default function MarineTrafficMap({
  mmsi = "244100879",
  className = "",
}: MarineTrafficMapProps) {
  const src = `https://www.marinetraffic.com/en/ais/embed/zoom:14/cenx:4.5/ceny:51.9/maptype:1/shownames:false/mmsi:${mmsi}/clicktoact:false`;

  return (
    <div
      className={`overflow-hidden rounded-2xl ring-1 ring-slate-200 ${className}`}
    >
      <iframe
        src={src}
        width="100%"
        height="100%"
        loading="lazy"
        style={{ border: "none" }}
        title="MarineTraffic kaart"
      />
    </div>
  );
}
