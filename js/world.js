import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
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
import { gsap } from "gsap";

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
const ambientLight = new AmbientLight("#80a6d0", 0.65);
scene.add(ambientLight);

const stagePalettes = [
  { glow: 0xef5848, accent: 0xf3bd62, wall: 0x24191c, background: 0x10090d },
  { glow: 0x55f078, accent: 0xc1ff70, wall: 0x10241d, background: 0x06120d },
  { glow: 0x638dff, accent: 0x75e9ff, wall: 0x151c31, background: 0x080d1a },
  { glow: 0xe3a65c, accent: 0xffd391, wall: 0x29241d, background: 0x100d09 },
  { glow: 0x89b9e8, accent: 0xf2ca79, wall: 0x1a2028, background: 0x090d12 }
];

function addBox(group, size, position, material) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function addCylinder(group, radiusTop, radiusBottom, height, position, material, segments = 24) {
  const mesh = new Mesh(new CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function createStageEnvironment(index) {
  const palette = stagePalettes[index];
  const group = new Group();
  const wallMaterial = new MeshStandardMaterial({
    color: palette.wall,
    emissive: palette.glow,
    emissiveIntensity: 0.12,
    metalness: 0.78,
    roughness: 0.34
  });
  const darkMaterial = new MeshStandardMaterial({
    color: 0x101820,
    metalness: 0.72,
    roughness: 0.42
  });
  const accentMaterial = new MeshBasicMaterial({
    color: palette.accent,
    transparent: true,
    opacity: 0.72,
    blending: AdditiveBlending
  });
  const glassMaterial = new MeshStandardMaterial({
    color: palette.glow,
    emissive: palette.glow,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.22,
    metalness: 0.4,
    roughness: 0.16
  });

  if (index === 0) {
    for (const side of [-1, 1]) {
      addBox(group, [1.15, 3.6, 1.05], [side * 4.15, 0.05, -4.9], wallMaterial);
      addBox(group, [1.28, 0.12, 1.16], [side * 4.15, 1.94, -4.9], accentMaterial);
      addBox(group, [0.72, 1.9, 0.2], [side * 4.15, 0.2, -4.31], darkMaterial);
      addBox(group, [0.48, 0.05, 0.24], [side * 4.15, 0.66, -4.18], accentMaterial);
      const armorRing = new Mesh(new TorusGeometry(0.86, 0.028, 8, 48), accentMaterial);
      armorRing.position.set(side * 2.75, 0.2, -5.6);
      armorRing.rotation.y = side * 0.24;
      group.add(armorRing);
    }
    addCylinder(group, 0.48, 0.65, 0.16, [0, -1.62, -4.2], accentMaterial);
    addCylinder(group, 0.35, 0.48, 0.22, [0, -1.48, -4.2], darkMaterial);
  } else if (index === 1) {
    for (const side of [-1, 1]) {
      addCylinder(group, 0.52, 0.52, 3.25, [side * 3.25, 0.06, -5.1], glassMaterial, 32);
      addCylinder(group, 0.64, 0.64, 0.16, [side * 3.25, 1.73, -5.1], accentMaterial);
      addCylinder(group, 0.64, 0.64, 0.16, [side * 3.25, -1.61, -5.1], accentMaterial);
      addCylinder(group, 0.18, 0.18, 2.65, [side * 3.25, 0.1, -5.1], accentMaterial);
      const containmentRing = new Mesh(new TorusGeometry(0.72, 0.025, 8, 48), accentMaterial);
      containmentRing.position.set(side * 3.25, 0.05, -5.1);
      containmentRing.rotation.x = Math.PI / 2;
      group.add(containmentRing);
    }
    addBox(group, [0.16, 3.7, 0.16], [-4.35, 0.08, -4.8], wallMaterial);
    addBox(group, [0.16, 3.7, 0.16], [4.35, 0.08, -4.8], wallMaterial);
  } else if (index === 2) {
    addCylinder(group, 0.58, 0.82, 4.4, [0, 1.15, -9], wallMaterial, 12);
    for (let tier = 0; tier < 5; tier += 1) {
      const towerRing = new Mesh(
        new TorusGeometry(0.9 + tier * 0.1, 0.025, 8, 64),
        tier % 2 ? accentMaterial : glassMaterial
      );
      towerRing.position.set(0, -0.65 + tier * 0.9, -8.95);
      towerRing.rotation.x = Math.PI / 2;
      group.add(towerRing);
    }
    for (const side of [-1, 1]) {
      addBox(group, [0.3, 3.2, 0.44], [side * 3.85, 0.15, -6.2], wallMaterial);
      addBox(group, [0.42, 0.08, 1.15], [side * 3.62, 1.72, -6.2], accentMaterial);
      addCylinder(group, 0.035, 0.035, 4.2, [side * 3.55, 0.2, -8.1], accentMaterial, 8);
    }
  } else if (index === 3) {
    for (const side of [-1, 1]) {
      addBox(group, [1.55, 1.08, 0.8], [side * 3.08, -0.42, -4.5], darkMaterial);
      addBox(group, [1.08, 0.66, 0.12], [side * 3.08, 0.28, -4.88], wallMaterial);
      addBox(group, [0.84, 0.43, 0.045], [side * 3.08, 0.3, -4.79], accentMaterial);
      addBox(group, [0.48, 0.08, 0.32], [side * 3.08, -1.03, -4.28], wallMaterial);
      addCylinder(group, 0.055, 0.055, 3.4, [side * 4.25, 0.2, -6.2], accentMaterial, 10);
      for (let rib = 0; rib < 3; rib += 1) {
        addBox(group, [0.44, 0.07, 0.08], [side * (2.2 + rib * 0.55), 1.35, -6.4], accentMaterial);
      }
    }
    addBox(group, [0.12, 0.12, 2.2], [0, 1.94, -6.5], accentMaterial);
  } else {
    for (const side of [-1, 1]) {
      addBox(group, [1.35, 3.9, 0.68], [side * 4.08, 0.05, -5.35], wallMaterial);
      addBox(group, [1.52, 0.16, 0.82], [side * 4.08, 2.05, -5.35], darkMaterial);
      addBox(group, [0.94, 0.08, 0.72], [side * 4.08, 1.94, -4.94], accentMaterial);
      addBox(group, [0.92, 0.78, 0.2], [side * 3.05, -1.12, -4.8], darkMaterial);
      addBox(group, [1.12, 0.12, 0.32], [side * 3.05, -0.65, -4.65], wallMaterial);
    }
    addCylinder(group, 0.055, 0.11, 2.5, [0, 1.6, -7.6], accentMaterial, 10);
    addCylinder(group, 0.76, 0.76, 0.08, [0, 2.88, -7.6], darkMaterial, 32);
    const radar = new Mesh(new TorusGeometry(0.58, 0.025, 8, 40), accentMaterial);
    radar.position.set(0, 2.88, -7.6);
    radar.rotation.x = Math.PI / 2;
    group.add(radar);
    addBox(group, [2.4, 0.09, 0.85], [0, -1.75, -5.5], accentMaterial);
  }
  group.visible = false;
  group.userData.materials = [wallMaterial, darkMaterial, accentMaterial, glassMaterial];
  return group;
}

const stageEnvironments = stagePalettes.map((_, index) => createStageEnvironment(index));
stageEnvironments.forEach((stageEnvironment) => scene.add(stageEnvironment));

const gateMaterial = new MeshStandardMaterial({
  color: "#15212c",
  emissive: "#16434a",
  emissiveIntensity: 0.7,
  metalness: 0.8,
  roughness: 0.28
});
const gateGeometry = new BoxGeometry(0.88, 3.35, 0.24);
const leftGate = new Group();
leftGate.position.set(-0.92, 0, -5);
const leftGatePanel = new Mesh(gateGeometry, gateMaterial);
leftGatePanel.position.x = 0.44;
leftGate.add(leftGatePanel);
environment.add(leftGate);
const rightGate = new Group();
rightGate.position.set(0.92, 0, -5);
const rightGatePanel = new Mesh(gateGeometry, gateMaterial);
rightGatePanel.position.x = -0.44;
rightGate.add(rightGatePanel);
environment.add(rightGate);
const gateFrameMaterial = new MeshBasicMaterial({
  color: "#56d8e4",
  transparent: true,
  opacity: 0.72,
  blending: AdditiveBlending,
  side: 2
});
const gateFrame = new Mesh(new RingGeometry(1.17, 1.22, 64), gateFrameMaterial);
gateFrame.position.set(0, 0, -5.2);
environment.add(gateFrame);

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
let activeStage = -1;
const stageHues = stagePalettes.map((palette) => palette.glow);
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
  gateGeometry.dispose();
  gateMaterial.dispose();
  gateFrame.geometry.dispose();
  gateFrameMaterial.dispose();
  for (const stageEnvironment of stageEnvironments) {
    stageEnvironment.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    stageEnvironment.userData.materials.forEach((material) => material.dispose());
  }
}, { once: true });
frame = window.requestAnimationFrame(render);

