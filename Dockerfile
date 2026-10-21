# ---- Backend (NestJS API) ----
# Build stage: install everything, compile TypeScript, then drop dev dependencies.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime stage: only compiled code + production dependencies.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p data incoming docs/rules && chown -R node:node /app
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Load the fictional demo club on first start (skipped if it already exists; set SEED_DEMO=false to disable).
CMD ["sh", "-c", "if [ \"$SEED_DEMO\" != \"false\" ]; then node dist/scripts/seed-demo.js --if-empty || echo 'Demo seed skipped'; fi; exec node dist/main.js"]
