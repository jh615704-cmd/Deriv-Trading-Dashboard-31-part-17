import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, accessKeySessionsTable, accessKeysTable } from "@workspace/db";
import {
  CreateAccessKeyBody,
  CreateAccessKeyResponse,
  GetAccessSessionResponse,
  ListAccessKeysResponseItem,
  LoginAccessKeyBody,
  UpdateAccessKeyBody,
  ListAccessKeysResponse,
} from "@workspace/api-zod";
import {
  ACCESS_FEATURES,
  accessCookie,
  activeDeviceCount,
  clearAccessCookie,
  deviceHash,
  featureList,
  findSessionByToken,
  generateAccessKey,
  generateSessionToken,
  hashSecret,
  isOnline,
  offlineSeconds,
  onlineDeviceCount,
  parseAccessCookie,
  PRIMARY_ADMIN_KEY_HASH,
} from "../lib/access-keys";
import { requireAccess, requireAccessAdmin } from "../middlewares/requireAccess";

const router: IRouter = Router();

function secureCookie(forwardedProto?: string) {
  return forwardedProto === "https";
}

function sessionResponse(session: {
  accessKeyId: string;
  keyPrefix: string;
  label: string;
  kind: "admin" | "user";
  status: "active" | "paused" | "blocked" | "banned";
  maxDevices: number;
  features: string[] | null;
  sessionLastSeenAt: Date | null;
  keyHash: string;
}) {
  return GetAccessSessionResponse.parse({
    key_id: session.accessKeyId,
    key_prefix: session.keyPrefix,
    label: session.label,
    kind: session.kind,
    is_admin: session.keyHash === PRIMARY_ADMIN_KEY_HASH,
    status: session.status,
    max_devices: session.maxDevices,
    features: featureList(session.features, session.kind),
    online: true,
    last_seen_at: session.sessionLastSeenAt,
  });
}

router.post("/access/login", async (req, res): Promise<void> => {
  const parsed = LoginAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter an access key and device identifier" });
    return;
  }

  const [key] = await db.select().from(accessKeysTable)
    .where(eq(accessKeysTable.keyHash, hashSecret(parsed.data.access_key.trim())))
    .limit(1);
  if (!key) {
    res.status(401).json({ error: "That access key is not recognized" });
    return;
  }
  if (key.status !== "active") {
    const message = key.status === "banned"
      ? "This access key is permanently banned"
      : `This access key is ${key.status}`;
    res.status(403).json({ error: message });
    return;
  }

  const fingerprint = deviceHash(parsed.data.device_id);
  const sessions = await db.select().from(accessKeySessionsTable).where(and(
    eq(accessKeySessionsTable.accessKeyId, key.id),
    isNull(accessKeySessionsTable.revokedAt),
  ));
  const existingDevice = sessions.find((session) => session.deviceHash === fingerprint);
  const deviceCount = new Set(sessions.map((session) => session.deviceHash)).size;
  if (!existingDevice && deviceCount >= key.maxDevices) {
    res.status(403).json({ error: `This access key is already in use on ${key.maxDevices} device${key.maxDevices === 1 ? "" : "s"}` });
    return;
  }

  const rawSession = generateSessionToken();
  const now = new Date();
  if (existingDevice) {
    await db.update(accessKeySessionsTable)
      .set({ revokedAt: now })
      .where(eq(accessKeySessionsTable.id, existingDevice.id));
  }
  const [session] = await db.insert(accessKeySessionsTable).values({
    accessKeyId: key.id,
    tokenHash: hashSecret(rawSession),
    deviceHash: fingerprint,
    userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    firstSeenAt: now,
    lastSeenAt: now,
  }).returning();
  await db.update(accessKeysTable).set({ lastSeenAt: now, updatedAt: now }).where(eq(accessKeysTable.id, key.id));

  res.append("Set-Cookie", accessCookie(rawSession, secureCookie(req.get("x-forwarded-proto"))));
  res.json(sessionResponse({
    accessKeyId: key.id,
    keyPrefix: key.keyPrefix,
    label: key.label,
    kind: key.kind,
    status: key.status,
    maxDevices: key.maxDevices,
    features: key.features,
    keyHash: key.keyHash,
    sessionLastSeenAt: session.lastSeenAt,
  }));
});

router.get("/access/session", requireAccess, async (_req, res): Promise<void> => {
  res.json(sessionResponse({
    accessKeyId: res.locals.accessKeyId,
    keyPrefix: res.locals.accessKey.keyPrefix,
    label: res.locals.accessKey.label,
    kind: res.locals.accessKey.kind,
    status: res.locals.accessKey.status,
    maxDevices: res.locals.accessKey.maxDevices,
    features: res.locals.accessKey.features,
    keyHash: res.locals.accessKey.keyHash,
    sessionLastSeenAt: new Date(),
  }));
});

