import { Router, type IRouter } from "express";
import {
  GetDerivAccountsResponse,
  GetDerivHistoryResponse,
  GetDerivStatusResponse,
  RequestDerivProposalBody,
  RequestDerivProposalResponse,
  BuyDerivContractBody,
  BuyDerivContractResponse,
  SellDerivContractBody,
  SellDerivContractResponse,
  BulkBuyDerivContractsBody,
  BulkBuyDerivContractsResponse,
  DualBuyDerivContractsBody,
  SelectDerivAccountBody,
  SelectDerivAccountResponse,
  SelectDerivSymbolBody,
  SelectDerivSymbolResponse,
  TestDerivConnectionResponse,
} from "@workspace/api-zod";
import {
  getAccounts,
  getStatus,
  getLiveStatus,
  getHistory,
  clearHistory,
  requestProposal,
  buyContract,
  sellContract,
  bulkBuyContracts,
  dualBuyContracts,
  selectAccount,
  selectSymbol,
  testConnection,
  withUser,
  withUserSerialized,
  setUserPat,
  disposeUser,
  DerivCredentialError,
} from "../lib/deriv";
import { db, derivCredentialsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptPat } from "../lib/pat-crypto";

const router: IRouter = Router();
class MissingDerivCredentialError extends Error {}
class InvalidStoredCredentialError extends Error {}

function isCredentialError(error: unknown): error is Error {
  return error instanceof MissingDerivCredentialError
    || error instanceof InvalidStoredCredentialError
    || error instanceof DerivCredentialError;
}

async function withCredential<T>(
  userId: string,
  operation: () => Promise<T>,
  serialize = true,
): Promise<T> {
  const run = async () => {
    let [credential] = await db
      .select()
      .from(derivCredentialsTable)
      .where(eq(derivCredentialsTable.clerkUserId, userId))
      .limit(1);
    let hasStoredCredential = Boolean(credential);
    if (credential) {
      try {
        const pat = decryptPat(credential.encryptedPat);
        setUserPat(userId, pat);
      } catch {
        await db.delete(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, userId));
        hasStoredCredential = false;
        throw new InvalidStoredCredentialError("The saved Deriv token is no longer readable. Enter it again to reconnect.");
      }
    }
    if (!hasStoredCredential) throw new MissingDerivCredentialError("Connect a Deriv token first");
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DerivCredentialError)) throw error;
      await db.delete(derivCredentialsTable).where(eq(derivCredentialsTable.clerkUserId, userId));
      disposeUser(userId);
      throw new InvalidStoredCredentialError("The saved Deriv token was rejected. Enter your PAT again to reconnect.");
    }
  };
  return serialize ? withUserSerialized(userId, run) : withUser(userId, run);
}

