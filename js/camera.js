import { PerspectiveCamera } from "three";

export function createCamera() {
  const camera = new PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 2.4, 12);
  camera.lookAt(0, 0, 0);
  return camera;
}
