// HEXGRID - Main Game Script

import { HexRenderer } from './renderer.js';
import { AudioSystem } from './audio.js';
import { getDirectionFromDelta, HEX_DIRECTIONS } from './hexmath.js';

// Mobile detection
const isMobileMode = new URLSearchParams(window.location.search).get('mobile') === 'true';

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const connectingScreen = document.getElementById('connectingScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameUI = document.getElementById('gameUI');
const spectatorBanner = document.getElementById('spectatorBanner');
const gameOverScreen = document.getElementById('gameOverScreen');
const mobileHint = document.getElementById('mobileHint');

const playerListEl = document.getElementById('playerList');
const lobbyStatusEl = document.getElementById('lobbyStatus');
const countdownEl = document.getElementById('countdown');
const timerEl = document.getElementById('timer');
const scoreDisplayEl = document.getElementById('scoreDisplay');
const playerIndicatorsEl = document.getElementById('playerIndicators');
const powerUpIndicatorEl = document.getElementById('powerUpIndicator');
const resultsTableEl = document.getElementById('resultsTable');
const yourResultEl = document.getElementById('yourResult');

// Game state
let socket = null;
let authToken = null;
let currentUser = null;
let localPlayerId = null;
let isSpectator = false;
let lastCountdown = -1;

let gameState = {
    status: 'waiting',
    players: [],
    powerUps: [],
    timeRemaining: 75000
};

// Renderer
const renderer = new HexRenderer(canvas);

// Handle window resize
window.addEventListener('resize', () => {
    renderer.resize();
});

// Request auth from parent
window.addEventListener('message', (event) => {
    if (event.data?.type === 'HEXGRID_AUTH') {
        authToken = event.data.token;
        currentUser = event.data.user;
        connectToServer();
    }
    if (event.data?.type === 'HIGH_SCORE_DATA') {
        // Could show high score target
    }
});

// Tell parent we're ready
window.parent.postMessage({ type: 'HEXGRID_READY', game: 'hexgrid' }, '*');

// Connect to server
function connectToServer() {
    if (!authToken) {
        showError('Authentication required');
        return;
    }

    // Connect to Socket.io
    socket = io({
        auth: { token: authToken }
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        localPlayerId = socket.id;

        // Join the hexgrid lobby
        socket.emit('hexgrid:join', { lobbyId: 'main' });
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        showError('Connection failed');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected');
        showConnecting();
    });

    // Hexgrid events
    socket.on('hexgrid:lobby_update', handleLobbyUpdate);
    socket.on('hexgrid:state_update', handleStateUpdate);
    socket.on('hexgrid:player_eliminated', handlePlayerEliminated);
    socket.on('hexgrid:territory_claimed', handleTerritoryClaimed);
    socket.on('hexgrid:game_over', handleGameOver);
    socket.on('hexgrid:error', handleError);
}

// Show screens
function showConnecting() {
    connectingScreen.style.display = 'flex';
    lobbyScreen.style.display = 'none';
    gameUI.style.display = 'none';
    gameOverScreen.style.display = 'none';
    spectatorBanner.style.display = 'none';
}

function showLobby() {
    connectingScreen.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    gameUI.style.display = 'none';
    gameOverScreen.style.display = 'none';
}

function showGame() {
    connectingScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameUI.style.display = 'block';
    gameOverScreen.style.display = 'none';

    if (isMobileMode) {
        mobileHint.style.display = 'block';
        setTimeout(() => {
            mobileHint.style.display = 'none';
        }, 3000);
    }
}

function showGameOver() {
    gameOverScreen.style.display = 'flex';
    spectatorBanner.style.display = 'none';
}

function showError(message) {
    document.querySelector('.connecting-text').textContent = message;
}

// Handle lobby update
function handleLobbyUpdate(data) {
    gameState.status = data.status;
    gameState.players = data.players;

    // Check if we're a spectator
    isSpectator = !data.players.some(p => p.id === localPlayerId);

    if (data.status === 'waiting' || data.status === 'countdown') {
        showLobby();
        updateLobbyUI(data);

        if (data.status === 'countdown' && data.countdown !== undefined) {
            const seconds = Math.ceil(data.countdown / 1000);
            if (seconds !== lastCountdown && seconds > 0) {
                lastCountdown = seconds;
                countdownEl.textContent = seconds;
                countdownEl.style.display = 'block';
                lobbyStatusEl.style.display = 'none';
                AudioSystem.init();
                AudioSystem.playCountdown(seconds);
            } else if (seconds <= 0) {
                AudioSystem.playCountdown(0);
            }
        } else {
            countdownEl.style.display = 'none';
            lobbyStatusEl.style.display = 'block';
            lastCountdown = -1;
        }
    } else if (data.status === 'playing') {
        showGame();
        spectatorBanner.style.display = isSpectator ? 'block' : 'none';
    }
}

// Update lobby UI
function updateLobbyUI(data) {
    playerListEl.innerHTML = '';

    // Sort players: real players first, then AI
    const sortedPlayers = [...data.players].sort((a, b) => {
        if (a.isAI && !b.isAI) return 1;
        if (!a.isAI && b.isAI) return -1;
        return 0;
    });

    for (const player of sortedPlayers) {
        const slot = document.createElement('div');
        slot.className = `player-slot filled ${player.isAI ? 'ai' : ''}`;

        const avatar = document.createElement('div');
        avatar.className = 'player-avatar';
        avatar.style.backgroundColor = player.avatarColor;
        avatar.style.borderColor = player.avatarColor;

        if (player.avatarImage) {
            const img = document.createElement('img');
            img.src = player.avatarImage;
            img.alt = player.username;
            avatar.appendChild(img);
        } else if (player.isAI) {
            avatar.textContent = '🤖';
        }

        const name = document.createElement('div');
        name.className = 'player-name';
        name.textContent = player.username;

        slot.appendChild(avatar);
        slot.appendChild(name);
        playerListEl.appendChild(slot);
    }

    // Update status text
    if (data.realPlayerCount === 0) {
        lobbyStatusEl.textContent = 'Waiting for players...';
    } else if (data.realPlayerCount < 8) {
        lobbyStatusEl.textContent = `${data.realPlayerCount}/8 players - Starting soon...`;
    } else {
        lobbyStatusEl.textContent = 'Lobby full!';
    }
}

// Handle game state update
function handleStateUpdate(data) {
    gameState.status = data.status;
    gameState.players = data.players;
    gameState.powerUps = data.powerUps;
    gameState.timeRemaining = data.timeRemaining;

    if (data.status === 'playing') {
        showGame();
        updateGameUI();
    }
}

// Update game UI
function updateGameUI() {
    // Timer
    const seconds = Math.ceil(gameState.timeRemaining / 1000);
    timerEl.textContent = `${seconds}s`;

    if (seconds <= 10) {
        timerEl.style.color = '#ff4444';
    } else {
        timerEl.style.color = '#00ffff';
    }

    // Score
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (localPlayer) {
        scoreDisplayEl.textContent = Math.floor(localPlayer.score);
    }

    // Player indicators
    updatePlayerIndicators();

    // Power-up indicator for local player
    if (localPlayer) {
        if (localPlayer.hasMultiplier) {
            powerUpIndicatorEl.textContent = '2X MULTIPLIER ACTIVE';
            powerUpIndicatorEl.classList.add('active');
        } else if (localPlayer.hasSpeedBoost) {
            powerUpIndicatorEl.textContent = 'SPEED BOOST ACTIVE';
            powerUpIndicatorEl.classList.add('active');
        } else {
            powerUpIndicatorEl.classList.remove('active');
        }
    }
}

// Update player indicators (right side scoreboard)
function updatePlayerIndicators() {
    playerIndicatorsEl.innerHTML = '';

    // Sort by score descending
    const sorted = [...gameState.players].sort((a, b) => b.score - a.score);

    for (const player of sorted) {
        const indicator = document.createElement('div');
        indicator.className = `player-indicator ${player.isAlive ? '' : 'eliminated'}`;

        const color = document.createElement('div');
        color.className = 'indicator-color';
        color.style.backgroundColor = player.avatarColor;

        const name = document.createElement('span');
        name.textContent = player.username.substring(0, 6);

        const score = document.createElement('span');
        score.className = 'indicator-score';
        score.textContent = Math.floor(player.score);

        indicator.appendChild(color);
        indicator.appendChild(name);
        indicator.appendChild(score);
        playerIndicatorsEl.appendChild(indicator);
    }
}

// Handle player eliminated
function handlePlayerEliminated(data) {
    const isLocalPlayer = data.playerId === localPlayerId;

    AudioSystem.playElimination(isLocalPlayer);
    renderer.shake(isLocalPlayer ? 20 : 8);

    // Add particles at player's last position
    const player = gameState.players.find(p => p.id === data.playerId);
    if (player) {
        renderer.addParticles(player.position, player.avatarColor, isLocalPlayer ? 30 : 15);
    }

    if (isLocalPlayer) {
        spectatorBanner.style.display = 'block';
        isSpectator = true;
    }
}

// Handle territory claimed
function handleTerritoryClaimed(data) {
    if (data.playerId === localPlayerId) {
        AudioSystem.playClaim(data.tiles.length);
    }

    // Could add particles for claimed tiles
}

// Handle game over
function handleGameOver(data) {
    showGameOver();

    const localRanking = data.rankings.find(r => r.playerId === localPlayerId);
    const won = localRanking && localRanking.rank === 1;

    AudioSystem.playRoundOver(won);

    // Build results table
    resultsTableEl.innerHTML = '';

    for (const ranking of data.rankings.slice(0, 8)) {
        const row = document.createElement('div');
        row.className = `result-row ${ranking.rank === 1 ? 'winner' : ''}`;

        const rankEl = document.createElement('span');
        rankEl.className = `result-rank ${ranking.rank === 1 ? 'gold' : ranking.rank === 2 ? 'silver' : ranking.rank === 3 ? 'bronze' : ''}`;
        rankEl.textContent = `#${ranking.rank}`;

        const avatar = document.createElement('div');
        avatar.className = 'result-avatar';
        avatar.style.backgroundColor = ranking.odanAvatarColor;

        const name = document.createElement('span');
        name.className = 'result-name';
        name.textContent = ranking.username + (ranking.isAI ? ' (AI)' : '');

        const score = document.createElement('span');
        score.className = 'result-score';
        score.textContent = ranking.score;

        row.appendChild(rankEl);
        row.appendChild(avatar);
        row.appendChild(name);
        row.appendChild(score);
        resultsTableEl.appendChild(row);
    }

    // Your result
    if (localRanking) {
        yourResultEl.textContent = `You placed #${localRanking.rank} with ${localRanking.score} points!`;

        // Send score to parent
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'GAME_OVER',
                game: 'hexgrid',
                score: localRanking.score,
                stats: {
                    rank: localRanking.rank,
                    territoryClaimed: localRanking.territoryClaimed,
                    eliminations: localRanking.eliminations,
                    roundDuration: Math.floor(data.roundDuration / 1000)
                }
            }, '*');
        }
    }

    // Reset spectator state for next round
    isSpectator = false;
}

