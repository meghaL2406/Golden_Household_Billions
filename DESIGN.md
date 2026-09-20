# Design system brief

Every screen in this project is built to this brief, without exception. The look is quiet, precise and
editorial: white surfaces, one blue, lots of air, small confident type, no gradients on content, no
shadows heavier than a whisper. Think a well-set financial report, not a SaaS dashboard.

## Tokens

Defined once as CSS custom properties and used everywhere:

```css
--blue: #2458e5;        /* primary — links, active states, one accent per screen */
--blue-dark: #1947c8;   /* hover state on primary buttons */
--blue-light: #eef3ff;  /* active pill fill, soft highlights */
--ink: #202735;         /* body and heading text */
--muted: #637083;       /* secondary text, captions, units */
--line: #e5e9ef;        /* every border, every divider */
--green: #147b65;       /* success / positive only */
--paper: #f8fafc;       /* page background; cards sit on it in pure white (#fff) */
```

Additional tones, used sparingly:

| Tone | Text | Background |
|---|---|---|
| Warning | `#7a4b00` | `#fff7ea` |
| Danger | `#a8452b` | used sparingly, no fixed background |

Sector or category colours (dots, tags) sit at 12–15% tint of the same colour, with dark text on top:

| Category | Colour |
|---|---|
| Steel | `#2c5eea` |
| Cement | `#098875` |
| Textiles | `#bb861b` |
| Chemicals | `#dd7150` |

## Type

Loaded from Google Fonts: **DM Sans** (weights 400, 450, 500, 550, 600, 650, 700) and **IBM Plex Mono**
(weights 400, 500). Body text is DM Sans. Weights are fractional on purpose: use 550 for emphasis and
650 for the brand wordmark; never use bold 700 inside ordinary content.

| Element | Size | Weight | Notes |
|---|---|---|---|
| Page title (`h1`) | 34–40px | 600 | letter-spacing -0.01em, ink colour |
| Section heading (`h2`) | 13–14px | 550 | sub-note beside or under it: 10px, muted |
| Body text | 12–13px | 400 | |
| Captions, units, table headers | 9–10px | 400 | muted colour |
| Big stat values | 30px | 550 | tabular figures; the unit sits beside it at 11px muted, never inside the number |

**Eyebrows:** every page and every card section opens with a mono eyebrow — IBM Plex Mono, 10px, weight
500, uppercase, letter-spacing 0.06em, colour `#5a6f91`, with 9px of space below it. For example,
"YOUR EMISSIONS, IN FOCUS" above a "Command Map" heading. IDs, codes, model names and formulas are also
set in mono.

## Radii

Two distinct radius families, never mixed on the same element:

- **Chrome and cards:** 15–18px (cards 18px, stat tiles 15–16px, dialogs 20px).
- **Controls:** pills are fully round (999px); inputs, selects and buttons use 11–12px; tiny tags use
  4–5px.

## Navbar

A fixed pattern, reused on every page:

- Height 68px, background `#fff`, 1px bottom border in `--line`, horizontal padding 36px, flex layout
  with `space-between` and a 16px gap. On a map page it floats over the map as a glass bar instead.
- **Left:** the brand wordmark in DM Sans, 28px, weight 650, lowercase ("leakpoint") with a `--blue`
  full stop after it, preceded by a small geometric mark built from two `--blue` strokes — an L-shape
  25px tall with a 6px stroke and 1px radius, plus an 8px square dot.
- **Centre:** the primary navigation as a single pill capsule. Each item is its own pill: padding
  8px 15px, radius 999px, 12.5px text at weight 550, colour `#5b6678`. On hover the background becomes
  `#f2f5fb` with ink text; the active item has background `--blue-light` and `--blue` text. Six items
  maximum. Secondary destinations (alerts, ledger) do not belong in the nav.
- **Right:** a mono region label with a small globe icon (11px), a bell icon button (30px) with a
  `--blue` count badge (17px round, 9.5px weight 600 white text, 2px white ring) shown only when unread
  count is greater than zero, a settings gear button (30px), and a 30px round avatar (`#eef2f8` fill,
  10px weight 600 `#536380` initials). Icon buttons are borderless, colour `#54617a`, radius 999px, with
  a `#f2f5fb` hover background.
- Below 900px width, the capsule collapses into a hamburger dropdown; the bell and gear stay visible.