router.get("/deriv/accounts", async (req, res) => {
  try {
    const accounts = GetDerivAccountsResponse.parse(await withCredential(res.locals.userId, getAccounts, false));
    res.set("Cache-Control", "no-store");
    res.json(accounts);
  } catch (error) {
    if (isCredentialError(error)) {
      res.status(401).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Unable to load Deriv accounts");
    res.status(502).json({ error: "Unable to load Deriv accounts from Deriv" });
  }
});

router.get("/deriv/status", (_req, res) => {
  void withCredential(res.locals.userId, getLiveStatus, false)
    .then((status) => {
      res.set("Cache-Control", "no-store");
      res.json(GetDerivStatusResponse.parse(status));
    })
    .catch((error) => {
       const missingCredential = isCredentialError(error);
       res.status(missingCredential ? 401 : 502).json({
        error: missingCredential ? error.message : "Unable to refresh Deriv balance",
      });
    });
});

router.get("/deriv/history", (req, res) => {
  res.set("Cache-Control", "no-store");
  withCredential(res.locals.userId, async () => getHistory(), false)
    .then((history) => res.json(GetDerivHistoryResponse.parse(history)))
     .catch((error) => {
       const missingCredential = isCredentialError(error);
       if (!missingCredential) req.log.error({ err: error }, "Unable to load Deriv history");
       return res.status(missingCredential ? 401 : 502).json({
       error: missingCredential ? error.message : "Unable to load Deriv history",
       });
     });
});

router.delete("/deriv/history", (_req, res) => {
  res.set("Cache-Control", "no-store");
  withCredential(res.locals.userId, async () => clearHistory(), false)
    .then((result) => res.json(result))
     .catch((error) => {
       const missingCredential = isCredentialError(error);
       return res.status(missingCredential ? 401 : 502).json({
       error: missingCredential ? error.message : "Unable to clear Deriv history",
       });
     });
});

router.post("/deriv/test-connection", async (req, res) => {
  try {
    const result = TestDerivConnectionResponse.parse(await withCredential(res.locals.userId, testConnection, true));
    res.json(result);
  } catch (error) {
    if (isCredentialError(error)) {
      res.status(401).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Deriv connection test failed");
    res.status(502).json({ error: "Deriv connection test failed" });
  }
});

router.post("/deriv/proposals", async (req, res) => {
  const parsed = RequestDerivProposalBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid proposal request" });
  }

  try {
    const result = RequestDerivProposalResponse.parse(await withCredential(res.locals.userId, () => requestProposal(parsed.data), true));
    return res.status(202).json(result);
  } catch (error) {
    req.log.error({ err: error }, "Deriv proposal request failed");
     const missingCredential = isCredentialError(error);
     return res.status(missingCredential ? 401 : 503).json({
       error: missingCredential ? error.message : "Deriv WebSocket is not ready",
    });
  }
});

router.post("/deriv/select-account", async (req, res) => {
  const parsed = SelectDerivAccountBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid account selection" });

  try {
    const result = SelectDerivAccountResponse.parse(await withCredential(res.locals.userId, () => selectAccount(parsed.data.account_id), true));
    return res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Deriv account selection failed");
     const missingCredential = isCredentialError(error);
     return res.status(missingCredential ? 401 : 502).json({ error: missingCredential ? error.message : "Unable to select account" });
  }
});

router.post("/deriv/select-symbol", async (req, res) => {
  const parsed = SelectDerivSymbolBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid market selection" });
  try {
    const result = SelectDerivSymbolResponse.parse(
      await withCredential(res.locals.userId, () => selectSymbol(parsed.data.symbol), true),
    );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to select market";
     const missingCredential = isCredentialError(error);
     return res.status(missingCredential ? 401 : 400).json({ error: missingCredential ? error.message : message });
  }
});

router.post("/deriv/buy", async (req, res) => {
  const parsed = BuyDerivContractBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Explicit live-trade confirmation is required" });

  try {
    const result = BuyDerivContractResponse.parse(await withCredential(res.locals.userId, () => buyContract(parsed.data), true));
    return res.status(202).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Buy request failed";
    req.log.error({ err: error }, "Deriv live buy request failed");
     const status = isCredentialError(error)
      ? 401
      : message.includes("disabled") || message.includes("real account")
      ? 403
       : message.includes("still settling") || message.includes("safety timeout")
         ? 409
      : message.includes("cooldown")
        ? 429
       : message.includes("not available") || message.includes("balance") || message.includes("confirmation") || message.includes("offers no return") || message.includes("duration")
        ? 400
        : message.includes("did not return a proposal") || message.includes("WebSocket is not ready")
          ? 504
        : 502;
    return res.status(status).json({ error: message });
  }
});

router.post("/deriv/sell", async (req, res) => {
  const parsed = SellDerivContractBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid contract close request" });

  try {
    const result = SellDerivContractResponse.parse(
      await withCredential(res.locals.userId, () => sellContract(parsed.data.contract_id), true),
    );
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contract close request failed";
    req.log.error({ err: error }, "Deriv contract close request failed");
    const status = isCredentialError(error)
      ? 401
      : message.includes("WebSocket is not ready")
        ? 504
        : 502;
    return res.status(status).json({ error: message });
  }
});

router.post("/deriv/bulk-buy", async (req, res) => {
  const parsed = BulkBuyDerivContractsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid bulk buy request" });

  try {
    const result = BulkBuyDerivContractsResponse.parse(
      await withCredential(res.locals.userId, () => bulkBuyContracts(parsed.data), true),
    );
    return res.status(202).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk buy request failed";
    req.log?.error({ err: error }, "Deriv bulk buy request failed");
    const status = isCredentialError(error)
      ? 401
      : message.includes("disabled") || message.includes("real account")
      ? 403
      : message.includes("still settling") || message.includes("safety timeout")
        ? 409
       : message.includes("not available") || message.includes("balance") || message.includes("confirmation") || message.includes("offers no return") || message.includes("duration")
        ? 400
        : message.includes("did not return a proposal") || message.includes("WebSocket is not ready")
          ? 504
        : 502;
    return res.status(status).json({ error: message });
  }
});

router.post("/deriv/dual-buy", async (req, res) => {
  const parsed = DualBuyDerivContractsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid dual buy request" });

  try {
    const result = BulkBuyDerivContractsResponse.parse(
      await withCredential(res.locals.userId, () => dualBuyContracts(parsed.data), true),
    );
    return res.status(202).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dual buy request failed";
    req.log.error({ err: error }, "Deriv dual buy request failed");
    const status = isCredentialError(error)
      ? 401
      : message.includes("disabled") || message.includes("real account")
      ? 403
      : message.includes("still settling") || message.includes("safety timeout")
        ? 409
       : message.includes("not available") || message.includes("balance") || message.includes("confirmation") || message.includes("offers no return")
        ? 400
        : message.includes("did not return a proposal") || message.includes("WebSocket is not ready")
          ? 504
        : 502;
    return res.status(status).json({ error: message });
  }
});

export default router;