# Google sign-in for Safqa

Safqa ships a real Google Identity Services (GIS) button. It stays in a clear
"not configured yet" state until a Google **OAuth Client ID** is provided. It
never fakes a login.

## Static demo (Hugging Face static Space)

1. Open <https://console.cloud.google.com/> and create a project (e.g. `Safqa`).
2. **APIs & Services → OAuth consent screen**: choose *External*, app name
   `صفقة Safqa`, your support email, and save. Scopes: keep the defaults
   (`openid`, `email`, `profile`). Click **Publish app** (or add test users).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `https://safqa-eg-safqa.static.hf.space`
     - `http://localhost:47321` (local dev, optional)
   - No redirect URI is needed for the GIS button.
4. Copy the Client ID (it ends with `.apps.googleusercontent.com`). It is a
   public identifier, not a secret.
5. Rebuild and redeploy with it:

   ```bash
   VITE_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com deploy/hf/deploy-static.sh
   ```

In static mode the ID token is decoded in the browser and checked for audience
and expiry only (there is no server to verify the signature), and the account
lives in that browser's localStorage, like every other demo account.

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
