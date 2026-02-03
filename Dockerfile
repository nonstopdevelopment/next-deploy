FROM node:20-alpine
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Build if necessary (e.g. for Vite or Next.js production/dev bundles)
RUN if grep -q '"build":' package.json; then npm run build; fi

# Expose port 3000 for all app types
EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV VITE_HOST=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Unified start command:
# 1. Try "npm run dev" (best for Vite/Next dev mode as requested)
# 2. Try "npm start" (fallback for production-ready apps)
# 3. Fallback to "node index.js"
CMD npm run dev || npm start || node index.js
