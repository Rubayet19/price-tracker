"use client";

import AddCompetitorSheet from "@/components/dashboard/add-competitor-sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-[#0f172a]/10 bg-[#f7f6f3]/95 backdrop-blur">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:ring-2 focus:ring-[#0f766e] focus:outline-none"
      >
        Skip to content
      </a>
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 border border-[#0f172a]/10 bg-white text-[#0f172a] hover:bg-[#f8fafc]" />
        <div className="ml-auto">
          <AddCompetitorSheet />
        </div>
      </div>
    </header>
  );
}
