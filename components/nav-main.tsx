"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type Icon } from "@tabler/icons-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: Icon;
  }[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const isItemActive = (url: string): boolean => {
    if (url === "/dashboard") {
      return pathname === url;
    }

    return pathname === url || pathname.startsWith(`${url}/`);
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isItemActive(item.url);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                  className="h-10 gap-3 px-3 text-[0.95rem] font-medium [&>svg]:size-[18px]"
                >
                  <Link
                    href={item.url}
                    prefetch={false}
                    onMouseEnter={() => router.prefetch(item.url)}
                    onFocus={() => router.prefetch(item.url)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.icon ? <item.icon aria-hidden="true" /> : null}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
