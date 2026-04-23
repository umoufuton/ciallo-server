import {
  listClientReleases,
  type ReleaseStatus,
  upsertClientReleaseWithAssets,
} from "@/lib/client-updates";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

function getAdminTokenFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
      return token.trim();
    }
  }

  const direct = request.headers.get("x-update-admin-token");
  if (direct?.trim()) return direct.trim();
  return null;
}

function timingSafeEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(request: Request) {
  const expectedToken = process.env.UPDATE_ADMIN_TOKEN?.trim();
  if (!expectedToken) {
    return { ok: false as const, error: "UPDATE_ADMIN_TOKEN is not set", status: 500 };
  }

  const providedToken = getAdminTokenFromRequest(request);
  if (!providedToken || !timingSafeEquals(expectedToken, providedToken)) {
    return { ok: false as const, error: "invalid admin token", status: 401 };
  }

  return { ok: true as const };
}

function parseStatus(value: string | null): ReleaseStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "published") return "published";
  if (normalized === "archived") return "archived";
  return null;
}

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  const status = parseStatus(searchParams.get("status"));
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

  try {
    const releases = await listClientReleases({
      channel: channel?.trim() || undefined,
      status,
      limit,
    });

    return Response.json({
      data: releases,
      count: releases.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to list releases";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        version?: string;
        channel?: string;
        notes?: string;
        pubDate?: string | null;
        mandatory?: boolean;
        minSupportedVersion?: string | null;
        rolloutPercent?: number;
        status?: "draft" | "published" | "archived";
        assets?: Array<{
          platform?: string;
          arch?: string | null;
          url?: string;
          signature?: string | null;
          sha256?: string | null;
          size?: number | null;
        }>;
      }
    | null;

  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.version || body.version.trim().length === 0) {
    return Response.json({ error: "version is required" }, { status: 400 });
  }

  if (!Array.isArray(body.assets) || body.assets.length === 0) {
    return Response.json({ error: "assets is required and cannot be empty" }, { status: 400 });
  }

  try {
    const release = await upsertClientReleaseWithAssets({
      version: body.version,
      channel: body.channel,
      notes: body.notes,
      pubDate: body.pubDate,
      mandatory: body.mandatory,
      minSupportedVersion: body.minSupportedVersion,
      rolloutPercent: body.rolloutPercent,
      status: body.status,
      assets: body.assets.map((asset) => ({
        platform: asset.platform ?? "",
        arch: asset.arch ?? "",
        url: asset.url ?? "",
        signature: asset.signature ?? null,
        sha256: asset.sha256 ?? null,
        size: asset.size ?? null,
      })),
    });

    return Response.json({
      ok: true,
      release,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to upsert release";
    return Response.json({ error: message }, { status: 500 });
  }
}
