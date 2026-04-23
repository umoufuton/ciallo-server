import { readBearerToken, type AuthTokenPayload, verifyAuthToken } from "@/lib/auth";

export function readPirepAuthPayload(request: Request): AuthTokenPayload | null {
  const token = readBearerToken(request);
  if (!token) return null;

  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}
