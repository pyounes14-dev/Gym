// The identity of the second copy (her.html) lives here, and only here.
//
// Both tools/make-her-copy.js and tools/generate-her-icons.js read this file, so
// the HTML, the manifest and the icons can't drift apart. Change something, then
// re-run both scripts (see README → "A second copy").

// Accent presets. Green, amber and red are spoken for inside the app (beat-last-time,
// warnings, delete), so a copy's accent should stay clear of those hues.
const PRESETS = {
  cyan:    { accent: '#2fb6ff', accent2: '#8fd8ff', gradFrom: '#4cc0ff', gradTo: '#1a8cf0', chart: '#6fc9ff' },
  rose:    { accent: '#ff5c9c', accent2: '#ffa8c6', gradFrom: '#ff79ad', gradTo: '#f03c85', chart: '#ff8ab6' },
  magenta: { accent: '#e05cff', accent2: '#f0a8ff', gradFrom: '#ea79ff', gradTo: '#c93ceb', chart: '#ea8cff' },
};

const THEME = {
  // Shown in the header footer, the tab title, and as the home-screen name.
  // Make it hers: "Maya's Log", "Sophie — Gym", whatever she'd tap.
  name: 'Her Gym Log',
  shortName: 'Her Log',
  // 'cyan' | 'rose' | 'magenta'
  accent: 'cyan',
  // Her data lives under this localStorage key. Must differ from the main app's
  // "gymlog.v1" — that separation is the whole point of the copy.
  storageKey: 'gymlog.her.v1',
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function resolve() {
  const palette = PRESETS[THEME.accent];
  if (!palette) {
    throw new Error(`Unknown accent "${THEME.accent}". Pick one of: ${Object.keys(PRESETS).join(', ')}`);
  }
  const slug = THEME.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'her-gym-log';
  return { ...THEME, ...palette, slug, accentRgb: hexToRgb(palette.accent) };
}

module.exports = { resolve, PRESETS };
