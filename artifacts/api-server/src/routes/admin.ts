import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { createClerkClient } from "@clerk/backend";
import { db, approvedUsersTable } from "@workspace/db";
import { CreateAdminUserBody, CreateAdminUserResponse, ListAdminUsersResponse, GetAuthAccessResponse } from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const clerk = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? "" });

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
  try {
    const existing = await db.select({ userId: approvedUsersTable.userId })
      .from(approvedUsersTable).where(eq(approvedUsersTable.email, email)).limit(1);
    if (existing.length) {
      res.status(400).json({ error: "A user with that email already exists" });
      return;
    }
    const user = await clerk().users.createUser({
      emailAddress: [email],
      password: parsed.data.password,
    });
    const [approved] = await db.insert(approvedUsersTable).values({
      userId: user.id, email, role: "user", active: true,
    }).returning();
    res.status(201).json(CreateAdminUserResponse.parse({
      user_id: approved.userId, email: approved.email, role: approved.role,
      active: approved.active, created_at: approved.createdAt,
    }));
  } catch (error) {
    req.log.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "Admin user creation failed");
    res.status(400).json({ error: "Unable to create user" });
  }
});

export default router;