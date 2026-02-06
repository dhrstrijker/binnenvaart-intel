import Dashboard from "@/components/Dashboard";
import NotificationSignup from "@/components/NotificationSignup";
import NavLink from "@/components/NavLink";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Ship icon */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 17h1l1-5h14l1 5h1M5 17l-2 4h18l-2-4M7 7h10l2 5H5l2-5zM9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                Binnenvaart Intel
              </h1>
              <p className="text-xs text-blue-200 sm:text-sm">
                Scheepvaart marktplaats monitor
              </p>
            </div>
          </div>

          {/* Navigation + Status */}
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-2">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/analytics">Analyse</NavLink>
            </nav>
            <div className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-blue-100">Live</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <Dashboard />

      {/* Notification signup */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <NotificationSignup />
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs text-slate-400">
            Binnenvaart Intel &mdash; Gegevens van Rensen & Driessen en Galle
            Makelaars
          </p>
        </div>
      </footer>
    </div>
  );
}
