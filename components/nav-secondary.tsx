"use client";

import * as React from "react";
import Link from "next/link";
import { type Icon } from "@tabler/icons-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface NavSecondaryItem {
  title: string;
  url: string;
  icon: Icon;
}

export function NavSecondary({
  items,
  ...props
}: {
  items: NavSecondaryItem[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                className="h-10 gap-3 px-3 text-[0.95rem] font-medium [&>svg]:size-[18px]"
              >
                {item.url.startsWith("/") ? (
                  <Link href={item.url}>
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </Link>
                ) : (
                  <a href={item.url}>
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </a>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
