import { Types } from "mongoose";
import { notFound } from "next/navigation";
import { auth } from "@/libs/auth";
import {
  requireAuthenticatedDashboardUserId,
  requireCompletedSetup,
} from "@/libs/setup";
import CompetitorDetailPage from "@/components/dashboard/competitor-detail-page";

interface CompetitorDetailPageRouteProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompetitorDetailPageRoute({
  params,
}: CompetitorDetailPageRouteProps) {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  const { companyId } = await params;
  if (!Types.ObjectId.isValid(companyId)) {
    notFound();
  }

  return <CompetitorDetailPage companyId={companyId} />;
}
