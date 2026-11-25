FROM oven/bun:1.4.5-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build

FROM oven/bun:1.4.5-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=1000:1000 /app/build ./build
USER 1000:1000
EXPOSE 3000
ENTRYPOINT ["bun", "--no-env-file"]
CMD ["build/index.js"]
