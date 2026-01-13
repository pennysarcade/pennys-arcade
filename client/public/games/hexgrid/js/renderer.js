// HEXGRID - Canvas Renderer

import { hexToPixel, getHexCorners, hexToKey } from './hexmath.js';

export class HexRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = 7;
        this.hexSize = 30;
        this.centerX = 0;
        this.centerY = 0;

        // Animation state
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.particles = [];

        // Interpolation state for smooth movement
        this.playerPositions = new Map(); // playerId -> { prev: {q,r}, current: {q,r}, lastUpdate: timestamp }
        this.interpolationDuration = 400; // ms to interpolate between positions

        // Pre-calculate grid hexes
        this.gridHexes = [];

        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;

        // Calculate hex size to fit grid
        const maxRadius = Math.min(this.canvas.width, this.canvas.height) * 0.42;
        this.hexSize = maxRadius / (this.gridSize * 1.75);

        // Pre-calculate grid hexes
        this.gridHexes = [];
        for (let q = -this.gridSize; q <= this.gridSize; q++) {
            for (let r = -this.gridSize; r <= this.gridSize; r++) {
                const s = -q - r;
                if (Math.abs(s) <= this.gridSize) {
                    this.gridHexes.push({ q, r });
                }
            }
        }
    }

    setGridSize(size) {
        this.gridSize = size;
        this.resize();
    }

    // Update player position for interpolation
    updatePlayerPosition(playerId, newPosition) {
        const existing = this.playerPositions.get(playerId);
        const now = Date.now();

        if (existing) {
            // Only update if position actually changed
            if (existing.current.q !== newPosition.q || existing.current.r !== newPosition.r) {
                existing.prev = { ...existing.current };
                existing.current = { ...newPosition };
                existing.lastUpdate = now;
            }
        } else {
            // First time seeing this player
            this.playerPositions.set(playerId, {
                prev: { ...newPosition },
                current: { ...newPosition },
                lastUpdate: now
            });
        }
    }

    // Get interpolated position for a player
    getInterpolatedPosition(playerId, fallbackPosition) {
        const posData = this.playerPositions.get(playerId);
        if (!posData) return fallbackPosition;

        const now = Date.now();
        const elapsed = now - posData.lastUpdate;
        const t = Math.min(1, elapsed / this.interpolationDuration);

        // Smooth easing function
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        // Convert hex positions to pixel positions and interpolate
        const prevPixel = hexToPixel(posData.prev.q, posData.prev.r, this.hexSize, this.centerX, this.centerY);
        const currPixel = hexToPixel(posData.current.q, posData.current.r, this.hexSize, this.centerX, this.centerY);

        return {
            x: prevPixel.x + (currPixel.x - prevPixel.x) * easeT,
            y: prevPixel.y + (currPixel.y - prevPixel.y) * easeT
        };
    }

    // Clean up old player positions
    cleanupOldPositions(activePlayerIds) {
        const activeSet = new Set(activePlayerIds);
        for (const [id] of this.playerPositions) {
            if (!activeSet.has(id)) {
                this.playerPositions.delete(id);
            }
        }
    }

    // Trigger screen shake
    shake(intensity) {
        this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
    }

    // Update screen shake
    updateShake() {
        if (this.screenShake.intensity > 0) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity * 2;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity * 2;
            this.screenShake.intensity *= 0.9;
            if (this.screenShake.intensity < 0.5) {
                this.screenShake.intensity = 0;
                this.screenShake.x = 0;
                this.screenShake.y = 0;
            }
        }
    }

    // Add particles for effects
    addParticles(hex, color, count = 10) {
        const pos = hexToPixel(hex.q, hex.r, this.hexSize, this.centerX, this.centerY);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            this.particles.push({
                x: pos.x,
                y: pos.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color: color,
                size: 2 + Math.random() * 3
            });
        }
    }

    // Update and draw particles
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            p.vx *= 0.98;
            p.vy *= 0.98;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    drawParticles() {
        for (const p of this.particles) {
            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    // Draw a single hexagon
    drawHex(q, r, fillColor = null, strokeColor = null, lineWidth = 1) {
        const pos = hexToPixel(q, r, this.hexSize, this.centerX, this.centerY);
        const corners = getHexCorners(pos.x, pos.y, this.hexSize * 0.95);

        this.ctx.beginPath();
        this.ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            this.ctx.lineTo(corners[i].x, corners[i].y);
        }
        this.ctx.closePath();

        if (fillColor) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }

        if (strokeColor) {
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = lineWidth;
            this.ctx.stroke();
        }
    }

    // Draw the hex grid background
    drawGrid() {
        for (const hex of this.gridHexes) {
            this.drawHex(hex.q, hex.r, null, 'rgba(0, 255, 255, 0.1)', 1);
        }
    }

    // Draw territory for a player
    drawTerritory(territoryKeys, color) {
        const fillColor = color + '40'; // 25% opacity
        for (const key of territoryKeys) {
            const [q, r] = key.split(',').map(Number);
            this.drawHex(q, r, fillColor, color + '80', 1);
        }
    }

    // Draw trail for a player
    drawTrail(trail, color) {
        if (trail.length < 1) return;

        // Draw trail hexes
        const trailColor = color + '60';
        for (const hex of trail) {
            this.drawHex(hex.q, hex.r, trailColor, color, 2);
        }

        // Draw connecting line
        if (trail.length >= 2) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([8, 4]);

            const first = hexToPixel(trail[0].q, trail[0].r, this.hexSize, this.centerX, this.centerY);
            this.ctx.moveTo(first.x, first.y);

            for (let i = 1; i < trail.length; i++) {
                const pos = hexToPixel(trail[i].q, trail[i].r, this.hexSize, this.centerX, this.centerY);
                this.ctx.lineTo(pos.x, pos.y);
            }

            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    // Draw a player
    drawPlayer(player, isLocalPlayer = false) {
        // Use interpolated position for smooth movement
        const pos = this.getInterpolatedPosition(player.id, player.position);
        const radius = this.hexSize * 0.4;

        // Glow effect for local player
        if (isLocalPlayer) {
            this.ctx.save();
            this.ctx.shadowColor = player.avatarColor;
            this.ctx.shadowBlur = 15;
        }

        // Draw avatar circle with border
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

        if (player.avatarImage) {
            // Draw image (would need to pre-load)
            this.ctx.fillStyle = player.avatarColor;
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = player.avatarColor;
            this.ctx.fill();
        }

        // Border
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (isLocalPlayer) {
            this.ctx.restore();
        }

        // Draw direction indicator
        if (player.direction && player.isAlive) {
            this.drawDirectionArrow(pos.x, pos.y, radius, player.direction, player.avatarColor);
        }

        // Draw freeze effect
        if (player.isFrozen) {
            this.ctx.save();
            this.ctx.strokeStyle = '#88ccff';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.restore();
        }

        // Draw speed boost effect
        if (player.hasSpeedBoost) {
            this.ctx.save();
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                this.ctx.globalAlpha = 0.3 - i * 0.1;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, radius + 8 + i * 4, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }

        // Draw multiplier effect
        if (player.hasMultiplier) {
            this.ctx.save();
            this.ctx.font = 'bold 12px "Press Start 2P"';
            this.ctx.fillStyle = '#ffd700';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('2X', pos.x, pos.y - radius - 8);
            this.ctx.restore();
        }

        // Draw player name below
        this.ctx.save();
        this.ctx.font = '8px "Press Start 2P"';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.username.substring(0, 8), pos.x, pos.y + radius + 14);
        this.ctx.restore();
    }

    // Draw direction arrow
    drawDirectionArrow(x, y, radius, direction, color) {
        const dirVectors = {
            NE: { x: 0.5, y: -0.866 },
            E:  { x: 1, y: 0 },
            SE: { x: 0.5, y: 0.866 },
            SW: { x: -0.5, y: 0.866 },
            W:  { x: -1, y: 0 },
            NW: { x: -0.5, y: -0.866 }
        };

        const dir = dirVectors[direction];
        if (!dir) return;

        const arrowDist = radius + 8;
        const arrowX = x + dir.x * arrowDist;
        const arrowY = y + dir.y * arrowDist;

        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.beginPath();

        // Arrow pointing in direction
        const angle = Math.atan2(dir.y, dir.x);
        const arrowSize = 6;

        this.ctx.translate(arrowX, arrowY);
        this.ctx.rotate(angle);

        this.ctx.moveTo(arrowSize, 0);
        this.ctx.lineTo(-arrowSize / 2, -arrowSize / 2);
        this.ctx.lineTo(-arrowSize / 2, arrowSize / 2);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
    }

    // Draw power-up
    drawPowerUp(powerUp) {
        const pos = hexToPixel(powerUp.position.q, powerUp.position.r, this.hexSize, this.centerX, this.centerY);
        const size = this.hexSize * 0.35;
        const time = Date.now() / 1000;
        const bob = Math.sin(time * 3) * 3;

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y + bob);

        switch (powerUp.type) {
            case 'gem':
                this.drawGem(size, '#00ff00');
                break;
            case 'crown':
                this.drawCrown(size);
                break;
            case 'multiplier':
                this.drawMultiplier(size);
                break;
            case 'speed':
                this.drawLightning(size);
                break;
            case 'freeze':
                this.drawSnowflake(size);
                break;
        }

        this.ctx.restore();
    }

    drawGem(size, color) {
        this.ctx.fillStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(0, -size);
        this.ctx.lineTo(size * 0.7, 0);
        this.ctx.lineTo(0, size);
        this.ctx.lineTo(-size * 0.7, 0);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }

    drawCrown(size) {
        this.ctx.fillStyle = '#ffd700';
        this.ctx.shadowColor = '#ffd700';
        this.ctx.shadowBlur = 15;

        this.ctx.beginPath();
        this.ctx.moveTo(-size, size * 0.5);
        this.ctx.lineTo(-size, -size * 0.3);
        this.ctx.lineTo(-size * 0.5, 0);
        this.ctx.lineTo(0, -size);
        this.ctx.lineTo(size * 0.5, 0);
        this.ctx.lineTo(size, -size * 0.3);
        this.ctx.lineTo(size, size * 0.5);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }

    drawMultiplier(size) {
        this.ctx.fillStyle = '#ff00ff';
        this.ctx.shadowColor = '#ff00ff';
        this.ctx.shadowBlur = 10;
        this.ctx.font = `bold ${size * 1.5}px "Press Start 2P"`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('2X', 0, 0);
        this.ctx.shadowBlur = 0;
    }

    drawLightning(size) {
        this.ctx.fillStyle = '#ffff00';
        this.ctx.shadowColor = '#ffff00';
        this.ctx.shadowBlur = 10;

        this.ctx.beginPath();
        this.ctx.moveTo(size * 0.3, -size);
        this.ctx.lineTo(-size * 0.3, 0);
        this.ctx.lineTo(size * 0.2, 0);
        this.ctx.lineTo(-size * 0.3, size);
        this.ctx.lineTo(size * 0.3, 0);
        this.ctx.lineTo(-size * 0.2, 0);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }

    drawSnowflake(size) {
        this.ctx.strokeStyle = '#88ccff';
        this.ctx.lineWidth = 2;
        this.ctx.shadowColor = '#88ccff';
        this.ctx.shadowBlur = 10;

        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            this.ctx.save();
            this.ctx.rotate(angle);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(0, -size);
            this.ctx.moveTo(0, -size * 0.5);
            this.ctx.lineTo(-size * 0.3, -size * 0.7);
            this.ctx.moveTo(0, -size * 0.5);
            this.ctx.lineTo(size * 0.3, -size * 0.7);
            this.ctx.stroke();
            this.ctx.restore();
        }
        this.ctx.shadowBlur = 0;
    }

    // Main render function
    render(gameState, localPlayerId) {
        this.updateShake();
        this.updateParticles();

        // Update interpolation state for all players
        const activeIds = [];
        for (const player of gameState.players) {
            activeIds.push(player.id);
            this.updatePlayerPosition(player.id, player.position);
        }
        this.cleanupOldPositions(activeIds);

        this.ctx.save();
        this.ctx.translate(this.screenShake.x, this.screenShake.y);

        // Clear canvas
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        // Draw background gradient
        const gradient = this.ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, this.canvas.width * 0.6
        );
        gradient.addColorStop(0, 'rgba(0, 50, 80, 0.3)');
        gradient.addColorStop(1, 'rgba(10, 10, 26, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw all territories
        for (const player of gameState.players) {
            this.drawTerritory(player.territory, player.avatarColor);
        }

        // Draw all trails
        for (const player of gameState.players) {
            if (player.isAlive) {
                this.drawTrail(player.trail, player.avatarColor);
            }
        }

        // Draw power-ups
        for (const powerUp of gameState.powerUps) {
            this.drawPowerUp(powerUp);
        }

        // Draw all players (local player last for top layer)
        for (const player of gameState.players) {
            if (player.isAlive && player.id !== localPlayerId) {
                this.drawPlayer(player, false);
            }
        }

        // Draw local player on top
        const localPlayer = gameState.players.find(p => p.id === localPlayerId);
        if (localPlayer && localPlayer.isAlive) {
            this.drawPlayer(localPlayer, true);
        }

        // Draw particles on top
        this.drawParticles();

        this.ctx.restore();
    }

    // Render waiting/lobby state
    renderWaiting() {
        this.ctx.fillStyle = '#0a0a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw subtle grid in background
        this.ctx.globalAlpha = 0.3;
        this.drawGrid();
        this.ctx.globalAlpha = 1;
    }
}
