import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import apiRouter from './routes/api.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Behind a reverse proxy (Caddy/nginx) so req.ip is the real client for rate limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// In production the frontend is served from this same origin, so CORS is only needed in dev
if (!isProd) {
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
}
app.use(express.json({ limit: '64kb' }));

app.use('/api', apiRouter);

if (isProd) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, '../../frontend/dist');
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    console.warn(`[Backlot] frontend build not found at ${distPath}. Run "npm run build" in frontend/.`);
  }
  app.use(express.static(distPath, { maxAge: '7d', index: false }));
  // SPA fallback for client-side routes (/chat, /credits). Express 5 needs a regex here, not '*'.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[Backlot] listening on http://localhost:${PORT} (${isProd ? 'production' : 'development'})`);
  if (!process.env.QLOO_API_KEY) console.warn('[Backlot] QLOO_API_KEY is not set');
  if (!process.env.AWS_ACCESS_KEY_ID) console.log('[Backlot] No AWS keys in env; Bedrock will use the default credential chain (e.g. EC2 instance role)');
});
