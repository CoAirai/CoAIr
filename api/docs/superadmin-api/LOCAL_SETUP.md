# Connecting Your Client

Two ways to have a real API to build against. They are not exclusive — most
people run the sandbox and keep a shared-server account for cross-checking.

| | |
|---|---|
| **Run it yourself** | `docker compose up` and the whole backend is on your machine with a seeded company. Fastest loop, no waiting on us, works offline. See **[SANDBOX.md](SANDBOX.md)** — start there. |
| **Point at a server we run** | Nothing to install; we give you a URL and an account. Better for checking against real data, worse for iterating. The rest of this document covers it. |

## What you need from us for the shared server

Ask for these four things in one message — we can turn them around together:

1. **API base URL** — e.g. `https://<host>/api`.
2. **An account** — username + password. Say which: a **company SuperAdmin**
   (organization `owner`) to build the customer-facing panel, or one of our
   **platform operator** accounts (`admin`/`superadmin`) to build the
   cross-company console. See [PERMISSIONS.md](PERMISSIONS.md).
3. **Your origin allow-listed** — see below.
4. **A project id** to test the content endpoints against (the ones that need
   `X-Project-ID`).

## CORS — the one thing that will block you on day one

The browser blocks a cross-origin call before your token is ever checked, so
this fails in a way that looks like an auth or network bug.

The API reads a comma-separated `CORS_ORIGINS` environment variable. Unset, it
allows only `http://localhost:3000`, `http://localhost:5173` and
`http://127.0.0.1:5173` — the local dev servers of our own frontend.

**Send us every origin you will call from**, scheme and port included, e.g.:

```
CORS_ORIGINS=http://localhost:4000,https://panel.yourdomain.com
```

Two constraints:

- `*` does not work. The API sends credentials, and browsers reject a wildcard
  on credentialed requests. Each origin must be spelled out.
- An origin is scheme + host + port. `http://localhost:3000` and
  `http://localhost:3001` are different origins; so are `http` and `https`.

**Alternative that needs no configuration:** proxy `/api` through your own dev
server so the browser sees a same-origin request. In Vite:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: { '/api': { target: 'https://<api-host>', changeOrigin: true } },
  },
});
```

That is how our own frontend works in development, and it sidesteps CORS
entirely. For a production deployment of your panel on its own domain, you will
still need the allow-list entry.

## Minimal client

The whole integration is a bearer token and, for content endpoints, a project
header:

```ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 120_000, // RAG answers are slow — do not set this low
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Admin endpoints do not need this; content endpoints answer 428 without it.
  const projectId = localStorage.getItem('projectId');
  if (projectId) config.headers['X-Project-ID'] = projectId;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    // No refresh token exists — a 401 means re-login, always.
    if (error?.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('token');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);
```

Timeouts: a chat/RAG call can legitimately take **60–120 seconds**. Admin
endpoints answer in milliseconds. If you use one client for both, keep the long
timeout and show progress in the UI.

## Exploring the API interactively

The running server exposes the standard FastAPI docs:

- `GET /docs` — Swagger UI
- `GET /redoc` — ReDoc
- `GET /openapi.json` — raw schema

They are reachable without authentication today. Two caveats: the Swagger
"Authorize" button is **not** wired (the API parses the `Authorization` header
by hand rather than through `OAuth2PasswordBearer`), so paste the header
manually; and we intend to close public access to these routes, so do not have
your client fetch the schema at runtime. The copy in this pack
(`openapi.json`) is the one to build against.

## Sanity-check sequence

Run these in order the first time. Each failure has an unambiguous cause.

| Step | Call | If it fails |
|---|---|---|
| 1 | `GET /api/health` from a terminal | Wrong URL, or the server is down |
| 2 | `POST /api/auth/login` from a terminal | Wrong credentials |
| 3 | Same login **from your browser app** | CORS — your origin is not allow-listed |
| 4 | `GET /api/admin/users` with the token | `403 admin_required` → your account is a plain user |
| 5 | `GET /api/library` with `X-Project-ID` | `428` → header missing; `404` → wrong project id |

[examples.http](examples.http) has all of these ready to run.
