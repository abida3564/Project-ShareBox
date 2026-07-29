# ShareBox — a campus resource-sharing platform for verified university students.
## Share More. Spend Less. Waste Less.

## PostgreSQL backend

The backend now uses Render PostgreSQL instead of temporary JSON-file storage. See `POSTGRES-DEPLOY.md` for the exact deployment steps. Required environment variables are `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and optionally `ADMIN_KEY`.
