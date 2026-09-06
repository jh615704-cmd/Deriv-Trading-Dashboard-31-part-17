import { Router, type IRouter } from "express";
import {
  GetDerivAccountsResponse,
  GetDerivStatusResponse,
  RequestDerivProposalBody,
  RequestDerivProposalResponse,
  TestDerivConnectionResponse,
} from "@workspace/api-zod";
import {
  getAccounts,
  getStatus,
  requestProposal,
  startDeriv,
  testConnection,
} from "../lib/deriv";

const router: IRouter = Router();

router.get("/deriv/accounts", async (req, res) => {
  try {
    const accounts = GetDerivAccountsResponse.parse(await getAccounts());
    res.json(accounts);
  } catch (error) {
    req.log.error({ err: error }, "Unable to load Deriv accounts");
    res.status(502).json({ error: "Unable to load Deriv accounts from Deriv" });
  }
});

router.get("/deriv/status", (_req, res) => {
  res.json(GetDerivStatusResponse.parse(getStatus()));
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

startDeriv();

export default router;