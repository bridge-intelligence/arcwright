import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import auth from './routes/auth';
import projects from './routes/projects';
import repos from './routes/repos';
import settings from './routes/settings';
import webhooks from './routes/webhooks';

const app = new Hono<{ Bindings: Env }>();

// CORS for frontend
app.use('*', cors({
  origin: (origin, c) => {
    const appUrl = c.env.APP_URL;
    const allowed = [appUrl, 'http://localhost:5200', 'http://localhost:3000'];
    return allowed.includes(origin) ? origin : appUrl;
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', environment: c.env.ENVIRONMENT }));

// Routes
app.route('/api/auth', auth);
app.route('/api/projects', projects);
app.route('/api/repos', repos);
app.route('/api/settings', settings);
app.route('/api/webhooks', webhooks);

// 404 fallback for API routes
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
