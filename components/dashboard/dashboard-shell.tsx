import type { CSSProperties, ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset id="main-content" className="bg-[#f7f6f3]">
        <SiteHeader />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
