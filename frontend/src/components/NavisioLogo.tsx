"use client";

interface NavisioLogoProps {
  size?: "sm" | "md" | "lg";
  variant?: "light" | "dark";
}

const sizeConfig = {
  sm: { text: "text-xl", gap: "gap-0.5", height: "h-[6px]" },
  md: { text: "text-2xl", gap: "gap-1", height: "h-[8px]" },
  lg: { text: "text-4xl", gap: "gap-1.5", height: "h-[10px]" },
};

export default function NavisioLogo({
  size = "md",
  variant = "light",
}: NavisioLogoProps) {
  const config = sizeConfig[size];
  const textColor = variant === "light" ? "text-white" : "text-slate-900";

  return (
    <div className={`inline-flex flex-col ${config.gap} self-start`}>
      <span
        className={`${config.text} font-bold tracking-[-0.03em] ${textColor}`}
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        NAVISIO
      </span>
      <svg
        className={`w-full ${config.height}`}
        viewBox="0 0 120 10"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M 0 5 Q 15 1 30 5 T 60 5 T 90 5 T 120 5"
          stroke="#06B6D4"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
