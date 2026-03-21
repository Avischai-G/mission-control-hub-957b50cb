# App Startup Notes

Use these instructions when the user asks to start, restart, open, or verify the app in this repo.

## What this app actually uses

- Frontend runs on `http://127.0.0.1:8080/`.
- The app backend is the local Supabase stack on `http://127.0.0.1:54321/`.
- Chat requests go to `http://127.0.0.1:54321/functions/v1/chat`.
- Do not assume this repo uses `5173`.
- Do not assume this repo has an app backend on `8081`. The code is wired to Supabase on `54321`.

## Canonical start/restart command

From the repo root, run:

```sh
./'Start or Restart App.command'
```

This script is the canonical launcher. It is expected to:

- Ensure Docker Desktop is running.
- Start the local Supabase stack with `npx supabase start`.
- Start the local Edge Functions runtime via `launchctl submit`.
- Start or restart the Vite frontend on port `8080` via `launchctl submit`.

Important implementation detail:

- This repo lives inside `Documents`, so macOS privacy rules make LaunchAgents unreliable here for writing logs and sometimes for startup itself.
- Do not switch this launcher back to `nohup` background jobs from a transient shell. Those processes can disappear after the command returns in this environment.
- Do not use LaunchAgents for the long-lived frontend/functions processes while the repo remains in `Documents`.
- The working path on this machine is `launchctl submit` with stdout/stderr logs stored outside `Documents` under `~/.codex/tmp/ai-mission-control-runtime/`.
- Closing Terminal windows should not stop the app anymore, because the launcher no longer depends on Terminal-owned sessions.

## Open the app

After startup, open:

```sh
open http://127.0.0.1:8080/
```

## Verification checklist

After running the launcher, verify all of the following:

```sh
curl -I --max-time 5 http://127.0.0.1:8080 | head -n 1
curl -s --max-time 5 http://127.0.0.1:54321/functions/v1/chat
```

Expected behavior:

- Frontend check should return `HTTP/1.1 200 OK`.
- Chat endpoint does not need to return success on a bare `GET`.
- A response like `{"error":"Unexpected end of JSON input"}` is acceptable for a bare check and means the function is reachable.
- A response like `{"message":"name resolution failed"}` means the functions gateway is broken and the backend is not ready yet.

## Runtime files

- Frontend PID: `logs/app-frontend.pid`
- Functions PID: `logs/app-functions.pid`
- Frontend log: `logs/app-frontend.log`
- Backend log: `logs/app-backend.log`
- Long-lived runtime logs: `~/.codex/tmp/ai-mission-control-runtime/frontend-runtime.log`
- Long-lived runtime logs: `~/.codex/tmp/ai-mission-control-runtime/functions-runtime.log`

## If the backend is not ready

Use this order:

1. Run the launcher script again.
2. If Docker is not running, launch Docker Desktop and wait until `docker info` succeeds.
3. Confirm Supabase is healthy:

```sh
npx supabase status
```

4. If the chat endpoint still returns `name resolution failed`, start the Edge Functions runtime on the Supabase Docker network:

```sh
npx supabase functions serve --env-file .env --no-verify-jwt --network-id supabase_network_kduaxliyxldpvsbeaonx
```

5. If the launcher says it started but the app is missing, verify that the problem is not one of these old failure modes:

- `nohup` job died when the original shell exited.
- LaunchAgent failed with `operation not permitted` while touching files under `Documents`.
- `launchctl submit` job was removed or replaced by another start attempt.

## Important context for future sessions

- The repo `vite.config.ts` is set to port `8080`.
- `.env` points the frontend at local Supabase on `127.0.0.1:54321`.
- If the UI loads but chat still does not answer, startup may already be correct; the next issue is likely inside the function runtime, provider credentials, or app configuration rather than “the backend is not running”.
