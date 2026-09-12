import type { RequestHandler } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, accessKeySessionsTable, accessKeysTable } from "@workspace/db";
import { requireAdmin, requireAuth } from "./requireAuth";
import {
  findSessionByToken,
  featureList,
  hashSecret,
  parseAccessCookie,
} from "../lib/access-keys";

export const requireAccess: RequestHandler = async (req, res, next) => {
  try {
    const rawToken = parseAccessCookie(req.headers.cookie);
    if (!rawToken) {
      res.status(401).json({ error: "An access key is required" });
      return;
    }

    const session = await findSessionByToken(hashSecret(rawToken));
    if (!session) {
      res.status(401).json({ error: "Access session expired. Enter your access key again." });
      return;
    }
    if (session.status !== "active") {
      const message = session.status === "banned"
        ? "This access key is permanently banned"
        : `This access key is ${session.status}`;
      res.status(403).json({ error: message });
      return;
    }

    const now = new Date();
    await db.update(accessKeySessionsTable)
      .set({ lastSeenAt: now })
      .where(and(eq(accessKeySessionsTable.id, session.sessionId), isNull(accessKeySessionsTable.revokedAt)));
    await db.update(accessKeysTable)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(eq(accessKeysTable.id, session.accessKeyId));

    res.locals.accessKeyId = session.accessKeyId;
    res.locals.accessSessionId = session.sessionId;
    res.locals.userId = session.accessKeyId;
    res.locals.accessKey = {
      ...session,
      features: featureList(session.features, session.kind),
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAccessFeature = (feature: string): RequestHandler => (_req, res, next) => {
  const features = res.locals.accessKey?.features as string[] | undefined;
  if (!features?.includes(feature)) {
    res.status(403).json({ error: `This access key does not include the ${feature} feature` });
    return;
  }
  next();
};

export const requireAccessAdmin: RequestHandler = (req, res, next) => {
  if (res.locals.role === "admin") {
    next();
    return;
  }
  if (res.locals.accessKey?.kind !== "admin") {
    res.status(403).json({ error: "Administrator access key required" });
    return;
  }
  next();
};

export const requireAccessOrClerkAdmin: RequestHandler = (req, res, next) => {
  const rawToken = parseAccessCookie(req.headers.cookie);
  if (rawToken) {
    requireAccess(req, res, next);
    return;
  }
  requireAuth(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }
    requireAdmin(req, res, next);
  });
};