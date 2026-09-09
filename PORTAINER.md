# Portainer Git Stack deployment

This fork includes a root `docker-compose.yml` so Portainer can deploy the repository directly as a Git Stack.

## Deploy

1. Portainer → **Stacks** → **Add stack** → **Repository**.
2. Repository URL: `https://github.com/chinalcm001/papra`.
3. Reference while testing: `refs/heads/feature/receipt-assistant-mvp`.
4. Compose path: `docker-compose.yml`.
5. Add environment variables:
   - `AUTH_SECRET`: a long random secret, e.g. generated with `openssl rand -hex 48`.
   - `PAPRA_APP_BASE_URL`: the exact URL used in the browser, e.g. `http://192.168.1.20:1221` or `https://papra.example.com`.
   - Optional `PAPRA_PORT` (default `1221`).
   - Optional `ASSISTANT_PORT` (default `8787`).
   - Optional `TZ` (default `Europe/Madrid`).
6. Deploy the stack.

Papra data is stored in the named volume `papra_data`. The bookkeeping database is stored separately in `assistant_data` at `/data/ledger.sqlite`.

## Enable receipt search in the assistant

Text/voice bookkeeping works without a Papra API token. Receipt search needs Papra API access:

1. Open Papra and create an API key with at least `documents:read`.
2. Copy the organization id from the Papra URL (`org_...`).
3. In Portainer add/update:
   - `PAPRA_API_TOKEN`
   - `PAPRA_ORGANIZATION_ID`
4. Redeploy the stack.

The API token stays server-side and is never returned to the browser.

## URLs

- Papra: `http://SERVER:PAPRA_PORT`
- Assistant: `http://SERVER:ASSISTANT_PORT`

## Voice input

The first version uses the browser Web Speech API. Chrome/Edge generally support it. Browser microphone/voice features may require HTTPS (or localhost), so if you access Portainer services by plain LAN HTTP and voice is blocked, text bookkeeping still works; put the assistant behind HTTPS for reliable microphone permissions.

## Notes

- The stack uses Papra's official rootless image.
- A small `papra-init` container prepares volume ownership for UID/GID 1000 before Papra starts, avoiding common bind-mount permission failures.
- If Papra reports an invalid origin during login, make sure `PAPRA_APP_BASE_URL` exactly matches the browser URL.
- Before production, do not leave `AUTH_SECRET` at the fallback value.
