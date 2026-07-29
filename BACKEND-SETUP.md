# ShareBox Backend Connection — 10 Minute Setup

## A. Upload this updated project to GitHub
Replace the old repository files with all files from this folder and commit them. Important new files:

- `server.js`
- `package.json`
- `render.yaml`
- `api-config.js`
- `data/database.json`
- `uploads/.gitkeep`

## B. Deploy backend on Render
1. Sign in to Render with GitHub.
2. Click **New +** → **Web Service**.
3. Select the same ShareBox GitHub repository.
4. Use:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add environment variable:
   - `JWT_SECRET` = any long random text
   - `FRONTEND_URL` = `https://abida3564.github.io`
6. Click **Create Web Service** and wait for `Live`.
7. Copy the Render URL, for example:
   `https://sharebox-backend-xxxx.onrender.com`

## C. Connect GitHub Pages frontend
1. Open `api-config.js` in GitHub.
2. Replace:
   `https://YOUR-RENDER-SERVICE.onrender.com`
3. With your real Render URL.
4. Commit the change.
5. Wait 1–2 minutes, then hard refresh the GitHub Pages live link.

## D. Test
Open:
`YOUR_RENDER_URL/api/health`

Expected response:
`{"ok":true,...}`

Then test registration using a new email, Student ID, password and ID-card image. Log out, then log in again. The account should still work because it is saved through the backend.

## Important for final production
Render's free local disk can reset after a redeploy. This version is suitable for the immediate demo. For permanent data, later connect MongoDB Atlas/Supabase and Cloudinary.
