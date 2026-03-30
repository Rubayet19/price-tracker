import { ReactNode } from "react";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import config from "@/config";
import { getDashboardSession } from "@/libs/dashboard-session";

// This is a server-side component to ensure the user is logged in.
// If not, it will redirect to the login page.
// It's applied to all subpages of /dashboard in /app/dashboard/*** pages
// You can also add custom static UI elements like a Navbar, Sidebar, Footer, etc..
// See https://shipfa.st/docs/tutorials/private-page
export default async function LayoutPrivate({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getDashboardSession();

  if (!session) {
    redirect(config.auth.loginUrl);
  }

  return <DashboardShell>{children}</DashboardShell>;
}
