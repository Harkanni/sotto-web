# Sotto UI design system

The rules every screen follows. It documents what is built, so the code is the source of truth:
`src/styles/tokens.css` (values), `src/styles/globals.css` (Tailwind mapping, utilities),
`src/styles/shell.css` (app chrome), `src/lib/motion/` (springs) and `src/components/ui/`
(components). Change a value there first, then here. Storybook (`pnpm storybook`) shows every
component in every state, in light and dark.

Brief §8–9 (in `sotto-platform/docs/BRIEF.md`) is the origin; where the brief and this file differ,
this file describes what shipped.

## 1. Direction

Sotto should feel like a native app on the phone in your hand: calm, quick, and quiet about
itself. The content (memos, meetings, answers with sources) is the subject; the interface gets out
of its way.

- **Grouped surfaces.** A light-grey page (`#F2F2F7`, black in dark mode) with white cards and
  inset rows, so structure comes from surfaces rather than lines and borders.
- **One accent.** Indigo (`#5856D6`) marks what you can act on: buttons, links, the active tab,
  selection, citations. Everything else is neutral. Red only for destructive actions and the
  Restricted label.
- **The system's own type.** SF on Apple devices (via `-apple-system`), Inter everywhere else,
  never SF shipped as a file.
- **Materials, not chrome.** Bars and menus are translucent and blurred, so content stays present
  under them.
- **Motion answers touch.** Things move because you moved them: a push follows the tap, a sheet
  follows the finger, a swipe hands its speed to the spring. Nothing animates on its own to
  decorate.

## 2. Colour

All colours are tokens with a light and a dark value (`light-dark()`), so one name covers both
themes. Tailwind's own palette is switched off: only these exist (`bg-card`,
`text-muted-foreground`, `border-separator`…). Every text pairing meets WCAG AA (4.5:1); ratios
are noted in `tokens.css` and checked in `test/tokens.test.ts`.

### Surfaces

| Token         | Light     | Dark      | Use                                                 |
| ------------- | --------- | --------- | --------------------------------------------------- |
| `background`  | `#F2F2F7` | `#000000` | The page behind grouped content                     |
| `card`        | `#FFFFFF` | `#1C1C1E` | Cards, list rows, sheets                            |
| `card-nested` | `#F2F2F7` | `#2C2C2E` | A well inside a card (sheet tiles, shortcut groups) |
| `elevated`    | `#FFFFFF` | `#2C2C2E` | Menus, popovers, the palette, toasts                |

### Text

| Token              | Light                | Dark                    | Use                                                                  |
| ------------------ | -------------------- | ----------------------- | -------------------------------------------------------------------- |
| `foreground`       | `#000000`            | `#FFFFFF`               | Body and titles                                                      |
| `muted-foreground` | `#6C6C70`            | `rgb(235 235 245 / .6)` | Secondary text, metadata (5.23:1 on card)                            |
| `faint-foreground` | `rgb(60 60 67 / .3)` | `rgb(235 235 245 / .3)` | Decoration only: chevrons, disabled glyphs. Never text you must read |

### Accent and status

| Token                      | Light              | Dark      | Use                                                                  |
| -------------------------- | ------------------ | --------- | -------------------------------------------------------------------- |
| `primary`                  | `#5856D6`          | `#5E5CE6` | Filled buttons, the + button, selected chips (white text 5.65:1)     |
| `primary-text`             | `#5856D6`          | `#7D7AFF` | Links, ghost buttons, the active tab; `#9A98FF` on elevated surfaces |
| `primary-tint` / `-strong` | indigo at 8% / 14% | same      | Hover wash / pressed wash on indigo text controls                    |
| `destructive`              | `#D70015`          | `#D70015` | Destructive fills (white text 5.38:1)                                |
| `destructive-text`         | `#D70015`          | `#FF6961` | Destructive text and menu items                                      |
| `success-text`             | `#1D7432`          | `#30D158` | Done, Public                                                         |
| `warning-text`             | `#B33000`          | `#FF9F0A` | Due today, Confidential                                              |

Sensitivity labels (`SensitivityBadge`): Public (green), Internal (grey), Confidential (orange),
Restricted (red), each as text on a 10% (16% dark) tint of itself. Internal is the default and
isn't shown in lists.

### Fills, lines and states

| Token                                  | Use                                                |
| -------------------------------------- | -------------------------------------------------- |
| `fill` / `fill-strong` / `fill-subtle` | Inputs and chips / pressed / hover                 |
| `separator`                            | Hairlines between rows (0.5 px, inset to the text) |
| `row-pressed`                          | A list row under your finger                       |
| `ring`                                 | Focus ring (`primary-text`)                        |
| `overlay`                              | Dim behind sheets and dialogs (22% / 48% black)    |
| `scrim`                                | Dim on a screen being covered by a push (8% / 32%) |

