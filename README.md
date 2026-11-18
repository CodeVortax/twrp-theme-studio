# TWRP Theme Studio

Visual, live-preview editor for TWRP recovery themes. It loads a real TWRP theme (`ui.xml` + `portrait.xml` + images),
renders it with a proper theme engine (templates, styles, conditions, lists, keyboard, sliders...) and lets you edit it by tapping.

## Run
```bash
npm install          # only needs express
npm start            # http://localhost:8080
# edit the real recovery source instead of the bundled copy:
THEME_DIR=/data/data/com.termux/files/home/realme_c51/android_bootable_recovery/gui/theme npm start
```
Env: `PORT`, `HOST`, `THEME_DIR`, `DENSITY` (default `portrait_hdpi`).

## What you can do
- **Preview mode** – tap buttons to navigate like the real recovery; pick any page from the dropdown; ← goes back.
- **Select mode** – tap any element to inspect it, **drag to move**, arrow keys nudge (Shift = 8px). Edit position, anchor, text, colors, font, image, style; delete elements.
- **Colors** – every theme color with alpha, plus all hard-coded colors (keyboard, navbar...) grouped for replace-everywhere.
- **Layout** – font sizes and every numeric variable (header height, indent, list heights...) with sliders.
- **Images** – tap/drop to replace (auto-resized to the original size), tint, reset.
- **Presets** – Dracula, Nord, AMOLED, Catppuccin... or a random palette; image buttons/icons are recolored to match.
- **Simulate** – battery, clock, Samsung navbar, keyboard, busy state, font scale (preview only).
- **Undo/redo**, **Save** (variable edits patch only the changed line, so git diffs stay small; optional git commit/push),
  **Export ui.zip** (flash-ready; does not touch the source).

Shortcuts: Ctrl+S save, Ctrl+Z / Ctrl+Y undo/redo, Esc deselect.

## Notes
- Fonts are not in the repo, so the preview uses Roboto Condensed look-alikes; use *Simulate → Font scale* if sizes feel off.
- Edits to elements/styles/fonts rewrite the XML file tab-indented (comments kept, blank lines dropped).
