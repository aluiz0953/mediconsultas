---
name: MediConsultas (signed-in interior)
description: Cuidado conectado. A clinic's appointments and patients as printed fichas, status as a stamp, emerald only where you act.
colors:
  sheet: "#fafafa"
  sheet-dark: "#171717"
  shell-dark: "#0a0a0a"
  ficha: "#ffffff"
  ink: "#171717"
  ink-dark: "#f5f5f5"
  ink-soft: "#525252"
  ink-soft-dark: "#a3a3a3"
  rule: "#e5e5e5"
  rule-dark: "#262626"
  rule-strong: "#d4d4d4"
  rule-strong-dark: "#404040"
  emerald-fill: "#047857"
  emerald-fill-hover: "#065f46"
  emerald-ring: "#059669"
  emerald-on-dark: "#10b981"
  selection: "#a7f3d0"
  stop-red: "#991b1b"
  stop-red-dark: "#f87171"
typography:
  page-title:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  time:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.25"
  value:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "1.5"
  body:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.05em"
rounded:
  stamp: "3px"
  ficha: "6px"
  pill: "9999px"
spacing:
  tab-inset: "19px"
  rail: "72px"
  rail-open: "240px"
  ficha-x: "16px"
  panel-x: "20px"
  page-max: "1100px"
components:
  button-primary:
    backgroundColor: "{colors.emerald-fill}"
    textColor: "{colors.ficha}"
    rounded: "{rounded.ficha}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.emerald-fill-hover}"
  button-cancel:
    textColor: "{colors.stop-red}"
    rounded: "{rounded.ficha}"
    padding: "8px 12px"
  tab-open:
    backgroundColor: "{colors.emerald-fill}"
    textColor: "{colors.ficha}"
    rounded: "{rounded.ficha}"
    height: "44px"
  ficha-strip:
    backgroundColor: "{colors.ficha}"
    rounded: "{rounded.ficha}"
    padding: "12px 16px"
  stamp:
    textColor: "{colors.ink}"
    rounded: "{rounded.stamp}"
    padding: "1px 6px"
    typography: "{typography.label}"
---

# Design System: MediConsultas (signed-in interior)

## Overview

**Creative North Star: "The Ficha de Prontuário"**

Every appointment is a printed ficha on a pale sheet: a white card with a one-pixel edge, small uppercase field labels over plain values, and status as a rubber stamp rather than a coloured pill. The interior is monochrome ink on paper; emerald appears only where the user acts or where they are (the primary button, the open tab), and red appears only for cancel and absence. One family, Outfit, with tabular numerals everywhere so times and counts line up.

The system is quiet and operational. Density is moderate, rules (1px lines, a 2px top rule on stat fields, a dashed rule inside a ficha) do the work that tinted fills and icon tiles do elsewhere. Login, register, forgot and reset screens are outside this system: pinned, with their own treatment (Fraunces survives there only).

Applies today to the shell and shared components (rail, page header, stat field, stamp, toast) and to the secretary schedule row. Other screens inherit the shell but still carry the older card layout (see Deviations).

**Key Characteristics:**
- Neutral sheet, white ficha, 1px rule edge; no gradients, no glass, no icon tiles.
- Emerald-700 for every fill that carries white text; emerald never decorates.
- Status is a stamp: border style encodes kind, ink stays neutral.
- Destructive and confirming actions sit at opposite ends of a fixed-width column.
- One typeface (Outfit), tabular numerals globally.

## Colors

Neutral paper and ink with a single emerald action colour and a single red reserved for stopping things.

