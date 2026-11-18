import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../server.ts';

const app = createApiApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
