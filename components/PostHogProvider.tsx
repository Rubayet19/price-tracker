"use client";

import React, { Suspense, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "@posthog/react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

if (
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_POSTHOG_KEY
) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: false, // We capture manually on route change
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
}

function PostHogPageview(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) url += `?${search}`;
      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify(): null {
  const { data: session } = useSession();
  const ph = usePostHog();
  const identified = useRef(false);

  useEffect(() => {
    if (session?.user && !identified.current) {
      ph.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
      });
      identified.current = true;
    }

    if (!session?.user && identified.current) {
      ph.reset();
      identified.current = false;
    }
  }, [session, ph]);

  return null;
}

export default function PostHogProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
