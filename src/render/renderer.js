// WebGL renderer: context creation with capability detection, shader setup,
// depth testing, camera/projection wiring, and per-frame drawing.

import * as mat4 from '../math/mat4.js';
import { MESH_VERTEX_SHADER, MESH_FRAGMENT_SHADER, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER } from './shaders.js';
import { playerShipMesh, enemyShipMesh, projectileMesh, starfieldPoints } from './meshes.js';

// Attempts WebGL2 then WebGL1. Returns null if unavailable (caller shows fallback).
export function createContext(canvas) {
  const attrs = { antialias: true, alpha: false };
  return (
    canvas.getContext('webgl2', attrs) ||
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
  const starBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stars.positions), gl.STATIC_DRAW);
  const starCount = stars.positions.length / 3;

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

  function render(gameState, canvasWidth, canvasHeight) {
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = canvasWidth / Math.max(1, canvasHeight);
    const projection = mat4.perspective(Math.PI / 3, aspect, 0.1, 200);
    const view = mat4.lookAt({ x: 0, y: 2, z: 10 }, { x: 0, y: 0, z: -20 }, { x: 0, y: 1, z: 0 });

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

  return { render };
}
