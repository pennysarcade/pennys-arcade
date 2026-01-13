// HEXGRID - Hex Math Utilities
// Uses axial coordinate system (q, r)

// Direction vectors for flat-top hexagons
export const HEX_DIRECTIONS = {
    NE: { q: 1, r: -1 },
    E:  { q: 1, r: 0 },
    SE: { q: 0, r: 1 },
    SW: { q: -1, r: 1 },
    W:  { q: -1, r: 0 },
    NW: { q: 0, r: -1 }
};

// Convert axial coordinates to pixel coordinates (flat-top hexagons)
export function hexToPixel(q, r, size, centerX, centerY) {
    const x = size * (3/2 * q);
    const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return {
        x: centerX + x,
        y: centerY + y
    };
}

// Convert pixel coordinates to axial coordinates
export function pixelToHex(x, y, size, centerX, centerY) {
    const px = x - centerX;
    const py = y - centerY;

    const q = (2/3 * px) / size;
    const r = (-1/3 * px + Math.sqrt(3)/3 * py) / size;

    return hexRound(q, r);
}

// Round fractional hex coordinates to nearest hex
export function hexRound(q, r) {
    const s = -q - r;

    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
    } else if (rDiff > sDiff) {
        rr = -rq - rs;
    }

    return { q: rq, r: rr };
}

// Get neighbor in a given direction
export function getNeighbor(hex, direction) {
    const d = HEX_DIRECTIONS[direction];
    if (!d) return hex;
    return { q: hex.q + d.q, r: hex.r + d.r };
}

// Get all six neighbors
export function getNeighbors(hex) {
    return Object.values(HEX_DIRECTIONS).map(d => ({
        q: hex.q + d.q,
        r: hex.r + d.r
    }));
}

// Check if hex is within grid bounds
export function isInBounds(hex, gridSize) {
    const s = -hex.q - hex.r;
    return Math.abs(hex.q) <= gridSize &&
           Math.abs(hex.r) <= gridSize &&
           Math.abs(s) <= gridSize;
}

// Calculate distance between two hexes
export function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Check if two hexes are equal
export function hexEquals(a, b) {
    return a.q === b.q && a.r === b.r;
}

// Convert hex to string key
export function hexToKey(hex) {
    return `${hex.q},${hex.r}`;
}

// Convert string key to hex
export function keyToHex(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

// Get corner points of a hexagon (for drawing)
export function getHexCorners(centerX, centerY, size) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        // Flat-top hexagon: start at 0 degrees (pointing right)
        const angle = (Math.PI / 3) * i;
        corners.push({
            x: centerX + size * Math.cos(angle),
            y: centerY + size * Math.sin(angle)
        });
    }
    return corners;
}

// Get direction from angle (for swipe input)
export function getDirectionFromAngle(angleDegrees) {
    // Normalize angle to 0-360
    let angle = ((angleDegrees % 360) + 360) % 360;

    // Map angle ranges to directions
    // E is at 0, then going counter-clockwise:
    // NE is at 60, N would be 90, NW is at 120, W is at 180, SW is at 240, SE is at 300

    if (angle >= 330 || angle < 30) return 'E';
    if (angle >= 30 && angle < 90) return 'NE';
    if (angle >= 90 && angle < 150) return 'NW';
    if (angle >= 150 && angle < 210) return 'W';
    if (angle >= 210 && angle < 270) return 'SW';
    if (angle >= 270 && angle < 330) return 'SE';

    return 'E'; // Default
}

// Get direction from delta x, y (for swipe)
export function getDirectionFromDelta(dx, dy) {
    const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    return getDirectionFromAngle(angle);
}

// Lerp between two hex positions (for animation)
export function hexLerp(a, b, t) {
    return {
        q: a.q + (b.q - a.q) * t,
        r: a.r + (b.r - a.r) * t
    };
}

// Get all hexes in the grid
export function getAllHexes(gridSize) {
    const hexes = [];
    for (let q = -gridSize; q <= gridSize; q++) {
        for (let r = -gridSize; r <= gridSize; r++) {
            const s = -q - r;
            if (Math.abs(s) <= gridSize) {
                hexes.push({ q, r });
            }
        }
    }
    return hexes;
}

// Get hexes on the edge of the grid
export function getEdgeHexes(gridSize) {
    const edges = [];
    for (let q = -gridSize; q <= gridSize; q++) {
        for (let r = -gridSize; r <= gridSize; r++) {
            const s = -q - r;
            if (Math.abs(q) === gridSize || Math.abs(r) === gridSize || Math.abs(s) === gridSize) {
                if (isInBounds({ q, r }, gridSize)) {
                    edges.push({ q, r });
                }
            }
        }
    }
    return edges;
}
