# Flux Relay

Flux Relay is a small browser arcade game built with vanilla HTML, CSS, and JavaScript. It is ready for GitHub, Vercel, and an optional Firebase Realtime Database leaderboard.

## Run locally

```bash
npm run dev
```

Open `http://localhost:5173`.

## Controls

In 1P mode, move with WASD or arrow keys. In 2P mode, P1 uses WASD and P2 uses arrow keys.

## Build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`.

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. Keep the defaults from `vercel.json`.
4. Add Firebase environment variables in Vercel if you want the online leaderboard.

## Firebase setup

Create a Firebase project, add a Web app, and enable Realtime Database. Add these Vercel environment variables:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_DATABASE_URL=https://game-a122f-default-rtdb.firebaseio.com
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_SCORES_PATH=scores
```

`VITE_FIREBASE_SCORES_PATH` is optional. It defaults to `scores`.

The game still works without Firebase config. In that mode it stores leaderboard entries in the browser with `localStorage`.

Scores are stored under `scores` with `name`, `score`, `difficulty`, `playerMode`, `maxBoostLevel`, `delivered`, and `createdAt`.

## Realtime Database rules

Use `database.rules.json` in the Firebase console Realtime Database rules tab. It allows public reads for `scores`, validates new score entries, supports `chill`, `standard`, `chaos`, and `hell`, and blocks updates, deletes, and every other path. For a serious production leaderboard, add authentication, rate limits, or a server-side verification flow.

## Project structure

```text
src/
  index.html
  styles.css
  game.js
  leaderboard.js
  runtime-config.js
scripts/
  build.mjs
  serve.mjs
database.rules.json
vercel.json
```
