import AppSidebar from "@/components/layout/app-sidebar";
import Header from "@/components/layout/header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-[#050505]">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
