import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marktanalyse",
  description:
    "Marktinzichten voor de binnenvaart: prijstrends, aanbodanalyse en bronvergelijking van 5 scheepsmakelaars.",
  alternates: {
    canonical: "https://navisio.nl/analytics",
  },
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
