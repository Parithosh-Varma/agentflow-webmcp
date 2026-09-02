import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

// Custom edge: draws the path normally, then renders the label as an HTML
// element via EdgeLabelRenderer so it sits above the connection path (and is
// fully legible instead of being clipped behind node cards).
export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
}: EdgeProps) {
  // Guard: port geometry may be unmounted/NaN on first frame — fallback to prevent d="M NaN NaN"
  const sx = Number.isFinite(sourceX) ? sourceX : 0;
  const sy = Number.isFinite(sourceY) ? sourceY : 0;
  const tx = Number.isFinite(targetX) ? targetX : sx + 80;
  const ty = Number.isFinite(targetY) ? targetY : sy;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition,
    targetX: tx,
    targetY: ty,
    targetPosition,
  });

  // Fallback path if bezier failed (empty or NaN)
  const safePath = edgePath && !edgePath.includes('NaN') && edgePath.length > 4 ? edgePath : `M ${sx} ${sy} C ${sx + 50} ${sy}, ${tx - 50} ${ty}, ${tx} ${ty}`;

  return (
    <>
      <BaseEdge id={id} path={safePath} style={{ stroke: '#6366f1', strokeWidth: 2, ...style }} markerEnd={markerEnd} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            title={String(label)}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {String(label).length > 22 ? `${String(label).slice(0, 22)}…` : String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
