# Community Map

An interactive community map where visitors can explore user-submitted pins and optionally add their own.  
Submissions are anonymous, go into a moderation queue, and only appear on the public map after approval.

The app is built as a lightweight SPA with **React + Vite**, uses **MapLibre GL** with **MapTiler** tiles for the basemap, and stores data in **Supabase** (Postgres + Row-Level Security).

---

## Features

- 🗺 **Interactive world map**
  - Pan/zoom basemap using MapLibre GL + MapTiler.
  - Approved pins rendered as circle markers.

- 📍 **Anonymous pin submission**
  - Users click on the map to choose a location.
  - Sidebar form to describe themselves / their interests and optionally add contact handles.
  - Submissions are stored as `pending` and do not appear on the map until approved.

- ✅ **Moderator review interface**
  - Separate `/moderate` route showing all `pending` pins.
  - Approve / reject buttons to update pin status.
  - Approved pins appear on the public map, rejected ones are hidden.

- 🔐 **Safety by design**
  - Supabase Row-Level Security (RLS):
    - Public users can insert new pins as `pending`.
    - Public users can only read `approved` pins.
    - Moderator-only route intended to be restricted by Supabase Auth (to be refined).

---

## Tech Stack

**Frontend**

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [React Router](https://reactrouter.com/) for `/` and `/moderate` routes
- [MapLibre GL JS](https://maplibre.org/projects/maplibre-gl-js/) for map rendering
- Map tiles from [MapTiler Cloud](https://www.maptiler.com/) (via style URL)

**Backend / Data**

- [Supabase](https://supabase.com/) (Postgres)
- Supabase JS client for database access from the browser
- Row-Level Security policies to protect data

**Deployment (planned / recommended)**

- [Cloudflare Pages](https://pages.cloudflare.com/) for static site hosting
- GitHub → Cloudflare Pages for automatic deploys on push

---

## Project Structure

Rough layout:

```bash
community-map/
├─ public/
├─ src/
│  ├─ App.jsx             # Main map + sidebar + submission form
│  ├─ MapView.jsx         # MapLibre map & pins rendering
│  ├─ ModerationPage.jsx  # /moderate route, pending pins list
│  ├─ main.jsx            # React entry, React Router setup
│  ├─ index.css           # Global styles
│  └─ supabaseClient.js   # Supabase JS client
├─ index.html
├─ package.json
├─ vite.config.js
├─ .gitignore
└─ README.md
