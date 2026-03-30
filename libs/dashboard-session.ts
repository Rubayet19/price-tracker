import "server-only";

import { cache } from "react";
import { auth } from "@/libs/auth";

// Reuse the same auth lookup across dashboard layout/page renders in a request.
export const getDashboardSession = cache(async () => auth());
