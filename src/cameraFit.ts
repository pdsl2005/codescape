/**
 * Pure projection math for fitting the isometric 3D camera to a scene bounding volume.
 * Extracted from ThreeJsCityRenderer.fitCamera() for testability (no Three.js dependency).
 *
 * Returns the scalar camera distance from the scene centre needed to fit the bounding
 * volume in the frustum at the standard isometric angle (30° elevation, 45° azimuth).
 */
export function computeCameraFit(
  spans: { spanX: number; spanZ: number; maxTop: number },
  camera: { fov: number; aspect: number },
  isoYFactor: number,
  padding = 1.1,
): { dist: number } {
  const diag = Math.max(spans.spanX + spans.spanZ, 8);
  const projV = 0.354 * diag + 0.866 * spans.maxTop;
  const projH = 0.707 * diag;
  const tanHalfFov = Math.tan((camera.fov * Math.PI / 180) / 2);
  const camToTarget = Math.max(
    (projV / 2) / tanHalfFov,
    (projH / 2) / (tanHalfFov * camera.aspect),
  ) * padding;
  const isoLen = Math.sqrt(2 + isoYFactor * isoYFactor);
  return { dist: camToTarget / isoLen };
}
