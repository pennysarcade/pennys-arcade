# Penny's Arcade Game Development Guide

This guide explains how to create games that integrate with Penny's Arcade.

## Directory Structure

Each game lives in its own folder under `client/public/games/`:

```
client/public/games/{game-id}/
├── index.html          # Game entry point (required)
├── js/
│   └── script.js       # Game logic (required)
├── css/
│   └── style.css       # Game styles (required)
├── banner.jpg          # Static thumbnail, 16:9 ratio (required)
└── banner.webm         # Animated preview, 16:9 ratio (optional)
```

The `{game-id}` must be lowercase, alphanumeric with hyphens (e.g., `tessles`, `onzac`, `space-invaders`).

## Registering Your Game

Add your game to `client/src/components/Games/ArcadeGrid.tsx`:

```tsx
export const GAMES: Game[] = [
  // ... existing games
  {
    id: 'your-game-id',
    title: 'Your Game Title',
    description: 'Short tagline for your game',
    status: 'available'  // or 'coming-soon'
  }
]
```

That's it! The game page (`Game.tsx`) automatically picks up games from this array. The game will be playable at `/game/your-game-id` and expects an `index.html` at `/games/your-game-id/index.html`.

## Integration Protocol

Games run in an iframe and communicate with Penny's Arcade via `postMessage`.

### Receiving High Score Data

When your game loads, the parent window sends the current high score:

```js
window.addEventListener('message', (event) => {
  if (event.data?.type === 'HIGH_SCORE_DATA') {
    const highScore = event.data.score || 0;
    const highScoreHolder = event.data.username || '';
    // Update your high score display
  }
});
```

### Sending Game Start

When a new game begins (including restarts), notify the parent:

```js
function notifyGameStart() {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'GAME_START',
      game: 'your-game-id'
    }, '*');
  }
}
```

This starts a new scoring session for authenticated users.

### Sending Game Over

When the game ends, send the final score:

```js
function notifyGameOver(score, stats) {
  if (window.parent !== window && score > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: 'your-game-id',
      score: score,
      stats: stats  // Optional game-specific stats
    }, '*');
  }
}
```

The `stats` object can contain any game-specific data you want to record:

```js
// Example stats objects
{ time: '2:30', maxCombo: 5, waves: 12 }           // Tessles
{ time: '45s', maxCombo: 8, zombiesKilled: 142 }   // ONZAC
```

### Optional: Periodic Score Updates

For longer games, you can send periodic score updates:

```js
function notifyScoreUpdate(score, stats) {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'SCORE_UPDATE',
      game: 'your-game-id',
      score: score,
      stats: stats
    }, '*');
  }
}
```

## Complete Integration Example

```js
// === PENNY'S ARCADE INTEGRATION ===

const GAME_ID = 'your-game-id';
let highScore = 0;
let highScoreHolder = '';

// Receive high score from parent
window.addEventListener('message', (event) => {
  if (event.data?.type === 'HIGH_SCORE_DATA') {
    highScore = event.data.score || 0;
    highScoreHolder = event.data.username || '';
    updateHighScoreDisplay();
  }
});

function updateHighScoreDisplay() {
  const el = document.getElementById('high-score');
  if (el) {
    if (highScore > 0 && highScoreHolder) {
      el.textContent = `HIGH SCORE: ${highScore} (${highScoreHolder})`;
    } else {
      el.textContent = `HIGH SCORE: ${highScore}`;
    }
  }
}

function notifyGameStart() {
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'GAME_START',
      game: GAME_ID
    }, '*');
  }
}

function notifyGameOver(score, stats) {
  if (window.parent !== window && score > 0) {
    window.parent.postMessage({
      type: 'GAME_OVER',
      game: GAME_ID,
      score: Math.floor(score),
      stats: stats
    }, '*');
  }

  // Update local high score display
  if (score > highScore) {
    highScore = score;
    updateHighScoreDisplay();
  }
}

// === YOUR GAME CODE ===

function startGame() {
  notifyGameStart();
  // ... initialize game state
}

function endGame() {
  const finalScore = calculateScore();
  const stats = {
    time: getTimeString(),
    // ... other stats
  };
  notifyGameOver(finalScore, stats);
  // ... show game over screen
}
```

## Scoring Balance Guidelines

To maintain fair leaderboard comparisons across games, aim for approximately **40-50 points per second** of gameplay on average.

### Calculating Your Rate

After playtesting, calculate:
```
points_per_second = total_score / survival_time_seconds
```

### Reference Data

| Game    | Avg Score | Avg Time | Points/Sec |
|---------|-----------|----------|------------|
| Tessles | ~2,170    | ~47s     | ~46 pts/s  |
| ONZAC   | ~2,100    | ~50s     | ~42 pts/s  |

If your game runs significantly higher or lower, adjust point values at source.

## Asset Requirements

### banner.jpg
- **Dimensions:** 640x360 (16:9 ratio) recommended
- **Format:** JPEG
- **Purpose:** Static thumbnail shown in game grid

### banner.webm
- **Dimensions:** 640x360 (16:9 ratio) recommended
- **Format:** WebM (VP9 codec)
- **Duration:** 3-6 seconds, looping
- **Purpose:** Animated preview on hover (optional but recommended)

## Styling Guidelines

Games should match Penny's Arcade's retro aesthetic:

### Recommended Fonts
```css
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');

/* Headings and UI */
font-family: 'Press Start 2P', monospace;

/* Body text */
font-family: 'VT323', monospace;
```

### Color Palette
```css
:root {
  --neon-cyan: #00ffff;
  --neon-magenta: #ff00ff;
  --neon-green: #00ff00;
  --neon-orange: #ff6600;
  --neon-yellow: #ffff00;
  --bg-dark: #0a0a0f;
  --bg-card: #12121a;
  --text-primary: #e0e0e0;
  --text-muted: #888888;
}
```

### Canvas Scaling
For pixel-art games, disable image smoothing:
```js
ctx.imageSmoothingEnabled = false;
```

## Testing Locally

1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:5173/game/your-game-id`
3. Open browser console to verify messages are being sent/received
4. Test as both guest and authenticated user

## Checklist

Before submitting your game:

- [ ] Directory structure follows the template
- [ ] Game registered in `ArcadeGrid.tsx` and `Game.tsx`
- [ ] `HIGH_SCORE_DATA` listener implemented
- [ ] `GAME_START` sent on new game/restart
- [ ] `GAME_OVER` sent with score and stats
- [ ] Scoring balanced to ~40-50 pts/sec
- [ ] `banner.jpg` included (640x360)
- [ ] `banner.webm` included (optional)
- [ ] Tested in iframe context
- [ ] Works for both guests and authenticated users
