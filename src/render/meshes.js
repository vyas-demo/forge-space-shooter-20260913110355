// Original low-poly geometry data (vertices/normals/indices) for player ship,
// enemy ship, projectile, and a starfield point field. No external assets.

// A small arrow-like wedge for the player ship, pointing along -z.
export function playerShipMesh() {
  const positions = [
    0, 0.6, -1.2, // nose
    -0.9, -0.4, 0.8, // left wing back
    0.9, -0.4, 0.8, // right wing back
    0, -0.1, 0.5, // belly/tail center
    0, 0.9, 0.6, // top fin
  ];
  const indices = [
    0, 1, 2, // main wing triangle
    0, 2, 4,
    0, 4, 1,
    1, 4, 2,
    1, 2, 3,
  ];
  const normals = computeFlatNormals(positions, indices);
  return { positions, normals, indices };
}

// A stubbier inverted wedge for enemy ships, pointing along +z (toward player).
export function enemyShipMesh() {
  const positions = [
    0, 0.4, 0.9,
    -0.7, -0.3, -0.6,
    0.7, -0.3, -0.6,
    0, -0.6, -0.6,
    0, 0.6, -0.4,
  ];
  const indices = [
    0, 2, 1,
    0, 1, 4,
    0, 4, 2,
    1, 2, 4,
    1, 3, 2,
  ];
  const normals = computeFlatNormals(positions, indices);
  return { positions, normals, indices };
}

// A tiny elongated diamond for projectiles.
export function projectileMesh() {
  const positions = [
    0, 0, -0.4,
    0.1, 0.1, 0,
    -0.1, 0.1, 0,
    -0.1, -0.1, 0,
    0.1, -0.1, 0,
    0, 0, 0.4,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1,
    5, 2, 1, 5, 3, 2, 5, 4, 3, 5, 1, 4,
  ];
  const normals = computeFlatNormals(positions, indices);
  return { positions, normals, indices };
}

// Deterministic pseudo-random starfield point cloud (no external assets).
export function starfieldPoints(count = 200, seed = 1337) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push(
      (rand() * 2 - 1) * 40,
      (rand() * 2 - 1) * 25,
      -rand() * 100 - 5
    );
  }
  return { positions };
}

function computeFlatNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const idx of [ia, ib, ic]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }
  return normals;
}
