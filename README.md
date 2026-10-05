# Little Rush

A mobile-first 2D micro-game collection with 23 playable challenges, built with plain HTML, CSS and JavaScript. Version 0.7.0 adds endless Zen mode, playable practice tiles in Tweaks, and smooth claw acceleration with a stronger momentum swing. No libraries, external assets, account or network connection are required to play.

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
- The board starts empty; after a 650ms breath, a random eligible game appears. On Normal, a new game appears every **2.5 seconds** in a random empty slot. When all eight slots are occupied, that spawn is skipped; the next scheduled spawn uses an available slot.
- On Normal, every tile has **25 seconds**. Its filled top-right circle empties as time runs out and turns red in the final 4 seconds. A single expired tile ends the run.
- **WAIT & HATCH** can appear randomly during the run: wait 3 seconds for the caterpillar to become a chrysalis, then tap to release a butterfly. It appears only once per run. **CRACK IT** games are geodes: tap a randomized 5–11 times to crack the shell and reveal glowing crystals.
- The butterfly flutters over the board for the rest of that run. Hatching unlocks **FEED BUTTERFLY** when that game is enabled, queuing it for the next regular spawn. Later Feed tiles can appear randomly, with at most one active at a time.
- Drag nectar out of its tile to the butterfly. It keeps flying while you carry nectar. A missed drop can be retried. Keyboard users can select nectar with Enter and then activate the focused butterfly.
- Complete tiles in any order. Wrong inputs can be retried. Pause freezes game time, animations and spawn scheduling; leaving the tab pauses automatically. Restart clears the butterfly and Feed unlock.
- During play, a compact bar shows elapsed time, cleared count and pause. Each tile's title states its objective. Controls fill the remaining tile space, with no visible instruction footer. Essential puzzle content, such as a wire's target endpoints, stays visible; detailed state updates remain available to screen readers. Sound is optional and initially off.

## Difficulty and points

The main menu defaults to **Normal** (2.5-second spawns, 25-second expiry). **Calm** uses 3-second spawns and 30-second expiry; **Extreme** uses 1.5-second spawns and 15-second expiry. The selection is saved locally and applied at the next run.

**Zen** starts with all eight slots filled and immediately replaces a completed game after its finishing animation. Tiles never expire. The HUD shows only the number completed and a Zen label: no points or run timer. Timing-based points preferences are retained for timed modes. Zen does not change timed-run records. Games keep their own interaction timing, such as Simon playback and the aim trainer. Hatch and Feed can repeat in Zen so even a small enabled game pool keeps the board full.

In **Tweaks → Gameplay**, enable **Time-based points** to replace the top-left cleared count with a cumulative points score. **Faster clears** awards the rounded percentage of tile lifetime remaining (1–100 points); **Closer to expiry** awards the rounded percentage elapsed (1–100). Expired tiles earn nothing. Both use active game time, so pausing cannot alter the reward. Completed tiles display their award briefly, while the engine continues tracking cleared count independently. Existing title-screen cleared records remain completion records.

Successful tiles retain their completed pose before leaving: 720ms for pipes, the beetle and Match, 880ms for the geode, and 480ms for other games. These tiles have already scored, cannot expire or score twice, and reserve their slot until the exit finishes. Their completion timing freezes when paused.

## Records and Tweaks

The title screen shows **All-time best** and **Today's best**. Each keeps the longest survival time and the highest cleared count independently, so those two records can come from different runs. Records are saved locally in this browser. Daily records follow the device's local calendar date.

Open **Tweaks** beside the title. Its **Micro-games** tab shows a two-column gallery with a playable tile and toggle for every game; its **Styles** tab controls the appearance. The **Gameplay** tab configures time-based points. The game selection is saved in this browser and applies to the next run. All games are enabled initially.

Practice directly in any tile, including games disabled for runs. A completed tile briefly retains its final state, then resets to a fresh puzzle. Practice has no tile expiry and never changes run progress or records. Offscreen and hidden-page previews pause; closing or switching tabs cleans up their controls. Feed has its own practice butterfly, independent of the run.

- Turning off **WAIT & HATCH** also turns off **FEED BUTTERFLY**. Feed can only be enabled while Hatch is enabled.
- At least one repeatable challenge must be enabled to start. **WAIT & HATCH** alone is not a valid timed-run pool; Zen allows it to repeat.
- The first challenge is randomly chosen from the enabled, currently available games; Hatch has no special priority.

In **Styles**, choose **Flat** or **Holofoil**. Style changes apply immediately, are saved in this browser and are restored when the game is reopened.

- **Flat** is the default minimal pastel appearance.
- **Holofoil** uses a dark backdrop, matte pearl tiles with a reflective foil bevel and engraved corner detail and a brief perspective landing when a tile appears. A WebGL fragment shader produces the moving foil highlights and responds to the pointer, with a subtle touch-position tilt; category colors and readable game controls remain distinct.
- With the system's reduced-motion preference enabled, foil highlights remain still and the landing animation is removed. Foil animation also pauses while a dialog is open or the page is hidden.
- If WebGL is unavailable or its context is lost, Holofoil keeps a static CSS foil finish. Game controls continue to work.

Tile colors identify five consistent categories:

| Color | Category | Games |
| --- | --- | --- |
| Butter | Numbers | Solve, Tap in Order, Tap Low to High |
| Lavender | Memory | Repeat, Remember, Type the Word |
| Blue | Spatial | Turn On, Match Shapes, Cut the Wire, Drag to Exit, Slide to Marks, Join Pipes |
| Sage | Dexterity | Turn Upright, Stop in the Green, Hold, Sign Here, Catch It, Match, Tap Targets |
| Peach | Nature | Wait & Hatch, Crack It, Upload, Feed Butterfly |

