# Polish checklist (v4)

Short list of the copy, feel and accessibility details. Tick = shipped.

## Voice and copy (Egyptian Arabic, friendly, never blaming the user)
- [x] Buttons say what happens: «راقب السعر»، «جرّب تاني»، «رجّعه»، «احفظ».
- [x] Empty states have an emoji, one line of why, and one next step (watchlist, alerts, search, radar, app).
- [x] Errors: «حصلت لخبطة صغيرة… مش ذنبك، جرّب تاني» with a retry button (`role="alert"`).
- [x] Loading: skeleton cards + a rotating line («بنقارن المتاجر ببعض…»، «بنشوف الخصم ده حقيقي ولا لأ…»).
- [x] Success toasts: watch added, target saved («اتحفظ 🎯 هنقولك أول ما يوصل…»), plan activated.
- [x] 404: three random friendly variants («شكلك تهت في السوق!») + Home / Deals / Search buttons.
- [x] Greeting by Cairo time on Home (web) and app home: صباح الفل / نهارك سعيد / مساء الخير / سهرانين؟
- [x] Honest labels: demo content says «تجريبي»; paid tiers say «قريبًا» or «مجاني فترة الإطلاق»; WhatsApp bot note says it needs the paid API.
- [x] Agent verdicts print money as `9,657 ج.م` (no raw floats like 10477.755000000001).
- [x] One digit style everywhere: Latin digits (`en-US` / `ar-EG-u-nu-latn`).

## Feel
- [x] Undo toasts: remove from watchlist / compare, plan switch (web) and watchlist remove (app).
- [x] Confirmation before destructive actions (app: remove from watchlist, clear my data).
- [x] Micro-interactions: `.press` scale on tap, card lift, shimmer on tier badges, sparkles on Plans.
- [x] Sound (WebAudio, generated, **off by default**) and haptics (on by default) for key actions; both toggles in Settings and the menu.
- [x] Bottom bar hides on scroll down, shows on scroll up; can be set to always / hidden.
- [x] Smart defaults: theme follows the system, sound muted, haptics on, 5% minimum drop for alerts, recent searches remembered (app).

## Keyboard (web)
- [x] `/` search · `Ctrl/⌘+K` command palette · `?` shortcuts sheet · `T` theme · `L` language.
- [x] `g` then a letter jumps: `g h` home, `g s` search, `g y` deals, `g c` compare, `g t` tools, `g u` community, `g v` plans, `g w` watchlist…
- [x] Welcome tour: ← → to move, Esc to close.

## Accessibility
- [x] Every icon-only button has an `aria-label` (Arabic) / `accessibilityLabel` (app).
- [x] Visible focus ring (`:focus-visible`), skip-to-content link, `aria-live` on loading lines and toasts.
- [x] Deal cards read as one sentence: name, price, fake-discount warning.
- [x] Touch targets ≥ 44 px on phone; safe-area insets for the bottom bar and toasts.
- [x] Reduced motion respected for tour animations and shimmer.

## Ideas parked for later
- [ ] Spoken price summary (TTS) on product page.
- [ ] Per-category emoji in empty states.
- [ ] “Explain this score” tooltip with the exact math per product.
