import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db, approvedUsersTable } from "@workspace/db";
import { logger } from "./logger";

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function bootstrapAdmin(): Promise<void> {
  const rawEmail = process.env.JDY_ADMIN_EMAIL;
  const initialPassword = process.env.JDY_ADMIN_INITIAL_PASSWORD;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!rawEmail || !secretKey) {
    throw new Error("Admin bootstrap is not configured: required server secrets are missing");
  }
  const email = normalizedEmail(rawEmail);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Admin bootstrap email is invalid");
  }
  const clerk = createClerkClient({ secretKey });
  try {
    const existingApproved = await db.select().from(approvedUsersTable)
      .where(eq(approvedUsersTable.email, email)).limit(1);
    if (existingApproved[0]?.active && existingApproved[0].role === "admin") return;

    const found = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    let user = found.data[0];
    if (!user) {
      if (!initialPassword) {
        throw new Error("Admin bootstrap cannot provision the initial administrator");
      }
      user = await clerk.users.createUser({
        emailAddress: [email],
        password: initialPassword,
        publicMetadata: { role: "admin" },
      });
    }
    await db.insert(approvedUsersTable).values({
      userId: user.id, email, role: "admin", active: true,
    }).onConflictDoUpdate({
      target: approvedUsersTable.userId,
      set: { email, role: "admin", active: true },
    });
    logger.info({ provisioned: true }, "Administrator access provisioned");
  } catch (error) {
    const clerkError = error as {
      name?: string;
      status?: number;
      errors?: Array<{ code?: string }>;
    };
    logger.error({
      errorType: clerkError?.name ?? "unknown",
      status: clerkError?.status,
      codes: clerkError?.errors?.map((entry) => entry.code).filter(Boolean),
    }, "Administrator bootstrap failed");
    throw new Error("Admin bootstrap failed; administrator access could not be provisioned");
  }
}