Swipe-action colours are fixed (they sit on their own colour, white text ≥ 4.5:1): orange
`#C93400` (Pin), blue `#0040DD` (Share), indigo `#5856D6` (Move), red `#D70015` (Delete).

## 3. Typography

Font stack: `-apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif`. Inter is
self-hosted (Latin subset, variable 100–900, `font-display: swap`, not preloaded because Apple
devices never request it).

The scale (iOS text styles). Use the utility, not a raw size:

| Utility            | Size / line | Weight | Use                                         |
| ------------------ | ----------- | ------ | ------------------------------------------- |
| `text-large-title` | 34 / 41     | 700    | A tab's root title, collapsing into the bar |
| `text-title-1`     | 28 / 34     | 700    | Rare: hero numbers                          |
| `text-title-2`     | 22 / 28     | 700    | Empty-state and drop-target titles          |
| `text-title-3`     | 20 / 25     | 600    | Sheet titles, section headers on Home       |
| `text-headline`    | 17 / 22     | 600    | Card titles, the inline bar title           |
| `text-body`        | 17 / 22     | 400    | Row titles, reading text                    |
| `text-callout`     | 16 / 21     | 400    | Buttons (600), toasts, descriptions         |
| `text-subhead`     | 15 / 20     | 400    | Row subtitles                               |
| `text-footnote`    | 13 / 18     | 400    | Section labels above lists, hints, metadata |
| `text-caption`     | 12 / 16     | 400    | Badges, timestamps under controls           |

Rules:

- Body text is at least 16 px; anything smaller is metadata. Inputs are at least 16 px so iOS
  never zooms on focus.
- Tracking follows the face: Inter's own spacing by default, UIKit's table on Apple devices
  (`data-platform="apple"`, set before first paint).
- Long reading text (`prose-reading`) uses a 1.5 line height and stays under ~70 characters.
- Titles truncate to one line with an ellipsis; nothing reflows a bar.
- Sentence case everywhere. No all-caps labels.

## 4. Spacing and layout

- **Grid:** Tailwind's 4 px spacing scale (`p-1` = 4 px … `p-4` = 16 px).
- **Gutter:** `--gutter` is 16 px on phones and 20 px from 768 px; screens and cards use
  `px-[var(--gutter)]`.
- **Rows:** at least 44 px tall (`min-h-11`), 16 px leading inset, separators inset to the text,
  the last row without one.
- **Sections:** a footnote-size label 6 px above a grouped card; 20–28 px between sections.
- **Tap targets:** at least 44 × 44 px with 8 px between neighbours. Small visuals (citation chips,
  the sheet close button) extend their hit area with a transparent `::before`.
- **Thumb reach:** primary actions in the bottom 40% on phones: the + button, the composer and
  Send, play and pause, sheet actions.
- **Safe areas:** `viewport-fit=cover` with `--safe-*` insets; bars pad into them.
- **Fixed sizes:** tab bar 49 px (+ safe area), nav bar 44 px, + button 56 px (16 px above the
  tab bar, mirrored for left-handed use), sidebar 272 px, list pane 376 px.

## 5. Radii

| Token                       | Value    | Use                                         |
| --------------------------- | -------- | ------------------------------------------- |
| `rounded-xs` / `rounded-sm` | 4 / 6 px | Skeleton lines, small marks                 |
| `rounded-button`            | 8 px     | Buttons, sidebar items                      |
| `rounded-input`             | 10 px    | Search fields, inputs                       |
| `rounded-card`              | 12 px    | Cards and grouped lists                     |
| `rounded-menu`              | 13 px    | Menus, toasts, the long-press menu          |
| `rounded-sheet`             | 16 px    | Sheets and dialogs (the palette uses 18 px) |
| `rounded-full`              | —        | Chips, avatars, the + button, the composer  |

Nested corners shrink by the padding between them (a 13 px menu with 4 px padding has 9 px items).

## 6. Depth

Depth comes from surface colour first, then materials, then shadow.

| Level                                           | Treatment                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Page                                            | `background`                                                                   |
| Card                                            | `card` (+ `shadow-card`, a 1 px hint, light mode only)                         |
| Bars (tab bar, nav bar, sidebar, offline strip) | `material-bar`: card at 72% + `saturate(180%) blur(20px)`, hairline edge       |
| Menus, toasts                                   | `material-thick`: elevated at 82% + `saturate(180%) blur(30px)`, `shadow-menu` |
| Palette                                         | elevated at 94% + `blur(40px)` (legible over any page), `shadow-menu`          |
| Sheets                                          | `card`, `shadow-sheet`; the page behind scales to 0.94 and dims                |
| + button                                        | `primary`, `shadow-fab` (indigo-tinted in light mode)                          |

