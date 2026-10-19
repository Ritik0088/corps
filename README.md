# CareOps local application

CareOps runs as a dependency-free Node.js application. It serves the existing UI and stores data in `data/erp.json` (created and seeded on first start).

## Run locally

Requires Node.js 18 or newer. No `npm install` is needed:

```bash
npm start
# open http://localhost:3000
```

Sign in with `admin@careops.local` / `admin123`. The API uses server-side random bearer sessions, and passwords are stored as `crypto.scrypt` hashes. Employees and inventory changes persist across restarts. CSV export remains available from the UI.

For another port, use `PORT=8080 npm start` (PowerShell: `$env:PORT=8080; npm start`).

## Production and cloud caveats

This is intended for a trusted local workstation or private LAN. Put it behind HTTPS and a reverse proxy for network use, change the seeded administrator password, restrict filesystem permissions on `data/erp.json`, and add backups. Sessions are stored in the JSON data file and are single-process; use a real database, external session store, user provisioning, CSRF protection, rate limiting, audit logging, and a managed deployment before exposing it to the public internet or handling regulated production data. The app has no cloud synchronization or multi-process coordination.
