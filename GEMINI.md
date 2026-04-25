# GEMINI.md - my-city-sim

## Project Overview
`my-city-sim` is a city simulation prototype built using **Phaser 4**, **TypeScript**, and **Vite**. The project focuses on a grid-based map where users can interact with tiles and manage a simple points-based economy.

### Key Technologies
- **Game Engine:** [Phaser 4](https://phaser.io/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Language:** TypeScript
- **Styling:** Vanilla CSS (referenced in `src/style.css`)

### Architecture
- **`src/main.ts`**: The entry point that initializes the Phaser game instance and handles window resizing.
- **`src/scenes/gameScene.ts`**: The core game logic, including:
  - Grid rendering and mouse hover interaction.
  - UI elements (Point counter, "Add Points" button).
  - Basic state management for points.
- **`src/scenes/gridSettings.ts`**: Configuration constants for `TILE_SIZE`, `GRID_WIDTH`, and `MAP_HEIGHT`.

## Building and Running

### Development
To start the development server with hot-reload:
```bash
npm run dev
```

### Build
To compile the TypeScript code and create a production build in the `dist/` directory:
```bash
npm run build
```

### Preview
To preview the production build locally:
```bash
npm run preview
```

## Development Conventions
- **Language:** All logic should be written in TypeScript.
- **Modularity:** Maintain configuration constants (like grid sizes) in dedicated files (e.g., `gridSettings.ts`).
- **Phaser Scenes:** Use Phaser's built-in `Scene` lifecycle methods (`preload`, `create`, `update`) to manage game state and rendering.
- **UI:** Interactive UI elements are currently built using Phaser GameObjects (Containers, Rectangles, Text) directly in the scene.
- **Localization:** Code comments and logs are currently in Polish.
