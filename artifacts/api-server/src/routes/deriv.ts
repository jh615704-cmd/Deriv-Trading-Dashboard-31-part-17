import { Router, type IRouter } from "express";
import {
  GetDerivAccountsResponse,
  GetDerivStatusResponse,
  RequestDerivProposalBody,
  RequestDerivProposalResponse,
  BuyDerivContractBody,
  BuyDerivContractResponse,
  SelectDerivAccountBody,
  SelectDerivAccountResponse,
  TestDerivConnectionResponse,
} from "@workspace/api-zod";
import {
  getAccounts,
  getStatus,
  getLiveStatus,
  getHistory,
  requestProposal,
  buyContract,
  selectAccount,
  startDeriv,
  testConnection,
} from "../lib/deriv";

const router: IRouter = Router();

router.get("/deriv/accounts", async (req, res) => {
  try {
    const accounts = GetDerivAccountsResponse.parse(await getAccounts());
    res.set("Cache-Control", "no-store");
    res.json(accounts);
  } catch (error) {
    req.log.error({ err: error }, "Unable to load Deriv accounts");
    res.status(502).json({ error: "Unable to load Deriv accounts from Deriv" });
  }
});

router.get("/deriv/status", (_req, res) => {
  void getLiveStatus()
    .then((status) => {
      res.set("Cache-Control", "no-store");
      res.json(GetDerivStatusResponse.parse(status));
    })
    .catch((error) => {
      res.status(502).json({ error: "Unable to refresh Deriv balance" });
    });
});

router.get("/deriv/history", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(getHistory());
});

router.post("/deriv/test-connection", async (req, res) => {
  try {
    const result = TestDerivConnectionResponse.parse(await testConnection());
    res.json(result);
  } catch (error) {
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
    const result = RequestDerivProposalResponse.parse(await requestProposal(parsed.data));
    return res.status(202).json(result);
  } catch (error) {
    req.log.error({ err: error }, "Deriv proposal request failed");
    return res.status(503).json({ error: "Deriv WebSocket is not ready" });
  }
});

router.post("/deriv/select-account", async (req, res) => {
  const parsed = SelectDerivAccountBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid account selection" });

  try {
    const result = SelectDerivAccountResponse.parse(await selectAccount(parsed.data.account_id));
    return res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "Deriv account selection failed");
    return res.status(502).json({ error: error instanceof Error ? error.message : "Unable to select account" });
  }
});

router.post("/deriv/buy", async (req, res) => {
  const parsed = BuyDerivContractBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Explicit live-trade confirmation is required" });

  try {
    const result = BuyDerivContractResponse.parse(await buyContract(parsed.data));
    return res.status(202).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live buy request failed";
    req.log.error({ err: error }, "Deriv live buy request failed");
    const status = message.includes("disabled") || message.includes("real account")
      ? 403
      : message.includes("not available") || message.includes("confirmation")
        ? 400
        : 503;
    return res.status(status).json({ error: message });
  }
});

startDeriv();

export default router;