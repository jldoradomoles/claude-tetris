# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla + HTML5 Canvas. Sin dependencias, sin `package.json`, sin build, sin linter ni tests. El README (en español) documenta el juego en detalle.

## Ejecutar

Abrir `index.html` directamente en el navegador, o servir la carpeta con cualquier servidor estático (`python -m http.server 8000`, `npx serve .`).

## Arquitectura

Tres archivos: `index.html` (DOM + canvas), `style.css` (tema oscuro), `game.js` (toda la lógica, script clásico con `'use strict'`, sin módulos).

- El estado es global en `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`…). `init()` lo reinicia por completo y también sirve como handler del botón Reiniciar.
- `board` es una matriz `ROWS × COLS` con `0` (vacío) o un índice 1–8 (8 = torre 3×3 hueca, que sale con `CHALLENGE_CHANCE`) que indexa a la vez `COLORS` y `PIECES`. Los valores dentro de cada matriz de `PIECES` son su propio índice de color.
- Flujo de una pieza: `loop` (rAF, acumula `dropAccum` contra `dropInterval`) / teclas → `lockPiece()` → `merge()` + `clearLines()` + `spawn()`. `spawn()` llama a `endGame()` si la nueva pieza colisiona.
- `clearLines()` es quien actualiza puntuación, nivel y `dropInterval` (`max(100, 1000 - (level-1)*90)`); hard drop suma 2 pts/celda y soft drop 1 pt/fila.
- Pausa y game over cancelan el rAF (`cancelAnimationFrame(animId)`); reanudar reinicia `lastTime` y vuelve a llamar a `loop`.
- Rotación: `rotateCW` + wall kicks simples en `tryRotate` (desplazamientos horizontales `[0,-1,1,-2,2]`, no SRS).

- Récords: `#start-screen` (tabla + Jugar) se muestra al cargar; `init()` ya no se llama al cargar sino desde Jugar y Reiniciar. Se persisten en `localStorage['tetris-records']` (`{scores:[{name,score,lines,level,date}], bestCombo, maxLines}`, top 5, siempre en `try/catch`). `endGame()` llama a `showGameOverRecords()`. `combo`/`comboMax` los gestiona `clearLines()`. El `keydown` global ignora eventos de un `<input>` y mientras `started` sea false.

## Ojo al cambiar tamaños

`COLS`, `ROWS` y `BLOCK` en `game.js` deben coincidir con `width`/`height` de `<canvas id="board">` en `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). El canvas de vista previa (`#next-canvas`, 120×120) asume una rejilla de 4×4 con bloques de 30 px (`drawNext`).
