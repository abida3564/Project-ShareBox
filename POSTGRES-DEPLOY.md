# ShareBox — Render PostgreSQL Deployment

This version stores users, hashed passwords, Student IDs, Student ID card images, products, and notifications in PostgreSQL. It no longer uses `data/database.json` for backend persistence.

## Important: update your existing Render service

Because your current `sharebox-backend` already exists, do the following after uploading this project to GitHub.

### 1. Create the database

1. Open Render Dashboard.
2. Click **New** → **Postgres**.
3. Name it `sharebox-postgres`.
4. Select the Free plan when available.
5. Create the database and wait until it is available.

### 2. Connect it to the backend

1. Open the new PostgreSQL database in Render.
2. Copy its **Internal Database URL**.
3. Open the existing `sharebox-backend` Web Service.
4. Go to **Environment**.
5. Add:
   - Key: `DATABASE_URL`
   - Value: paste the Internal Database URL
6. Confirm these variables also exist:
   - `JWT_SECRET` — a long random value
   - `FRONTEND_URL` — `https://keyacse.github.io`
   - `NODE_ENV` — `production`
   - `ADMIN_KEY` — a long random value, optional but recommended
7. Save changes. Render will redeploy automatically.

### 3. Confirm the deployment

Open:

`https://sharebox-backend-uzn8.onrender.com/api/health`

A successful response looks similar to:

```json
{"ok":true,"database":"connected","time":"..."}
```

The server automatically creates all required tables on startup. You do not need to run `schema.sql` manually.

### 4. Test permanent registration

1. Register a new account on the GitHub Pages website.
2. Clear the site's Local Storage or use an Incognito window.
3. Log in again with the same email and password.
4. Redeploy/restart the backend and repeat the login test.

If login still works, the account is stored in PostgreSQL.

## Viewing registered users safely

The project provides a protected endpoint:

`GET /api/admin/users`

It requires the `ADMIN_KEY` value in an `x-admin-key` request header. It never returns password hashes or Student ID card image bytes. Do not put `ADMIN_KEY` in frontend JavaScript or GitHub.

You can also inspect tables through a PostgreSQL client using Render's external connection details.

## Existing JSON accounts

Accounts previously saved in Render's temporary `data/database.json` are not automatically migrated because that runtime file may already have disappeared after a deploy. Register those demo accounts again after PostgreSQL is connected.

## Student ID card storage

Student ID card images are stored privately as PostgreSQL `BYTEA` data. They are not exposed through a public URL.

## Admin dashboard

After deployment, open `sharebox-admin.html` from the GitHub Pages site. Enter the same `ADMIN_KEY` configured in Render. The key is stored only in the current browser tab (`sessionStorage`). The dashboard shows users, products/resources, search, and verification controls.


## Database-backed admin login
Set Render environment variables:

- `ADMIN_EMAIL=admin@sharebox.local`
- `ADMIN_PASSWORD=<a strong private password>`

If `ADMIN_PASSWORD` is omitted, the existing `ADMIN_KEY` is used as the first admin password. The admin account is stored in PostgreSQL table `admins` and logs in at `sharebox-admin.html`.


## Product publishing rule
Products are published immediately after upload. No admin approval is required. An authenticated admin can delete inappropriate products from the admin dashboard.
