# Portainer + Git deployment (MVP)

This guide deploys both Papra and the Receipt Assistant from this repository.

## Portainer stack settings

- Build method: **Repository**
- Repository URL: `https://github.com/chinalcm001/papra.git`
- Repository reference: `refs/heads/feature/receipt-assistant-mvp`
- Compose path: `portainer-stack.yml`

Enable Git auto-update only after the first deployment is working.

## Stack environment variables

Required for the first deployment:

```env
PAPRA_PORT=1221
RECEIPT_ASSISTANT_PORT=8787
PAPRA_PUBLIC_URL=http://YOUR_DOCKER_HOST_IP:1221
PAPRA_AUTH_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
PAPRA_DEMO=true
```

Optional for the first deployment:

```env
PAPRA_PAGE_SIZE=20
PAPRA_API_TOKEN=
PAPRA_ORGANIZATION_ID=
```

With `PAPRA_DEMO=true`, the Receipt Assistant starts immediately with demo documents while Papra is being configured.

## First startup

After deploying the stack:

- Papra: `http://YOUR_DOCKER_HOST_IP:1221`
- Receipt Assistant: `http://YOUR_DOCKER_HOST_IP:8787`

Create your Papra account and an organization, then upload a few Spanish receipt images/PDFs and wait for OCR to finish.

## Connect the assistant to real Papra data

In Papra:

1. Create an API token with at least `documents:read` permission.
2. Copy the organization ID from the organization URL or API.

Then edit the Portainer Stack environment variables:

```env
PAPRA_API_TOKEN=YOUR_TOKEN
PAPRA_ORGANIZATION_ID=YOUR_ORGANIZATION_ID
PAPRA_DEMO=false
```

Redeploy the stack. The assistant communicates with Papra internally at `http://papra:1221`, so the API token is never sent to the browser.

## Data persistence

Papra data is stored in the Docker named volume:

```text
papra_app_data
```

Removing/recreating containers does not delete this volume. Do not manually remove the volume unless you intend to erase Papra's database and documents.

## Why the MVP uses the root image

The first Portainer stack uses `ghcr.io/papra-hq/papra:latest-root` with a Docker named volume to avoid common host UID/GID permission issues during initial testing. After the workflow is validated, switch to Papra's recommended rootless image and configure ownership appropriately.
