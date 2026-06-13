# Captain Adel — standalone service image.
# Serves the captadel.com site + chat API. Deploy to a KSA region (Cloud Run
# me-central1 or a Kingdom box): real user questions are personal data and must
# be processed in-Kingdom (PDPL). The ALLaM model runs on a separate GPU
# endpoint — this image is CPU-only and reaches it over ALLAM_BASE_URL.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

EXPOSE 8787

# Size the container with >= 2 GiB memory: the BM25 index over the GACAR corpus
# is held resident for fast lookups.
CMD ["node", "src/server.js"]
