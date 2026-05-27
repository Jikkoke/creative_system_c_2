# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # eslint
```

No test suite is configured.

## Environment Variables

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — required for map and routing.
- `NEXT_PUBLIC_GAS_LOG_URL` — optional. POST endpoint for event logging (LAUNCH / GOODS_RECEIVED / SKIP_GOODS / SPOT_SELECT / APPROACH_200M). If unset, logging is skipped silently.
- `NEXT_PUBLIC_GAS_PARKING_URL` — optional. GET endpoint returning `{ status: 'full' | ... }` for the parking-fill indicator. If unset, parking is assumed open.

## Architecture

Single-page app centered on Nago city (名護市), Okinawa. Almost all logic lives in [app/page.tsx](app/page.tsx) — it owns map rendering, GPS, routing, and panel UI.

**Normal mode** — bottom sheet drives the user through four states (the user-facing step indicator collapses the two middle states into one "受取" step, so the bar shows 3 phases):
- `initial` → pick a goods-pickup shop (entries with `goodsPickup: true` in [spots.json](data/spots.json)) or skip to spot tour
- `navigating` → DRIVING route to municipal parking (`lat: 26.5915, lng: 127.9845`); arrival detected at 100m. The selected goods spot is displayed as the "next stop after parking"
- `walking-to-goods` → WALKING route from parking to the selected goods spot; arrival detected at 100m of that spot
- `completed` → spot list / detail / WALKING-route navigation to a freely-selected spot

The "skip to spot tour" path goes `initial → completed` directly without selecting a goods spot.

**Disaster mode (防災モード)** — toggled by a button top-right. Hides the normal panel, shows an emergency banner with live JMA weather alerts, and shows the WALKING route to the nearest evacuation shelter (Haversine-based nearest).

### Key files

| File | Role |
|---|---|
| [app/page.tsx](app/page.tsx) | Root client component. Owns all state, map, GPS watch, routing, and bottom-sheet UI. |
| [hooks/useWeatherAlert.ts](hooks/useWeatherAlert.ts) | Fetches JMA warning JSON for Nago city (area code `4720900`) when disaster mode is on. |
| [data/spots.json](data/spots.json) | 2 parking lots + food/shop spots, validated against Nago lat/lng bounds at load time. Entries with `goodsPickup: true` appear as selectable goods-pickup shops at `initial`. |
| [data/shelters.json](data/shelters.json) | Evacuation shelters in Nago area, validated at load time. |

### Routing model

`app/page.tsx` separates two GPS-derived states:
- `userLocation` — updated on every `watchPosition` tick, drives the on-map "you are here" marker.
- `routeOrigin` — updated only when the user moves ≥ `ROUTE_RECALC_THRESHOLD_M` (100m). Drives the `useEffect` that calls Google Directions API, preventing per-tick API spam.

Per-status routing:
1. **Disaster mode** (requires GPS) → WALKING to nearest shelter.
2. **`navigating`** → DRIVING to parking (shown on map) **plus** WALKING duration (info only).
3. **`walking-to-goods`** → WALKING to `selectedGoodsSpot` (the shop the user chose at `initial`).
4. **`completed` + spot selected** → WALKING to spot (shown on map) **plus** DRIVING duration (info only).

When GPS is not yet available, normal-mode routes fall back to `KYODA_ORIGIN` (道の駅許田) so a time estimate appears immediately, with an explicit "測位中…（推定値）" note in the UI.

Each `useEffect` route-calculation pass guards against race conditions with a `cancelled` flag set in cleanup.

### Path alias

`@/*` resolves to the project root (configured in `tsconfig.json`).

## Tailwind v4

This project uses Tailwind CSS v4 (`@tailwindcss/postcss`). Configuration is done via CSS (`@theme inline` in `globals.css`), not `tailwind.config.js`.
