FROM node:22-alpine
WORKDIR /app

# OKD compatibility: Use /tmp for writable caches and set binding envs
ENV HOME=/tmp
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV VITE_CACHE_DIR=/tmp/.vite
ENV PORT=3000
ENV HOST=0.0.0.0
ENV VITE_HOST=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies
COPY package*.json ./
RUN npm install && npm config set update-notifier false

# Copy the rest of the application
COPY . .

# Build if necessary
RUN if grep -q '"build":' package.json; then npm run build; fi

# OKD/OpenShift compatibility: 
# 1. Ensure /app is group-writable by GID 0 (root group)
# 2. OpenShift runs with a random UID in GID 0
RUN chgrp -R 0 /app &&     chmod -R g+rwX /app &&     mkdir -p /tmp/.npm /tmp/.vite &&     chgrp -R 0 /tmp &&     chmod -R g+rwX /tmp

# Expose port 3000
EXPOSE 3000

# Unified start command:
# We explicitly add --host 0.0.0.0 and --port 3000 to npm run dev to ensure Vite/Next.js binds correctly
CMD ["sh", "-c", "echo 'Starting application...' && (npm run dev -- --host 0.0.0.0 --port 3000 || PORT=3000 npm start || node index.js || (echo 'Start failed' && exit 1))"]
