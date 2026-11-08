import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Build your bridge · Keystone",
  description: "Tell Keystone about your degree, your goal and how you learn. Agents then map your syllabus to real job ads.",
};

export default function OnboardPage() {
  return <OnboardingWizard />;
}
