import * as Phaser from "phaser";

const CHECKERBOARD_TOLERANCE = 20;

function colorsClose(
  data: Uint8ClampedArray,
  i: number,
  bg: readonly [number, number, number],
): boolean {
  return (
    Math.abs(data[i] - bg[0]) <= CHECKERBOARD_TOLERANCE &&
    Math.abs(data[i + 1] - bg[1]) <= CHECKERBOARD_TOLERANCE &&
    Math.abs(data[i + 2] - bg[2]) <= CHECKERBOARD_TOLERANCE
  );
}

/**
 * Flood-fills the checkerboard background (grown from every border pixel inward) to alpha 0,
 * and returns the bounding box of whatever pixels are left opaque — or null if everything
 * on the canvas turned out to be background.
 */
function stripCheckerboardBackground(
  imageData: ImageData,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { width, height, data } = imageData;

  // The checkerboard alternates between exactly two colors; the top-left corner and the
  // first differently-colored pixel along the top edge give us both.
  const bgColors: Array<[number, number, number]> = [[data[0], data[1], data[2]]];
  for (let x = 1; x < width && bgColors.length < 2; x++) {
    const i = x * 4;
    if (!colorsClose(data, i, bgColors[0])) {
      bgColors.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  const isBackground = (pixelIndex: number) => {
    const i = pixelIndex * 4;
    return bgColors.some((bg) => colorsClose(data, i, bg));
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const trySeed = (x: number, y: number) => {
    const p = y * width + x;
    if (visited[p]) return;
    if (isBackground(p)) {
      visited[p] = 1;
      stack.push(p);
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p / width) | 0;
    data[p * 4 + 3] = 0;

    if (x > 0) trySeed(x - 1, y);
    if (x < width - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < height - 1) trySeed(x, y + 1);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX === -1 ? null : { minX, minY, maxX, maxY };
}

/**
 * Some source art was exported over a visible checkerboard instead of real alpha (a flat
 * JPEG standing in for what should've been a transparent PNG). This flood-fills that
 * checkerboard into a real alpha channel and crops to the remaining opaque silhouette,
 * registering the result as a new texture — so callers can scale/position it like any
 * ordinary cutout sprite instead of working around a fixed, padded canvas.
 */
export function prepareCutoutTexture(scene: Phaser.Scene, sourceKey: string, destKey: string): void {
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = source.width;
  const height = source.height;

  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d")!;
  ctx.drawImage(source, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const bounds = stripCheckerboardBackground(imageData);
  ctx.putImageData(imageData, 0, 0);

  if (!bounds) {
    // Nothing was detected as opaque — fall back to the untouched image rather than a blank texture.
    scene.textures.addCanvas(destKey, scratch);
    return;
  }

  const cropWidth = bounds.maxX - bounds.minX + 1;
  const cropHeight = bounds.maxY - bounds.minY + 1;
  const cropped = document.createElement("canvas");
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  cropped
    .getContext("2d")!
    .drawImage(scratch, bounds.minX, bounds.minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  scene.textures.addCanvas(destKey, cropped);
}
