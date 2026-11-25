# Google sign-in for Safqa

Safqa ships a real Google sign-in button. It stays in a clear "not configured
yet" state until a Google **OAuth Client ID** is provided. It never fakes a
login.

## Static demo (Hugging Face static Space)

The live static Space is served with `Cross-Origin-Opener-Policy: same-origin`
by Hugging Face. That header cannot be changed from the Space (it is not a
meta tag). It isolates the page from popups, so the Google Identity Services
popup never posts the credential back — the popup sits on
`accounts.google.com/gsi/transform` and the app never logs in.

The static demo therefore uses the OpenID Connect **implicit redirect** flow
as the primary path (`response_type=id_token`). After the user picks an
account, Google redirects to the exact registered URI with `#id_token=...`.
Safqa reads that fragment *before* the hash router starts, verifies `state`,
`nonce`, `aud` and `exp`, creates the local demo session, and sends the user
to `#/dashboard`.

1. Open <https://console.cloud.google.com/> and create a project (e.g. `Safqa`).
2. **APIs & Services → OAuth consent screen**: choose *External*, app name
   `صفقة Safqa`, your support email, and save. Scopes: keep the defaults
   (`openid`, `email`, `profile`). Click **Publish app** (or add test users).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `https://safqaeg.pages.dev` (the site)
     - `https://preview.safqaeg.pages.dev` (preview deploys, optional)
     - `https://safqa-eg-safqa.static.hf.space` (keep: the admin Hub signs in through it)
     - `http://localhost:47321` (local dev, optional)
   - Authorized redirect URIs (exact):
     - `https://safqaeg.pages.dev/auth/callback`
     - `https://preview.safqaeg.pages.dev/auth/callback` (optional)
     - `https://safqa-eg-safqa.static.hf.space` (keep: the admin Hub + old links)
     - `http://localhost:47321/auth/callback` (local dev, optional)
     - `http://localhost:8787/api/auth/google/callback` (real API mode only)
4. Copy the Client ID (it ends with `.apps.googleusercontent.com`). It is a
   public identifier, not a secret.
5. Rebuild and redeploy with it:

   ```bash
   VITE_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com deploy/pages/deploy.sh   # or deploy/hf/deploy-static.sh (Pages + HF redirect)
   ```

The live static Space already ships with the production Client ID
`700154178904-k0hi0kp5v19m775u8t1bt6m6mnfhrghc.apps.googleusercontent.com`.
It is a public identifier, baked into `apps/web/.env.production` and used as
the default in `deploy/hf/deploy-static.sh`.

In static mode the ID token is decoded in the browser and checked for issuer,
audience, expiry, nonce and email verification only (there is no server to
verify the signature). The name, email and picture from the token create a
local account in that browser's localStorage, like every other demo account.

## Real API mode

The API already implements the server-side OAuth code flow
(`/api/auth/oauth/google` → `/api/auth/oauth/google/callback`). Set these on the
API service and the web button switches to it automatically (via `/api/meta`):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URL=https://<api-host>/api/auth/oauth/google/callback
```

Add that redirect URL under *Authorized redirect URIs* of the same OAuth client.
