import * as assert from 'assert';
import { computeCameraFit } from '../cameraFit';

suite('computeCameraFit', () => {
  const ISO_Y_FACTOR = Math.sqrt(2 / 3);
  const cam = { fov: 20, aspect: 1 };

  test('returns positive distance for a non-trivial scene', () => {
    const { dist } = computeCameraFit({ spanX: 5, spanZ: 5, maxTop: 4 }, cam, ISO_Y_FACTOR);
    assert.ok(dist > 0, 'distance must be positive');
  });

  test('distance grows with wider grid', () => {
    const small = computeCameraFit({ spanX: 2, spanZ: 2, maxTop: 1 }, cam, ISO_Y_FACTOR);
    const large = computeCameraFit({ spanX: 20, spanZ: 20, maxTop: 1 }, cam, ISO_Y_FACTOR);
    assert.ok(large.dist > small.dist, 'wider grid needs larger camera distance');
  });

  test('distance grows with taller buildings', () => {
    const low = computeCameraFit({ spanX: 5, spanZ: 5, maxTop: 1 }, cam, ISO_Y_FACTOR);
    const high = computeCameraFit({ spanX: 5, spanZ: 5, maxTop: 20 }, cam, ISO_Y_FACTOR);
    assert.ok(high.dist > low.dist, 'taller buildings need larger camera distance');
  });

  test('minimum diagonal of 8 prevents zero-distance on empty scene', () => {
    const { dist } = computeCameraFit({ spanX: 0, spanZ: 0, maxTop: 0 }, cam, ISO_Y_FACTOR);
    assert.ok(dist > 0, 'empty scene still needs positive camera distance');
  });

  test('wider aspect ratio reduces required distance', () => {
    const square = computeCameraFit({ spanX: 10, spanZ: 10, maxTop: 2 }, { fov: 20, aspect: 1 }, ISO_Y_FACTOR);
    const wide = computeCameraFit({ spanX: 10, spanZ: 10, maxTop: 2 }, { fov: 20, aspect: 2 }, ISO_Y_FACTOR);
    assert.ok(wide.dist <= square.dist, 'wider viewport fits more horizontally, so camera can be closer');
  });
});