router.post("/access/heartbeat", requireAccess, async (_req, res): Promise<void> => {
  const now = new Date();
  await db.update(accessKeySessionsTable)
    .set({ lastSeenAt: now })
    .where(and(eq(accessKeySessionsTable.id, res.locals.accessSessionId), isNull(accessKeySessionsTable.revokedAt)));
  await db.update(accessKeysTable)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(eq(accessKeysTable.id, res.locals.accessKeyId));
  res.json({ success: true });
});

router.post("/access/logout", requireAccess, async (req, res): Promise<void> => {
  await db.update(accessKeySessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(accessKeySessionsTable.id, res.locals.accessSessionId));
  res.append("Set-Cookie", clearAccessCookie(secureCookie(req.get("x-forwarded-proto"))));
  res.json({ success: true });
});

router.use("/access/keys", requireAccess, requireAccessAdmin);

router.get("/access/keys", async (_req, res): Promise<void> => {
  const keys = await db.select().from(accessKeysTable).orderBy(asc(accessKeysTable.createdAt));
  const response = await Promise.all(keys.map(async (key) => {
    const [deviceCount, onlineDevices] = await Promise.all([
      activeDeviceCount(key.id),
      onlineDeviceCount(key.id),
    ]);
    return {
      key_id: key.id,
      key_prefix: key.keyPrefix,
      label: key.label,
      kind: key.kind,
      status: key.status,
      max_devices: key.maxDevices,
      device_count: deviceCount,
      online_devices: onlineDevices,
      online: onlineDevices > 0,
      features: featureList(key.features, key.kind),
      last_seen_at: key.lastSeenAt,
      offline_seconds: offlineSeconds(key.lastSeenAt),
      created_at: key.createdAt,
    };
  }));
  res.json(ListAccessKeysResponse.parse(response));
});

router.post("/access/keys", async (req, res): Promise<void> => {
  const parsed = CreateAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a label, a valid device limit, and at least one feature" });
    return;
  }
  const kind = parsed.data.kind;
  const rawKey = generateAccessKey(kind);
  const features = kind === "admin" ? [...ACCESS_FEATURES] : featureList(parsed.data.features, kind);
  const [created] = await db.insert(accessKeysTable).values({
    keyHash: hashSecret(rawKey),
    keyPrefix: rawKey.slice(0, 17),
    label: parsed.data.label.trim(),
    kind,
    maxDevices: parsed.data.max_devices,
    features,
  }).returning();
  res.status(201).json(CreateAccessKeyResponse.parse({
    key_id: created.id,
    access_key: rawKey,
    key_prefix: created.keyPrefix,
    label: created.label,
    kind: created.kind,
    status: created.status,
    max_devices: created.maxDevices,
    features: featureList(created.features, created.kind),
    created_at: created.createdAt,
  }));
});

router.patch("/access/keys/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateAccessKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid access key update" });
    return;
  }
  const [current] = await db.select().from(accessKeysTable).where(eq(accessKeysTable.id, id)).limit(1);
  if (!current) {
    res.status(404).json({ error: "Access key not found" });
    return;
  }
  if (current.status === "banned" && parsed.data.status !== "banned") {
    res.status(400).json({ error: "Banned access keys cannot be restored" });
    return;
  }
  if (id === res.locals.accessKeyId && parsed.data.status && parsed.data.status !== "active") {
    res.status(400).json({ error: "The current administrator key cannot be disabled from its own session" });
    return;
  }

  const nextStatus = parsed.data.status ?? current.status;
  const [updated] = await db.update(accessKeysTable).set({
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.max_devices ? { maxDevices: parsed.data.max_devices } : {}),
    ...(parsed.data.features ? { features: featureList(parsed.data.features, current.kind) } : {}),
    updatedAt: new Date(),
  }).where(eq(accessKeysTable.id, id)).returning();
  if (nextStatus === "blocked" || nextStatus === "banned") {
    await db.update(accessKeySessionsTable).set({ revokedAt: new Date() })
      .where(and(eq(accessKeySessionsTable.accessKeyId, id), isNull(accessKeySessionsTable.revokedAt)));
  }
  res.json(ListAccessKeysResponseItem.parse({
    key_id: updated.id,
    key_prefix: updated.keyPrefix,
    label: updated.label,
    kind: updated.kind,
    status: updated.status,
    max_devices: updated.maxDevices,
    device_count: await activeDeviceCount(updated.id),
    online_devices: await onlineDeviceCount(updated.id),
    online: await onlineDeviceCount(updated.id) > 0,
    features: featureList(updated.features, updated.kind),
    last_seen_at: updated.lastSeenAt,
    offline_seconds: offlineSeconds(updated.lastSeenAt),
    created_at: updated.createdAt,
  }));
});

export default router;