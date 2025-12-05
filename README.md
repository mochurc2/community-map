# Community Map

An interactive community map where visitors can explore user-submitted pins and optionally add their own. Submissions are anonymous, go into a moderation queue, and only appear on the public map after approval.

The app is built as a lightweight SPA with **React + Vite**, uses **MapLibre GL** with **MapTiler** tiles for the basemap, and stores data in **Supabase** (Postgres + Row-Level Security).

---

## Quick start

1. Create a `.env` file with your credentials:

```bash
VITE_SUPABASE_URL=<your supabase project url>
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_MAPTILER_STYLE_URL=<maptiler style url>
# Optional: protects /moderate with a shared secret
VITE_MODERATION_PASSCODE=<passcode>
```

2. Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

3. Open `http://localhost:5173` to view the map.

If the map fails to load, check that `VITE_MAPTILER_STYLE_URL` is set. If the moderation page prompts for a passcode, it comes from `VITE_MODERATION_PASSCODE`.

---

## Features

- 🗺 **Interactive world map**
  - Pan/zoom basemap using MapLibre GL + MapTiler.
  - Approved pins rendered as circle markers.
  - Inline banner messaging if the map fails to load.

- 📍 **Anonymous pin submission**
  - Users click on the map to choose a location.
  - Sidebar form to describe themselves / their interests and optionally add contact handles.
  - Submissions are stored as `pending` and do not appear on the map until approved.

- ✅ **Moderator review interface**
  - Separate `/moderate` route showing all `pending` pins.
  - Approve / reject buttons to update pin status.
  - Optional passcode gate via `VITE_MODERATION_PASSCODE` to keep the page private.

- 🔐 **Safety by design**
  - Supabase Row-Level Security (RLS):
    - Public users can insert new pins as `pending`.
    - Public users can only read `approved` pins.
    - Moderator-only route is protected with a shared passcode plus Supabase Auth (to be refined).

---

## Project Structure

Rough layout:

```bash
community-map/
├─ public/
├─ src/
│  ├─ App.jsx             # Main map + sidebar + submission form
│  ├─ MapView.jsx         # MapLibre map & pins rendering with map status banners
│  ├─ ModerationPage.jsx  # /moderate route, pending pins list + passcode gate
│  ├─ main.jsx            # React entry, React Router setup
│  ├─ index.css           # Global styles
│  └─ supabaseClient.js   # Supabase JS client
├─ index.html
├─ package.json
├─ vite.config.js
├─ .gitignore
└─ README.md
```
