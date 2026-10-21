/*
  Esercizio 1 — Ricombinazione di una fotografia

  Fotografie:
  - foto.png  (fiori magenta e blu): fotografia propria
  - foto2.png (grattacieli blu e cielo): fotografia propria
  - foto3.png (pomodori, pane e basilico): fotografia propria
  (se una foto non è tua, scrivi qui l'indirizzo della pagina
  della foto e il nome dell'autore, se la licenza lo richiede)

  The photo is cut into a grid of tiles, and the tiles are shuffled.
  Two forces take turns rearranging them:

  - THE MACHINE (at the start): the tiles reorganise themselves.
    Every frame two tiles try to swap places, and the swap is kept only
    if the tiles fit better with their neighbours: edges that continue
    into each other, and similar overall colour (blue near blue,
    magenta near magenta). Slowly the mosaic settles into a new image
    that looks like it continues by itself.
  - THE HUMAN (click): the human invades. A click picks up the block
    of tiles under the pointer (and the machine stops), the next click
    drops it. The tiles that were there slide into the holes.
  - DOUBLE CLICK (fast): the machine takes over again and keeps
    matching edges, starting from whatever the human left behind.
  - RIGHT CLICK: switch to the next photo (1 → 2 → 3 → 1 ...). The tiles keep their
    places, only the picture inside them changes.

  Keys: "s" or Cmd+S saves the current frame as preview.png, "r" reshuffles.
*/

// --- Values to experiment with ---
const COLS = 8;       // tiles across (800 / 8 = 100 px per tile)
const ROWS = 6;       // tiles down   (600 / 6 = 100 px per tile)
const SPEED = 0.12;  // how fast tiles move (0.01 = slow, 1 = instant)
const GRAB = 1;      // block you pick up: 0 = one tile, 1 = 3×3, 2 = 5×5
const DOUBLE_CLICK = 250; // ms: two clicks closer than this count as a double click

// The machine
const EDGE_WEIGHT = 1;   // how much matching edges count (0 = ignore edges)
const COLOUR_WEIGHT = 1; // how much similar overall colour counts (0 = ignore colour)
const SEGMENTS = 5;  // colour samples along each side of a tile (more = pickier matching)
const DEPTH = 3;     // how many pixels into the tile each edge sample looks
const TRIES = 30;    // swaps the machine tries per frame (it keeps at most one)

let photos = []; // all the photos
let photoIndex = 0; // which photo is showing (0, 1, 2)
let img;        // the photo showing right now
let tiles = []; // one object per tile
let grid = [];  // grid[c][r] = the tile sitting in that cell
let tw, th;     // tile width and height
let mode;       // 'machine', 'placed' (human, hands free), 'holding' (human carrying tiles)
let grabC, grabR; // the cell under the pointer when we picked tiles up
let clickTimer = null; // waiting to see if a click becomes a double click

async function setup() {
  setupInfo(); // the "i" button works even while the photos are loading

  let canvas = createCanvas(800, 600);
  canvas.parent('stage'); // put the canvas in the box that also holds the "i" button
  pixelDensity(1); // one canvas pixel = one photo pixel (also keeps preview.png at 800×600)

  // Right click on the canvas: switch photo instead of opening the browser menu
  canvas.elt.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    switchPhoto();
  });

  // p5.js 2: load the photos with await, no preload()
  photos = [
    await loadImage('foto.png'),
    await loadImage('foto2.png'),
    await loadImage('foto3.png')
  ];
  for (let p of photos) {
    p.resize(width, height); // foto2 is 799×600: this stretches it to 800×600
    p.loadPixels();          // we need to read pixel colours for the edges
  }

  tw = width / COLS;
  th = height / ROWS;

  img = photos[photoIndex];
  shuffleTiles();
}

