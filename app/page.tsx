import LandingPage from "@/components/landing/LandingPage";
import type { Metadata } from "next";
import { getSEOTags, renderSchemaTags } from "@/libs/seo";

export const metadata: Metadata = getSEOTags({
  title: "Price Tracker | Monitor Competitor Pricing Changes",
  description:
    "Monitor competitor pricing pages, verify meaningful changes, and make faster pricing decisions with confidence-tagged signals.",
  canonicalUrlRelative: "/",
});

export default function Home() {
  return (
    <>
      <LandingPage />
      {renderSchemaTags()}
    </>
  );
}
