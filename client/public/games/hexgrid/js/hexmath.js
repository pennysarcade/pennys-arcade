// HEXGRID - Grid Math Utilities (Square Grid Version)
// Uses (x, y) coordinate system

// Direction vectors for square grid
export const HEX_DIRECTIONS = {
    N: { x: 0, y: -1 },
    E: { x: 1, y: 0 },
    S: { x: 0, y: 1 },
    W: { x: -1, y: 0 }
};

// Convert grid coordinates to pixel coordinates
export function hexToPixel(x, y, cellSize, offsetX, offsetY) {
    return {
        x: offsetX + x * cellSize + cellSize / 2,
        y: offsetY + y * cellSize + cellSize / 2
    };
}

// Convert pixel coordinates to grid coordinates
export function pixelToHex(px, py, cellSize, offsetX, offsetY) {
    const x = Math.floor((px - offsetX) / cellSize);
    const y = Math.floor((py - offsetY) / cellSize);
    return { x, y };
}

// Get neighbor in a given direction
export function getNeighbor(coord, direction) {
    const d = HEX_DIRECTIONS[direction];
    if (!d) return coord;
    return { x: coord.x + d.x, y: coord.y + d.y };
}

// Get all four neighbors
export function getNeighbors(coord) {
    return Object.values(HEX_DIRECTIONS).map(d => ({
        x: coord.x + d.x,
        y: coord.y + d.y
    }));
}

// Check if coordinate is within grid bounds
export function isInBounds(coord, gridSize) {
    return coord.x >= 0 && coord.x < gridSize && coord.y >= 0 && coord.y < gridSize;
}

// Calculate Manhattan distance between two coordinates
export function hexDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Check if two coordinates are equal
export function hexEquals(a, b) {
    return a.x === b.x && a.y === b.y;
}

// Convert coordinate to string key
export function hexToKey(coord) {
    return `${coord.x},${coord.y}`;
}

// Convert string key to coordinate
export function keyToHex(key) {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
}

// Get corner points of a square cell (for drawing)
export function getHexCorners(centerX, centerY, size) {
    const half = size / 2;
    return [
        { x: centerX - half, y: centerY - half },
        { x: centerX + half, y: centerY - half },
        { x: centerX + half, y: centerY + half },
        { x: centerX - half, y: centerY + half }
    ];
}

// Get direction from delta x, y (for input)
export function getDirectionFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 'E' : 'W';
    } else {
        return dy > 0 ? 'S' : 'N';
    }
}

// Linear interpolation between two grid positions
export function hexLerp(a, b, t) {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
    };
}

// Get all coordinates in the grid
export function getAllHexes(gridSize) {
    const coords = [];
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            coords.push({ x, y });
        }
    }
    return coords;
}

// Get coordinates on the edge of the grid
export function getEdgeHexes(gridSize) {
    const edges = [];
    for (let x = 0; x < gridSize; x++) {
        edges.push({ x, y: 0 });
        edges.push({ x, y: gridSize - 1 });
    }
    for (let y = 1; y < gridSize - 1; y++) {
        edges.push({ x: 0, y });
        edges.push({ x: gridSize - 1, y });
    }
    return edges;
}
