apiVersion: v1
kind: Secret
metadata:
  name: siesta-secret
  namespace: siesta
type: Opaque
stringData:
  SESSION_SECRET: "${SESSION_SECRET}"
  ENCRYPTION_KEY: "${ENCRYPTION_KEY}"
  DB_PASSWORD: "${DB_PASSWORD}"
  username: "siesta"
  password: "${DB_PASSWORD}"
  DATABASE_URL: "postgresql://siesta:${DB_PASSWORD}@agentgateway.siesta.svc.cluster.local:5432/siesta"
