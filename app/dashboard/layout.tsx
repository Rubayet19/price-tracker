import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/libs/auth";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import config from "@/config";

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
  const session = await auth();

  if (!session) {
    redirect(config.auth.loginUrl);
  }

  return <DashboardShell>{children}</DashboardShell>;
}
