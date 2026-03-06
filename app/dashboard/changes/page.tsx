import { auth } from "@/libs/auth";
import {
  requireAuthenticatedDashboardUserId,
  requireCompletedSetup,
} from "@/libs/setup";
import DashboardChangesContent from "@/components/dashboard/dashboard-changes-content";

export default async function DashboardChangesPage() {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return <DashboardChangesContent />;
}