Every material falls back to a solid surface without backdrop-filter support or with
`prefers-reduced-transparency`.

Stacking order (`--z-*`): screen 0 → nav bar 10 → tab bar 20 → + button 30 → banner 35 →
overlay 40 → sheet 50 → popover 60 → toast 70 → palette 80.

## 7. Components

All in `src/components/ui` (primitives) and `src/components/shell` (app chrome). Built on Radix
for focus, keyboard and labelling.

- **Button** — four variants: `primary` (indigo fill), `secondary` (indigo outline), `ghost`
  (indigo text), `destructive` (red fill). Always 44 px tall; `size="icon"` is 44 × 44. `loading`
  shows a spinner without changing the width (in place of the icon, or over the hidden label).
  `asChild` styles a link.
- **List / ListRow / ActionRow** — grouped rows with optional leading icon, subtitle, detail,
  trailing accessory and chevron. ActionRow adds every secondary action: swipe left for the
  trailing actions (a full swipe deletes), swipe right for Pin, long-press for a preview with the
  menu, right-click on desktop, and a "…" button for keyboards and screen readers.
- **SegmentedControl** — a sliding white thumb on a fill track (Radix radio group).
- **Switch** — iOS switch in indigo; the thumb stretches while pressed.
- **SearchField** — filled, rounded, clear button, Cancel slides in while focused.
- **Badge / SensitivityBadge**, **Avatar / AvatarStack**, **Kbd** (`ModKey` shows ⌘ or Ctrl).
- **Sheet** — a bottom sheet on phones (content, medium and large detents, a grabber,
  drag-to-dismiss with velocity, the page receding behind); a centred dialog from 768 px.
- **Toasts** — bottom-centre above the tab bar and the + button, translucent; Delete never asks,
  it offers Undo.
- **Command palette (⌘K)** — top-anchored, one sliding highlight, results grouped, ↵ opens,
  ⌘↵ asks Sotto.
- **Widget states** — `AsyncWidget` renders loading, empty, error and content for every data
  widget (see §8).
- **Shell** — tab bar (phones), sidebar (768 px and up), nav bar with large title, + button,
  offline strip, drag-and-drop target, shortcuts sheet.

## 8. States

### Buttons and controls

| State              | Treatment                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Default            | As above                                                                                                       |
| Hover (mouse only) | Fills darken 8% (`color-mix` with black); text controls get `primary-tint`                                     |
| Pressed            | Instant `scale(0.97)` and a 12% darker fill (`primary-tint-strong` for text controls); springs back on release |
| Focused (keyboard) | 2 px `ring` outline, 2 px offset, following the shape                                                          |
| Disabled           | 40% opacity, no pointer events                                                                                 |
| Loading            | Spinner, `aria-busy`, clicks ignored, same width                                                               |

`hovered:` and `pressed:` are custom variants: the real `:hover`/`:active`, or
`[data-hovered]`/`[data-pressed]` so Storybook can show them. Hover styles exist only where a
pointer can hover; touch never sees sticky hovers.

### Inputs

Default `fill` background with muted placeholder; focus shows the ring (search fields add
Cancel); filled shows a clear button; disabled at 40%. Text is 17 px.

### Rows

Pressed: `row-pressed`, applied 40 ms after touch-down (so a scroll never flashes it) and fading
out over 300 ms. Selected (wide screens): `fill`. Just opened (phones): the row stays tinted
under the pushed screen and fades on the way back.

### Data widgets

- **Loading:** a skeleton that mirrors the final layout, tinted from the widget's own surface,
  with a slow shimmer (static under reduced motion). Shown only after 150 ms, then kept for at
  least 300 ms, so nothing flickers.
- **Empty:** a small line illustration in the accent colour, a title, one line of help and at
  most one action. Time-filtered widgets say "No data for this period".
- **Error:** what went wrong in plain words, a 44 px Retry that refetches only that widget, and
  collapsible details with the request ID.

## 9. Motion

### Principles

1. **Motion follows the finger.** Gestures drive position directly; on release the spring starts
   from the gesture's speed, so there's no jump between dragging and animating.
2. **Interruptible.** Every transition can be reversed mid-flight (tap Back during a push, grab a
   sheet while it settles).
3. **Compositor only.** Animate `transform` and `opacity` (and `translate`/`scale`, the separate
   properties Tailwind 4 uses). Never animate layout (`width`, `height`, `top`, margins), except
   a row folding away after Delete.
4. **Quiet by default.** No entrance animations on page load, no hover effects that move
   things. One motion per action.