export function setWorldStage(level) {
  const stage = Math.max(0, Math.min(4, Math.trunc(level)));
  const palette = stagePalettes[stage];
  const hue = palette.glow;
  document.body.dataset.stage = String(stage);
  const glowColor = `#${hue.toString(16).padStart(6, "0")}`;
  const accentColor = `#${palette.accent.toString(16).padStart(6, "0")}`;
  document.documentElement.style.setProperty("--stage-glow", glowColor);
  document.documentElement.style.setProperty("--stage-accent", accentColor);
  document.documentElement.style.setProperty("--cyan", glowColor);
  document.documentElement.style.setProperty("--blue", accentColor);
  stageEnvironments.forEach((stageEnvironment, index) => { stageEnvironment.visible = index === stage; });
  scene.background.setHex(palette.background);
  scene.fog.color.setHex(palette.background);
  coreMaterial.emissive.setHex(hue);
  keyLight.color.setHex(hue);
  rimLight.color.setHex(palette.accent);
  ambientLight.intensity = stage === 1 ? 0.82 : 0.65;
  gateMaterial.emissive.setHex(hue);
  gateFrameMaterial.color.setHex(hue);
  if (stage === activeStage || reducedMotion) {
    activeStage = stage;
    return;
  }
  activeStage = stage;
  const leftOpenAngle = Math.PI * 0.39;
  gsap.killTweensOf(leftGate.rotation);
  gsap.killTweensOf(rightGate.rotation);
  gsap.killTweensOf(gateFrame.scale);
  gsap.killTweensOf(camera.position);
  gsap.to(camera.position, { z: 11.4 - stage * 0.42, duration: 0.9, ease: "power2.inOut" });
  const cycleGate = (door, angle) => {
    gsap.to(door.rotation, {
      y: 0,
      duration: 0.24,
      ease: "power2.in",
      onComplete: () => gsap.to(door.rotation, { y: angle, duration: 0.72, ease: "power3.out" })
    });
  };
  cycleGate(leftGate, leftOpenAngle);
  cycleGate(rightGate, -leftOpenAngle);
  gsap.fromTo(gateFrame.scale, { x: 0.72, y: 0.72, z: 1 }, {
    x: 1.12,
    y: 1.12,
    z: 1,
    duration: 0.82,
    ease: "elastic.out(1, 0.62)"
  });
}

