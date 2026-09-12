import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/admin-bootstrap";

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

void bootstrapAdmin()
  .catch((err: unknown) => {
    // A missing bootstrap configuration must not take the trading API offline.
    // Clerk-protected admin routes remain unavailable until the configuration
    // is restored, while PAT-backed guest trading can continue to operate.
    logger.error({ err }, "Administrator bootstrap unavailable; starting API without bootstrap");
  })
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  });
