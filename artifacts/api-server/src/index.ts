import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/admin-bootstrap";
import { syncConfiguredPrimaryAdminKey } from "./lib/access-keys";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  await bootstrapAdmin().catch((err: unknown) => {
    // A missing bootstrap configuration must not take the trading API offline.
    // Clerk-protected admin routes remain unavailable until the configuration
    // is restored, while PAT-backed guest trading can continue to operate.
    logger.error({ err }, "Administrator bootstrap unavailable; starting API without bootstrap");
  });

  try {
    await syncConfiguredPrimaryAdminKey();
  } catch (err) {
    logger.error({ err }, "Primary administrator access-key synchronization unavailable");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

void startServer();
