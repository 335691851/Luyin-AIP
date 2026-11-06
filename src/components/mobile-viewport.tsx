"use client";
import { useEffect } from "react";

// Mobile keyboards resize the visual viewport, not necessarily CSS vh (notably on iOS).
export default function MobileViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    let width = innerWidth;
    let fullHeight = viewport?.height || innerHeight;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height || innerHeight;
        fullHeight =
          width !== innerWidth ? height : Math.max(fullHeight, height);
        width = innerWidth;
        root.dataset.mobileKeyboard = String(
          width <= 650 &&
            height < fullHeight - 100 &&
            !!document.activeElement?.matches(
              "input, textarea, [contenteditable='true']",
            ),
        );
        root.style.setProperty("--visual-viewport-height", `${height}px`);
        const header = document.querySelector(".topbar");
        root.style.setProperty(
          "--workspace-header-height",
          `${header?.getBoundingClientRect().height || 62}px`,
        );
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    viewport?.addEventListener("resize", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      viewport?.removeEventListener("resize", update);
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--workspace-header-height");
      delete root.dataset.mobileKeyboard;
    };
  }, []);
  return null;
}
