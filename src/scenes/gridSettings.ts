export const gridSettings = {
  TILE_SIZE: 64,
  GRID_WIDTH: 20,
  GRID_HEIGHT: 20,
  MAP_WIDTH: 20,
  MAP_HEIGHT: 20,
};

// Trees live on a finer sub-grid than buildings: each building tile is divided into
// SUB_TILES_PER_TILE x SUB_TILES_PER_TILE slots, so several trees can fit where one hut would go.
export const SUB_TILES_PER_TILE = 2;
export const SUB_TILE_SIZE = gridSettings.TILE_SIZE / SUB_TILES_PER_TILE;
export const TREE_GRID_WIDTH = gridSettings.GRID_WIDTH * SUB_TILES_PER_TILE;
export const TREE_GRID_HEIGHT = gridSettings.GRID_HEIGHT * SUB_TILES_PER_TILE;

export function tileCenterPx(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: gridX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2,
    y: gridY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2,
  };
}

export function subTileCenterPx(subX: number, subY: number): { x: number; y: number } {
  return {
    x: subX * SUB_TILE_SIZE + SUB_TILE_SIZE / 2,
    y: subY * SUB_TILE_SIZE + SUB_TILE_SIZE / 2,
  };
}
