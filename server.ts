import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  handleHealth,
  handleParseItem,
  handleParseVoice,
  handleScanBill,
  handleTranscribe,
  handleTts,
} from './api/_lib/openrouter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApiApp() {
  const app = express();

  app.use(express.json({ limit: '25mb' }));

  app.all('/api/health', (req, res) => {
    void handleHealth(req, res);
  });
  app.all('/api/ai/transcribe', (req, res) => {
    void handleTranscribe(req, res);
  });
  app.all('/api/ai/parse-voice', (req, res) => {
    void handleParseVoice(req, res);
  });
  app.all('/api/ai/scan-bill', (req, res) => {
    void handleScanBill(req, res);
  });
  app.all('/api/ai/parse-item', (req, res) => {
    void handleParseItem(req, res);
  });
  app.all('/api/ai/tts', (req, res) => {
    void handleTts(req, res);
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CM Voice Khata server running on http://localhost:${PORT} (OpenRouter AI)`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
