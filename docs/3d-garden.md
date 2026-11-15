# Companion garden

The desktop dashboard opens a 3D garden by default. **Garden / List** switches between the garden and the original sprite collection; the preference is local to the browser. Below 768 pixels the sprite collection is used without importing the renderer.

Drag to pan, use **Zoom in / Zoom out**, and choose **Reset view** to return to the initial composition. Select a companion to show its name and **Open profile**. **Find a companion** searches the whole collection and switches to the correct plot. Each plot contains at most 24 records, including stationary terrarium habitats.

Plant companions wander, occasionally run, sit, and rest. Their existing sprite selection determines their family and preferred resting pose. Jar occupants represent terrarium artwork; they do not replace linked plant records. Animation performs no data writes or care actions.

The setting is a continuous woodland garden: gently raised terrain, winding earth paths, broadleaf trees and pines, shrubs, boulders, ferns, dense grass, and drifts of lavender, daisies, and yellow flowers. Rabbits, songbirds, and butterflies add ambient activity. The camera uses perspective, with tree shadows and distance fog; terrain extends beyond the view at every supported camera position.

## Motion and accessibility

**Pause** freezes the scene. Reduced motion disables ambient activity and selection reactions; manual camera controls remain immediate. Activity also stops when the garden is offscreen, the document is hidden, an app overlay is open, or keyboard focus is within the garden controls. Resuming never advances the simulation by the time spent inactive.

The companion finder provides native buttons and profile links for every record. Selecting a finder entry moves focus to its profile link; Escape clears selection. Renderer, asset, and context failures show the original sprite collection, with **Retry garden** to reload assets.

Camera, plot, selection, and pause state survive navigation within the app session. Only the Garden/List preference survives a full page reload. Appearance changes recolor the scene without resetting state.

## Rebuilding the artwork

Editable Blender sources and painted textures live in `assets/garden/`. Runtime models and the meadow texture live in `public/models/garden/`. They are all locally served; no Blender installation is required to run or build Greenhouse.

Blender 4.5 can regenerate all assets from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python scripts/garden-assets.py -- all
```

Use `-- flowering` instead of `-- all` to rebuild the first character alone. The source script uses a six-bone shared skeleton and in-place animation; the browser owns navigation. Each family exports one mesh primitive with a 1,024-pixel painted atlas and these clips: `idle`, `walk`, `run`, `sit_down`, `seated`, `lie_down`, `resting`, `stand_up`, `rise`, and `react`. Each character is below 6,000 triangles. Jar glass is a separate translucent primitive, using painted color rather than real-time refraction.

Authoring output overwrites the generated `.blend`, `.glb`, and texture files; edit the script for reproducible changes, or export intentional manual Blender edits separately. The original PNG companions remain available throughout the application.

The woodland environment is authored directly in `src/garden/Environment.tsx`. Its geometry and seeded planting layout are reproducible without Blender. Large vegetation stays outside the walkable clearing; companion and habitat heights follow the terrain. Wildlife shares the scene's pause and reduced-motion controls.

## Rendering and validation

Three.js and React Three Fiber are isolated in a lazy scene chunk. Models are loaded once per browser module session, skeletons and animation mixers are independent, and vegetation, rocks, flowers, and jar shells are instanced. Pixel ratio is capped at 1.5 and drops to 1 after sustained low frame rates. Paused scenes render on demand. Static tree and scenery shadows use a single cached shadow map; companions have inexpensive ground shadows. There is no physics, post-processing, audio, or external service.

`tests/garden-model.test.ts` covers identity mapping, plot membership, movement reservations/bounds, elapsed-time clamping, and runtime asset structure/animation budgets. `tests/garden-view.test.tsx` covers selection, navigation state, fallback/retry, view preferences, mobile, empty collections, and reduced motion. The original carousel retains its regression suite.

Shared play and garden customization are future additions. General laptop and physical touch-device performance require separate hardware review.

### Verified on September 30, 2026

- All 190 tests, client/server type checks, and the production build passed.
- Edge browser checks covered pause, plot navigation, finder selection, profile links, camera pan/zoom/reset, drag suppression, view persistence, reduced motion, mobile fallback, lost graphics context/retry, and missing-model/retry.
- The production preview verified actual profile navigation and restored selection, plot, and pause state; appearance changes preserved scene state. Screens at 820, 1280, and 1440 pixels had no horizontal overflow, and sidebar resizing retained a usable scene. Opening a plant form suspended animation.
- A full 24-companion plot in the woodland scene measured approximately 100 FPS with 75 draw calls on an Intel i7-12700KF / NVIDIA RTX 4070 SUPER PC. This is a local measurement, not a general laptop performance guarantee.
- Review scripts and screenshots are in the ignored `.tmp-codex-verification-garden/` directory. The preview uses an isolated database there, separate from the user's collection.
