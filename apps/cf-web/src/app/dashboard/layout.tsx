import { DashboardHeader } from "@/components/dashboard-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] selection:bg-primary selection:text-primary-foreground">
      <DashboardHeader />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