### Primary
- **Clinic Emerald** (`emerald-fill`, #047857): the primary button, the open tab fill, the text caret, links ("Ver tudo"). Chosen at 700 so white text on it is legible. Hover is **Deep Emerald** (`emerald-fill-hover`, #065f46). Focus rings use **Ring Emerald** (`emerald-ring`, #059669). In dark mode text and caret lift to **Lit Emerald** (`emerald-on-dark`, #10b981); fills stay emerald-700.

### Secondary
- **Stop Red** (`stop-red`, #991b1b; dark `stop-red-dark`, #f87171): Cancelar, and the stamp for cancelled and absent states. Nothing else is red.

### Neutral
- **Sheet** (`sheet`, #fafafa; dark `sheet-dark`, #171717): page background. In the shipped shell the dark page area is `shell-dark` (#0a0a0a) while the rail and header use #171717.
- **Ficha** (`ficha`, #ffffff): rail, header, strips and panels (dark: #171717).
- **Ink** (`ink`, #171717; dark `ink-dark`, #f5f5f5): values, titles, stamp text.
- **Soft Ink** (`ink-soft`, #525252; dark #a3a3a3): labels, subtitles, secondary lines.
- **Rule** (`rule`, #e5e5e5; dark #262626): the 1px edge on fichas, header and rail, and dividers. **Strong Rule** (`rule-strong`, #d4d4d4; dark #404040): stat-field top rule and the "done" stamp border.
- **Selection** (`selection`, #a7f3d0 on #064e3b text; dark #065f46 on #ecfdf5): text selection takes the palette.

The shadcn-style tokens in `index.css` (`--background`, `--card`, `--border`, `--primary` #047857 / dark #10b981, `--destructive`) mirror these for the toast and orb components.

### Named Rules
**The Action-Only Emerald Rule.** Emerald marks an action or the current place, nothing else. A screen with no primary button and no open tab has no emerald fill.

**The Red-Means-Stop Rule.** Red is for cancel, reject and absence. Warnings, pending and information are neutral ink with a different stamp border, never amber or blue.

## Typography

**Display / Body / Label Font:** Outfit Variable (with ui-sans-serif, system-ui, sans-serif). **Login only:** Fraunces Variable.

**Character:** a single geometric sans carries everything; hierarchy comes from weight, size and uppercase small labels, not from a second face. Tabular numerals are set on `body`.

### Hierarchy
- **Page title** (600, 1.5rem, -0.025em tracking): one h1 per screen in the ruled header.
- **Figure** (600, 1.5rem): the number in a stat field.
- **Time** (600, 1.125rem, tight leading): the appointment time that anchors a ficha strip.
- **Value** (500, 15px): the patient name or main datum of a row; 14px (0.875rem) for supporting lines, 12px for "até" and meta lines.
- **Label** (600, 11px, +0.05em, uppercase): field labels, stamps, section tab titles; panel headings use 13px at the same tracking.

### Named Rules
**The Label-Above Rule.** Labels are small uppercase text above a larger value, never inline beside it.

## Layout

Desktop (lg and up): a fixed 72px tab rail on the left, page content padded 72px, centered in a 1100px max-width column with 16px (24px from sm) padding. Below lg the rail becomes a 256px drawer opened from a menu button in the top bar. A thin top bar (white, 1px bottom rule) carries the role zone name, profile and "Sair".

Within a page: a ruled PageHeader (title, optional subtitle capped at prose width, action at the right end, wrapping under it on narrow screens), then content. Stat fields sit in a grid; the secretary strip is a 3-column grid (88px time, flexible who/stamp, auto actions) that collapses to two columns with the actions on a dashed-rule second line below sm. Spacing follows the Tailwind 4px scale; rows use 12px vertical, 16px horizontal (strips) or 20px horizontal (panels).

## Elevation & Depth

Flat. Depth comes from a 1px rule edge and from the white ficha sitting on the pale sheet. The only shadow in the interior is the toast's stock `shadow-md`, because it floats over content; nothing at rest has a shadow. No backdrop blur or translucent glass on any surface (the mobile drawer scrim is a plain 40% black).

### Named Rules
**The Flat-At-Rest Rule.** A surface that is not floating over other content has a border, not a shadow.

## Shapes

Square-ish. Fichas, strips, panels, buttons and tabs use a 6px corner (`rounded-md`). Stamps use 3px. Only the toast's icon well, the avatar and the toast action/close buttons are fully round. Borders are the shape language: 1px rule edges, 1.5px stamp borders, a 2px top rule on stat fields, a dashed 1px rule dividing actions inside a ficha.

## Components

### Buttons
- **Shape:** 6px corners.
- **Primary:** Clinic Emerald fill, white text, 14px/500, padding 8px 14px (strip) or 8px 16px (page action). Hover to Deep Emerald; active scales to 0.98; focus shows a 2px Ring Emerald ring with 2px offset.
- **Cancel (destructive):** no fill, Stop Red text, underline on hover, red ring on focus. It is deliberately not a filled button and never adjacent to Confirmar.
- **Sair / neutral:** 1px neutral-300 border, soft ink text, hover neutral-100.

### Navigation (tab rail)
A 72px rail whose 44px tabs hold an 18px icon at a 19px inset so it stays centred when closed. Hover or focus-within on the rail widens it to 240px (200ms, ease cubic-bezier(0.16,1,0.3,1)) and fades the labels in. The current tab is filled Clinic Emerald with white text, 6px corners; other tabs are soft ink, hover neutral-100. Section titles ("Navegação", "Gestão") are 11px uppercase labels above a rule. Reduced motion removes the width and fade transitions. Mobile: same content in a slide-in 256px drawer with labels always shown.

### Page header
Title and optional subtitle on the left, action on the right, a 1px bottom rule with 16px below the text. No background.

### Stat field
A labelled field, not a card: 2px strong-rule on top, 8px padding, 11px uppercase soft-ink label, then the 24px/600 figure. The icon prop is accepted and ignored.

### Status stamp
Bordered, uppercase 11px/600 label, 3px corners, 1.5px border in current colour, padding 1px 6px. Ink is neutral; the border style states the kind:
- Waiting (SCHEDULED): dashed.
- Confirmed (CONFIRMED): solid.
- In progress (IN_PROGRESS): double, 3px.
- Done (COMPLETED): solid, soft ink on strong rule.
- Stopped (CANCELLED, PATIENT_ABSENT, DOCTOR_ABSENT): solid, Stop Red.
The doctor queue chips (Fila aberta solid, pausada dashed, fechada done-light) reuse the same vocabulary. When a live update changes a row's status, the stamp flips once (380ms rotateX from -90deg, top origin); reduced motion turns this off.

### Secretary ficha strip
White bordered 6px row: bold 18px time with "até" end time beneath, patient (15px/500) with "com doctor" below and the stamp under that, and a 16rem action column. Confirmar (primary, left) shows only for SCHEDULED; Cancelar (right, red text) shows for SCHEDULED and CONFIRMED; the two sit at opposite ends of the column, which is the isolation. Below sm the actions drop onto a dashed-rule second line.

### Panel
White 6px-corner bordered section with a 13px uppercase heading over a bottom rule, rows divided by 1px rules, 20px horizontal padding. Notice counts render in a small bordered stamp-like box, never a coloured disc.

### Toast
The beUI animated stack, themed through the shadcn tokens: `bg-card`, 1px border, 6px corners, `shadow-md`, no blur or glass; enter/exit and content swaps use springs and fades that fall back to opacity-only under reduced motion. Success tints the icon well emerald, error uses destructive.

### Selection and caret
Text selection is Emerald-200 on emerald-900; the input caret is emerald-700 (dark #10b981).

## Do's and Don'ts

### Do:
- **Do** put the fill emerald-700 (#047857) behind any white text; use ring-emerald-600 for focus.
- **Do** show status as a stamp and encode its kind in the border style, keeping the ink neutral.
- **Do** place a destructive action at the opposite end of the action column from the confirming one.
- **Do** keep field labels at 11px uppercase above 15px values, with tabular numerals.
- **Do** honour `prefers-reduced-motion` for the rail, stamp flip and toast.
- **Do** start a screen with a ruled PageHeader and use the 6px corner for new fichas and panels.

### Don't:
- **Don't** use red for anything but cancel, reject and absence.
- **Don't** nest cards inside cards, add gradients, icon tiles, or glass to the interior.
- **Don't** colour a status as a tinted pill; the stamp is the only status form.
- **Don't** introduce Fraunces or a second family outside the login screens.
- **Don't** place Confirmar and Cancelar next to each other.

## Deviations (recorded from the build, not rules)

- Only the shell, the shared components (PageHeader, StatCard, StatusBadge, toast theming) and the secretary schedule row are redesigned. The doctor queue, patient lists and admin pages still use the older card layout, with 6px and 8px corners mixed.
- The secretary schedule's first viewport still opens on the booking form, not on the day's fichas in time order.
- Ruled entry lines inside fichas (the contract's notes area) are not built; the only inner rule is the dashed action divider.
- The dark page area is #0a0a0a rather than the contract's #171717.
- Verified only against mocked fetch; no local Postgres was available, so real-data states are unobserved.