// Show the next photo. The tiles stay where they are, but their colours
// change, so the machine re-reads them (and keeps sorting, if it's running).
function switchPhoto() {
  if (photos.length < 2) return; // still loading
  photoIndex = (photoIndex + 1) % photos.length;
  img = photos[photoIndex];
  for (let t of tiles) readColours(t);
}

// Read a tile's colours from the photo showing right now
function readColours(t) {
  t.edges = readEdges(t);  // the colours along its four sides
  t.colour = averageColour(t.origC * tw, t.origR * th, tw, th); // its overall colour
}

// Cut the photo into tiles and put each one in a random cell
function shuffleTiles() {
  // 1. List every cell of the grid (c = column, r = row)
  let cells = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      cells.push({ c: c, r: r });
    }
  }

  // 2. Shuffle a copy: this gives every tile a new, random cell
  let shuffled = shuffle(cells);

  // 3. Each tile remembers which piece of the photo it shows (orig)
  //    and which cell of the mosaic it sits in (c, r)
  tiles = [];
  for (let i = 0; i < cells.length; i++) {
    let t = {
      origC: cells[i].c,     // its place in the real photo
      origR: cells[i].r,
      c: shuffled[i].c,      // its cell in the mosaic
      r: shuffled[i].r,
      x: shuffled[i].c * tw, // where it is drawn right now (pixels)
      y: shuffled[i].r * th,
      held: false            // true while the human carries it
    };
    readColours(t);
    tiles.push(t);
  }

  mode = 'machine';
}

function draw() {
  // draw() can run before the photo has finished loading
  if (!img) return;

  background(0);

  if (mode === 'machine') {
    machineStep();
  }

  for (let t of tiles) {
    // Where the tile wants to be: its cell in the grid...
    let targetX = t.c * tw;
    let targetY = t.r * th;

    // ...or following the pointer, keeping its place inside the carried block
    if (t.held) {
      targetX = mouseX - tw / 2 + (t.c - grabC) * tw;
      targetY = mouseY - th / 2 + (t.r - grabR) * th;
    }

    // Move a little toward the target each frame, for smooth motion
    t.x = lerp(t.x, targetX, SPEED);
    t.y = lerp(t.y, targetY, SPEED);
  }

  // Carried tiles are drawn last, on top of everything
  let sorted = [...tiles].sort((a, b) => a.held - b.held);

  for (let t of sorted) {
    // image(photo, where to draw: x, y, w, h,  which part of the photo: x, y, w, h)
    image(img, t.x, t.y, tw, th, t.origC * tw, t.origR * th, tw, th);
  }
}

// ---------- THE MACHINE: matching edges by colour ----------

// Read the colours along the four sides of a tile, from the original photo
function readEdges(t) {
  let x = t.origC * tw;
  let y = t.origR * th;
  return {
    top:    sampleStrip(x, y, tw, DEPTH, true),
    bottom: sampleStrip(x, y + th - DEPTH, tw, DEPTH, true),
    left:   sampleStrip(x, y, DEPTH, th, false),
    right:  sampleStrip(x + tw - DEPTH, y, DEPTH, th, false)
  };
}

// Split a thin strip of pixels into SEGMENTS pieces
// and return the average colour of each piece
function sampleStrip(x, y, w, h, horizontal) {
  let colours = [];
  for (let s = 0; s < SEGMENTS; s++) {
    if (horizontal) {
      let segW = w / SEGMENTS;
      colours.push(averageColour(x + s * segW, y, segW, h));
    } else {
      let segH = h / SEGMENTS;
      colours.push(averageColour(x, y + s * segH, w, segH));
    }
  }
  return colours;
}

