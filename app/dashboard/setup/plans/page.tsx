import { redirect } from "next/navigation";
import PlansSetupCard from "@/components/dashboard/setup/plans-setup-card";
import SetupFrame from "@/components/dashboard/setup/setup-frame";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function PlansSetupPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));

  if (status.isSetupComplete) {
    redirect("/dashboard");
  }

  if (status.nextStep.step !== "plans") {
    redirect(status.nextStep.href);
  }

  return (
    <SetupFrame
      title="Choose your plan"
      description="Pick the plan that matches your monitoring needs, or start with a free trial."
      currentStep="plans"
      status={status}
    >
      <PlansSetupCard status={status} />
    </SetupFrame>
  );
}
