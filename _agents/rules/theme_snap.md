---
trigger: always_on
description: "Light/dark theme switches must snap instantly on every element, never fade or animate."
---

# Theme Toggles Snap, Never Fade

When the user switches between light and dark mode, the whole page must change **instantly**. No element may fade, cross-dissolve, or animate its colors during the switch. This applies to every site, page, game, and tool in this repo, existing and new.

## How to implement
- Don't put `transition` on `body`, `html`, or page backgrounds just for theme colors.
- Hover and state transitions on components are fine, but they must be suppressed during the theme swap. Use a temporary snap class on `<html>`:

```css
html.theme-snap,
html.theme-snap *,
html.theme-snap *::before,
html.theme-snap *::after {
    transition: none !important;
}
```

```js
function applyTheme(dark) {
    const root = document.documentElement;
    root.classList.add('theme-snap');
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    void root.offsetHeight; // force a style flush while transitions are off
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-snap')));
}
```

- Apply the saved theme in an inline `<script>` in `<head>` before any CSS paints, so there's no flash or fade on page load.
- Only kill `transition` in the snap class, not `animation`. Toggling `animation: none` on and off restarts every finished keyframe animation (pops, fades in), so the whole page would replay its entrance effects on each theme switch. Theme colors should never be driven by keyframe animations in the first place.
- When reviewing or restyling an existing page, check its theme toggle against this rule and fix it if it fades.
