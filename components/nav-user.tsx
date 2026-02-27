"use client";

import { IconCreditCard, IconDotsVertical, IconLogout, IconUserCircle } from "@tabler/icons-react";
import { signOut, useSession } from "next-auth/react";
import apiClient from "@/libs/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const getInitials = (name?: string | null, email?: string | null): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.charAt(0).toUpperCase() ?? "";
    const second = parts[1]?.charAt(0).toUpperCase() ?? "";
    return `${first}${second}` || "PT";
  }

  if (email && email.trim()) {
    return email.charAt(0).toUpperCase();
  }

  return "PT";
};

export function NavUser() {
  const { isMobile } = useSidebar();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? "Account";
  const userEmail = session?.user?.email ?? "Signed in";

  const handleSignOut = (): void => {
    void signOut({ callbackUrl: "/" });
  };

  const handleBilling = async (): Promise<void> => {
    try {
      const { url } = (await apiClient.post("/stripe/create-portal", {
        returnUrl: window.location.href,
      })) as { url: string };
      window.location.href = url;
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={session?.user?.image ?? ""} alt={userName} />
                <AvatarFallback className="rounded-lg bg-[#0f766e] text-white">
                  {getInitials(session?.user?.name, session?.user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={session?.user?.image ?? ""} alt={userName} />
                  <AvatarFallback className="rounded-lg bg-[#0f766e] text-white">
                    {getInitials(session?.user?.name, session?.user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUserCircle />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleBilling()}>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
