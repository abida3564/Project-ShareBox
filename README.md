# ShareBox — a campus resource-sharing platform for verified university students.
## Share More. Spend Less. Waste Less.

## PostgreSQL backend

The backend now uses Render PostgreSQL instead of temporary JSON-file storage. See `POSTGRES-DEPLOY.md` for the exact deployment steps. Required environment variables are `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, and optionally `ADMIN_KEY`.


## Database-backed resource management

- **Browse:** `sharebox-resources.html` shows approved public products.
- **My Resources:** `sharebox-resources.html?view=mine` shows only the logged-in user's products, with edit/delete.
- **Profile and Dashboard:** totals and views are loaded from PostgreSQL.
- **Admin:** `sharebox-admin.html` uses a PostgreSQL-backed admin account and can approve/reject/delete products.

### Admin credentials on Render

Set:

```text
ADMIN_EMAIL=admin@sharebox.local
ADMIN_PASSWORD=your_strong_private_password
```

If `ADMIN_PASSWORD` is absent, the existing `ADMIN_KEY` becomes the initial admin password. Redeploy once after setting the variables.
