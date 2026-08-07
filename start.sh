#!/usr/bin/env bash
set -euo pipefail

# Safe start script used by some PaaS (Railway) when no custom command provided.
# It installs deps if needed and runs the compiled Node bundle.

# Install production deps if node_modules missing
if [ ! -d "node_modules" ] && [ -f package.json ]; then
  npm ci --omit=dev --no-audit --no-fund || true
fi

# Build if dist missing
if [ ! -d "dist" ]; then
  npm run build
fi

exec node ./dist/index.js
#!/usr/bin/env bash
set -euo pipefail

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
npm start
