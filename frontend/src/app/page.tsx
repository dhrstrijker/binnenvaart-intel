import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Binnenvaartschepen te koop - Dashboard",
  description:
    "Bekijk alle binnenvaartschepen te koop bij 5 makelaars. Vergelijk prijzen, specificaties en markttrends op één plek.",
  alternates: {
    canonical: "https://navisio.nl",
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main>
        <Dashboard />
      </main>

      <Footer />
    </div>
  );
}
