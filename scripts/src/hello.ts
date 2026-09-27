console.log("Hello from @workspace/scripts");
import express from 'express';
import pinoHttp from 'pino-http';
import { IncomingMessage, ServerResponse } from 'http';

const app = express();

// Correct way to create the logger
const logger = pinoHttp();

// Use the logger as middleware
app.use(logger);

// Example route (you can keep or change this)
app.get('/', (req: IncomingMessage, res: ServerResponse) => {
  // req.log is available thanks to pino-http
  (req as any).log?.info('Hello from the root route');
  res.end('Hello World');
});

// Another example if you need typed Express Request/Response
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;