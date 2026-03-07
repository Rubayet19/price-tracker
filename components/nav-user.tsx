"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconCreditCard,
  IconDotsVertical,
  IconLogout,
  IconUserCircle,
} from "@tabler/icons-react";
import toast from "react-hot-toast";
import { signOut, useSession } from "next-auth/react";
import { createBillingPortalSession } from "@/components/dashboard/dashboard-api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const router = useRouter();
  const [isOpeningPortal, setIsOpeningPortal] = useState<boolean>(false);

  const userName = session?.user?.name ?? "Account";
  const userEmail = session?.user?.email ?? "Signed in";

  const handleSignOut = (): void => {
    void signOut({ callbackUrl: "/" });
  };

  const handleBillingPortal = async (): Promise<void> => {
    setIsOpeningPortal(true);

    try {
      const url = await createBillingPortalSession(window.location.href);
      window.location.href = url;
    } catch {
      toast.error("No billing account yet. Redirecting to settings.");
      router.push("/dashboard/settings");
    } finally {
      setIsOpeningPortal(false);
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
                <span className="text-muted-foreground truncate text-xs">
                  {userEmail}
                </span>
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
                  <AvatarImage
                    src={session?.user?.image ?? ""}
                    alt={userName}
                  />
                  <AvatarFallback className="rounded-lg bg-[#0f766e] text-white">
                    {getInitials(session?.user?.name, session?.user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {userEmail}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <IconUserCircle />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isOpeningPortal}
                onClick={() => void handleBillingPortal()}
              >
                <IconCreditCard />
                {isOpeningPortal ? "Opening..." : "Billing & Plan"}
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
