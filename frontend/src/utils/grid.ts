import type { Node, Edge } from '@xyflow/react';

export const GRID_X = 280;
export const GRID_Y = 90;
export const X0 = 80;
export const Y0 = 80;
export const NODE_W = 200;
export const NODE_H = 64;
export const MIN_GAP_Y = NODE_H + 22; // 86px

// ── Grid helpers ──────────────────────────────────────────────

export function snapToGrid(x: number, y: number): { x: number; y: number; col: number; row: number } {
  const col = Math.round((x - X0) / GRID_X);
  const row = Math.round((y - Y0) / GRID_Y);
  return { x: X0 + col * GRID_X, y: Y0 + row * GRID_Y, col, row };
}

export function getCol(x: number): number {
  return Math.round((x - X0) / GRID_X);
}

export function getRow(y: number): number {
  return Math.round((y - Y0) / GRID_Y);
}

// ── Occupancy ─────────────────────────────────────────────────

/**
 * Check if a grid cell is occupied by any other node.
 * Snaps every node's position before comparing, so non-grid-aligned
 * nodes (e.g. from a loaded example flow) are handled correctly.
 */
function isCellOccupied(
  cx: number,
  cy: number,
  nodes: Node[],
  ignoreId?: string,
): boolean {
  return nodes.some((n) => {
    if (n.id === ignoreId) return false;
    const s = snapToGrid(n.position.x, n.position.y);
    return s.x === cx && s.y === cy;
  });
}

// ── Spiral search ─────────────────────────────────────────────

/**
 * From a target grid cell, spiral outward (right → down → up → etc.)
 * until we find an unoccupied cell. Returns the grid-snapped position.
 */
export function findNearestOpenSlot(
  target: { x: number; y: number },
  nodes: Node[],
  ignoreId?: string,
): { x: number; y: number } {
  const snapped = snapToGrid(target.x, target.y);

  if (!isCellOccupied(snapped.x, snapped.y, nodes, ignoreId)) {
    return snapped;
  }

  const MAX_R = 8;
  for (let r = 1; r <= MAX_R; r++) {
    // Collect all cells at Manhattan-distance r from the origin cell
    const candidates: { dx: number; dy: number }[] = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        candidates.push({ dx, dy });
      }
    }
    // Priority: right first, then closer to target row, then down before up
    candidates.sort((a, b) => {
      if (a.dx !== b.dx) return b.dx - a.dx;           // prefer rightward
      if (a.dy !== b.dy) return Math.abs(a.dy) - Math.abs(b.dy); // prefer same row
      return b.dy - a.dy;                               // prefer down (positive dy)
    });
    for (const { dx, dy } of candidates) {
      const cx = snapped.x + dx * GRID_X;
      const cy = snapped.y + dy * GRID_Y;
      if (cy < Y0) continue;                           // don't go above origin row
      if (!isCellOccupied(cx, cy, nodes, ignoreId)) {
        return { x: cx, y: cy };
      }
    }
  }
  return snapped; // fallback — shouldn't happen with MAX_R=8
}

// ── Smart placement (add_node) ────────────────────────────────

/**
 * Pick the best grid cell for a new node:
 *  1. If a node is selected → place to its right (same row)
 *  2. If nothing selected  → place to the right of the rightmost node
 *  3. If canvas empty      → place at origin
 * Then spiral-search for the nearest open cell.
 */
export function getSmartPlacement(
  nodes: Node[],
  selectedId: string | null,
): { x: number; y: number } {
  if (nodes.length === 0) {
    return findNearestOpenSlot({ x: X0, y: Y0 }, nodes);
  }

  let origin: { x: number; y: number };

  if (selectedId) {
    const sel = nodes.find((n) => n.id === selectedId);
    if (sel) {
      origin = { x: sel.position.x + GRID_X, y: sel.position.y };
    } else {
      // Fallback: rightmost node
      const maxX = Math.max(...nodes.map((n) => n.position.x));
      const rightmost = nodes.filter((n) => n.position.x === maxX);
      const avgY = rightmost.reduce((s, n) => s + n.position.y, 0) / rightmost.length;
      origin = { x: maxX + GRID_X, y: avgY };
    }
  } else {
    const maxX = Math.max(...nodes.map((n) => n.position.x));
    const rightmost = nodes.filter((n) => n.position.x === maxX);
    const avgY = rightmost.reduce((s, n) => s + n.position.y, 0) / rightmost.length;
    origin = { x: maxX + GRID_X, y: avgY };
  }

  return findNearestOpenSlot(origin, nodes);
}

// ── Local wiring (connect_nodes) ─────────────────────────────

