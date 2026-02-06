import Dashboard from "@/components/Dashboard";
import NotificationSignup from "@/components/NotificationSignup";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* Content */}
      <Dashboard />

      {/* Notification signup */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <NotificationSignup />
      </div>

      <Footer />
    </div>
  );
}
