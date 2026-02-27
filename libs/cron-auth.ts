import { NextRequest, NextResponse } from "next/server";

const getBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
};

export const isCronAuthorized = (request: NextRequest): boolean => {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    return false;
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const bearerSecret = getBearerToken(request.headers.get("authorization"));

  return headerSecret === expectedSecret || bearerSecret === expectedSecret;
};

export const requireCronAuth = (request: NextRequest): NextResponse | null => {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
};