/**
 * When wiring A → B, only move B (and its subtree) if B is not already
 * downstream of A. Specifically:
 *  - If B.x > A.x → B is already to the right → do nothing
 *  - If B.x ≤ A.x → push B and its entire downstream subtree to column A.col + 1
 * Preserve B's y-coordinate. Resolve vertical overlaps locally in the
 * affected column(s) with MIN_GAP_Y spacing.
 */
export function localWireAdjust(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  targetId: string,
): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const src = byId.get(sourceId);
  const tgt = byId.get(targetId);
  if (!src || !tgt) return nodes;

  // If target is already to the right of source, leave it alone
  if (tgt.position.x > src.position.x + 10) return nodes;

  const srcCol = getCol(src.position.x);
  const tgtCol = getCol(tgt.position.x);
  const newCol = srcCol + 1;

  // If target is already at or past the target column, nothing to do
  if (newCol <= tgtCol) return nodes;

  const deltaX = (newCol - tgtCol) * GRID_X;

  // Build adjacency list from current edges + the new edge being added
  const outgoing: Record<string, string[]> = {};
  nodes.forEach((n) => (outgoing[n.id] = []));
  edges.forEach((e) => {
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
  });

  // BFS downstream of target (including target itself)
  const toMove = new Set<string>();
  const queue = [targetId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (toMove.has(cur)) continue;
    toMove.add(cur);
    for (const nb of outgoing[cur] || []) {
      if (!toMove.has(nb)) queue.push(nb);
    }
  }

  // Shift everything in the subtree rightward
  const moved = nodes.map((n) => {
    if (!toMove.has(n.id)) return n;
    return { ...n, position: { x: n.position.x + deltaX, y: n.position.y } };
  });

  // Resolve vertical overlaps in each affected column
  const affectedColNums = new Set<number>();
  toMove.forEach((id) => {
    const n = byId.get(id)!;
    affectedColNums.add(getCol(n.position.x + deltaX));
  });
  affectedColNums.add(newCol);

  let result = [...moved];
  for (const col of affectedColNums) {
    const colX = X0 + col * GRID_X;
    const colNodes = result
      .filter((n) => getCol(n.position.x) === col)
      .sort((a, b) => a.position.y - b.position.y);

    let lastY = -Infinity;
    for (const n of colNodes) {
      let y = n.position.y;
      if (y < lastY + MIN_GAP_Y) {
        y = lastY + MIN_GAP_Y;
      }
      if (y !== n.position.y) {
        result = result.map((r) =>
          r.id === n.id ? { ...r, position: { x: colX, y } } : r,
        );
      }
      lastY = y;
    }
  }

  return result;
}

// ── Drag & drop (onNodeDragStop) ─────────────────────────────

/**
 * Snap a dragged node to the grid. If the target cell is occupied,
 * push the occupying node (and everything below it in that column)
 * down by one grid row (90px). Then do a final de-overlap pass.
 */
export function snapAndPushOnDrop(
  draggedId: string,
  droppedPos: { x: number; y: number },
  nodes: Node[],
): Node[] {
  const snapped = snapToGrid(droppedPos.x, droppedPos.y);

  // Find occupant at the snapped cell
  const occupant = nodes.find((n) => {
    if (n.id === draggedId) return false;
    const s = snapToGrid(n.position.x, n.position.y);
    return s.x === snapped.x && s.y === snapped.y;
  });

  // Place dragged node at snapped position
  let next = nodes.map((n) =>
    n.id === draggedId ? { ...n, position: { x: snapped.x, y: snapped.y } } : n,
  );

  // If cell was occupied, push occupant + everything below it down
  if (occupant) {
    const col = getCol(snapped.x);
    const colNodes = next
      .filter((n) => getCol(n.position.x) === col && n.id !== draggedId)
      .sort((a, b) => a.position.y - b.position.y);

    const idx = colNodes.findIndex((n) => n.id === occupant.id);
    if (idx !== -1) {
      const toPush = new Set(colNodes.slice(idx).map((n) => n.id));
      next = next.map((n) => {
        if (!toPush.has(n.id)) return n;
        return { ...n, position: { x: n.position.x, y: n.position.y + GRID_Y } };
      });
    }
  }

  // Final de-overlap pass for the drop column
  const dropCol = getCol(snapped.x);
  const colNodes2 = next
    .filter((n) => getCol(n.position.x) === dropCol)
    .sort((a, b) => a.position.y - b.position.y);

  let lastY = -Infinity;
  let out = [...next];
  for (const n of colNodes2) {
    let y = n.position.y;
    if (y < lastY + MIN_GAP_Y) {
      y = lastY + MIN_GAP_Y;
    }
    if (y !== n.position.y) {
      out = out.map((r) =>
        r.id === n.id ? { ...r, position: { x: r.position.x, y } } : r,
      );
    }
    lastY = y;
  }

  return out;
}
