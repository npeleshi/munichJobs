#!/usr/bin/env bash
# Creates .env for Codespaces (random secrets, local Postgres, correct public URL), installs deps, creates tables.
set -e
if [ ! -f .env ]; then
  URL="http://localhost:3000"
  [ -n "$CODESPACE_NAME" ] && URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  cat > .env <<ENV
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/munich_jobs"
NEXTAUTH_URL="$URL"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_MODEL="claude-sonnet-5-5"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID="common"
ADZUNA_APP_ID="${ADZUNA_APP_ID:-}"
ADZUNA_APP_KEY="${ADZUNA_APP_KEY:-}"
CRON_SECRET="$(openssl rand -hex 24)"
ALLOW_DEV_LOGIN="true"
NEXT_PUBLIC_ALLOW_DEV_LOGIN="true"
ENV
  echo "Created .env (app URL: $URL)"
fi
npm install
for i in $(seq 1 20); do npx prisma db push --skip-generate && break; echo "waiting for database…"; sleep 3; done
echo "✅ Setup done. Start the app with:  npm run dev"
