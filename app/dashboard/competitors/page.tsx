import { auth } from "@/libs/auth";
import { requireAuthenticatedDashboardUserId, requireCompletedSetup } from "@/libs/setup";
import DashboardCompetitorsContent from "@/components/dashboard/dashboard-competitors-content";
import DashboardShell from "@/components/dashboard/dashboard-shell";

export default async function DashboardCompetitorsPage() {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return (
    <DashboardShell>
      <DashboardCompetitorsContent />
    </DashboardShell>
  );
}
