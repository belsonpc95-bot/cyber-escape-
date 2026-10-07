import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  FogExp2,
  GridHelper,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer
} from "three";
import { createCamera } from "./camera.js";
import { createParticleField } from "./particles.js";

const mount = document.querySelector("#world-canvas");
const scene = new Scene();
scene.background = new Color("#070a12");
scene.fog = new FogExp2("#070a12", 0.035);

const camera = createCamera();
const renderer = new WebGLRenderer({ alpha: false, antialias: true, powerPreference: "low-power" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
mount.append(renderer.domElement);

const environment = new Group();
scene.add(environment);
scene.add(new AmbientLight("#80a6d0", 0.65));

const keyLight = new PointLight("#56d8e4", 30, 30);
keyLight.position.set(-5, 4, 5);
scene.add(keyLight);

const rimLight = new PointLight("#416dff", 38, 26);
rimLight.position.set(5, 1, -3);
scene.add(rimLight);

const coreMaterial = new MeshStandardMaterial({
  color: "#122633",
  emissive: "#0d7881",
  emissiveIntensity: 0.45,
  metalness: 0.82,
  roughness: 0.24,
  wireframe: true
});
const core = new Mesh(new IcosahedronGeometry(2.05, 2), coreMaterial);
core.position.set(5.3, 0.2, -2.8);
environment.add(core);

const innerCore = new Mesh(
  new IcosahedronGeometry(1.22, 1),
  new MeshBasicMaterial({ color: "#50e3dc", wireframe: true, transparent: true, opacity: 0.32 })
);
innerCore.position.copy(core.position);
environment.add(innerCore);

const rings = new Group();
rings.position.copy(core.position);
for (let i = 0; i < 3; i += 1) {
  const ring = new Mesh(
    new TorusGeometry(2.5 + i * 0.28, 0.012, 6, 150),
    new MeshBasicMaterial({ color: i === 1 ? "#568aff" : "#57d9da", transparent: true, opacity: 0.32 })
  );
  ring.rotation.x = Math.PI * (0.37 + i * 0.2);
  ring.rotation.y = Math.PI * (0.13 + i * 0.21);
  rings.add(ring);
}
environment.add(rings);

const platform = new Mesh(
  new RingGeometry(2.55, 2.62, 96),
  new MeshBasicMaterial({ color: "#65e9e4", transparent: true, opacity: 0.18, side: 2, blending: AdditiveBlending })
);
platform.rotation.x = -Math.PI / 2;
platform.position.set(5.3, -2, -2.8);
environment.add(platform);

const grid = new GridHelper(80, 48, "#163741", "#111c2a");
grid.position.set(0, -4, -8);
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const halo = new Mesh(
  new RingGeometry(10, 10.018, 180),
  new MeshBasicMaterial({ color: "#308e9a", transparent: true, opacity: 0.18, side: 2 })
);
halo.position.set(0, 0.8, -13);
scene.add(halo);

const particles = createParticleField();
scene.add(particles);

let pointerX = 0;
let pointerY = 0;
let frame = 0;
let disposed = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(event) {
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
}

function render(time) {
  if (disposed) return;
  frame = window.requestAnimationFrame(render);
  const seconds = time * 0.00025;
  if (!reducedMotion) {
    core.rotation.y = seconds * 0.7;
    core.rotation.x = Math.sin(seconds) * 0.15;
    innerCore.rotation.y = -seconds * 1.1;
    innerCore.rotation.z = seconds * 0.55;
    rings.rotation.z = seconds * 0.16;
    particles.rotation.y = seconds * 0.08;
    camera.position.x += (pointerX * 0.45 - camera.position.x) * 0.012;
    camera.position.y += (2.4 - pointerY * 0.22 - camera.position.y) * 0.012;
    camera.lookAt(pointerX * 0.22, 0, 0);
  }
  renderer.render(scene, camera);
}

window.addEventListener("resize", resize);
window.addEventListener("pointermove", onPointerMove, { passive: true });
window.addEventListener("pagehide", () => {
  disposed = true;
  window.cancelAnimationFrame(frame);
  window.removeEventListener("resize", resize);
  window.removeEventListener("pointermove", onPointerMove);
  renderer.dispose();
  core.geometry.dispose();
  coreMaterial.dispose();
}, { once: true });
frame = window.requestAnimationFrame(render);

export function setWorldStage(level) {
  const hue = [0x56d8e4, 0x4fa9d9, 0x7c86ff, 0x64d9b2, 0xf0c674][Math.max(0, Math.min(4, level))];
  coreMaterial.emissive.setHex(hue);
  keyLight.color.setHex(hue);
}
