import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prijzen - Navisio Pro",
  description:
    "Upgrade naar Navisio Pro voor prijsgeschiedenis, marktanalyse, prijstrend-indicatoren en e-mail notificaties.",
  alternates: {
    canonical: "https://navisio.nl/pricing",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
