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
} from './api/_lib/openrouter.js';

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
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // Vite 8 still injects /@vite/client with a WebSocket connection on port 24678
    // even when hmr/ws are disabled. Serve a zero-WebSocket client shim that keeps
    // dev CSS injection (updateStyle/removeStyle) and module HMR APIs intact.
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`const sheetsMap = new Map();

export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}

export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}

export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}

export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}

const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};
export class ErrorOverlay extends BaseElement {}
`);
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
