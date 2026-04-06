import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const projects = new Hono<{ Bindings: Env }>();
projects.use('*', authMiddleware);

// List projects for tenant
projects.get('/', async (c) => {
  const user = c.get('user');
  const results = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM repos r WHERE r.project_id = p.id) as repo_count,
       (SELECT COUNT(*) FROM repos r WHERE r.project_id = p.id AND r.status = 'ready') as analyzed_count
     FROM projects p WHERE p.tenant_id = ? ORDER BY p.updated_at DESC`
  ).bind(user.tenant_id).all();
  return c.json(results.results);
});

// Create project
projects.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name: string; description?: string }>();

  if (!body.name?.trim()) return c.json({ error: 'name required' }, 400);

  const id = crypto.randomUUID();
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  await c.env.DB.prepare(
    `INSERT INTO projects (id, tenant_id, name, slug, description, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, user.tenant_id, body.name.trim(), slug, body.description?.trim() || null, user.sub).run();

  return c.json({ id, name: body.name.trim(), slug }, 201);
});

// Get project with its repos
projects.get('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ? AND tenant_id = ?'
  ).bind(projectId, user.tenant_id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  const repos = await c.env.DB.prepare(
    `SELECT r.*,
       (SELECT a.services_count FROM analyses a WHERE a.repo_id = r.id AND a.status = 'completed' ORDER BY a.created_at DESC LIMIT 1) as services,
       (SELECT a.issues_count FROM analyses a WHERE a.repo_id = r.id AND a.status = 'completed' ORDER BY a.created_at DESC LIMIT 1) as issues
     FROM repos r WHERE r.project_id = ? ORDER BY r.created_at DESC`
  ).bind(projectId).all();

  return c.json({ ...project, repos: repos.results });
});

// Update project
projects.put('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; system_instructions?: string }>();

  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ? AND tenant_id = ?'
  ).bind(projectId, user.tenant_id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), system_instructions = COALESCE(?, system_instructions), updated_at = datetime('now') WHERE id = ?`
  ).bind(body.name?.trim() || null, body.description?.trim() || null, body.system_instructions !== undefined ? body.system_instructions : null, projectId).run();

  return c.json({ ok: true });
});

// Delete project (unlinks repos, doesn't delete them)
projects.delete('/:id', async (c) => {
  const user = c.get('user');
  const projectId = c.req.param('id');

  const project = await c.env.DB.prepare(
    'SELECT * FROM projects WHERE id = ? AND tenant_id = ?'
  ).bind(projectId, user.tenant_id).first();

  if (!project) return c.json({ error: 'Not found' }, 404);

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE repos SET project_id = NULL WHERE project_id = ?').bind(projectId),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
  ]);

  return c.json({ ok: true });
});

export default projects;
