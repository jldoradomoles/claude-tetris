'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#a1887f', // Torre - piedra (reto)
  '#e0e0e0', // 9 - comodín (tinte)
  '#ff7043', // 10 - bomba
  '#fff176', // 11 - rayo
  '#f06292', // 12 - tinte
  '#9575cd', // 13 - gravedad
  '#4fc3f7', // 14 - congelar
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  // [[8,8,8],[8,0,8],[8,8,8]],                  // Torre (3x3 hueca, reto)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const CHALLENGE_TYPE = 8;
const CHALLENGE_CHANCE = 0.05;

// Power-ups: pieza de 1 bloque que aparece cada POWER_EVERY líneas.
// Su índice (10-14) indexa COLORS; el 9 es el bloque comodín del tablero.
const WILD = 9;
const POWER_EVERY = 5;
const FREEZE_MS = 5000;
const CELL_POINTS = 10;
const POWERS = {
  10: { name: 'Bomba', icon: '💣' },
  11: { name: 'Rayo', icon: '⚡' },
  12: { name: 'Tinte', icon: '🎨' },
  13: { name: 'Gravedad', icon: '⬇' },
  14: { name: 'Congelar', icon: '❄' },
};
const POWER_TYPES = Object.keys(POWERS).map(Number);

// Skins: cada una aporta su paleta (mismos índices que COLORS) y su función de dibujo
// de bloque. `grid` sustituye al color de rejilla del tema; `icon`/`wild` son los
// colores de los iconos de power-up y del comodín.
const SKINS = {
  retro: {
    colors: COLORS,
    icon: '#000', wild: '#555',
    draw: drawRetroBlock,
  },
  neon: {
    colors: [
      null, '#00f0ff', '#ffee00', '#d500f9', '#39ff14', '#ff1744', '#2979ff', '#ff9100',
      '#b0bec5', '#ffffff', '#ff6d00', '#ffff00', '#ff4081', '#b388ff', '#40c4ff',
    ],
    icon: '#fff', wild: '#fff',
    grid: '#161628',
    draw: drawNeonBlock,
  },
  pastel: {
    colors: [
      null, '#a8e6ef', '#fff3b0', '#d7b9e8', '#b8e6bf', '#f4b6b6', '#bcd7f5', '#fbd3a4',
      '#cfc3bd', '#f3f3f3', '#ffb59e', '#fff7b8', '#f7bfd4', '#c9bfe8', '#b3e1f7',
    ],
    icon: '#5a5a6a', wild: '#8a8a9a',
    draw: drawPastelBlock,
  },
  pixel: {
    colors: [
      null, '#00bcd4', '#fbc02d', '#9c27b0', '#43a047', '#e53935', '#1e88e5', '#fb8c00',
      '#795548', '#cfd8dc', '#f4511e', '#fdd835', '#d81b60', '#5e35b1', '#039be5',
    ],
    icon: '#000', wild: '#455a64',
    draw: drawPixelBlock,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const statusEl = document.getElementById('power-status');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let gridColor = '#22222e';
let shineColor = 'rgba(255,255,255,0.12)';
let skin = SKINS.retro;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let powerAt, powerPending, freezeLeft, toastLeft, toastText;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  if (powerPending) {
    powerPending = false;
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    return { type, power: true, shape: [[type]], x: Math.floor(COLS / 2), y: 0 };
  }
  const type = PIECES[CHALLENGE_TYPE] && Math.random() < CHALLENGE_CHANCE
    ? CHALLENGE_TYPE
    : Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    const empty = board[r].filter(v => v === 0).length;
    const wild = board[r].filter(v => v === WILD).length;
    if (empty <= wild) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    while (lines >= powerAt) {
      powerAt += POWER_EVERY;
      powerPending = true;
    }
    updateHUD();
  }
}

function compactColumn(c) {
  const col = [];
  for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push(board[r][c]);
  for (let r = ROWS - 1; r >= 0; r--) board[r][c] = col.pop() || 0;
}

