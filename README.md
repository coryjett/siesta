# Siesta

Sales Engineering portfolio management platform powered by MCP (Model Context Protocol). Provides unified visibility into accounts, interactions, and portfolio health.

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker and Docker Compose (for local PostgreSQL and Redis)

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
   # Edit .env with your MCP, OpenAI, and other credentials
   ```

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

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all packages and apps |
| `npm run typecheck` | Type-check all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run db:generate` | Generate Drizzle migrations from schema |
| `npm run db:migrate` | Run pending database migrations |
| `npm run db:studio` | Open Drizzle Studio GUI |

## Architecture

```
                                    siesta namespace                                          telemetry namespace
 ┌──────────┐      ┌──────────────────────────────────────────────────────────┐      ┌──────────────────────────────┐
 │          │      │                                                          │      │                              │
 │          │ HTTPS│  ┌─────────────────────────────────────────────────────┐  │      │  ┌────────────────────────┐  │
 │          ├──────┼──┤            Agent Gateway (Gateway API)              │  │      │  │        Grafana         │  │
 │          │ :443 │  │                                                     │  │      │  │  Dashboards / Explore  │  │
 │ Browser  │      │  │  HTTPS :443 ─── TLS termination (Let's Encrypt)    │  │      │  └───┬──────────┬────────┘  │
 │          │      │  │  HTTP  :3001 ── MCP routing (API key auth)         │  │      │      │          │           │
 │          │      │  │  TCP   :5432 ── PostgreSQL passthrough             │  │      │  ┌───▼───┐  ┌───▼────────┐  │
 │          │      │  │  TCP   :6379 ── Redis passthrough                  │  │      │  │ Tempo │  │ Prometheus │  │
 └──────────┘      │  └──┬──────────┬──────────────────────────────────────┘  │      │  └───▲───┘  └────────────┘  │
                   │     │          │                                          │      │      │                      │
                   │     │ web      │ MCP / OpenAI                            │      │  ┌───┴────────────────────┐  │
                   │     │ traffic  │ traffic                                  │      │  │    OTEL Collector      │  │
                   │     │          │                                          │      │  │    (traces, gRPC)      │  │
                   │     ▼          ▼                                          │      │  └───▲───────────────▲────┘  │
                   │  ┌──────────────────────┐         ┌────────────────────┐  │      │      │               │      │
                   │  │                      │  fetch   │ Portfolio-Analyzer │  │      │      │               │      │
                   │  │   Siesta Server      ├────────►│    MCP Server      │  │      └──────┼───────────────┼──────┘
                   │  │   (Fastify + React)  │         │                    │  │             │               │
                   │  │                      │         │  Salesforce        │  │             │               │
                   │  │  ┌────────────────┐  │         │  Gong              │  │      traces │        traces │
                   │  │  │  OTEL SDK      │──┼─────────┼────────────────────┼──┼─────────────┘               │
                   │  │  │  (auto-instr.) │  │         │  Zendesk           │  │                             │
                   │  │  └────────────────┘  │         │  GitHub            │  │                             │
                   │  │                      │         │  Gmail             │  │  ┌──────────────────────┐   │
                   │  │  ┌────────────────┐  │         │  Calendar          │  │  │   Agent Gateway      │   │
                   │  │  │  OpenAI        │  │         └────────────────────┘  │  │   OTEL export        ├───┘
                   │  │  │  (gpt-4o-mini) │  │                                │  └──────────────────────┘
                   │  │  └────────────────┘  │                                │
                   │  └──┬────────────┬──────┘                                │
                   │     │            │                                        │
                   │     ▼            ▼                                        │
                   │  ┌────────┐  ┌──────────────┐                            │
                   │  │ Redis  │  │  PostgreSQL   │                            │
                   │  │ Cache  │  │ (CloudNativePG)│                           │
                   │  └────────┘  └──────────────┘                            │
                   │                                                          │
                   └──────────────────────────────────────────────────────────┘
```

## Environment Variables

