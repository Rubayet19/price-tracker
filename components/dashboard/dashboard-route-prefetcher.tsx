"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/competitors",
  "/dashboard/changes",
  "/dashboard/settings",
] as const;

const PREFETCH_STAGGER_MS = 100;

const warmedRoutes = new Set<string>();

export default function DashboardRoutePrefetcher(): null {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    warmedRoutes.add(pathname);

    const routesToPrefetch = DASHBOARD_ROUTES.filter(
      (route) => route !== pathname && !warmedRoutes.has(route)
    );

    if (!routesToPrefetch.length) {
      return;
    }

    const timerIds: number[] = [];

    routesToPrefetch.forEach((route, index) => {
      const timerId = window.setTimeout(() => {
        router.prefetch(route);
        warmedRoutes.add(route);
      }, index * PREFETCH_STAGGER_MS);

      timerIds.push(timerId);
    });

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [pathname, router]);

  return null;
}
