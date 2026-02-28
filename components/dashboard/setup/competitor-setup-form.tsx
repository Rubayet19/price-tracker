"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { createCompany } from "@/components/dashboard/setup/setup-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CompetitorSetupFormProps {
  competitorLimit: number;
}

export default function CompetitorSetupForm({ competitorLimit }: CompetitorSetupFormProps) {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [domain, setDomain] = useState<string>("");
  const [homepageUrl, setHomepageUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (): Promise<void> => {
    setError(null);

    if (!name.trim()) {
      setError("Add a competitor name.");
      return;
    }

    if (!domain.trim() && !homepageUrl.trim()) {
      setError("Add a domain or homepage URL.");
      return;
    }

    setIsSubmitting(true);

    try {
      await createCompany({
        name: name.trim(),
        type: "competitor",
        domain: domain.trim() || undefined,
        homepageUrl: homepageUrl.trim() || undefined,
      });

      toast.success("Competitor added");
      window.dispatchEvent(new Event("competitor:added"));
      router.push("/dashboard/setup");
      router.refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Failed to add competitor";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-[#0f172a]/10 bg-white/95">
      <CardHeader>
        <CardTitle className="text-2xl font-black tracking-tight text-[#0f172a]">
          Add the first competitor
        </CardTitle>
        <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
          Start with the competitor that matters most. The setup flow will discover likely pricing
          pages and ask you to confirm the final URL before tracking starts.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="setup-competitor-name">Competitor name</Label>
            <Input
              id="setup-competitor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme"
              autoComplete="organization"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-competitor-domain">Domain</Label>
            <Input
              id="setup-competitor-domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="acme.com"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="setup-competitor-homepage">Homepage URL</Label>
            <Input
              id="setup-competitor-homepage"
              value={homepageUrl}
              onChange={(event) => setHomepageUrl(event.target.value)}
              placeholder="https://acme.com"
              inputMode="url"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4 text-sm leading-6 text-[#475569]">
          Your current access tier supports up to {competitorLimit} tracked competitors. Add the
          highest-priority one now, then expand from the global “Add Competitor” button later.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSubmitting ? "Adding..." : "Add competitor"}
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
