# Consistency + identity audit — site · native app · admin Hub (v5.2)

**Goal:** the same words, type, colours and component behaviour on every surface (phone, tablet, desktop), without everything looking the same. Each part of Safqa gets its own accent, and the user's tier and a deal's heat are visible at a glance.

## One source of truth: `packages/brand/`
- `tokens.json` holds:
  - font (Readex Pro), type scale, radius, shadow, motion, core palette (light + dark)
  - **section accents**, the route → section map, **tiers**, **deal heat** and state colours
- `glossary.json` holds the approved Arabic/English terms plus **avoid** lists, for example:
  - المراقبة / قايمة المراقبة
  - تسجيل الدخول · دخول · خروج · الباسورد
  - avoid «تسجيل دخول», «حالياً» …
- `build.mjs` generates:
  - web: `apps/web/src/brand/tokens.css` + `tokens.ts` (`sectionFor`, `heatLevel`, `GLOSSARY`)
  - Hub: `apps/admin/public/tokens.css`
  - app: `apps/mobile/src/lib/brand.ts`
- `brand.test.ts` fails CI when:
  - the generated files are stale
  - any accent pair is below contrast (ink ≥ 3:1 on both gradient stops, text ≥ 4.5:1 on the card, light **and** dark)
  - an "avoid" term appears anywhere in the code

## Section identity (not monotony)
`<html data-section>` is set from the route (`sectionFor(path)`). It drives `--accent`, `--accent-2`, `--accent-ink`, `--accent-text`, `--accent-soft` and `--accent-glow`. Since `--color-primary` is `var(--accent)`, every primary button, ring, link and the page-hero bar takes the section's gradient automatically.

| Section | Light gradient | Used on |
|---|---|---|
| deals | #D98A0B → #E4572E (amber → ember) | home, deals, drops, product |
| radar | #0E7C70 → #1D6FD8 (teal → blue) | radar, alerts, watchlist |
| community | #7C3AED → #C0267A (violet → magenta) | live, community |
| tools | #3B5BDB → #0E7490 (indigo → cyan) | toolbox, compare, calculators |
| plans | #F5B524 → #E0820B (gold) | plans, pay |
| ai | #6D28D9 → #B321C2 | AI lab, smart alerts |
| coupons | #15803D → #4D7C0F (green) | coupons |
| account | #C9840A → #E3A93A (brand gold) | account, login |

Dark mode has its own, brighter stop pairs. Nav links carry `data-section`, so hover and current states preview the hue of the section they lead to.

## Button hierarchy (web `button.tsx` + `.btn-*`, Hub `.btn.p/.sec/.ghost/.icon/.chip`, app `Button kind`)
| Level | Look | Use |
|---|---|---|
| primary | section gradient pill, glow on hover | one main action per view |
| secondary | accent-soft fill, accent text | supporting actions |
| ghost | text + hover wash | tertiary / in lists |
| icon | 44 px round, always `aria-label` | toolbars |
| chip | small pill, toggles | filters |
| fab | floating gradient circle | the single most important mobile action |
| destructive | red | delete / sign out everywhere |

## Tiers and heat
- **Tiers** (`.tier-free/silver/gold/diamond`):
  - each tier has its own badge colour and ring
  - gold gets a warm glow; diamond gets an animated sheen (stopped under `prefers-reduced-motion`)
- **Deal heat** (`.temp-0..4`, aliases `.heat-cool/warm/hot/blaze`):
  - slate → sky → yellow → orange → red at score thresholds 0/40/60/75/85
  - "on fire" pulses
  - used by the score ring and the discount badge, so a hot deal reads as hot everywhere
- **Surfaces:** `.card-elev` (elevated), `.card-accent` (accent top edge), `.accent-wash` (glass + section-tinted gradient behind page headers), `.section-kicker`.

## Parity across surfaces
| Area | Web | App (Expo) | Hub |
|---|---|---|---|
| Font | Readex Pro | Readex Pro | Readex Pro (was a system font) |
| Palette / dark mode | tokens.css, dark before first paint | `brand.ts` + `useMode` | tokens.css, dark by default (was a cold blue-grey) |
| Section hues | `data-section` | `useAccent(section)`, per-tab tint | `SECTION` map per page |
| Primary button | gradient pill | `expo-linear-gradient` pill | gradient `.btn.p` |
| Glossary | `GLOSSARY` + test | `brand.ts` | same terms |
| Links | clean paths on safqaeg.pages.dev | same | same |

## Before / after
Screenshots are in `docs/screenshots/v5.2/`. Each image shows before (left) and after (right):
- `412_home.jpg`: home on a phone; the deals amber/ember identity and heat chips
- `412_coupons.jpg`: coupons in green
- `412_live.jpg`: community violet; the fixed overflow and labelled buttons
- `1440_radar.jpg`: radar teal → blue on desktop; CLS fixed
- `1440_plans.jpg`: plans gold and tier cards
- `1440_toolbox.jpg`: tools indigo → cyan

The full raw set (8 pages × 412/1440, before and after) is in `/workspace/url-qa/{before,after}` on the build box.
