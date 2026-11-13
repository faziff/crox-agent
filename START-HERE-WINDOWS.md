# CROX — Start Here (Windows / VS Code)

## 1. Requirements

- Node.js 22.13 or newer
- VS Code
- Internet access for the first dependency installation

Check versions in the VS Code terminal:

```powershell
node -v
npm.cmd -v
```

## 2. Open the correct folder

1. Extract the CROX ZIP to a normal folder, for example `C:\CROX`.
2. Open VS Code.
3. Select **File → Open Folder** and choose `C:\CROX`.
4. Make sure the Explorer shows `package.json`, `server.ts`, `src`, and `server` at the top level. Do not open only the `src` folder.

## 3. Install and start

Open the VS Code terminal with **Terminal → New Terminal** and run:

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Keep the terminal open. When the terminal says the CROX server is running, open:

- App: `http://localhost:3000`
- API health: `http://localhost:3000/api/health`

If PowerShell says running `npm.ps1` is blocked, use `npm.cmd` exactly as shown above. Do not change the PowerShell execution policy just for CROX.

## 4. Run checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

The development app runs through the Express server with Vite middleware. Use `npm.cmd run dev` for the full application preview; `npm.cmd run preview` is only the Vite static preview and does not start the CROX API.

## 5. AI provider keys

You can open the app first without adding an AI key. AI operations that require a provider will need a valid key configured through the CROX AI Providers / Credentials interface or the documented server environment variable. Never paste provider API keys into frontend source files.

## 6. Production requirements

Before `npm.cmd start` in production:

1. Run `npm.cmd run build`.
2. Set a stable `CREDENTIAL_ENCRYPTION_KEY` in the hosting provider's server-side environment settings.
3. Keep the same encryption key when upgrading the app. Replacing it makes credentials encrypted by the previous key unreadable.
4. Set `PORT` only when required by the host; CROX binds to `0.0.0.0`.

Do not delete the `data` folder when updating an existing installation. It contains the SQLite database and development-only local secrets.
