// HEXGRID - Main Game Script (Square Grid Version with WASD Controls)

import { HexRenderer } from './renderer.js';
import { AudioSystem } from './audio.js';
import { HEX_DIRECTIONS } from './hexmath.js';

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
let serverUrl = null;
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
        console.log('[HEXGRID] Received auth from parent:', {
            hasToken: !!event.data.token,
            serverUrl: event.data.serverUrl,
            user: event.data.user?.username
        });
        authToken = event.data.token;
        serverUrl = event.data.serverUrl;
        currentUser = event.data.user;
        connectToServer();
    }
    if (event.data?.type === 'HIGH_SCORE_DATA') {
        // Could show high score target
    }
});

// Tell parent we're ready - retry until we get auth
function requestAuth() {
    if (authToken) return; // Already got auth
    console.log('[HEXGRID] Requesting auth from parent...');
    window.parent.postMessage({ type: 'HEXGRID_READY', game: 'hexgrid' }, '*');
    setTimeout(requestAuth, 500); // Retry every 500ms
}
requestAuth();

// Wait for Socket.io to be available
function waitForSocketIO(callback, attempts = 0) {
    if (typeof io !== 'undefined') {
        callback();
    } else if (attempts < 50) {
        setTimeout(() => waitForSocketIO(callback, attempts + 1), 100);
    } else {
        console.error('[HEXGRID] Socket.io failed to load');
        showError('Failed to load networking');
    }
}

// Connect to server
function connectToServer() {
    if (!authToken) {
        showError('Authentication required');
        return;
    }

    console.log('[HEXGRID] Connecting to server:', serverUrl);

    // Wait for Socket.io to be available before connecting
    waitForSocketIO(() => {
        console.log('[HEXGRID] Socket.io loaded, creating connection...');

        try {
            socket = io(serverUrl, {
                auth: { token: authToken }
            });
        } catch (err) {
            console.error('[HEXGRID] Failed to create socket:', err);
            showError('Connection failed');
            return;
        }

        socket.on('connect', () => {
            console.log('[HEXGRID] Connected to server');
            localPlayerId = socket.id;

            // Join the hexgrid lobby
            socket.emit('hexgrid:join', { lobbyId: 'main' });
        });

        socket.on('connect_error', (err) => {
            console.error('[HEXGRID] Connection error:', err);
            showError('Connection failed');
        });

        socket.on('disconnect', () => {
            console.log('[HEXGRID] Disconnected');
            showConnecting();
        });

        // Hexgrid events
        socket.on('hexgrid:lobby_update', handleLobbyUpdate);
        socket.on('hexgrid:state_update', handleStateUpdate);
        socket.on('hexgrid:player_eliminated', handlePlayerEliminated);
        socket.on('hexgrid:territory_claimed', handleTerritoryClaimed);
        socket.on('hexgrid:game_over', handleGameOver);
        socket.on('hexgrid:error', handleError);
    });
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
        mobileHint.textContent = 'Swipe to move';
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
    } else if (data.realPlayerCount < 4) {
        lobbyStatusEl.textContent = `${data.realPlayerCount}/4 players - Starting soon...`;
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

    for (const ranking of data.rankings.slice(0, 4)) {
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

// Input handling - WASD keyboard controls
const KEY_TO_DIRECTION = {
    'w': 'N',
    'W': 'N',
    'ArrowUp': 'N',
    's': 'S',
    'S': 'S',
    'ArrowDown': 'S',
    'a': 'W',
    'A': 'W',
    'ArrowLeft': 'W',
    'd': 'E',
    'D': 'E',
    'ArrowRight': 'E'
};

function sendDirection(direction) {
    if (!socket || gameState.status !== 'playing' || isSpectator) return;
    if (!HEX_DIRECTIONS[direction]) return;

    AudioSystem.init();
    socket.emit('hexgrid:move', { direction });
    AudioSystem.playMove();
}

function setupInput() {
    // Keyboard controls - WASD and arrow keys
    document.addEventListener('keydown', (e) => {
        const direction = KEY_TO_DIRECTION[e.key];
        if (direction) {
            e.preventDefault();
            sendDirection(direction);
        }
    });

    // Touch input for mobile - swipe to set direction
    let touchStartX = 0;
    let touchStartY = 0;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        AudioSystem.init();

        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!socket || gameState.status !== 'playing' || isSpectator) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        // Need minimum swipe distance
        const minSwipe = 30;
        if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

        // Determine direction from swipe
        let direction;
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx > 0 ? 'E' : 'W';
        } else {
            direction = dy > 0 ? 'S' : 'N';
        }

        sendDirection(direction);
    }, { passive: false });

    // Prevent scrolling on touch
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
    }, { passive: false });
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