// Handle error
function handleError(data) {
    console.error('Hexgrid error:', data.message);
    showError(data.message);
}

// Input handling
function setupInput() {
    // Keyboard input
    document.addEventListener('keydown', (e) => {
        if (!socket || gameState.status !== 'playing' || isSpectator) return;

        let direction = null;

        // Arrow keys and WASD
        // For hex grid, we map keys to 6 directions
        switch (e.key) {
            case 'ArrowRight':
            case 'd':
            case 'D':
                direction = 'E';
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                direction = 'W';
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                // Up could be NE or NW, let's use NE
                direction = 'NE';
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                // Down could be SE or SW, let's use SW
                direction = 'SW';
                break;
            case 'q':
            case 'Q':
                direction = 'NW';
                break;
            case 'e':
            case 'E':
                direction = 'NE';
                break;
            case 'z':
            case 'Z':
                direction = 'SW';
                break;
            case 'c':
            case 'C':
                direction = 'SE';
                break;
        }

        if (direction && HEX_DIRECTIONS[direction]) {
            e.preventDefault();
            socket.emit('hexgrid:move', { direction });
            AudioSystem.init();
            AudioSystem.playMove();
        }
    });

    // Touch input for mobile
    if (isMobileMode) {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            AudioSystem.init();

            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchStartTime = Date.now();
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();

            if (!socket || gameState.status !== 'playing' || isSpectator) return;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const duration = Date.now() - touchStartTime;

            // Require minimum swipe distance and speed
            if (distance > 30 && duration < 500) {
                const direction = getDirectionFromDelta(dx, dy);
                socket.emit('hexgrid:move', { direction });
                AudioSystem.playMove();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });
    }
}

// Game loop
function gameLoop() {
    if (gameState.status === 'playing') {
        renderer.render(gameState, localPlayerId);
    } else {
        renderer.renderWaiting();
    }

    requestAnimationFrame(gameLoop);
}

// Initialize
function init() {
    setupInput();
    gameLoop();

    // Show connecting screen initially
    showConnecting();

    // If no auth after 2 seconds, show error
    setTimeout(() => {
        if (!authToken) {
            showError('Waiting for authentication...');
        }
    }, 2000);
}

init();
