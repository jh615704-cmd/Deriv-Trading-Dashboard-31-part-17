import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, derivCredentialsTable } from "@workspace/db";
import { TestDerivTokenBody, TestDerivTokenResponse, GetDerivTokenStatusResponse, DeleteDerivTokenResponse } from "@workspace/api-zod";
import { encryptPat } from "../lib/pat-crypto";
import { disposeUser, setUserPat, withUserSerialized } from "../lib/deriv";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const appId = process.env.DERIV_APP_ID;

router.use(requireAuth);

router.post("/token/test", async (req, res): Promise<void> => {
  const parsed = TestDerivTokenBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A Deriv token is required" }); return; }
  if (!appId) { res.status(500).json({ error: "DERIV_APP_ID is not configured" }); return; }
  try {
    const userId = res.locals.userId as string;
    const accounts = await withUserSerialized(userId, async () => {
      const response = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
        headers: { "Deriv-App-ID": appId, Authorization: `Bearer ${parsed.data.token}`, "Content-Type": "application/json" },
      });
      const body = await response.json() as { data?: unknown; accounts?: unknown; errors?: Array<{ message?: string }> };
      if (!response.ok) {
        throw new Error(body.errors?.[0]?.message ?? "Token invalid or missing required scopes");
      }
      const raw = Array.isArray(body.data)
        ? body.data
        : body.data && typeof body.data === "object" && Array.isArray((body.data as { accounts?: unknown }).accounts)
          ? (body.data as { accounts: unknown[] }).accounts
          : Array.isArray(body.accounts) ? body.accounts : [];
      const normalized = raw.filter((account): account is Record<string, unknown> => Boolean(account && typeof account === "object")).map((account) => ({
        id: String(account.account_id ?? account.accountId ?? account.loginid ?? account.id ?? ""),
        type: (account.account_type === "demo" || account.type === "demo" || String(account.account_id ?? "").startsWith("DOT") ? "demo" : "real") as "demo" | "real",
        currency: String(account.currency ?? "USD"), balance: Number(account.balance ?? 0), status: String(account.status ?? "unknown"),
      })).filter((account) => account.id);
      if (!normalized.length) throw new Error("Deriv returned no Options accounts");
      const expiresAt = parsed.data.expires_at ? parsed.data.expires_at.toISOString().slice(0, 10) : null;
      const encryptedPat = encryptPat(parsed.data.token);
      await db.insert(derivCredentialsTable).values({
        clerkUserId: userId, encryptedPat, expiresAt, lastVerifiedAt: new Date(),
      }).onConflictDoUpdate({ target: derivCredentialsTable.clerkUserId, set: {
        encryptedPat, expiresAt, lastVerifiedAt: new Date(), updatedAt: new Date(),
      }});
      disposeUser(userId);
      setUserPat(userId, parsed.data.token);
      return normalized;
    });
    res.json(TestDerivTokenResponse.parse({ success: true, message: "Deriv token validated and saved", accounts }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate Deriv token";
    req.log.warn({ err: error }, "Deriv token validation failed");
    res.status(message === "Unable to validate Deriv token" ? 502 : 400).json({ error: message });
  }
});

router.get("/token/status", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, res.locals.userId as string)).limit(1);
  res.json(GetDerivTokenStatusResponse.parse({ has_token: Boolean(row), expires_at: row?.expiresAt ?? null, last_verified_at: row?.lastVerifiedAt ?? null }));
});

router.delete("/token", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await withUserSerialized(userId, async () => {
    await db.delete(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, userId));
    disposeUser(userId);
  });
  res.json(DeleteDerivTokenResponse.parse({ success: true }));
});

export default router;