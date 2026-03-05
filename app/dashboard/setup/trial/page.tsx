import { redirect } from "next/navigation";
import SetupFrame from "@/components/dashboard/setup/setup-frame";
import TrialSetupCard from "@/components/dashboard/setup/trial-setup-card";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function TrialSetupPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));

  if (status.isSetupComplete) {
    redirect("/dashboard");
  }

  if (status.nextStep.step !== "trial") {
    redirect(status.nextStep.href);
  }

  return (
    <SetupFrame
      title="Unlock competitor tracking"
      description="Start your free trial to unlock competitor monitoring and pricing intelligence."
      currentStep="trial"
      status={status}
    >
      <TrialSetupCard status={status} />
    </SetupFrame>
  );
}
