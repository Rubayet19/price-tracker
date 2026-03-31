"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/app/icon.png";
import config from "@/config";
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
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2"
          title={`${config.appName} dashboard`}
        >
          <Image
            src={logo}
            alt={`${config.appName} logo`}
            className="w-6"
            width={24}
            height={24}
            placeholder="blur"
            priority
          />
          <span className="text-sm font-black tracking-tight text-[#0f172a]">
            {config.appName}
          </span>
        </Link>
        <div className="ml-auto">
          <AddCompetitorSheet />
        </div>
      </div>
    </header>
  );
}
