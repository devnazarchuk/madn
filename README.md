# MÄDN – Multiplayer Turn‑Based Dice Game

**Live Demo:** https://madng.vercel.app/

---

## 📖 Project Overview

MÄDN is a **multiplayer, turn‑based dice game** built with **Next.js 14**, **React**, and **TypeScript**. Players take turns rolling dice, moving pawns on a 3‑D board, and competing to achieve game objectives. The game runs entirely in the browser with real‑time synchronization via a lightweight API.

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| **Framework** | **Next.js 14** (App Router) |
| **Language** | **TypeScript** (ES2022) |
| **Styling** | **Tailwind CSS**, **shadcn/ui** components |
| **3‑D Rendering** | **Three.js** via **react‑three‑fiber** |
| **State Management** | **Zustand** (global store) |
| **Audio** | Web Audio API wrappers |
| **Testing** | **Vitest** + **React Testing Library** |
| **CI / CD** | GitHub Actions (build, lint, test, deploy) |
| **Deployment** | **Vercel** / **Netlify** (static export) |
| **Package Manager** | **pnpm** |
| **Database (optional)** | **Prisma** (SQLite for local dev) |

---

## 🎮 Game Logic

- **Turn flow:**
  1. Player rolls a set of dice (configured in `src/engine/dice.ts`).
  2. The roll determines possible moves based on the **board track configuration** (`src/engine/boardTrackConfig.ts`).
  3. The player selects a pawn; the engine validates the move with the **rules engine** (`src/engine/rules/*`).
  4. After a successful move, the board state updates via the **Zustand store** (`src/store/gameStore.ts`).
  5. The turn passes to the next player.

- **Core modules**:
  - `src/engine/` – game engine, dice, board logic, AI helpers (`ai.ts`).
  - `src/components/game/` – visual components: board, pawns, dice UI, camera rig.
  - `src/components/hud/` – HUD, dialogs, settings, rules screens.
  - `src/store/` – global state, player settings (`settingsStore.ts`).
  - `src/services/` – API wrappers (`matchesApi.ts`) for matchmaking.

---

## 📸 Screenshots

![Game Board](/home/arch/.gemini/antigravity/brain/dc34f38a-5e6f-4a24-8227-bd103091abdd/.user_uploaded/media_1794955215541_18b73300.jpg)

![HUD & Dialogs](/home/arch/.gemini/antigravity/brain/dc34f38a-5e6f-4a24-8227-bd103091abdd/.user_uploaded/media_1794955286853_e578f62d.jpg)

![Settings Panel](/home/arch/.gemini/antigravity/brain/dc34f38a-5e6f-4a24-8227-bd103091abdd/.user_uploaded/media_1794955496516_17fef9a0.jpg)

![Game Over Screen](/home/arch/.gemini/antigravity/brain/dc34f38a-5e6f-4a24-8227-bd103091abdd/.user_uploaded/media_1794955522128_a969252a.jpg)

> **Note:** The screenshots have been lightly color‑corrected for better visibility.

---

## 🚀 Getting Started (Local Development)

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/devnazarchuk/madn.git
cd MÄDN

# Install dependencies (using pnpm)
pnpm install

# Run the development server
pnpm dev
```

The app will be available at `http://localhost:3000`.

### Building for Production

```bash
pnpm build   # Generates an optimized static export
pnpm start   # Serves the built app locally
```

---

## 📦 Deployment

The project is configured for **static export** (`next export`). Deploy the contents of the `out/` directory to any static‑hosting provider (Vercel, Netlify, GitHub Pages, etc.).

```bash
pnpm export   # Creates the `out/` folder
# Then push `out/` to your hosting service
```

---

## 🧪 Testing

Run the test suite with:

```bash
pnpm test
```

Tests are located in the `tests/` folder and cover engine logic, board tracking, and UI components.

---

## 📄 License

This project is licensed under the **MIT License** – see the `LICENSE` file for details.

---

*Feel free to open issues or submit pull requests for improvements!*