All sensitive values must be provided via `.env` file (gitignored) or environment variables. No secrets have hardcoded defaults in source code.

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Session cookie signing secret | Yes |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM token encryption | Yes |
| `MCP_SERVER_URL` | MCP endpoint URL | Yes |
| `MCP_CLIENT_ID` | Keycloak client ID for MCP auth | Yes |
| `MCP_CLIENT_SECRET` | Keycloak client secret for MCP auth | Yes |
| `MCP_AUTH_URL` | Keycloak authorization endpoint | Yes |
| `MCP_TOKEN_URL` | Keycloak token endpoint | Yes |
| `MCP_GATEWAY_API_KEY` | Agent Gateway API key | No |
| `REDIS_URL` | Redis connection string | No (default: `redis://localhost:6379`) |
| `APP_URL` | Frontend URL | No (default: `http://localhost:5173`) |
| `API_URL` | Backend URL | No (default: `http://localhost:3000`) |
| `COOKIE_SECURE` | Force secure cookies | No (auto in production) |
| `OPENAI_API_KEY` | OpenAI API key (enables AI features) | No |
| `OPENAI_BASE_URL` | OpenAI API base URL | No (default: `https://api.openai.com/v1`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP gRPC endpoint for traces (enables tracing) | No |
| `OTEL_SERVICE_NAME` | Service name for traces | No (default: `siesta`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL | No |

## Kubernetes Deployment

### Prerequisites

- GKE Autopilot cluster with `amd64` nodes
- `kubectl` configured for the cluster
- `helm` v3+
- Cloudflare account with API token (Zone:DNS:Edit, Zone:Zone:Read)
- Enterprise Agent Gateway operator installed (`enterprise-agentgateway` GatewayClass)
- CloudNativePG operator installed

### 1. Create namespace and base resources

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/configmap.yaml
```

The `siesta-secret` must contain:
- `DATABASE_URL` -- PostgreSQL connection string
- `SESSION_SECRET` -- Random 64-char hex string
- `ENCRYPTION_KEY` -- Random 64-char hex string (32 bytes)
- `MCP_CLIENT_ID`, `MCP_CLIENT_SECRET`, `MCP_TOKEN_URL`, `MCP_AUTH_URL`, `MCP_SERVER_URL` -- Keycloak OIDC credentials
- `MCP_GATEWAY_API_KEY` -- Must match the agent gateway API key secret
- `OPENAI_API_KEY` -- OpenAI API key (optional -- enables AI features)

### 2. Deploy PostgreSQL (CloudNativePG)

```bash
kubectl apply -f k8s/postgres-cnpg.yaml
```

### 3. Deploy Redis

```bash
kubectl apply -f k8s/redis.yaml
```

### 4. Install cert-manager

```bash
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true \
  --set startupapicheck.enabled=false \
  --set global.leaderElection.namespace=cert-manager
```

Create the Cloudflare API token secret:
```bash
kubectl create secret generic cloudflare-api-token \
  -n cert-manager \
  --from-literal=api-token=<YOUR_CLOUDFLARE_API_TOKEN>
```

Apply the ClusterIssuer and Certificate:
```bash
kubectl apply -f k8s/cert-manager.yaml
```

### 5. Deploy Agent Gateway

Create the API key secret:
```bash
API_KEY=$(openssl rand -hex 32)
kubectl create secret generic siesta-agw-apikey \
  -n siesta \
  --from-literal=api-key="$API_KEY"
```

Add the same key to `siesta-secret` as `MCP_GATEWAY_API_KEY`.

Apply the gateway resources:
```bash
kubectl apply -f k8s/agentgateway.yaml
```

This creates:
- **Gateway** with 3 listeners: HTTPS/443 (web), HTTPS/3000 (MCP external), HTTP/3001 (MCP internal)
- **AgentgatewayBackend** for portfolio-analyzer MCP server
- **AgentgatewayBackend** for OpenAI API proxying
- **HTTPRoute** `siesta-web` routing web traffic to siesta Service
- **HTTPRoute** `portfolio-analyzer` routing MCP traffic to the backend
- **HTTPRoute** `openai-proxy` routing `/v1/*` to OpenAI
- **AgentgatewayPolicy** with API key auth on MCP listeners only

### 6. Deploy Telemetry Stack (OTEL, Tempo, Grafana)

```bash
./k8s/deploy-telemetry.sh
```

This deploys into the `telemetry` namespace:
- **Loki** -- log aggregation
- **Tempo** -- distributed trace storage
- **OpenTelemetry Collectors** -- traces (gRPC on 4317), metrics, and logs (DaemonSet)
- **kube-prometheus-stack** -- Prometheus + Grafana (with Tempo/Loki datasources pre-configured)
- **Grafana dashboards** -- Agent Gateway logs, traces, and metrics

After deployment, configure Agent Gateway to export traces:
```bash
kubectl apply -f k8s/agentgateway-telemetry.yaml
```

Access Grafana:
```bash
kubectl port-forward -n telemetry svc/kube-prometheus-stack-grafana 3001:80
```

To tear down: `./k8s/deploy-telemetry.sh --cleanup`

### 7. Deploy Siesta

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod \
  -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl apply -f k8s/app.yaml
```

### 8. Configure DNS

Point your domain to the agent gateway LoadBalancer IP:
```bash
kubectl get svc agentgateway -n siesta -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Create an A record for `siesta.cjett.net` pointing to this IP.

### Redeployment

```bash
npm run build
docker build --platform linux/amd64 -f Dockerfile.prod \
  -t us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest .
docker push us-central1-docker.pkg.dev/field-engineering-us/siesta/siesta:latest
kubectl rollout restart deployment/siesta -n siesta
kubectl rollout status deployment/siesta -n siesta
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture notes and full configuration reference.