// Average [r, g, b] of a rectangle of the photo
function averageColour(x, y, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = floor(x); i < floor(x + w); i++) {
    for (let j = floor(y); j < floor(y + h); j++) {
      let k = 4 * (j * img.width + i); // each pixel takes 4 slots: r, g, b, alpha
      r += img.pixels[k];
      g += img.pixels[k + 1];
      b += img.pixels[k + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

// How different two edges are (0 = identical colours)
function edgeDifference(a, b) {
  let total = 0;
  for (let s = 0; s < SEGMENTS; s++) {
    for (let k = 0; k < 3; k++) {
      total += (a[s][k] - b[s][k]) ** 2;
    }
  }
  return total;
}

// How different the overall colours of two tiles are (0 = identical)
function colourDifference(a, b) {
  let total = 0;
  for (let k = 0; k < 3; k++) {
    total += (a.colour[k] - b.colour[k]) ** 2;
  }
  return total * SEGMENTS; // same scale as edgeDifference, so the weights compare fairly
}

// How badly two neighbouring tiles fit together (0 = perfect)
// edgeA and edgeB are the two sides that touch
function fit(a, b, edgeA, edgeB) {
  return EDGE_WEIGHT * edgeDifference(edgeA, edgeB) + COLOUR_WEIGHT * colourDifference(a, b);
}

// How badly the tile in cell (c, r) fits with its 4 neighbours
function mismatch(c, r) {
  let t = grid[c][r];
  let total = 0;
  if (c > 0) {
    let n = grid[c - 1][r]; // neighbour on the left
    total += fit(n, t, n.edges.right, t.edges.left);
  }
  if (c < COLS - 1) {
    let n = grid[c + 1][r]; // neighbour on the right
    total += fit(t, n, t.edges.right, n.edges.left);
  }
  if (r > 0) {
    let n = grid[c][r - 1]; // neighbour above
    total += fit(n, t, n.edges.bottom, t.edges.top);
  }
  if (r < ROWS - 1) {
    let n = grid[c][r + 1]; // neighbour below
    total += fit(t, n, t.edges.bottom, n.edges.top);
  }
  return total;
}

// One step of the machine: try swapping two random tiles,
// keep the swap only if their edges fit better than before
function machineStep() {
  buildGrid();
  for (let i = 0; i < TRIES; i++) {
    let a = random(tiles);
    let b = random(tiles);
    if (a === b) continue;

    let before = mismatch(a.c, a.r) + mismatch(b.c, b.r);
    swapCells(a, b);
    let after = mismatch(a.c, a.r) + mismatch(b.c, b.r);

    if (after < before) return; // better: keep it (one swap per frame, so we see them move)
    swapCells(a, b);            // worse: undo
  }
}

// Fill grid[c][r] from the tiles' current cells
function buildGrid() {
  grid = [];
  for (let c = 0; c < COLS; c++) grid.push([]);
  for (let t of tiles) grid[t.c][t.r] = t;
}

function swapCells(a, b) {
  [a.c, b.c] = [b.c, a.c];
  [a.r, b.r] = [b.r, a.r];
  grid[a.c][a.r] = a;
  grid[b.c][b.r] = b;
}

// ---------- THE HUMAN: clicks ----------

function mousePressed(event) {
  if (!img) return;
  // only the left button (right click and Ctrl+click switch photo instead)
  if (event && (event.button !== 0 || event.ctrlKey)) return;
  // ignore clicks outside the canvas (and on the "i" button or the info box)
  if (event && event.target.tagName !== 'CANVAS') return;
  // while the info box is open, a click on the canvas only closes it
  if (infoIsOpen()) return;
  if (mouseX < 0 || mouseX >= width || mouseY < 0 || mouseY >= height) return;

  if (clickTimer) {
    // A second click arrived quickly: it's a double click
    clearTimeout(clickTimer);
    clickTimer = null;
    backToMachine();
  } else {
    // Wait a moment: if no second click comes, it was a single click.
    // Remember where the pointer was, so the delay doesn't move the action.
    let x = mouseX;
    let y = mouseY;
    clickTimer = setTimeout(() => {
      clickTimer = null;
      singleClick(x, y);
    }, DOUBLE_CLICK);
  }
}

function singleClick(x, y) {
  if (mode === 'holding') drop(x, y);
  else pickUp(x, y); // from 'machine' or 'placed': the human grabs, the machine stops
}

// Double click: the machine takes over again from the mosaic as it is now
function backToMachine() {
  for (let t of tiles) t.held = false; // carried tiles fly back to their cells
  mode = 'machine';
}

// Pick up the block of tiles around the cell under the pointer
function pickUp(x, y) {
  grabC = floor(x / tw);
  grabR = floor(y / th);

  for (let t of tiles) {
    t.held = abs(t.c - grabC) <= GRAB && abs(t.r - grabR) <= GRAB;
  }
  mode = 'holding';
}

// Drop the carried block on the grid cells under the pointer
function drop(x, y) {
  let held = tiles.filter(t => t.held);

  // How many cells the block has travelled, rounded to the grid
  let dc = round((x - (grabC * tw + tw / 2)) / tw);
  let dr = round((y - (grabR * th + th / 2)) / th);

  // Keep the whole block inside the canvas
  let cs = held.map(t => t.c);
  let rs = held.map(t => t.r);
  dc = constrain(dc, -Math.min(...cs), COLS - 1 - Math.max(...cs));
  dr = constrain(dr, -Math.min(...rs), ROWS - 1 - Math.max(...rs));

  let targets = held.map(t => ({ c: t.c + dc, r: t.r + dr }));
  for (let t of held) t.held = false;
  moveTiles(held, targets);

  mode = 'placed';
}

// Move some tiles to new cells. The tiles already sitting on those cells
// get pushed out and slide into the holes left behind (nearest hole first).
function moveTiles(movers, targets) {
  let key = (c, r) => c + ',' + r;
  let targetKeys = new Set(targets.map(p => key(p.c, p.r)));

  // Holes: cells the movers leave and nobody moves into
  let holes = movers
    .map(t => ({ c: t.c, r: t.r }))
    .filter(p => !targetKeys.has(key(p.c, p.r)));

  // Tiles in the way: not moving, but sitting on one of the target cells
  let pushed = tiles.filter(t => !movers.includes(t) && targetKeys.has(key(t.c, t.r)));

  // The movers take their new cells
  movers.forEach((t, i) => {
    t.c = targets[i].c;
    t.r = targets[i].r;
  });

  // Each pushed tile goes to the nearest free hole
  for (let t of pushed) {
    let best = 0;
    for (let i = 1; i < holes.length; i++) {
      if (dist(t.c, t.r, holes[i].c, holes[i].r) < dist(t.c, t.r, holes[best].c, holes[best].r)) {
        best = i;
      }
    }
    t.c = holes[best].c;
    t.r = holes[best].r;
    holes.splice(best, 1); // that hole is now filled
  }
}

// ---------- INFO BOX ("i" button in index.html) ----------

let infoBox; // the small white box with the instructions

function setupInfo() {
  let button = document.getElementById('info-btn');
  let close = document.getElementById('info-close');
  infoBox = document.getElementById('info-box');

  // the "i" opens the box, or closes it if it's already open
  button.addEventListener('click', () => {
    infoBox.hidden = !infoBox.hidden;
  });

  // close with the X
  close.addEventListener('click', () => {
    infoBox.hidden = true;
  });

  // close by clicking anywhere outside the box (and outside the "i")
  document.addEventListener('click', (event) => {
    if (!infoBox.contains(event.target) && event.target !== button) {
      infoBox.hidden = true;
    }
  });

  // close with the Esc key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') infoBox.hidden = true;
  });
}

function infoIsOpen() {
  return infoBox && !infoBox.hidden;
}

function keyPressed(event) {
  // "s" or Cmd+S: save the canvas (goes to your Downloads folder)
  if (key === 's' || key === 'S') {
    if (event && event.metaKey) {
      event.preventDefault(); // stop the browser's own "Save page" window
    }
    saveCanvas('preview', 'png');
  }
  if (key === 'r') {
    shuffleTiles(); // start again with a new random mosaic
  }
}