export function activateSecurityGate() {
  if (reducedMotion) return Promise.resolve();
  const originalCameraZ = camera.position.z;
  gateMaterial.emissive.set("#48ff9b");
  gateFrameMaterial.color.set("#48ff9b");
  const timeline = gsap.timeline();
  timeline
    .to(gateFrame.scale, { x: 1.22, y: 1.22, duration: 0.22, ease: "power2.out" })
    .to([leftGate.rotation, rightGate.rotation], {
      y: (index) => index === 0 ? Math.PI * 0.39 : -Math.PI * 0.39,
      duration: 0.52,
      ease: "power3.out"
    }, "<")
    .to(camera.position, { z: originalCameraZ - 1.15, duration: 0.52, ease: "power2.inOut" }, "<")
    .to([leftGate.rotation, rightGate.rotation], {
      y: 0,
      duration: 0.32,
      ease: "power2.in"
    })
    .to(camera.position, { z: originalCameraZ, duration: 0.32, ease: "power2.inOut" }, "<")
    .to(gateFrame.scale, { x: 1, y: 1, duration: 0.32, ease: "power2.out" }, "<")
    .call(() => {
      gateMaterial.emissive.setHex(stageHues[activeStage]);
      gateFrameMaterial.color.setHex(stageHues[activeStage]);
    });
  return new Promise((resolve) => timeline.eventCallback("onComplete", resolve));
}
