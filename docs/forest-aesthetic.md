# Forest aesthetic

Settings → Appearance → **Forest aesthetic** applies immediately. It defaults on; switching it off restores the existing styles and garden grass. The preference is local to this browser, independent of backups and sidebar state.

## Implementation

- `index.html` reads `greenhouse-forest-aesthetic` before the production stylesheet. Only the string `false` opts out; missing or invalid values enable the forest.
- `src/appearance.ts` owns the preference and listens for storage changes even outside Settings. Only Settings subscribes to its React snapshot. Changing the root `data-forest-aesthetic` attribute does not remount routes, forms, the carousel, or the editor.
- Storage errors leave the controls usable for the session and show a quiet Settings explanation. The existing sidebar storage access is also guarded so it cannot prevent Settings from opening.
- `src/forest.css` is the scoped material layer. The base screen styles remain intact. Outer surfaces use decorative pseudo-elements for backdrop filtering; ancestors of dialogs and editor popups never acquire filters or new stacking contexts.
- Home uses a 65% green tint, reference surfaces 82%, the writing surface 92%, and dialogs/inputs 96%. Profile section headings and collection tabs have darker backing to preserve contrast where the artwork is brighter.
- Reduced transparency uses opaque surfaces without the scene. Forced colors removes the scene and retains system-colored switch states. Browsers without backdrop filtering receive solid surfaces. A dark background remains if artwork cannot load.
- No animation, dependency, backend interface, database, backup format, companion identity, or editor document format was added or changed.

## Artwork

The application ships two optimized forest exports:

| Export | Dimensions | Bytes | Treatment |
| --- | --- | --- | --- |
| `public/images/forest-desktop.webp` | 1672 × 941 | 52,746 | Full composition, WebP quality 82, method 6 |
| `public/images/forest-mobile.webp` | 584 × 941 | 18,944 | Source crop `(0, 0, 584, 941)`, retaining the standing sprite; same WebP settings |

The CSS switches to the portrait export at 620px, uses one fixed viewport scene, and softly blurs that decorative layer. Functional companions and photographs stay sharp. Decorative characters never sit above UI panels.

## Verification

- **120 tests pass** (the previous baseline was 104), including preference initialization, persistence, invalid values, blocked storage access/writes, cross-tab events, independent sidebar state, and retained restore confirmation/file.
- Profile and carousel regressions confirm the active tab, comparison, draft, focus, logical scroll position and playback state survive appearance changes without extra API calls.
- Journal regression coverage checks the mounted editor, selection and unsaved title; the existing autosave, recovery, conflict and navigation suites pass unchanged.
- Production build and client/server type checking pass.
- The isolated demo preview was reviewed at **320, 390, 820, 1280 and 1440px**, with expanded navigation and both desktop sidebar states. **144 route screenshots (72 pairs)** have no document-level horizontal overflow. Missing photos, long captions and names are present in the fixture.
- Browser checks covered cross-tab switching with an open update form, Journal draft and drawer, nested Journal/search dialogs, search keyboard navigation, modal focus trapping, Escape and focus restoration. A temporary Journal entry verified actual editor undo/redo after switching; it was then deleted from the isolated demo.
- Conservative image-composition checks passed for 208 visible heading/metadata cases across viewport/sidebar combinations. The Home secondary-text surface has a minimum computed ratio of 4.53:1 over the brightest source pixel; reference/writing/dialog surfaces provide greater contrast. This is a targeted contrast review, not a full accessibility certification.
- Off-state Species screenshots were compared with the previous baseline at all five widths: layout, photo treatment and surfaces match; remaining pixel differences are focus/hover outlines and transient scrollbars.

### Local review artifacts

`.tmp-codex-verification-forest/review.html` contains paired route and overlay screenshots and a click-to-play toggle walkthrough. The isolated preview serves it at `http://localhost:4186/forest-review/review.html`. Screenshots and audit JSON are in the same ignored verification directory.

### Remaining device checks

Browser automation did not reproduce native Enter/Space default button activation, OS reduced-transparency/forced-colors settings, or physical touch input. The switch is a native labeled button with `role="switch"`, and the CSS fallbacks are implemented; verify those cases on the target device. Browser/React selection persistence was checked in regression tests, but actual IME composition through a cross-tab appearance change still needs a device check.

No test writes or restores touched the user's greenhouse. Browser writes used `/tmp/greenhouse-redesign-qa.2S0G3B`; restore tests used mocked uploads.
