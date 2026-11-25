# Attaching a custom domain later

The site runs on Cloudflare Pages project **`safqaeg`** → `https://safqaeg.pages.dev`. Nothing in the code depends on that host except the constants below, so moving to a domain such as `safqa.com.eg` takes five steps:

1. **Buy/own the domain**, then add it in Cloudflare: Pages → `safqaeg` → *Custom domains* → *Set up a domain*.
   - If DNS is on Cloudflare, it is automatic.
   - If not, add a `CNAME www → safqaeg.pages.dev`, or an apex CNAME / ALIAS if the DNS host supports it.
   - TLS is issued automatically.
2. **Google OAuth** (Cloud Console → Credentials → the web client):
   - Authorized JavaScript origin: `https://<domain>`
   - Redirect URI: `https://<domain>/auth/callback`
   - Keep the old entries until traffic moves.
3. **API CORS**: add the origin to `ALLOWED_ORIGINS` and set `SITE_URL` in `apps/edge/wrangler.toml`, then run `npx wrangler deploy` in `apps/edge`.
4. **Code constants**: search for `safqaeg.pages.dev` (`rg safqaeg.pages.dev`). The places that need changing:
   - `apps/web/src/lib/google-oauth.ts` (`SITE_ORIGIN`)
   - `apps/web/index.html` (canonical / og)
   - `public/robots.txt`, `public/sitemap.xml`
   - `apps/admin/public/app.js` (`SITE`)
   - `apps/mobile/app.json` + `src/lib/data.ts`
   - `deploy/hf/redirect.html`
5. Optionally, redirect `safqaeg.pages.dev` to the new domain with a Bulk Redirect. Pages keeps serving both until then.

There's no need to rebuild for the redirect URI: `redirectUriForOrigin()` derives it from `location.origin`. Only the default/canonical constants change.
