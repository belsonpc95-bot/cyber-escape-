import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";

export function createParticleField(count = 850) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = [0.42, 0.94, 0.92];
  const blue = [0.29, 0.53, 0.91];

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    positions[offset] = (Math.random() - 0.5) * 42;
    positions[offset + 1] = (Math.random() - 0.5) * 25;
    positions[offset + 2] = (Math.random() - 0.5) * 30 - 5;
    const color = Math.random() > 0.77 ? blue : cyan;
    colors[offset] = color[0];
    colors[offset + 1] = color[1];
    colors[offset + 2] = color[2];
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    sizeAttenuation: true,
    depthWrite: false
  });

  return new Points(geometry, material);
}
