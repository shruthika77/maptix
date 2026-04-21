import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Sidebar — fixed positioned, 256px wide (w-64) */}
      <Sidebar />

      {/* Main content — offset by sidebar width on lg+, full width on mobile */}
      <div className="flex-1 flex flex-col lg:pl-64 transition-all duration-300 min-w-0">
        <Header />
        <main className="flex-1 overflow-hidden relative">
          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