function applyPower(type, x, y) {
  let removed = 0;
  const clear = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !board[r][c]) return;
    board[r][c] = 0;
    removed++;
  };
  switch (type) {
    case 10: // Bomba: área 3×3
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) clear(y + dr, x + dc);
      for (let dc = -1; dc <= 1; dc++) if (x + dc >= 0 && x + dc < COLS) compactColumn(x + dc);
      break;
    case 11: // Rayo: fila o columna completa
      if (Math.random() < 0.5) {
        for (let c = 0; c < COLS; c++) clear(y, c);
        // la fila queda vacía: lo de arriba desciende una posición
        board.splice(y, 1);
        board.unshift(new Array(COLS).fill(0));
      } else for (let r = 0; r < ROWS; r++) clear(r, x);
      break;
    case 12: { // Tinte: el color bajo la pieza (o el más común) pasa a comodín
      let target = y + 1 < ROWS ? board[y + 1][x] : 0;
      if (!target || target === WILD) {
        const counts = {};
        board.forEach(row => row.forEach(v => { if (v && v !== WILD) counts[v] = (counts[v] || 0) + 1; }));
        target = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 0;
      }
      if (target)
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === target) { board[r][c] = WILD; removed++; }
      break;
    }
    case 13: // Gravedad: compacta huecos de cada columna
      for (let c = 0; c < COLS; c++) compactColumn(c);
      break;
    case 14: // Congelar
      freezeLeft = FREEZE_MS;
      break;
  }
  if (type === 10 || type === 11) score += removed * CELL_POINTS;
  toastText = POWERS[type].icon + ' ' + POWERS[type].name;
  toastLeft = 2000;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.power) applyPower(current.type, current.x, current.y);
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// Cada función dibuja el cuerpo del bloque en el cuadrado (px, py, sz) con `color`.
function drawRetroBlock(context, px, py, sz, color) {
  context.fillStyle = color;
  context.fillRect(px, py, sz, sz);
  context.fillStyle = shineColor;
  context.fillRect(px, py, sz, 4);
}

function drawNeonBlock(context, px, py, sz, color) {
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.fillStyle = color + '55';
  context.fillRect(px, py, sz, sz);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
  context.shadowBlur = 0;
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastelBlock(context, px, py, sz, color) {
  const r = sz * 0.3;
  roundRectPath(context, px, py, sz, sz, r);
  context.fillStyle = color;
  context.fill();
  roundRectPath(context, px + 3, py + 3, sz - 6, sz * 0.3, r * 0.5);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

function drawPixelBlock(context, px, py, sz, color) {
  const n = 6;
  const u = sz / n;
  context.fillStyle = color;
  context.fillRect(px, py, sz, sz);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let shade = null;
      if (i === n - 1 || j === n - 1) shade = 'rgba(0,0,0,0.38)';     // borde inferior/derecho
      else if (i === 0 || j === 0) shade = 'rgba(255,255,255,0.4)';   // borde superior/izquierdo
      else if ((i + j) % 2) shade = 'rgba(0,0,0,0.12)';                // trama de tablero
      if (!shade) continue;
      context.fillStyle = shade;
      context.fillRect(px + j * u, py + i * u, Math.ceil(u), Math.ceil(u));
    }
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size + 1, y * size + 1, size - 2, skin.colors[colorIndex]);
  const power = POWERS[colorIndex];
  if (power || colorIndex === WILD) {
    context.fillStyle = power ? skin.icon : skin.wild;
    context.font = `${power ? '' : 'bold '}${size * 0.6}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(power ? power.icon : '★', x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(79,195,247,0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function updateStatus() {
  let text = '';
  if (freezeLeft > 0) text = `❄ Congelado ${Math.ceil(freezeLeft / 1000)}s`;
  else if (toastLeft > 0) text = toastText;
  if (statusEl.textContent !== text) statusEl.textContent = text;
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // pinta el estado final; el último frame no se dibuja al salir del loop
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (toastLeft > 0) toastLeft -= dt;
  if (freezeLeft > 0) {
    freezeLeft -= dt;
    dropAccum = 0; // caída pausada mientras dura la congelación
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return; // endGame no puede cancelar el frame en curso
    }
  }
  draw();
  updateStatus();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  powerAt = POWER_EVERY;
  powerPending = false;
  freezeLeft = 0;
  toastLeft = 0;
  toastText = '';
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  refreshColors();
  const light = theme === 'light';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.textContent = light ? '☾ Oscuro' : '☀ Claro';
  try { localStorage.setItem('theme', theme); } catch (e) {}
  repaint();
}

// Lee los colores del tema CSS y aplica los overrides de la skin activa.
function refreshColors() {
  const styles = getComputedStyle(document.documentElement);
  gridColor = skin.grid || styles.getPropertyValue('--grid').trim();
  shineColor = styles.getPropertyValue('--block-shine').trim();
}

// Repintar aunque el juego esté en pausa o game over
function repaint() {
  if (current) { draw(); drawNext(); }
}

function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  refreshColors();
  try { localStorage.setItem('skin', name); } catch (e) {}
  repaint();
}

skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  skinSelect.blur(); // evita que flechas/Espacio cambien la opción mientras se juega
});

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Espacio vuelva a activar el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) {}
setSkin(savedSkin);

init();
