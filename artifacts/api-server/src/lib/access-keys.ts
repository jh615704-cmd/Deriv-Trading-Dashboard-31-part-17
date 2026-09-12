import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, accessKeySessionsTable, accessKeysTable } from "@workspace/db";

export const ACCESS_COOKIE_NAME = "jdy_access";
export const ACCESS_FEATURES = ["edge", "settings", "history", "admin"] as const;
export type AccessFeature = typeof ACCESS_FEATURES[number];
export type AccessKeyStatus = "active" | "paused" | "blocked" | "banned";

export const PRESENCE_STALE_MS = 90_000;

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateAccessKey(kind: "admin" | "user") {
  const prefix = kind === "admin" ? "EDGE-ADMIN" : "EDGE-USER";
  return `${prefix}-${randomBytes(24).toString("base64url")}`;
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function deviceHash(deviceId: string) {
  return hashSecret(`device:${deviceId}`);
}

export function isOnline(lastSeenAt: Date | null) {
  return Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() <= PRESENCE_STALE_MS);
}

export function offlineSeconds(lastSeenAt: Date | null) {
  if (!lastSeenAt || isOnline(lastSeenAt)) return 0;
  return Math.max(0, Math.floor((Date.now() - lastSeenAt.getTime()) / 1000));
}

export async function findSessionByToken(token: string) {
  const [session] = await db
    .select({
      sessionId: accessKeySessionsTable.id,
      accessKeyId: accessKeysTable.id,
      keyPrefix: accessKeysTable.keyPrefix,
      label: accessKeysTable.label,
      kind: accessKeysTable.kind,
      status: accessKeysTable.status,
      maxDevices: accessKeysTable.maxDevices,
      features: accessKeysTable.features,
      sessionLastSeenAt: accessKeySessionsTable.lastSeenAt,
    })
    .from(accessKeySessionsTable)
    .innerJoin(accessKeysTable, eq(accessKeySessionsTable.accessKeyId, accessKeysTable.id))
    .where(and(
      eq(accessKeySessionsTable.tokenHash, token),
      isNull(accessKeySessionsTable.revokedAt),
    ))
    .limit(1);
  return session ?? null;
}

export async function activeDeviceCount(accessKeyId: string) {
  const sessions = await db
    .select({ deviceHash: accessKeySessionsTable.deviceHash })
    .from(accessKeySessionsTable)
    .where(and(
      eq(accessKeySessionsTable.accessKeyId, accessKeyId),
      isNull(accessKeySessionsTable.revokedAt),
    ));
  return new Set(sessions.map((session) => session.deviceHash)).size;
}

export async function onlineDeviceCount(accessKeyId: string) {
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);
  const sessions = await db
    .select({ deviceHash: accessKeySessionsTable.deviceHash })
    .from(accessKeySessionsTable)
    .where(and(
      eq(accessKeySessionsTable.accessKeyId, accessKeyId),
      isNull(accessKeySessionsTable.revokedAt),
      gt(accessKeySessionsTable.lastSeenAt, cutoff),
    ));
  return new Set(sessions.map((session) => session.deviceHash)).size;
}

export function accessCookie(value: string, secure: boolean) {
  return `${ACCESS_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? "; Secure" : ""}`;
}

export function clearAccessCookie(secure: boolean) {
  return `${ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function parseAccessCookie(header: string | undefined) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ACCESS_COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function featureList(features: string[] | null | undefined, kind: "admin" | "user") {
  const normalized = Array.from(new Set((features ?? []).filter((feature): feature is AccessFeature =>
    (ACCESS_FEATURES as readonly string[]).includes(feature),
  )));
  if (kind === "admin") return ACCESS_FEATURES.slice();
  return normalized.length ? normalized : ["edge"];
}