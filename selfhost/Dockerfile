# =============================================================================
# AeroGap self-hosted application image
# =============================================================================
# Build context is the REPOSITORY ROOT, not selfhost/ — the server imports the
# handlers in api/ and the Convex generated client, and the SPA lives in src/.
# Build from the repo root:
#
#   docker build -f selfhost/Dockerfile -t aerogap-selfhost:0.1.0 .
#
# or let docker compose do it (see selfhost/docker-compose.yml, which already
# sets the context correctly).
#
# NOTE ON VITE_* BUILD ARGS
# Vite inlines VITE_* variables into the JS bundle at build time, so they cannot
# be changed by restarting the container — the image is specific to one
# install's Convex URL and Clerk key. That is why compose builds locally rather
# than pulling a prebuilt image. Serving these from a runtime-generated config
# instead would let us ship one prebuilt image and support air-gapped installs;
# that work is not done yet.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — install dependencies once, shared by both build stages
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /repo

# Copy manifests only, so `npm ci` is cached and does not re-run on source edits.
COPY package.json package-lock.json ./
# `npm ci` needs the lockfile to be in sync with package.json; it fails loudly
# rather than silently resolving different versions, which is what we want for a
# reproducible customer install.
RUN npm ci --no-audit --no-fund

COPY selfhost/package.json selfhost/package-lock.json ./selfhost/
RUN cd selfhost && npm ci --no-audit --no-fund


# -----------------------------------------------------------------------------
# Stage 1b — runtime dependencies only
# -----------------------------------------------------------------------------
# A separate, production-only install. The build stages need esbuild and
# TypeScript; the shipped image must not carry them. Copying the build stage's
# node_modules into the runtime would put a compiler and a test runner in a
# customer's image for no reason and widen its CVE surface.
FROM node:20-bookworm-slim AS runtime-deps
WORKDIR /repo/selfhost
COPY selfhost/package.json selfhost/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund


# -----------------------------------------------------------------------------
# Stage 2 — build the SPA
# -----------------------------------------------------------------------------
FROM deps AS spa-builder
WORKDIR /repo

# Baked into the bundle. Everything here is public-by-design (publishable keys
# and URLs the browser must reach); no secret may be added to this list.
ARG VITE_CONVEX_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_API_KEY
ARG VITE_SENTRY_DSN
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ARG VITE_STRIPE_PUBLISHABLE_KEY

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY \
    VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST \
    VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY

COPY . .

# Deliberately NOT `npm run build`. That script also generates a sitemap and
# prerenders marketing pages for SEO, which are meaningless for an install that
# is not on the public internet and which reach out to the network at build time.
RUN npx tsc && npx vite build


# -----------------------------------------------------------------------------
# Stage 3 — bundle the application server
# -----------------------------------------------------------------------------
FROM deps AS server-builder
WORKDIR /repo
COPY . .
RUN cd selfhost && node scripts/build-server.mjs


# -----------------------------------------------------------------------------
# Stage 4 — runtime
# -----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    APP_PORT=8080 \
    DIST_DIR=/app/dist

# Security patches for the base image, then drop the package lists again.
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Production dependencies only (see the runtime-deps stage). The server bundle
# leaves node_modules external so a vendor CVE is an `npm update` and rebuild,
# not a source patch.
COPY --from=runtime-deps /repo/selfhost/node_modules ./node_modules
COPY --from=runtime-deps /repo/selfhost/package.json ./package.json

COPY --from=server-builder /repo/selfhost/dist ./
COPY --from=spa-builder /repo/dist ./dist

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 8080

# Compose and orchestrators gate traffic on this. /healthz is unauthenticated
# and reveals no configuration.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" || exit 1

CMD ["node", "server.js"]
