// Composition: a large circle behind a grid of bars.
// - The circle's size follows the mouse horizontally (mouseX).
// - Each bar rotates to point at the mouse, like a compass needle.
// - Bars get longer the closer they are to the mouse.
// - The bars' color shifts from blue to red as the mouse moves down (mouseY).

const COLS = 6; // number of columns in the grid
const ROWS = 6; // number of rows in the grid
let cell;       // size of one grid cell, computed in setup()

function setup() {
  createCanvas(600, 600);
  rectMode(CENTER); // rect(x, y, w, h) is drawn from its center
  noStroke();
  cell = width / COLS;
}

function draw() {
  background(245, 240, 230); // warm off-white

  // --- 1. Big circle in the middle ---
  // map() converts mouseX (0 → width) into a diameter (150 → 450).
  // The last argument "true" keeps the result inside that range.
  let diameter = map(mouseX, 0, width, 150, 450, true);
  fill(240, 170, 60);
  circle(width / 2, height / 2, diameter);

  // --- 2. Bar color, based on the mouse's vertical position ---
  let top = color(30, 50, 110);    // dark blue
  let bottom = color(200, 50, 40); // red
  let amount = constrain(mouseY / height, 0, 1); // 0 at the top, 1 at the bottom
  fill(lerpColor(top, bottom, amount));

  // --- 3. Grid of bars ---
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      // center of this cell
      let x = i * cell + cell / 2;
      let y = j * cell + cell / 2;

      // angle from the bar to the mouse
      let angle = atan2(mouseY - y, mouseX - x);

      // closer to the mouse = longer bar
      let d = dist(mouseX, mouseY, x, y);
      let len = map(d, 0, width, cell * 0.9, cell * 0.3, true);

      push();            // save the current position/rotation
      translate(x, y);   // move the origin to the cell center
      rotate(angle);     // turn toward the mouse
      rect(0, 0, len, 8);
      pop();             // restore, so the next bar starts fresh
    }
  }
}
