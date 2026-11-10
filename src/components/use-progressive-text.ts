"use client";
import { useEffect, useRef, useState } from "react";

// Reveal only text already received from the server. Coalesced network packets must
// not turn into a single full-report paint, including the final persisted result.
export function useProgressiveText(text: string) {
  const target = useRef(text);
  const shown = useRef("");
  const frame = useRef<number | null>(null);
  const [visible, setVisible] = useState("");
  useEffect(() => {
    target.current = text;
    if (!text.startsWith(shown.current)) {
      shown.current = "";
      setVisible("");
    }
    if (frame.current !== null) return;
    const paint = () => {
      frame.current = null;
      const remaining = target.current.length - shown.current.length;
      if (remaining <= 0) return;
      let end =
        shown.current.length +
        Math.min(
          remaining,
          Math.max(8, Math.min(48, Math.ceil(remaining / 12))),
        );
      // Do not split a UTF-16 surrogate pair.
      const code = target.current.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end++;
      shown.current = target.current.slice(0, end);
      setVisible(shown.current);
      if (shown.current.length < target.current.length)
        frame.current = requestAnimationFrame(paint);
    };
    frame.current = requestAnimationFrame(paint);
  }, [text]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );
  return text ? visible : "";
}
