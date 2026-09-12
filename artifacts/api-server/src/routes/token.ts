import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, derivCredentialsTable } from "@workspace/db";
import { TestDerivTokenBody, TestDerivTokenResponse, GetDerivTokenStatusResponse, DeleteDerivTokenResponse } from "@workspace/api-zod";
import { decryptPat, encryptPat } from "../lib/pat-crypto";
import { disposeUser, setUserPat, withUserSerialized } from "../lib/deriv";

const router: IRouter = Router();
const appId = process.env.DERIV_APP_ID;

router.post("/token/test", async (req, res): Promise<void> => {
  const parsed = TestDerivTokenBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A Deriv token is required" }); return; }
  if (!appId) { res.status(500).json({ error: "DERIV_APP_ID is not configured" }); return; }
  try {
    const userId = res.locals.userId as string;
    const accounts = await withUserSerialized(userId, async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
        headers: { "Deriv-App-ID": appId, Authorization: `Bearer ${parsed.data.token}`, "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
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
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "Deriv token validation timed out. Check the PAT scopes and try again."
      : error instanceof Error ? error.message : "Unable to validate Deriv token";
    req.log.warn({ err: error }, "Deriv token validation failed");
    res.status(message === "Unable to validate Deriv token" ? 502 : 400).json({ error: message });
  }
});

router.get("/token/status", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, res.locals.userId as string)).limit(1);
  let hasToken = Boolean(row);
  if (row) {
    try {
      decryptPat(row.encryptedPat);
    } catch {
      hasToken = false;
      await db.delete(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, row.clerkUserId));
      disposeUser(res.locals.userId as string);
    }
  }
  res.json(GetDerivTokenStatusResponse.parse({ has_token: hasToken, expires_at: hasToken ? row?.expiresAt ?? null : null, last_verified_at: hasToken ? row?.lastVerifiedAt ?? null : null }));
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