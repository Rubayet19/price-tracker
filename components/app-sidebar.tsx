"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import {
  IconCreditCard,
  IconDashboard,
  IconHelp,
  IconListDetails,
  IconNotes,
} from "@tabler/icons-react";
import config from "@/config";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: IconDashboard,
    },
    {
      title: "Competitors",
      url: "/dashboard/competitors",
      icon: IconListDetails,
    },
    {
      title: "Recent Changes",
      url: "/dashboard/changes",
      icon: IconNotes,
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: IconCreditCard,
    },
  ],
  navSecondary: [
    {
      title: "Get Help",
      url: `mailto:${config.resend.supportEmail ?? "support@example.com"}`,
      icon: IconHelp,
    },
  ],
};

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="!px-3 !py-2.5">
              <Link href="/dashboard">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-[#0f766e] text-xs font-bold text-white">
                  PT
                </span>
                <span className="text-base font-black tracking-tight text-[#0f172a]">{config.appName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-3 px-1">
        <nav aria-label="Primary">
          <NavMain items={data.navMain} />
        </nav>
        <nav aria-label="Secondary">
          <NavSecondary items={data.navSecondary} className="mt-3" />
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
