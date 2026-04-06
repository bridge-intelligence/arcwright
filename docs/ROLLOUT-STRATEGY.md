# Arcwright — Rollout & Monetization Strategy

## 1. Cost Control & Guardrails

### AI Cost Guardrails
| Guard | Implementation | Status |
|-------|---------------|--------|
| **Commit dedup** | Skip analysis if same commit SHA already analyzed | Done |
| **Diff filter** | Only re-analyze if architectural files changed | Done |
| **Auto-sync toggle** | Per-repo on/off for webhook triggers | Done |
| **Free tier default** | Cloudflare AI (free) is default, Claude API is opt-in | Done |
| **Cost display** | Show tokens + cost before and after Claude analysis | Done |
| **Daily budget** | Max $ per tenant per day (e.g., $1/day free, $10/day pro) | TODO |
| **Rate limiting** | Max analyses per hour per tenant | TODO |
| **Token budget** | Max total tokens per month per plan | TODO |
| **Cached results** | Don't re-analyze unchanged branches | Done |

### Control Plane
- **Admin dashboard**: usage metrics, cost per tenant, analysis queue
- **Feature flags**: enable/disable Claude API per tenant
- **Quota management**: set limits per plan tier
- **Audit log**: who analyzed what, when, cost

## 2. Multi-Tenant Architecture (Current → Target)

### Current (MVP)
```
User → Tenant (auto-created on signup)
Tenant → Projects → Repos → Analyses
```

### Target (Production)
```
User → belongs to Organization(s)
Organization → has Workspace(s)
Workspace → has Projects → Repos → Analyses
Organization → has Team(s) → has Members (roles)
Organization → has Billing (Stripe subscription)
```

### Database Schema Additions
```sql
-- Organizations (billing entity)
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',        -- free, pro, enterprise
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_email TEXT,
  usage_limits JSONB,                       -- {analyses_per_month, claude_tokens, repos}
  created_at TEXT DEFAULT datetime('now')
);

-- Org membership
CREATE TABLE org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',       -- owner, admin, member, viewer
  invited_at TEXT,
  accepted_at TEXT
);

-- Usage tracking
CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,                        -- 'analysis', 'claude_api', 'cf_ai'
  repo_id TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  created_at TEXT DEFAULT datetime('now')
);
```

## 3. Pricing Tiers

| Feature | Free | Pro ($15/mo) | Team ($49/mo) | Enterprise |
|---------|------|-------------|---------------|------------|
| Repos | 3 | 20 | Unlimited | Unlimited |
| Analyses/month | 10 | 100 | 500 | Unlimited |
| CF AI analysis | ✓ | ✓ | ✓ | ✓ |
| Claude API analysis | — | 20/mo | 100/mo | Unlimited |
| Claude tokens/mo | — | 500K | 2M | Custom |
| Projects | 1 | 5 | Unlimited | Unlimited |
| Team members | 1 | 5 | 25 | Unlimited |
| Webhook auto-sync | — | ✓ | ✓ | ✓ |
| Branch analysis | ✓ | ✓ | ✓ | ✓ |
| Export XML | ✓ | ✓ | ✓ | ✓ |
| Push to arcwright branch | — | ✓ | ✓ | ✓ |
| Custom system instructions | — | ✓ | ✓ | ✓ |
| API access | — | — | ✓ | ✓ |
| SSO/SAML | — | — | — | ✓ |
| Self-hosted | — | — | — | ✓ |

## 4. Payment Integration

### Option A: Stripe (Primary)
- Stripe Checkout for subscriptions
- Stripe Billing Portal for plan management
- Stripe Webhooks for payment events
- Metered billing for Claude API overage

### Option B: LemonSqueezy (Alternative — no Stripe account needed)
- Simple checkout links
- Built-in tax handling
- Webhook-based fulfillment
- Good for indie/bootstrap

### Option C: Paddle (Alternative — handles global taxes)
- Merchant of Record (they handle taxes/VAT)
- Simple integration
- Good for international

### Recommendation
Start with **LemonSqueezy** (simpler, faster to set up, handles taxes), upgrade to **Stripe** when you need metered billing for Claude API tokens.

## 5. Pages to Build

| Page | Route | Priority |
|------|-------|----------|
| **User Profile** | /settings/profile | High |
| **Organization Settings** | /settings/org | High |
| **Team Management** | /settings/team | High |
| **Billing & Plans** | /settings/billing | High |
| **Usage Dashboard** | /settings/usage | High |
| **API Keys** | /settings/api-keys | Medium |
| **Audit Log** | /settings/audit | Medium |
| **Admin Dashboard** | /admin | Low |

## 6. Implementation Priority

### Phase 1: Guardrails (1 week)
- [ ] Daily budget per tenant
- [ ] Rate limiting (analyses/hour)
- [ ] Usage tracking table
- [ ] Cost dashboard in settings

### Phase 2: Organizations & Teams (2 weeks)
- [ ] Organization CRUD
- [ ] Team invites (email-based)
- [ ] Role-based access (owner, admin, member, viewer)
- [ ] Organization switcher in nav

### Phase 3: Billing (1 week)
- [ ] LemonSqueezy or Stripe integration
- [ ] Plan selection page
- [ ] Subscription webhooks
- [ ] Quota enforcement

### Phase 4: Polish (1 week)
- [ ] User profile page
- [ ] Usage analytics dashboard
- [ ] Audit log
- [ ] API key management for external access