## The 23 games

| Game | Action |
| --- | --- |
| WAIT & HATCH | Wait for the chrysalis, then tap to release the butterfly. |
| CRACK IT | Tap a geode 5–11 times to discover crystals inside. |
| SOLVE | Choose the correct arithmetic answer. A wrong answer locks all choices for 0.75 seconds. |
| TAP IN ORDER | Tap numbers from 1 to 4. |
| TURN ON | Turn all six switches on. They are arranged in two columns of three, and 1–4 start on at random. |
| REPEAT | Press Start in the center of the circle, then watch and repeat a three-color sequence. |
| STOP IN THE GREEN | Tap the inset lower button while the moving dot is inside the green zone. A miss locks the button for 750ms while the dot keeps moving. |
| HOLD | Hold the button continuously for one second. |
| MATCH SHAPES | Drag all three shapes to their matching outline slots. |
| CUT THE WIRE | Trace randomly labelled letter/digit endpoints and cut the requested wire. |
| TURN UPRIGHT | Rotate the beetle upright. |
| TYPE THE WORD | Enter one of 106 nature-themed words using the tile's letter keys. |
| DRAG TO EXIT | Draw a smooth path through a generated 5×5 maze. The dot follows continuously, sliding along walls without crossing them; arrow keys remain available. |
| SIGN HERE | Draw any sufficiently long signature inside the box, then lift your finger. |
| REMEMBER | Remember a five-character code containing letters and digits. Press Start to hide it and reveal the keys. A mistake reveals it again for a deliberate retry. |
| SLIDE TO MARKS | Grab and slide three large knobs into the wider target marks. No visible target numbers; tapping the track does not move them. |
| CATCH IT | Move the claw with the bottom left/right arrows or drag it, then press the center Drop button. Hold an arrow for continuous movement from the first frame, tap for a tiny nudge, then release for a stronger, naturally settling momentum swing. The rod extends over 700ms, pauses to grab, and retracts before completion. |
| UPLOAD | Tap Upload, wait for the three-second progress bar, then tap Complete. |
| JOIN PIPES | Rotate six pipe segments to connect the two endpoints of a generated puzzle. |
| TAP LOW TO HIGH | Tap the dice in ascending dot-count order. |
| MATCH | Tap anywhere in the tile when both the scrolling color and shape match the reference. A miss has a 750ms cooldown while scrolling continues. |
| TAP TARGETS | Press Start. Six circles spawn at 500ms intervals over three seconds, each fading and scaling in for 500ms. Tap each within its next 500ms or the tile resets for another attempt. |
| FEED BUTTERFLY | Drag nectar across the board to the unlocked butterfly. |

Select **Let's play** on the title screen to start a run. The play screen gives most of the portrait viewport to its eight square tiles. The compact header, six-pixel tile padding and larger controls accommodate both touch and mouse input; keyboard alternatives are also available for the supported interactions.

## Extend

- `engine.js`: timer-free run state. Spawn cadence, deadlines, dynamic availability, queued games and restart/pause handling.
- `microgames.js` and `microgames.css`: ten core games, including hatch, geode, wire, switch and shape interactions.
- `extra-games.js` and `extra-games.css`: twelve additional games, pure puzzle generators, and the shared thumb-only slider control.
- `butterfly.js` and `butterfly.css`: persistent butterfly and cross-board nectar drag interaction.
- `previews.js`: isolated practice clocks, completion resets, visibility pausing, and the practice butterfly.
- `app.js`: title and play screens, the one-time hatch and Feed gating, Tweaks selections, countdowns, sounds and local daily/all-time records.
- `styles.css`: compact responsive portrait board, title screen and dialogs.
- `theme.js` and `theme.css`: Flat/Holofoil appearance, shared WebGL foil rendering, tile landing animation, reduced-motion support and the CSS fallback.

Add a pack with `LittleRushGames.register(catalogEntries, mountFunction)`. Each catalog entry is `{id, title, color}`. The mounter receives `(container, type, options)` and returns `tick(ageMs, deltaMs)` and `destroy()`. Call `options.onComplete()` on success, use the supplied game clock for animation, and remove listeners/pointer captures on destruction. `options.demo` makes previews inert.

`npm run build` generates the optional standalone `dist/little-rush.html`; `dist/` is ignored by Git. To choose another output path, run `node build.cjs path/to/little-rush.html`. GitHub Pages serves the root source files directly, so it does not need this build step. No dependency installation is needed.

## Verification

Run `npm test` / `node --test tests/*.test.cjs`. Tests cover all 22 games, 2.5-second spawns, 25-second deadline boundaries, full-board handling, queue/unlock logic, pointer ownership, cooldowns, upload states, pause/restart/expiry cleanup, and the integrated hatch-to-feed lifecycle. Independent solvers verify generated puzzles across 1,000 seeds. DOM test doubles verify logic; browser checks verify rendered layout and real pointer behavior.

The browser QA checklist includes the hatch-to-butterfly-to-nectar sequence, shape drops, wire cuts, bounded switch knobs, slider and claw drags, ignored track taps, upload progression, generated maze routes and blocked wall shortcuts, pipe solutions, geode reveal, math cooldown, compact tile layouts, portrait phone sizes, records, and persistent Tweaks selections. Check both Styles choices, saved theme restoration, Holofoil's reduced-motion behavior and its WebGL fallback. Also check loading and starting with every asset served under a `/Little-rush/` path. No physical iOS/Android device testing has been performed.

For isolated interaction checks, open `/tests/playground.html` from the local server. It exposes the full catalog without run deadlines and lets you inspect 128px, 174px and 211px tiles.
