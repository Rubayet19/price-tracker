"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface AddCompetitorForm {
  name: string;
  domain: string;
  homepageUrl: string;
}

const INITIAL_FORM: AddCompetitorForm = {
  name: "",
  domain: "",
  homepageUrl: "",
};

export default function AddCompetitorSheet() {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [form, setForm] = useState<AddCompetitorForm>(INITIAL_FORM);

  const onSubmit = async (): Promise<void> => {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          type: "competitor",
          domain: form.domain || undefined,
          homepageUrl: form.homepageUrl || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add competitor");
      }

      toast.success("Competitor added");
      setForm(INITIAL_FORM);
      setIsOpen(false);
      window.dispatchEvent(new Event("competitor:added"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add competitor";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button className="bg-[#0f172a] text-white hover:bg-[#1e293b]">
          <Plus className="size-4" />
          Add Competitor
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add competitor</SheetTitle>
          <SheetDescription>
            Add a competitor domain to start monitoring pricing changes.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="competitor-name">Name</Label>
            <Input
              id="competitor-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Competitor name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitor-domain">Domain</Label>
            <Input
              id="competitor-domain"
              value={form.domain}
              onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))}
              placeholder="example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitor-homepage">Homepage URL (optional)</Label>
            <Input
              id="competitor-homepage"
              value={form.homepageUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, homepageUrl: event.target.value }))
              }
              placeholder="https://example.com/pricing"
            />
          </div>
        </div>

        <SheetFooter className="mt-4 border-t border-[#e2e8f0]">
          <Button
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting || !form.name.trim() || (!form.domain.trim() && !form.homepageUrl.trim())}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSubmitting ? "Adding..." : "Add competitor"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
