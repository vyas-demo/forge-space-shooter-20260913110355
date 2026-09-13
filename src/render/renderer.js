// WebGL renderer: context creation with capability detection, shader setup,
// depth testing, camera/projection wiring, and per-frame drawing.

import * as mat4 from '../math/mat4.js';
import { MESH_VERTEX_SHADER, MESH_FRAGMENT_SHADER, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER } from './shaders.js';
import { playerShipMesh, enemyShipMesh, projectileMesh, starfieldPoints } from './meshes.js';

// Shaders in this module are authored in GLSL ES 1.00 (attribute/varying,
// gl_FragColor), so we only request a WebGL1 context. A WebGL2 context
// would reject these shaders (no #version 300 es variants are provided),
// so we do not fall back to 'webgl2' and instead show the explicit
// unavailable-WebGL message when neither 'webgl' nor 'experimental-webgl'
// can be created.
export function createContext(canvas) {
  const attrs = { antialias: true, alpha: false };
  return (
    canvas.getContext('webgl', attrs) ||
    canvas.getContext('experimental-webgl', attrs) ||
    null
  );
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    throw new Error('Program link error: ' + info);
  }
  return program;
}

function createMeshBuffers(gl, mesh) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.normals), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);

  return { positionBuffer, normalBuffer, indexBuffer, count: mesh.indices.length };
}

export function createRenderer(gl, options = {}) {
  const reducedMotion = !!options.reducedMotion;
  const meshProgram = createProgram(gl, MESH_VERTEX_SHADER, MESH_FRAGMENT_SHADER);
  const pointProgram = createProgram(gl, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER);

  const meshAttribs = {
    position: gl.getAttribLocation(meshProgram, 'aPosition'),
    normal: gl.getAttribLocation(meshProgram, 'aNormal'),
  };
  const meshUniforms = {
    model: gl.getUniformLocation(meshProgram, 'uModel'),
    view: gl.getUniformLocation(meshProgram, 'uView'),
    projection: gl.getUniformLocation(meshProgram, 'uProjection'),
    color: gl.getUniformLocation(meshProgram, 'uColor'),
  };
  const pointAttribs = {
    position: gl.getAttribLocation(pointProgram, 'aPosition'),
  };
  const pointUniforms = {
    view: gl.getUniformLocation(pointProgram, 'uView'),
    projection: gl.getUniformLocation(pointProgram, 'uProjection'),
    color: gl.getUniformLocation(pointProgram, 'uColor'),
    pointSize: gl.getUniformLocation(pointProgram, 'uPointSize'),
  };

  const playerMesh = createMeshBuffers(gl, playerShipMesh());
  const enemyMesh = createMeshBuffers(gl, enemyShipMesh());
  const projectileMeshBuf = createMeshBuffers(gl, projectileMesh());

  const stars = starfieldPoints(reducedMotion ? 80 : 200);
  const starPositions = new Float32Array(stars.positions);
  const starBasePositions = new Float32Array(stars.positions);
  const starBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, starPositions, gl.STATIC_DRAW);
  const starCount = stars.positions.length / 3;
  const STAR_SPEED = 6; // units/sec of subtle depth drift toward the camera
  const STAR_NEAR_Z = -3;
  const STAR_FAR_Z = -105;

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.02, 0.02, 0.06, 1);

  function drawMesh(meshBuf, model, view, projection, color) {
    gl.useProgram(meshProgram);
    gl.uniformMatrix4fv(meshUniforms.model, false, model);
    gl.uniformMatrix4fv(meshUniforms.view, false, view);
    gl.uniformMatrix4fv(meshUniforms.projection, false, projection);
    gl.uniform3f(meshUniforms.color, color[0], color[1], color[2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.positionBuffer);
    gl.enableVertexAttribArray(meshAttribs.position);
    gl.vertexAttribPointer(meshAttribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf.normalBuffer);
    gl.enableVertexAttribArray(meshAttribs.normal);
    gl.vertexAttribPointer(meshAttribs.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshBuf.indexBuffer);
    gl.drawElements(gl.TRIANGLES, meshBuf.count, gl.UNSIGNED_SHORT, 0);
  }

  // Advances the starfield's depth positions by a subtle amount to convey
  // forward motion while playing; frozen when not playing (paused/ready/game
  // over) and reset back to the base layout on restart. Reduced-motion
  // disables the drift and keeps a fully static field.
  let lastStarState = null;
  function updateStarfield(dt, isPlaying) {
    if (reducedMotion) return;
    if (!isPlaying) return; // freeze while paused/ready/game-over
    for (let i = 0; i < starCount; i++) {
      const zi = i * 3 + 2;
      let z = starPositions[zi] + STAR_SPEED * dt;
      if (z > STAR_NEAR_Z) {
        z = STAR_FAR_Z; // wrap back to the far plane
      }
      starPositions[zi] = z;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, starPositions);
  }

  function resetStarfield() {
    starPositions.set(starBasePositions);
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, starPositions, gl.STATIC_DRAW);
  }

  function drawStarfield(view, projection) {
    gl.useProgram(pointProgram);
    gl.uniformMatrix4fv(pointUniforms.view, false, view);
    gl.uniformMatrix4fv(pointUniforms.projection, false, projection);
    gl.uniform3f(pointUniforms.color, 0.8, 0.85, 1.0);
    gl.uniform1f(pointUniforms.pointSize, 1.5);

    gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
    gl.enableVertexAttribArray(pointAttribs.position);
    gl.vertexAttribPointer(pointAttribs.position, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, starCount);
  }

