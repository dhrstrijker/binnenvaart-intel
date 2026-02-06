"use client";

interface NavisioLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
}

const sizeConfig = {
  sm: { text: "text-xl", wave: "w-20", gap: "gap-0.5" },
  md: { text: "text-2xl", wave: "w-28", gap: "gap-1" },
  lg: { text: "text-4xl", wave: "w-40", gap: "gap-1.5" },
};

export default function NavisioLogo({
  size = "md",
  variant = "light",
}: NavisioLogoProps) {
  const config = sizeConfig[size];
  const textColor = variant === "light" ? "text-white" : "text-slate-900";

  return (
    <div className={`flex flex-col ${config.gap}`}>
      <span
        className={`${config.text} font-bold tracking-[-0.03em] ${textColor}`}
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        NAVISIO
      </span>
      <svg
        className={config.wave}
        viewBox="0 0 400 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 0 10 Q 50 5 100 10 T 200 10 T 300 10 T 400 10"
          stroke="#06B6D4"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
