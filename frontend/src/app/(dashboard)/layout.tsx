import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <div className="flex-1 flex flex-col pl-64 transition-all duration-300">
        <Header />
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px]" />
          {children}
        </main>
      </div>
    </div>
  );
}
