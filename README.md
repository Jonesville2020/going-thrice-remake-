# Going Thrice

A self-contained, responsive browser remake of the auction-and-collection game described in the supplied rebuild specification. It uses plain JavaScript and has no build step or runtime dependencies.

## Run locally

From this directory, run:

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>. The game also works when served from a static host. Browser storage saves local games on the current origin; saves do not transfer between devices or domains.

Run the rules regression tests with:

```sh
node --test tests/engine.test.cjs
```

## Included

- Local human-versus-CPU and CPU spectator tables for 3–6 seats.
- Classic, Battle (including mandatory card gifting), and Frenzy auctions.
- The 60-card deck, 16 objectives, scoring tiers, carry penalties/exemptions, round resets, and score-target endings.
- Seven CPU behavior labels, a 30-character cosmetic roster, setup controls, local save/resume, sound toggle, responsive layouts, and an installable/offline static shell.

## Not included in this remake

The original ZIP, canonical campaign data, portrait/music assets, and backend source were not available in the workspace. Therefore this is a fresh local-play implementation, not a source migration: the 50-level campaign, online rooms, original portrait artwork/music, and existing save/server migrations are not included. Bot strategies are lightweight heuristics rather than a port of the documented v27 decision algorithm. Review the source and verify asset licensing before any public release.
