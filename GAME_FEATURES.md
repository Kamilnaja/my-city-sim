# My City Sim: Existing Game Features

My City Sim is a browser-based, grid-based village simulation built with Phaser 4,
TypeScript, and Vite. The game runs entirely in the browser; there is no backend or
account system.

## Starting state

- The map is a 20 x 20 grid.
- Each tile is 64 x 64 pixels.
- A new game starts with 20 wood.
- A 180-tree forest is generated on the map.
- One free woodcutter's hut is placed on an available tile.
- A winding river is generated across the map. Its orientation is randomized as
  vertical, horizontal, or diagonal.
- The river blocks building placement and worker paths unless a bridge is present.

## Controls

- **Left click** a build-menu button to select a building or bridge tool.
- **Left click** a valid map tile to place the selected item.
- The selected placement tool remains active after placement, allowing several items
  to be placed in succession.
- **Left click** a placed building when no placement tool is active to select it.
- **Right click** a building or bridge to demolish it and receive a partial wood refund.
- **Escape** cancels placement mode and deselects the selected building.
- The speed button in the upper-right cycles through `x1`, `x1.5`, `x2`, and `x5`.
  The selected speed is saved in browser local storage and restored on the next load.

The in-game interface is currently localized in Polish. The build menu shows the
Polish names and wood costs for each tool, while the hint area reports placement,
demolition, and upgrade results.

## Resources and economy

The game currently tracks two resources:

- **Wood** starts at 20 and is spent on buildings, bridges, and upgrades.
- **Meat** starts at 0 and is produced by hunters.

Resource counters are displayed in the bottom UI panel and update immediately when
resources change.

Demolishing a building or bridge refunds 30% of its base wood cost, rounded to the
nearest whole number. Placement is rejected when the player cannot afford the
selected item.

## Placeable buildings and tools

| Item | Wood cost | Work radius | Work duration | Primary behavior |
| --- | ---: | ---: | ---: | --- |
| Woodcutter's hut (`Chatka Drwala`) | 10 | 6 tiles | 2 seconds | Chops mature trees for wood |
| Forester's hut (`Chatka Leśnika`) | 5 | 6 tiles | 5.5 seconds | Plants trees in nearby empty spaces |
| Hunter's hut (`Chatka Myśliwego`) | 8 | 9 tiles | 3 seconds | Hunts deer and wolves for meat |
| Bridge (`Most`) | 4 | River tile only | — | Makes one river tile passable |

Buildings require an unoccupied dry tile without a growing or mature tree. A bare
stump does not prevent construction and is removed when the building is placed.
Bridges can only be placed on river tiles that do not already contain a bridge.

Buildings are drawn procedurally by default. Woodcutter and forester huts use
processed image artwork for their upgrade levels; hunter huts remain procedural.

## Workers

Every newly placed hut starts with one worker. Workers use the same finite-state
cycle:

1. Find the nearest valid target for their building role.
2. Walk to the target in a straight line.
3. Work for the role's configured duration.
4. Apply the result.
5. Return home and repeat.

Workers move at 90 pixels per second. They do not cross unbridged river water, and
targets on the other side of the river are ignored. If no target is available, a
worker retries after one second.

### Woodcutters

Woodcutters select the nearest available mature tree within their six-tile work
radius. A successful chop:

- Converts the tree into a stump.
- Adds 1 wood.
- Frees the tree for regrowth after the stump period.

### Foresters

Foresters search outward from their hut and select the closest empty tree slot within
their six-tile work radius. They avoid occupied building tiles, river tiles, and
unbridged routes. Completing the job plants a growing tree.

### Hunters

Hunters search within nine tiles for the closest reachable target among deer and
wolves. Deer are preferred when they are at least as close as a wolf. A successful
hunt removes the animal and adds 3 meat.

## Buildings, workers, and upgrades

- Buildings can be upgraded to level 3.
- Each upgrade costs `(current level + 1) x the building's base cost`.
- Each upgrade adds one worker slot, so a level 0 hut has one worker and a level 3
  hut can house four workers.
- Upgrade level bars are shown above the building and in the selected-building panel.
- The selection panel shows the building name, current level, worker count, and the
  next upgrade cost.
- If a wolf kills a worker, the worker slot remains in the building and a
  replacement appears after 12 seconds.
- Demolishing a building destroys its workers and removes the building.

## Trees and forestry

Trees use a finer 2 x 2 sub-grid inside each building tile, allowing multiple trees
where only one building can be placed.

Tree lifecycle:

1. A planted tree starts as a growing sapling.
2. Growth takes 6 seconds.
3. A mature tree can be chopped by a woodcutter or eaten by wildlife.
4. Chopping or eating changes it into a stump.
5. A stump remains for 15 seconds, then begins growing again.
6. Mature trees can also appear through slower natural regrowth, with a randomized
   interval of 50–90 seconds.

Deer and wolves prefer to spawn on forested tiles, but deer can fall back to any
free dry tile when the forest is sparse. Buildings and river tiles are never used
for animal spawning.

## Wildlife

### Deer

- Deer spawn periodically between 8 and 16 seconds apart.
- The population is capped at 5 deer.
- Deer wander up to 3 tiles from their starting point.
- They sometimes travel to a nearby mature tree and graze for 2.5 seconds.
- Grazing converts the tree into a stump.
- Deer cannot cross unbridged river water.

### Wolves

- Wolves spawn every 20–40 seconds when enough deer are available.
- At least 3 deer are required before wolf spawning can begin.
- The sustainable wolf population is one wolf per two deer, with an absolute cap
  of 3 wolves.
- Wolves wander up to 5 tiles from their starting point.
- On 40% of action selections, a wolf looks for prey.
- Wolves hunt nearby unreserved deer first. If no reachable deer is available, they
  can target a worker.
- An attack takes 1.5 seconds after the wolf reaches its target.
- A killed worker leaves its hut slot empty until the 12-second respawn delay ends.

## River and bridges

The river is rendered as one continuous winding water path. River tiles are blocked
for:

- Building placement.
- Tree planting and natural tree growth.
- Animal spawning.
- Worker, deer, and wolf straight-line movement.

A bridge makes one river tile passable for placement and movement. Bridges can be
demolished for the normal partial refund, except while an active worker's current
route still depends on that bridge. This prevents removing a bridge from underneath
a worker that is already crossing.

## Simulation speed

The speed control changes both delta-driven simulation logic and tree-growth
animations. Available multipliers are:

- `x1` (normal speed)
- `x1.5`
- `x2`
- `x5`

The selected multiplier is stored as a browser preference under the game's local
storage key and is restored when the game starts.

## Visual and interface behavior

- The game fills the browser viewport and resizes with the window.
- A hover highlight indicates whether the selected tool can be placed on a tile.
- The bottom toolbar contains resource counters, contextual hints, and buttons for
  all buildings and the bridge tool.
- Selecting a building opens a top-left information panel.
- The game uses procedural shapes for the grid, river, trees, workers, deer, wolves,
  and most buildings.

## Planned task: Statistics panel

Add a **Statistics** button at the top of the application. When the player clicks
the button, display a statistics panel containing the current:

- [x] Add a Statistics button at the top of the application.
- [x] Show the building count.
- [x] Show the current meat amount.
- [x] Show the human population (all living workers).
- [x] Show the animal population, including deer and wolves.
- [x] Keep the statistics synchronized with the live simulation as buildings,
  workers, deer, and wolves are added or removed.
- [x] Allow the panel to be closed by clicking the button again so the game view
  remains unobstructed.
