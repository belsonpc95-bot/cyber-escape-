import { gsap } from "gsap";

export function observeTransitions(app, onLevelChange) {
  let lastLevel = -1;
  let lastAnimatedContent = null;
  const observer = new MutationObserver(() => {
    const content = app.querySelector(".animate-in");
    if (content && content !== lastAnimatedContent) {
      lastAnimatedContent = content;
      gsap.fromTo(content, { autoAlpha: 0, y: 16, filter: "blur(4px)" }, {
        autoAlpha: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.62,
        ease: "power3.out",
        clearProps: "filter"
      });
    }

    const levelLabel = app.querySelector(".level-label")?.textContent || "";
    const match = levelLabel.match(/LEVEL 0([1-5])/);
    if (match) {
      const level = Number(match[1]) - 1;
      if (level !== lastLevel) {
        lastLevel = level;
        onLevelChange(level);
      }
    }
  });

  observer.observe(app, { childList: true, subtree: true });
  return () => observer.disconnect();
}
