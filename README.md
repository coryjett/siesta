# Siesta

A Sales Engineering pipeline management platform that integrates with Salesforce and Gong to provide unified visibility into opportunities, call transcripts, and activities.

## What It Does

Siesta syncs data from Salesforce CRM and Gong, giving Sales Engineers and their managers a single place to:

- Track opportunities across pipeline stages (list and kanban views)
- Search Gong call transcripts with full-text search
- Take rich-text notes on accounts and opportunities
- Surface attention items — overdue and stale deals
- View upcoming activities and recent calls from a dashboard
- Manage user roles and integration settings

## Tech Stack

| Layer          | Technology                                              |
| -------------- | ------------------------------------------------------- |
| Frontend       | React 19, TanStack Router & Query, Tailwind CSS 4, Vite |
| Backend        | Fastify 5, TypeScript, Drizzle ORM                      |
| Database       | PostgreSQL 16 (pg_trgm, pgcrypto)                       |
| Queue/Cache    | Redis 7, BullMQ                                         |
| Auth           | Google OAuth / dev-bypass                                |
| Rich Text      | TipTap                                                  |
| Monorepo       | Turborepo, npm workspaces                               |
| Infrastructure | Docker, Kubernetes                                      |

## Project Structure

```
siesta/
├── apps/
│   ├── server/        # Fastify API server
│   └── web/           # React SPA
├── packages/
│   └── shared/        # Shared types, validation schemas, constants
├── k8s/               # Kubernetes manifests
├── scripts/           # Database init scripts
├── docker-compose.yml # Local Postgres + Redis
├── Dockerfile         # Production container
└── turbo.json         # Turborepo config
```

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker and Docker Compose (for local Postgres and Redis)

## Getting Started

1. **Start infrastructure**

   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` as needed. The defaults work for local development with `AUTH_MODE=dev-bypass`.

4. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

5. **Start development servers**

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Health check: http://localhost:3000/health

## Environment Variables

| Variable              | Description                                | Default                          |
| --------------------- | ------------------------------------------ | -------------------------------- |
| `NODE_ENV`            | `development`, `production`, or `test`     | `development`                    |
| `PORT`                | Server port                                | `3000`                           |
| `APP_URL`             | Frontend URL                               | `http://localhost:5173`          |
| `API_URL`             | Backend URL                                | `http://localhost:3000`          |
| `DATABASE_URL`        | PostgreSQL connection string               | `postgresql://siesta:siesta@localhost:5432/siesta` |
| `REDIS_URL`           | Redis connection string                    | `redis://localhost:6379`         |
| `SESSION_SECRET`      | Secret for signing session cookies         | —                                |
| `AUTH_MODE`           | `google` or `dev-bypass`                   | `dev-bypass`                     |
| `GOOGLE_CLIENT_ID`    | Google OAuth client ID (when using google) | —                                |
| `GOOGLE_CLIENT_SECRET`| Google OAuth client secret                 | —                                |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL                  | `http://localhost:3000/auth/callback` |
| `ENCRYPTION_KEY`      | 32-byte hex key for encrypting tokens      | zeroed key (change in prod)      |
| `COOKIE_SECURE`       | Force secure cookies (`true`/`false`)      | auto based on `NODE_ENV`         |

## Scripts

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start all apps in development mode           |
| `npm run build`      | Build all packages and apps                  |
| `npm run lint`       | Lint all workspaces                          |
| `npm run typecheck`  | Type-check all workspaces                    |
| `npm run db:generate`| Generate Drizzle migrations from schema      |
| `npm run db:migrate` | Run pending database migrations              |
| `npm run db:studio`  | Open Drizzle Studio for database inspection  |

## Integrations

### Salesforce

Configured via the Settings page. An admin pastes a Salesforce session ID and instance URL. The app syncs the following entities every 15 minutes:

- Accounts
- Opportunities (with stage tracking)
- Contacts and contact roles
- Activities (tasks and events)
- Opportunity stages

A configurable field mapping determines which Salesforce field identifies the assigned SE.

### Gong

Configured via the Settings page with a client ID and client secret. The app syncs every 30 minutes using cursor-based incremental sync:

- Call metadata (title, duration, participants)
- Full transcripts (speaker-segmented)
- Links calls to Salesforce accounts and opportunities

## Roles

| Role         | Access                                         |
| ------------ | ---------------------------------------------- |
| `se`         | Own assigned opportunities only                |
| `se_manager` | All opportunities with filtering               |
| `admin`      | All opportunities, settings, user management   |

## Production Deployment

### Docker

```bash
docker build -t siesta:latest .
docker run -p 3000:3000 --env-file .env siesta:latest
```

In production the server serves the built frontend as static files, so only port 3000 is needed.

### Kubernetes

Manifests are in the `k8s/` directory:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/app.yaml
```

## API Overview

| Method | Path                                | Description                          |
| ------ | ----------------------------------- | ------------------------------------ |
| GET    | `/api/home`                         | Dashboard data                       |
| GET    | `/api/opportunities`                | List opportunities (filterable)      |
| GET    | `/api/opportunities/kanban`         | Kanban board data                    |
| GET    | `/api/opportunities/:id`            | Opportunity detail                   |
| GET    | `/api/opportunities/:id/contacts`   | Contacts for an opportunity          |
| GET    | `/api/opportunities/:id/activities` | Activities for an opportunity        |
| GET    | `/api/accounts`                     | List accounts                        |
| GET    | `/api/accounts/:id`                 | Account detail                       |
| GET    | `/api/accounts/:id/opportunities`   | Opportunities for an account         |
| GET    | `/api/accounts/:id/calls`           | Gong calls for an account            |
| GET    | `/api/search`                       | Full-text search in call transcripts |
| GET    | `/api/gong`                         | List Gong calls                      |
| GET    | `/api/gong/:id`                     | Call detail with transcript          |
| POST   | `/api/notes`                        | Create a note                        |
| PUT    | `/api/notes/:id`                    | Update a note (author only)          |
| DELETE | `/api/notes/:id`                    | Delete a note (author only)          |
| GET    | `/api/notes`                        | List notes for account/opportunity   |
| GET    | `/api/settings/connections`         | Integration connection status        |
| POST   | `/api/sync/trigger/:provider`       | Trigger manual sync                  |
| GET    | `/api/sync/status`                  | Sync status for all entities         |
