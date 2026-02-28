import { redirect } from "next/navigation";
import CompetitorSetupForm from "@/components/dashboard/setup/competitor-setup-form";
import SetupFrame from "@/components/dashboard/setup/setup-frame";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function CompetitorsSetupPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));

  if (status.isSetupComplete) {
    redirect("/dashboard");
  }

  if (status.nextStep.step !== "competitors") {
    redirect(status.nextStep.href);
  }

  return (
    <SetupFrame
      title="Add your first competitor"
      description="Setup stays focused: add one competitor, confirm its pricing URL, then land in the dashboard with real data paths already defined."
      currentStep="competitors"
      status={status}
    >
      <CompetitorSetupForm competitorLimit={status.entitlements.competitorLimit} />
    </SetupFrame>
  );
}
