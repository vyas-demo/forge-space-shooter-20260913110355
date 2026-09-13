// Original GLSL shader source for lit low-poly meshes, projectiles, and starfield.
// All inline/local — no external assets.
//
// Two dialects are provided for each program: GLSL ES 1.00 (attribute/varying,
// gl_FragColor) for WebGL1 contexts, and GLSL ES 3.00 (#version 300 es, in/out,
// explicit fragment output) for WebGL2 contexts. The renderer selects the
// matching dialect for both the mesh and point programs based on the actual
// context that was created, so a WebGL2 context never falls back to running
// ES 1.00 source (and vice versa).

export const MESH_VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vColor = uColor;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}
`;

export const MESH_FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
  vec3 ambient = vColor * 0.35;
  vec3 lit = ambient + vColor * diffuse * 0.65;
  gl_FragColor = vec4(lit, 1.0);
}
`;

export const POINT_VERTEX_SHADER = `
attribute vec3 aPosition;
uniform mat4 uView;
uniform mat4 uProjection;
uniform float uPointSize;
void main() {
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}
`;

export const POINT_FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}
`;

// --- WebGL2 / GLSL ES 3.00 variants ---

export const MESH_VERTEX_SHADER_GL2 = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec3 uColor;
out vec3 vNormal;
out vec3 vColor;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vColor = uColor;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}
`;

export const MESH_FRAGMENT_SHADER_GL2 = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vColor;
out vec4 fragColor;
void main() {
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.6));
  float diffuse = max(dot(normalize(vNormal), lightDir), 0.0);
  vec3 ambient = vColor * 0.35;
  vec3 lit = ambient + vColor * diffuse * 0.65;
  fragColor = vec4(lit, 1.0);
}
`;

export const POINT_VERTEX_SHADER_GL2 = `#version 300 es
in vec3 aPosition;
uniform mat4 uView;
uniform mat4 uProjection;
uniform float uPointSize;
void main() {
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
  gl_PointSize = uPointSize;
}
`;

export const POINT_FRAGMENT_SHADER_GL2 = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor, 1.0);
}
`;
