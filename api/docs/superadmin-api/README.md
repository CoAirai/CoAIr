# COAir — Backend Integration Pack

Everything needed to build a client (admin panel, back-office tool, dashboard)
against the COAir API. Written for a developer who is **not** working inside our
repository.

## What this is — and what it is not

| | |
|---|---|
| **This pack** | The API contract: endpoints, auth, roles, request/response shapes, error codes, runnable examples. |
| **Not in this pack** | Backend source code. You do not need it — the API is the whole interface. |
| **The earlier `designer-pack`** | A **UI-only design sandbox**. It ships `VITE_MOCK=1` and a mock axios adapter (`src/mocks/adapter.ts`) that answers every call from local fixtures, so **no HTTP request ever leaves the browser**. That is why the backend looked absent: the pack was built for visual design work, not integration. It also does not include the user-management screens or their API calls. |

If you were handed the designer pack and concluded "the backend connection is
missing" — that was the correct reading of that pack. This one is the answer.

## Read in this order

0. **[SANDBOX.md](SANDBOX.md)** — `docker compose up` and you have the real
   backend on your machine, with a seeded company to log into. Do this first;
   everything below is easier to read against a running API.
1. **[SCOPE_AND_OWNERSHIP.md](SCOPE_AND_OWNERSHIP.md)** — who builds what, which
   screens the API already feeds, and which ones need an endpoint we have not
   written yet. Read this before you design anything.
2. **[AUTH_AND_ROLES.md](AUTH_AND_ROLES.md)** — how to get a token, the role
   model, and the two headers every request needs.
3. **[PERMISSIONS.md](PERMISSIONS.md)** — who can do what, exhaustively: every
   capability and every refusal, per role. This is what decides your navigation.
4. **[API_REFERENCE.md](API_REFERENCE.md)** — **every** endpoint the API serves:
   128 operations across 105 paths, with method, auth level and purpose. The
   admin and organization surfaces are documented field by field.
5. **[ERRORS.md](ERRORS.md)** — the error envelopes your UI must render.
6. **[examples.http](examples.http)** — copy-paste requests, in order: the
   company SuperAdmin walkthrough, the platform operator flow, and the basics.
7. **[types.ts](types.ts)** — TypeScript interfaces for the admin and
   organization surfaces.
8. **[LOCAL_SETUP.md](LOCAL_SETUP.md)** — pointing your app at a real server,
   and the CORS setting we must enable for your origin.
9. **[openapi.json](openapi.json)** — machine-readable schema, for client
   generation. **Supplementary only**: several admin handlers are annotated as
   plain dictionaries, so their response schemas come out empty there.
   `API_REFERENCE.md` is the authoritative contract.

## 60-second version

```bash
# 1. Log in — returns a bearer token valid for 7 days.
curl -sX POST https://<api-host>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<user>","password":"<password>"}'

# 2. Every subsequent call carries the token.
curl -s https://<api-host>/api/admin/users \
  -H "Authorization: Bearer <access_token>"
```

Two headers matter:

- `Authorization: Bearer <token>` — always.
- `X-Project-ID: <project_id>` — on **content** endpoints (chat, files,
  library, documents, reports). Admin endpoints do **not** need it.

## Known limitations — read before you design

These are current facts about the system, not open tickets you should work
around silently. Design against them and tell us where they hurt.

- **Companies are modelled as organizations.** A company's SuperAdmin is an
  organization `owner`: it reaches every project the company owns, creates the
  company's users and grants them access to individual projects. It is **not** a
  global role — gate your panel on `GET /api/org` → `role === 'owner'`, not on
  the account's global role. Data isolation itself is still per **project**
  (`X-Project-ID`); the organization decides which projects you may select.
- **No token refresh.** Tokens are long-lived (default 7 days) and stateless —
  there is no refresh endpoint and no server-side revocation. On `401`, drop the
  token and send the user back to the login screen. `POST /api/auth/logout`
  exists but is a client-side no-op.
- **`GET /api/feedback/summary` is not admin-gated** even though it reads like
  an analytics view. Any authenticated user can call it. Known gap; do not build
  an admin feature on it until it is fixed.
- **`/docs`, `/redoc` and `/openapi.json` are reachable without authentication.**
  Convenient for you now; we intend to close this, so do not make your client
  depend on fetching the schema at runtime.
- **Cross-origin calls need our configuration.** See
  [LOCAL_SETUP.md](LOCAL_SETUP.md) — send us the exact origin you will serve
  from.

## Keeping this pack current

`openapi.json` is generated from the running app:

```bash
python scripts/export_openapi.py
```

The Markdown is hand-written. If you find a mismatch between a document here and
what the API actually returns, the API is right and this pack has drifted —
tell us and we will correct it.
