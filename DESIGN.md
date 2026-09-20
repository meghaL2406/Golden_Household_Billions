# Design system brief — build every screen to this, without exception

Quiet, precise, editorial: white surfaces, one blue, lots of air, small confident type, no gradients on content,
no shadows heavier than a whisper. A well-set financial report, not a SaaS dashboard.

## Tokens (CSS variables)
--blue: #2458e5; --blue-dark: #1947c8; --blue-light: #eef3ff; --ink: #202735; --muted: #637083; --line: #e5e9ef;
--green: #147b65; --paper: #f8fafc (page bg; cards pure #fff). Warning: amber text #7a4b00 on #fff7ea. Danger sparingly: #a8452b.
Category colours (dots/tags): steel #2c5eea, cement #098875, textiles #bb861b, chemicals #dd7150 — dark text on a 12–15% tint.

## Type
Google Fonts: DM Sans (400,450,500,550,600,650,700) and IBM Plex Mono (400,500). Body DM Sans; 550 for emphasis, 650 for brand; never 700 in content.
h1 34–40px w600 ls -0.01em ink. h2 13–14px w550, sub-note 10px muted. Body 12–13px. Captions/units/table headers 9–10px muted.
Stat values 30px w550 tabular-nums; unit 11px muted beside, never inside the number.
EYEBROWS: every page and card section opens with IBM Plex Mono 10px w500 uppercase ls 0.06em colour #5a6f91, 9px below. IDs, codes, formulas are mono.

## Radii — two families, never mixed on one element
Chrome/cards 15–18px (cards 18, stat tiles 15–16, dialogs 20). Controls: pills 999px; inputs/selects/buttons 11–12px; tiny tags 4–5px.

## Navbar
68px, #fff, 1px bottom --line, padding 0 36px, flex space-between gap 16. Left: geometric mark (L-shape 25px tall, 6px --blue stroke, radius 1px, plus 8px square dot) + wordmark DM Sans 28px w650 lowercase with --blue full stop.
Centre: single pill capsule; items padding 8px 15px radius 999 12.5px w550 #5b6678; hover bg #f2f5fb ink; active bg --blue-light --blue. Six items max.
Right: mono region label + globe icon (11px), bell button 30px with --blue count badge (17px round, 9.5px w600 white, 2px white ring) when unread>0, gear 30px, avatar 30px (#eef2f8, 10px w600 #536380 initials). Icon buttons borderless #54617a radius 999 hover #f2f5fb. Below 900px capsule collapses to hamburger; bell and gear stay.

## Layout and components
Page: max-width ~1180px centred, padding 32px 36px on --paper; header = eyebrow → h1 → 13px muted line, optional action right.
Cards: #fff, 1px --line, r18, padding 22–24, hover border #a6bdea; no shadow at rest, hover ≤ 0 6px 20px rgba(26,42,74,.12).
Stat tiles in a row separated by 1px --line verticals (not gaps): label 10px muted + small icon right, value 30px, note 10px muted.
Tables: 9px uppercase mono headers, 12px rows, 1px --line row borders, no zebra.
Tags: 9–10px w600, padding 3px 8px, r4, tinted bg + matching dark text. Tones blue, success, warning, neutral, category.
Buttons: primary --blue fill white r11 padding 10px 16px 12px w550 hover --blue-dark; outline #fff 1px --line ink. Icon 15–16px before label gap 8. No uppercase.
Inputs/selects 38–42px, 1px --line, r11, 12px; focus 1px --blue border + 2px #dce7ff ring.
Notices: full-width bar r12 1px border 12px text: info --blue-light with --blue border at 30%; warning amber. One sentence.
Glass panels (map): rgba(255,255,255,.86) blur(18px) 1px rgba(210,221,238,.9) r22; inner stat tiles r16.
Empty states: centred, icon 30px in soft tile, one h2, one sentence, one primary button.
Motion 0.18–0.22s ease on hover/border/colour only. Spacing scale 4,6,8,12,16,22,32,44. Prefer air over dividers.

## Non-negotiables
One accent per screen; charts use --blue and #9fb6ea, --line grid. Every number carries its unit in muted text.
WCAG AA 4.5:1; focus visible; no colour-only meaning. Plain declarative sentences, no exclamation marks, no emoji, no lorem.
Before finishing a screen check: eyebrow present, radii from the right family, only --line borders, units outside numbers, hover state on every clickable card.