// Camera setup: sits on the +z axis looking straight down -z at the
// playfield's z=0 plane (where the player moves), so the horizontal/vertical
// FOV can be derived exactly to fit the bounded playfield.
const CAMERA_EYE = { x: 0, y: 0, z: 14 };
const CAMERA_TARGET = { x: 0, y: 0, z: -20 };
const CAMERA_UP = { x: 0, y: 1, z: 0 };
const CAMERA_DISTANCE = CAMERA_EYE.z; // distance from eye to the player's z=0 plane
const MESH_MARGIN = 1.2; // accounts for ship/enemy mesh radius extending past the bounds
const HALF_X = 8 + MESH_MARGIN; // PLAYFIELD.maxX + margin
const HALF_Y = 5 + MESH_MARGIN; // PLAYFIELD.maxY + margin

// Computes a vertical FOV (radians) such that, at CAMERA_DISTANCE, both the
// horizontal and vertical playfield extents (with margin) project within
// the [-1, 1] normalized device coordinate range, for the given aspect.
function fitVerticalFov(aspect) {
  const fFromY = CAMERA_DISTANCE / HALF_Y;
  const fFromX = (aspect * CAMERA_DISTANCE) / HALF_X;
  const f = Math.min(fFromY, fFromX);
  return 2 * Math.atan(1 / f);
}

  function render(gameState, canvasWidth, canvasHeight, dt = 0) {
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const isPlaying = gameState.state === 'playing';
    updateStarfield(dt, isPlaying);

    const aspect = canvasWidth / Math.max(1, canvasHeight);
    const fovY = fitVerticalFov(aspect);
    const projection = mat4.perspective(fovY, aspect, 0.1, 200);
    const view = mat4.lookAt(CAMERA_EYE, CAMERA_TARGET, CAMERA_UP);

    drawStarfield(view, projection);

    const p = gameState.player;
    const flicker = p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0;
    if (!flicker) {
      const model = mat4.translation(p.x, p.y, p.z);
      drawMesh(playerMesh, model, view, projection, [0.3, 0.8, 1.0]);
    }

    for (const enemy of gameState.enemies) {
      const model = mat4.translation(enemy.x, enemy.y, enemy.z);
      drawMesh(enemyMesh, model, view, projection, [1.0, 0.35, 0.3]);
    }

    for (const proj of gameState.projectiles) {
      const model = mat4.translation(proj.x, proj.y, proj.z);
      drawMesh(projectileMeshBuf, model, view, projection, [1.0, 0.9, 0.3]);
    }
  }

  return { render, resetStarfield };
}
