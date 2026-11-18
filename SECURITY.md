# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected part (`apps/api`, `apps/web`, `apps/worker`, `apps/extension`, a package), steps to reproduce, and the impact you expect.

You should get a first reply within a few days. Please give us reasonable time to ship a fix before you share details publicly.

## Scope notes

- Secrets (`AUTH_SECRET`, `ADMIN_TOKEN`, LLM provider keys, push and Telegram tokens) belong in environment variables only. The admin page lists which keys are set and never shows a key.
- The demo account `demo@safqa.app` / `demo1234` and `LLM_PROVIDER=mock` are for local and demo use. Change `AUTH_SECRET` and seed data before any real deployment.
- The crawler must respect `robots.txt` and must not bypass bot protection. Reports about crawler behavior that breaks a site's rules are welcome too.

<div dir="rtl">

لو لقيت ثغرة أمنية، متفتحش Issue عام. استخدم «Report a vulnerability» من تبويب Security في المستودع.

</div>
