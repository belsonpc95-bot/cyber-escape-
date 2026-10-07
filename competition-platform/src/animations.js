import { gsap } from "gsap";

export function animateScreen(element) {
  gsap.fromTo(element, { autoAlpha: 0, y: 15, filter: "blur(4px)" }, {
    autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power3.out", clearProps: "filter"
  });
}
