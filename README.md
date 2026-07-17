# next-deploy

A small Next.js application used to test a hosting provider's repository import,
production build, runtime, environment variables, and automatic redeployment.

The repository intentionally contains no GitHub Actions, registry publishing,
webhook notification, or infrastructure deployment configuration. The hosting
provider owns that lifecycle.

## What it exercises

- a locked npm install and production Next.js build;
- a long-running Next.js server;
- optional PostgreSQL, Redis, and S3-compatible object-storage route handlers;
- a visible page that can be changed to confirm a new commit was deployed.

## Local development

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Production verification

```bash
npm run lint
npm run build
npm start
```

The normal npm scripts are application commands. Importing, building an image,
publishing it, assigning a domain, and monitoring the selected branch are the
hosting provider's responsibility.