## Layout and components

- **Page:** content is centred at a max width of roughly 1180px, with 32px 36px padding on the
  `--paper` background. The page header is eyebrow → `h1` → a one-line description (13px, muted), with
  an optional action on the right.
- **Cards:** `#fff` background, 1px `--line` border, 18px radius, 22–24px padding, hover border
  `#a6bdea`. No shadow at rest; on hover, at most `0 6px 20px rgba(26,42,74,0.12)`.
- **Stat tiles in a row:** separated by 1px `--line` vertical dividers, not by gaps. Each tile has a
  10px muted label with a small icon at the right, a 30px value, and a one-line 10px muted note beneath.
- **Tables:** 9px uppercase mono column headers, 12px rows, 1px `--line` row borders, no zebra striping.
- **Tags:** 9–10px text at weight 600, padding 3px 8px, radius 4px, a tinted background with matching
  dark text. Tones: blue, success (green), warning (amber), neutral (grey), plus the sector colours
  above.
- **Buttons:** primary is a `--blue` fill with white text, 11px radius, 10px 16px padding, 12px text at
  weight 550, hovering to `--blue-dark`. The outline variant is `#fff` with a 1px `--line` border and
  ink text. An icon (15–16px) sits before the label with an 8px gap. Buttons are never uppercase.
- **Inputs and selects:** 38–42px tall, 1px `--line` border, 11px radius, 12px text. Focus state is a
  1px `--blue` border plus a 2px `#dce7ff` ring — never a second inner ring.
- **Notices:** a full-width bar, 12px radius, 1px border, 12px text. Info tone uses `--blue-light` with
  a `--blue` border at 30% opacity; warning tone uses amber. One sentence only — disclose a caveat once
  per page, never repeated beside the number it qualifies.
- **Floating drawer or panel** (used on map pages): glass effect — background
  `rgba(255,255,255,0.86)` with `backdrop-filter: blur(18px)`, a 1px `rgba(210,221,238,0.9)` border, and
  22px radius. Stat tiles inside it use a faint vertical white gradient and 16px radius.
- **Floating assistant launcher:** fixed to the bottom-right at 24px, a `--blue` pill 52px tall with a
  sparkle icon and the label "Assistant", white text, and a soft shadow of
  `0 10px 30px rgba(36,88,229,0.28)`. While the assistant is a preview it carries a small mono
  "SOON" chip (9px, uppercase, white at 18% tint). It hides below 680px width when the panel is open.
- **Assistant panel (preview):** a card anchored above the launcher — 380px wide (full width minus
  16px gutters on phones), `#fff`, 1px `--line`, 18px radius, the hover-level shadow, 18px padding.
  Order inside: eyebrow "AI ASSISTANT" → `h2` "Family ID assistant" with a warning-tone tag
  "Coming soon" → one info notice stating that answers are samples → the conversation → suggested
  questions as pills (only before the first question) → a 40px input with a primary icon button.
  Messages are 12.5px on 12px-radius bubbles: assistant bubbles on `--paper` with a `--line`
  border, aligned left; user bubbles on `--blue-light` in `--blue`, aligned right. Page links
  returned with an answer render as pills with a small arrow. Nothing in the panel animates except
  the 0.18s fade on open.
- **Empty states:** centred, a 30px icon in a soft tile, one `h2`, one sentence, and one primary button.
- **Motion:** 0.18–0.22s ease transitions on hover, border and colour only. Nothing bounces.
- **Spacing scale:** 4, 6, 8, 12, 16, 22, 32, 44px. Prefer air over dividers wherever both would work.

## Non-negotiables

- One accent colour per screen. Charts use `--blue` and `#9fb6ea` for series, with `--line` for the
  grid.
- Every number carries its unit in muted text, and its source in a caption or an evidence panel.
- WCAG 2.1 AA contrast: 4.5:1 for all text (`--muted` on white passes this; never go lighter than
  `#5c6a80` on white). Focus must be visible on every interactive element, and meaning is never conveyed
  by colour alone.
- Copy is written in plain, declarative sentences: no exclamation marks, no emoji in interface text
  (emoji are allowed only as map-layer pictograms), and no placeholder lorem ipsum text.

Before finishing any screen, check: an eyebrow is present, radii come from the correct family, only
`--line` is used for borders, units sit outside numbers, and every clickable card has a hover state.
