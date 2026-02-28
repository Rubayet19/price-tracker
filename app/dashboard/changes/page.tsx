import { auth } from "@/libs/auth";
import { requireAuthenticatedDashboardUserId, requireCompletedSetup } from "@/libs/setup";
import DashboardChangesContent from "@/components/dashboard/dashboard-changes-content";
import DashboardShell from "@/components/dashboard/dashboard-shell";

export default async function DashboardChangesPage() {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return (
    <DashboardShell>
      <DashboardChangesContent />
    </DashboardShell>
  );
}
