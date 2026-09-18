import { createHash, hkdfSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, accessKeySessionsTable, accessKeysTable } from "@workspace/db";

export const ACCESS_COOKIE_NAME = "jdy_access";
// This is a SHA-256 fingerprint, never the raw administrator credential.
const LEGACY_PRIMARY_ADMIN_KEY_HASH = "0d11ae258d4fd0f86e2e07606a4b835b2cdc745a71fbe1d8590ba7d3abdd22be";
export const ACCESS_FEATURES = ["edge", "digit-flip", "trade-x", "settings", "history", "admin"] as const;
export type AccessFeature = typeof ACCESS_FEATURES[number];
export type AccessKeyStatus = "active" | "paused" | "blocked" | "banned" | "deleted";

export const PRESENCE_STALE_MS = 90_000;

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function configuredDashboardApiKey() {
  const value = process.env.DASHBOARD_API_KEY?.trim();
  return value || null;
}

export function primaryAdminKeyHash() {
  const configuredKey = configuredDashboardApiKey();
  return configuredKey ? hashSecret(configuredKey) : LEGACY_PRIMARY_ADMIN_KEY_HASH;
}

export function isPrimaryAdminKeyHash(value: string) {
  return value === primaryAdminKeyHash();
}

function accessKeyEncryptionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for access-key encryption");
  return Buffer.from(hkdfSync("sha256", secret, "access-key-salt", "access-key-encryption", 32));
}

export function encryptAccessKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accessKeyEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptAccessKey(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted access key");
  const decipher = createDecipheriv("aes-256-gcm", accessKeyEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * Makes the Replit secret the single designated administrator access key.
 * The raw value is only used to create the encrypted recovery copy and is
 * never returned by this function or written to logs.
 */
export async function syncConfiguredPrimaryAdminKey() {
  const configuredKey = configuredDashboardApiKey();
  if (!configuredKey) return;

  const configuredHash = hashSecret(configuredKey);
  const [configuredRow] = await db.select().from(accessKeysTable)
    .where(eq(accessKeysTable.keyHash, configuredHash))
    .limit(1);
  if (configuredRow) {
    if (configuredRow.status !== "active" || configuredRow.kind !== "admin" || configuredRow.maxDevices !== 0) {
      await db.update(accessKeysTable).set({
        kind: "admin",
        status: "active",
        maxDevices: 0,
        features: [...ACCESS_FEATURES],
        updatedAt: new Date(),
      }).where(eq(accessKeysTable.id, configuredRow.id));
    }
    return;
  }

  const [legacyRow] = await db.select().from(accessKeysTable)
    .where(eq(accessKeysTable.keyHash, LEGACY_PRIMARY_ADMIN_KEY_HASH))
    .limit(1);
  if (legacyRow) {
    await db.update(accessKeysTable).set({
      keyHash: configuredHash,
      encryptedKey: encryptAccessKey(configuredKey),
      keyPrefix: configuredKey.slice(0, 17),
      kind: "admin",
      status: "active",
      maxDevices: 0,
      features: [...ACCESS_FEATURES],
      updatedAt: new Date(),
    }).where(eq(accessKeysTable.id, legacyRow.id));
    await db.update(accessKeySessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessKeySessionsTable.accessKeyId, legacyRow.id), isNull(accessKeySessionsTable.revokedAt)));
    return;
  }

  await db.insert(accessKeysTable).values({
    keyHash: configuredHash,
    encryptedKey: encryptAccessKey(configuredKey),
    keyPrefix: configuredKey.slice(0, 17),
    label: "Primary administrator",
    kind: "admin",
    status: "active",
    maxDevices: 0,
    features: [...ACCESS_FEATURES],
  });
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
      keyHash: accessKeysTable.keyHash,
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
  return `${ACCESS_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
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
  const userFeatures = normalized.filter((feature) => feature !== "admin");
  return userFeatures.length ? userFeatures : ["edge"];
}