5. **Reduced motion** (`prefers-reduced-motion`): slides become crossfades, scales and lifts are
   dropped, skeletons stop shimmering.

### Springs and curves

Springs are traced into CSS `linear()` easings by `src/lib/motion/spring.ts`, so CSS transitions
and Web Animations share them; pair each with its duration. `ProgressDriver`
(`src/lib/motion/driver.ts`) runs them on the compositor with velocity hand-off.

| Name          | Stiffness / damping         | Duration   | Use                                                                            |
| ------------- | --------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `standard`    | 400 / 30 (slight overshoot) | 442 ms     | Sheets opening, the thumb of a segmented control, the long-press lift, banners |
| `snappy`      | 700 / 45                    | 350 ms     | Closing, small controls, menus popping in, a swiped row settling               |
| `push`        | 340 / 37 (no overshoot)     | 496 ms     | Screen push and pop                                                            |
| `sheet`       | 400 / 32                    | —          | Sheet drags released with velocity                                             |
| `ease-out`    | `cubic-bezier(.22,1,.36,1)` | 150–300 ms | Fades and colour changes                                                       |
| `ease-in-out` | `cubic-bezier(.65,0,.35,1)` | —          | Looping indicators                                                             |

Durations for plain fades: fast 150 ms (hover, colour), base 220 ms (bars, overlays), slow 300 ms.

### Choreography

| Moment                  | Motion                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Push                    | New screen slides in from the right on the `push` spring; the one below drifts 30% left under an 8% scrim and casts an edge shadow                     |
| Pop / edge swipe        | The reverse; an edge swipe (24 px from the left) tracks the finger and commits on a flick or past halfway                                              |
| Tab switch              | Instant (no animation), each tab keeps its stack and scroll                                                                                            |
| Sheet                   | Rises on `standard`, the page behind scales to 0.94 and dims; drag to dismiss with velocity                                                            |
| Dialog (tablet/desktop) | Fades in from 4% smaller and 12 px lower                                                                                                               |
| Palette                 | Drops 10 px from above and grows from 96.5%; the result highlight slides in 150 ms                                                                     |
| Long press              | The row sinks to 0.97 after 150 ms; at 480 ms it lifts out as a card over a blurred page, the menu pops from its corner; slide to an action and let go |
| Swipe row               | Follows the finger with rubber-banding; snaps open or closed with the release speed                                                                    |
| Delete                  | The row slides out (full swipe) or the preview fades, then the row folds away; Undo brings it back                                                     |
| Theme change            | A View Transition crossfade                                                                                                                            |
| Press                   | `scale(0.97)` in 70 ms, back on `snappy`                                                                                                               |

## 10. Responsive rules

| Width                    | Layout                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Under 768 px (phones)    | Tab bar with five tabs, one stack per tab, large titles, the + button, bottom sheets, edge swipe back (installed app)                                                                 |
| 768–1023 px (tablets)    | Sidebar (workspace, search, sections, New, Profile) and one content column; sheets become dialogs                                                                                     |
| 1024 px and up (desktop) | macOS-style panes: translucent sidebar, a 376 px list pane and a detail pane with a resizable Ask panel; ⌘K, keyboard shortcuts, right-click menus, drag-and-drop upload; no + button |

- The same URLs and screens at every width; only the arrangement changes.
- `dvh` for heights; the shell pins itself to the visual viewport while the iOS keyboard is open,
  so the composer sits right above it.
- Phones: one-handed rules (§4). Desktop: keyboard first (shortcuts in the "?" sheet).

## 11. Performance rules

The app must feel fast, not only look fast. `scripts/smoothness.mjs` measures frame timing at
4× CPU throttle on an emulated iPhone: a push, pop, swipe or tab switch should cost one or two
frames, with no network request.

- No `:has()` in selectors (it re-checks the document on every DOM change).
- Hidden tabs and covered screens use `content-visibility: hidden`, which keeps their layout;
  tabs are woken and laid out at idle so a first visit is a style change.
- One document, meeting and chat screen are pre-rendered at idle in a hidden `<Activity>`, so
  the first push of each kind runs warm instead of compiling its code mid-tap.
- Navigation is client-side over `history.pushState`: no server round trip per screen.
- Rows, bars and overlays are memoised; swipe buttons render only once a swipe starts.
- No layout reads during animations (ResizeObserver widths, CSS-positioned sentinels).
- Scrolling never re-renders React (an IntersectionObserver flips one attribute).

## 12. Accessibility

- AA contrast for all text (checked in tests); focus is always visible for keyboard users.
- Every gesture has a button equivalent ("…" on rows, Back, Close).
- Screen readers hear each navigation (a polite live region) and every status change (offline,
  back online, toasts).
- Labelled mocks: anything that is sample data or a preview says so on screen.
