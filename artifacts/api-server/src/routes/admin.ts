import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { createClerkClient } from "@clerk/backend";
import { db, approvedUsersTable } from "@workspace/db";
import { CreateAdminUserBody, CreateAdminUserResponse, ListAdminUsersResponse, GetAuthAccessResponse } from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const clerk = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });
const provisioningTails = new Map<string, Promise<void>>();

async function withEmailProvisioningLock<T>(email: string, operation: () => Promise<T>): Promise<T> {
  const previous = provisioningTails.get(email) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => turn);
  provisioningTails.set(email, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (provisioningTails.get(email) === tail) provisioningTails.delete(email);
  }
}

router.get("/auth/access", requireAuth, (_req, res): void => {
  res.json(GetAuthAccessResponse.parse({
    user_id: res.locals.userId, email: res.locals.email, role: res.locals.role,
  }));
});

router.use("/admin", requireAuth, requireAdmin);

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(approvedUsersTable).orderBy(asc(approvedUsersTable.createdAt));
  res.json(ListAdminUsersResponse.parse(users.map((user) => ({
    user_id: user.userId, email: user.email, role: user.role,
    active: user.active, created_at: user.createdAt,
  }))));
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email and password are required" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  let createdUserId: string | null = null;
  try {
    const approved = await withEmailProvisioningLock(email, async () => {
      const existing = await db.select({ userId: approvedUsersTable.userId })
        .from(approvedUsersTable).where(eq(approvedUsersTable.email, email)).limit(1);
      if (existing.length) throw new Error("approved_user_exists");

      const clerkClient = clerk();
      const found = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
      let user = found.data[0];
      if (user) {
        user = await clerkClient.users.updateUser(user.id, {
          password: parsed.data.password,
          signOutOfOtherSessions: true,
        });
      } else {
        user = await clerkClient.users.createUser({
          emailAddress: [email],
          password: parsed.data.password,
        });
        createdUserId = user.id;
      }

      try {
        const [row] = await db.insert(approvedUsersTable).values({
          userId: user.id, email, role: "user", active: true,
        }).returning();
        return row;
      } catch (error) {
        if (createdUserId) {
          await clerkClient.users.deleteUser(createdUserId).catch(() => undefined);
          createdUserId = null;
        }
        throw error;
      }
    });
    res.status(201).json(CreateAdminUserResponse.parse({
      user_id: approved.userId, email: approved.email, role: approved.role,
      active: approved.active, created_at: approved.createdAt,
    }));
  } catch (error) {
    const clerkError = error as { name?: string; status?: number; errors?: Array<{ code?: string }> };
    const codes = clerkError.errors?.map((entry) => entry.code).filter(Boolean) ?? [];
    req.log.warn({
      errorType: clerkError.name ?? "unknown",
      status: clerkError.status,
      codes,
    }, "Admin user creation failed");
    const message = error instanceof Error && error.message === "approved_user_exists"
      ? "A user with that email already exists"
      : codes.includes("form_password_length_too_short")
        ? "Password does not meet the minimum length"
        : codes.includes("form_password_pwned")
          ? "Choose a stronger password"
          : "Unable to create user";
    res.status(400).json({ error: message });
  }
});

export default router;