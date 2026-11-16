# IRON ARENA — CrazyGames submission kit

## What is in this folder

| Path | What it is | Where it goes |
|---|---|---|
| `game/` | The game build. `index.html` is at the root and every path is relative. | Upload as the game files |
| `iron-arena-crazygames.zip` | The same `game/` folder, zipped (contents at the zip root). | Upload this if the form asks for a zip |
| `videos/iron-arena-preview-landscape-1920x1080.mp4` | Landscape preview video, 16:9 | "Landscape video" |
| `videos/iron-arena-preview-portrait-1080x1620.mp4` | Portrait preview video, 2:3 | "Portrait video" |
| `SUBMISSION.md` | This file. Not part of the upload. | — |

**Not included: the three cover images** (landscape 1920×1080, portrait 800×1200, square 800×800). They are required by CrazyGames and must be added before you submit.

Rebuild everything from the repository with:

```
node tools/build.mjs && node tools/build_crazygames.mjs
```

## The build

- 12 files, about 1.3 MB (486 KB zipped). Initial download is the whole game, far under the 50 MB limit (and the 20 MB mobile-homepage limit).
- Nothing is loaded from a CDN: three.js r160 and the Barlow fonts are bundled. The only external request is the CrazyGames SDK itself.
- Licences for the bundled three.js (MIT) and fonts (SIL OFL 1.1) are in `game/THIRD-PARTY-LICENSES.txt`.
- Works without the SDK too: if the SDK fails to load, the game runs normally with no ads.

### SDK v3 integration

Loaded in `<head>` from `https://sdk.crazygames.com/crazygames-sdk-v3.js`.

| SDK call | When the game makes it |
|---|---|
| `SDK.init()` | On boot, before anything else (5 s timeout, then the game continues without the SDK) |
| `game.loadingStart()` / `game.loadingStop()` | Around fighter generation, until the title screen is ready |
| `game.gameplayStart()` / `game.gameplayStop()` | Start when the player is in control during the tutorial, practice or a round; stop on pause, between rounds, on the knockout / result screens, during replays and ads |
| `game.happytime()` | When the player wins a fight |
| `ad.requestAd('midgame', …)` | Before every fight after the first one (new fight or rematch), never during play. All game audio is muted from `adStarted` until `adFinished` / `adError`. |
| `data.getItem` / `data.setItem` | Progress (record, unlocks, key bindings, settings) is saved through the SDK data module as well as `localStorage` |

No rewarded ads, banners or in-game purchases.

### Platform notes

- **Esc** leaves fullscreen on the portal, so in this build **Backspace** pauses (Esc still works when not fullscreen) and there is an on-screen pause button.
- Arrow keys, Space and the game's keys do not scroll the page; the right-click menu is disabled over the game.
- Mobile: dedicated touch controls in landscape and portrait (portrait gets a control deck under the fight).
- No external links, no other-portal branding, no third-party ads.

## Form text (copy and paste)

**Title:** IRON ARENA

**Category / tags:** Fighting · Sports · 3D · Boxing · MMA · Multiplayer: no

**Short description (≈160 characters):**
Step into the cage. Read your opponent, slip their strikes, chain combinations and land the knockout in an illustrated 3D MMA striking game.

**Description:**
IRON ARENA is a 3D mixed-martial-arts striking game with an illustrated look. Pick one of six fighters, each with their own build, stance, ratings and signature moves, and fight three-round bouts inside the octagon.

Every strike has a cost. Fast jabs keep you safe, heavy hooks and head kicks end fights but leave you open when they miss. Guard high or low, slip straight punches, duck hooks and kicks, and punish mistakes with counters. Manage your stamina: throw too much and you get slow, weak and easy to hit.

Damage builds up on the head, body, arms and legs and changes how fighters move. Big shots cause knockdowns with physics-driven falls, and every knockout can be watched again in a slow-motion replay.

Start with a short hands-on tutorial, then fight the full roster on three difficulty levels, train in practice mode, and unlock two more fighters as you win.

**Controls:**
- Move: WASD or arrow keys
- Strike: four columns (quick punch, power punch, quick kick, power kick) on three rows for high, middle and low
  - High: U I O P · Middle: J K L ; · Low: M , . /
- Guard: hold Space (with W / S for a high or low guard)
- Evade: Shift plus a direction (back to sway, sideways to slip, forward to duck)
- Signature strikes: H and N
- Pause and move list: Backspace or the pause button
- Mouse: left button jab, right button power punch
- Touch: drag on the left to move; tap a strike button for a middle strike, flick up or down for high or low; hold GUARD; tap EVADE with a direction
- Gamepad: supported (standard layout)

## Preview videos

| | Landscape | Portrait |
|---|---|---|
| Resolution | 1920 × 1080 (16:9) | 1080 × 1620 (2:3) |
| Length | 17.6 s | 18.3 s |
| Encoding | H.264 MP4, 30 fps, no audio track | H.264 MP4, 30 fps, no audio track |
| File size | 32.9 MB | 34.2 MB |
| Fight | Mateo Duarte vs Bogdan Koval | Bogdan Koval vs Kai Moana |

Both are real gameplay captured frame by frame from the game itself (no fast-forward), with the HUD hidden: exchanges, blocks and evades, a knockdown, a get-up, and a knockout with the slow-motion fall and knockout camera. There is no text overlay, mouse cursor, logo transition or black bars.

Two things to know:
- CrazyGames asks that the video open on the static cover image. Since the covers are not made yet, the videos open straight on gameplay. Once the covers exist, either upload as is or add the cover as the first frame.
- To fit a knockout into under 20 seconds, damage was raised to 3.2× for the recording. Fights in the actual game last about 1 to 2 minutes.

## Checklist before submitting

- [ ] Make the three cover images (1920×1080, 800×1200, 800×800)
- [ ] Upload `iron-arena-crazygames.zip` (or the `game/` folder)
- [ ] Upload both preview videos
- [ ] Paste title, description and controls; choose orientation "both" (works in landscape and portrait)
- [ ] Open the game in the CrazyGames preview / QA tool and confirm the SDK events show up (`gameplayStart` once you can move, a midgame ad before your second fight)
- [ ] Test on one real phone in the preview
