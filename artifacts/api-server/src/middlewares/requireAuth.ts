import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { db, approvedUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  const userId = String(auth?.sessionClaims?.userId || auth?.userId || "");
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [approved] = await db.select().from(approvedUsersTable)
    .where(eq(approvedUsersTable.userId, userId)).limit(1);
  if (!approved || !approved.active) {
    res.status(403).json({ error: "Account is not approved" });
    return;
  }
  res.locals.userId = approved.userId;
  res.locals.email = approved.email;
  res.locals.role = approved.role;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (res.locals.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};