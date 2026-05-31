import { redirect } from "next/navigation";

export default function LegacyOrganizationOnboardingPage() {
  redirect("/onboarding/owner");
}
