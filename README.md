# Little Rush

A mobile-first 2D micro-game collection with 21 playable challenges, built with plain HTML, CSS and JavaScript. No libraries, external assets, account or network connection are required to play.

## Play

Open `index.html` in a modern browser, or run `npm start` / `node server.cjs` and visit `http://127.0.0.1:4173`.

The separate `little-rush.html` delivery bundles the game into one portable file. Host it on any static HTTPS host to play from a phone. This is a browser prototype rather than a packaged iOS or Android application.

## GitHub Pages

The project is ready to publish directly from the root of `main`; no build command or dependencies are required. `index.html` and all its assets are committed at the repository root, with relative URLs that also work under `/Little-rush/`. The `.nojekyll` file tells Pages to serve the static files directly.

1. Open [Settings → Pages](https://github.com/Adam-Vozzo/Little-rush/settings/pages).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/ (root)**, then **Save**.
4. Wait for GitHub's Pages deployment to finish. The site will be at [adam-vozzo.github.io/Little-rush/](https://adam-vozzo.github.io/Little-rush/).

Future pushes to `main` update the site automatically. See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for the current settings flow.

## Rules and butterfly

- The portrait board has 2 columns and 4 rows of square slots.
- The first game appears immediately. A new game appears every **2.5 seconds** in a random empty slot. When all eight slots are occupied, that spawn is skipped; the next scheduled spawn uses an available slot.
- Every tile has **25 seconds**. The top-right circle drains and turns red in its final 4 seconds. A single expired tile ends the run.
- The **first Break encounter is HATCH**: wait 3 seconds for the caterpillar to become a chrysalis, then tap to release a butterfly. HATCH appears only once per run. Subsequent BREAK games are geodes: tap 8 times to crack the shell and reveal glowing crystals.
- The butterfly flutters over the board for the rest of that run. Hatching unlocks FEED, which is queued for the next regular spawn. Later Feed tiles can appear randomly, with at most one active at a time.
- Drag nectar out of its tile to the butterfly. It stays still while you carry nectar, making it easier to reach. A missed drop can be retried. Keyboard users can select nectar with Enter and then activate the focused butterfly.
- Complete tiles in any order. Wrong inputs can be retried. Pause freezes game time, animations and spawn scheduling; leaving the tab pauses automatically. Restart clears the butterfly and Feed unlock.
- Run time, cleared count and best time are above the board. This version uses its own local best-time record, separate from earlier timing rules. Sound is optional and initially off.

## The 21 games

| Game | Action |
| --- | --- |
| HATCH | Wait for the chrysalis, then tap to release the butterfly. |
| BREAK | Tap a geode 8 times to discover crystals inside. |
| SOLVE | Choose the correct arithmetic answer. A wrong answer locks all choices for 0.75 seconds. |
| ORDER | Tap numbers from 1 to 4. |
| SWITCH | Turn all three switches on. |
| REPEAT | Watch and repeat a three-color sequence. |
| STOP | Stop the moving dot inside the highlighted zone. |
| HOLD | Hold the button continuously for one second. |
| MATCH | Drag all three shapes to their matching outline slots. |
| WIRES | Trace randomly labelled letter/digit endpoints and cut the requested wire. |
| ROLL | Rotate the beetle upright. |
| TYPE | Enter one of 106 nature-themed words using the tile's letter keys. |
| MAZE | Grab and drag the dot through the passages of a generated 5×5 maze. Walls block shortcuts; arrow keys are available when the maze has keyboard focus. |
| SIGN | Trace a newly generated dotted signature in one continuous gesture. |
| MEMORY | Remember a three-digit code, then enter it after it disappears. |
| LEVEL | Grab and slide three knobs to randomized target marks. Tapping the track does not move them. |
| CATCH | Grab and slide the claw above the flower, then drop it. Uses the same drag control as Level. |
| UPLOAD | Tap Upload, wait for the three-second progress bar, then tap Complete. |
| CONNECT | Rotate six pipe segments to connect the two endpoints of a generated puzzle. |
| DICE | Tap the dice in ascending dot-count order. |
| FEED | Drag nectar across the board to the unlocked butterfly. |

The start screen shows inert examples. Select **Let's play** to start a run. The layout keeps all eight square tiles on screen at 320 x 667 and 390 x 844. At 390 x 844, the tiles are approximately 173px per side (previously 146px).

## Extend

- `engine.js`: timer-free run state. Spawn cadence, deadlines, dynamic availability, queued games and restart/pause handling.
- `microgames.js` and `microgames.css`: ten core games, including hatch, geode, wire, switch and shape interactions.
- `extra-games.js` and `extra-games.css`: ten additional games, pure puzzle generators, and the shared thumb-only slider control.
- `butterfly.js` and `butterfly.css`: persistent butterfly and cross-board nectar drag interaction.
- `app.js`: run UI, the one-time hatch and Feed gating, countdowns, sounds and best-time storage.
- `styles.css`: compact responsive portrait board and desktop presentation.

Add a pack with `LittleRushGames.register(catalogEntries, mountFunction)`. Each catalog entry is `{id, title, color}`. The mounter receives `(container, type, options)` and returns `tick(ageMs, deltaMs)` and `destroy()`. Call `options.onComplete()` on success, use the supplied game clock for animation, and remove listeners/pointer captures on destruction. `options.demo` makes previews inert.

`npm run build` generates the optional standalone `dist/little-rush.html`; `dist/` is ignored by Git. To choose another output path, run `node build.cjs path/to/little-rush.html`. GitHub Pages serves the root source files directly, so it does not need this build step. No dependency installation is needed.

## Verification

Run `npm test` / `node --test tests/*.test.cjs`. Tests cover all 21 games, 2.5-second spawns, 25-second deadline boundaries, full-board handling, queue/unlock logic, pointer ownership, cooldowns, upload states, pause/restart/expiry cleanup, and the integrated hatch-to-feed lifecycle. Independent solvers verify generated puzzles across 1,000 seeds. DOM test doubles verify logic; they do not replace browser checks.

Browser checks covered the real hatch-to-butterfly-to-nectar sequence, shape drops, wire cuts, bounded switch knobs, Level/Catch drag completion and ignored track taps, upload progression, generated maze drag completion and blocked wall shortcuts, pipe solutions, geode reveal, math cooldown, 128px game layouts, and both phone sizes. The game also loaded and started with every asset served under a `/Little-rush/` path. No physical iOS/Android device testing has been performed.

For isolated interaction checks, open `/tests/playground.html` from the local server. It exposes the full catalog without run deadlines and lets you inspect 128px and 174px tiles.
