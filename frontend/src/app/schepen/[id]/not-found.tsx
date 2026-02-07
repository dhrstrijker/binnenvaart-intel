import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function VesselNotFound() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-slate-300"
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
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            Schip niet gevonden
          </h1>
          <p className="mt-2 text-slate-500">
            Dit schip bestaat niet of is verwijderd uit onze database.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Terug naar overzicht
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
