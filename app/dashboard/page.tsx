import DashboardOverviewContent from "@/components/dashboard/dashboard-overview-content";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import { auth } from "@/libs/auth";
import { requireAuthenticatedDashboardUserId, requireCompletedSetup } from "@/libs/setup";

export default async function Page() {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return (
    <DashboardShell>
      <DashboardOverviewContent />
    </DashboardShell>
  );
}
