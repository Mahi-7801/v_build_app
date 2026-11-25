# Deploy guide (GitHub → Railway backend → Expo frontend)

## 1. Fix GitHub push access (403)

Git on this PC is authenticated as **`kornepati-mahi`**, but the repo is
`Mahi-7801/v_build_app`. Pick ONE:

**Option A — add collaborator (recommended)**
1. Open `https://github.com/Mahi-7801/v_build_app` → **Settings** → **Collaborators**.
2. Add `kornepati-mahi` and accept the invite in that account.
3. Retry the push (section 2).

**Option B — use a Personal Access Token for Mahi-7801**
1. GitHub → avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token**.
2. Check `repo` scope, copy the token.
3. In PowerShell run:
   ```powershell
   cd C:\Users\pc\Downloads\app_vone
   git remote set-url origin https://<TOKEN>@github.com/Mahi-7801/v_build_app.git
   git push -u origin main
   git remote set-url origin https://github.com/Mahi-7801/v_build_app.git
   ```

## 2. Push the code

The repo is already initialized and committed locally. Just:

```powershell
cd C:\Users\pc\Downloads\app_vone
git add .
git commit -m "Deployment config"
git push -u origin main
```

## 3. Backend + database on Railway

1. Sign in at https://railway.app → **New Project** → **Empty Project**.
2. **+ New** → **Database** → **Add MySQL**.
3. **+ New** → **GitHub Repo** → select `v_build_app` → **Deploy from repo**.
4. In the new service: **Settings** → set **Root Directory** to `server`.
5. **Variables** → add:
   ```
   PORT=4000
   NODE_ENV=production
   DB_HOST=${{MySQL.MYSQL_HOST}}
   DB_PORT=${{MySQL.MYSQL_PORT}}
   DB_USER=${{MySQL.MYSQL_USER}}
   DB_PASSWORD=${{MySQL.MYSQL_PASSWORD}}
   DB_NAME=${{MySQL.MYSQL_DATABASE}}
   JWT_SECRET=<long-random-string>
   JWT_EXPIRES_IN=30d
   CORS_ORIGINS=*
   ADMIN_EMAIL=<your admin email>
   ADMIN_PASSWORD=<your admin password>
   GROQ_API_KEY=<optional>
   ```
6. **Settings** → **Deploy** → Start command: `npm start` (build: `npm install`).
7. Generate a Railway token: **Account Settings → Tokens → Create New Token**.
8. Locally, seed the database:
   ```powershell
   $env:RAILWAY_TOKEN="<token>"
   railway link            # choose the project/service
   railway run npm run db:migrate
   railway run npm run db:seed
   ```
   Use `db:migrate` (not `db:reset`) so existing data is not dropped.
9. Railway gives you a public URL, e.g. `https://v-build-app.up.railway.app`.
   Test: open `https://<your-url>/health` — expect `{"status":"ok","db":true}`.

## 4. Frontend on Expo (EAS)

1. Install/login:
   ```powershell
   cd C:\Users\pc\Downloads\app_vone\mobile
   npm install -g eas-cli
   eas login
   ```
2. Point the app at the Railway API (in `src/api/client.ts`, already env-driven):
   ```powershell
   $env:EXPO_PUBLIC_API_URL="https://<your-railway-url>/api"
   ```
   For a permanent value, set `EXPO_PUBLIC_API_URL` in `eas.json` build profiles or in EAS secrets.
3. Build:
   ```powershell
   eas build -p android --profile production
   # or iOS:
   eas build -p ios --profile production
   ```
4. Publish OTA updates:
   ```powershell
   eas update --branch production --message "initial release"
   ```
5. For Play Store/App Store submission:
   ```powershell
   eas submit -p android --profile production
   ```

## Notes

- `.env` files are gitignored; never commit real secrets.
- `mobile/src/api/client.ts` uses `EXPO_PUBLIC_API_URL` in production builds;
  without it the placeholder `https://your-api.example.com/api` is used.
- The backend `server/.env.example` lists all supported variables.
