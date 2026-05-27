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

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` must be set (`.env.local`) for the map and routing to work.

## Architecture

Single-page app centered on Nago city (名護市), Okinawa. The page has two modes:

**Normal mode** — bottom sheet UI lets the user pick a detour time and mood tags, then start navigation to the municipal parking lot (`lat: 26.5915, lng: 127.9845`). Three status states drive the bottom sheet: `idle → navigating → completed`.

**Disaster mode (防災モード)** — toggled by a button top-right. Hides the bottom sheet, shows an emergency banner with live JMA weather alerts, and immediately reroutes to the nearest evacuation shelter via walking directions.

### Key files

| File | Role |
|---|---|
| `app/page.tsx` | Root client component; owns all UI state (`status`, `isDisasterMode`, `detourTime`, `activeTag`) |
| `components/MapContainer.tsx` | Wraps `@react-google-maps/api`; recalculates route whenever `isStarted`, `isDisasterMode`, or `userLocation` changes |
| `hooks/useGeolocation.ts` | `navigator.geolocation.watchPosition` wrapper; returns `{ userLocation, isLocating }` |
| `hooks/useWeatherAlert.ts` | Fetches JMA warning JSON for Nago city (area code `4720900`) when disaster mode is on |
| `data/spots.json` | Parking location + 3 shops with scent metadata |
| `data/shelters.json` | 15 evacuation shelters in Nago area |

### Route logic in `MapContainer`

1. **Disaster mode on** → WALKING route to the geographically closest shelter (Euclidean, cosine-corrected for latitude).
2. **Normal mode + `isStarted`** → DRIVING route to the municipal parking lot.
3. **Normal mode + not started** → clears any displayed route.

### Path alias

`@/*` resolves to the project root (configured in `tsconfig.json`).

## Tailwind v4

This project uses Tailwind CSS v4 (`@tailwindcss/postcss`). Configuration is done via CSS (`@theme inline` in `globals.css`), not `tailwind.config.js`.
