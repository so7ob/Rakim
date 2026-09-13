import { useEffect, useState } from "react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 480);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <button
      className={`back-to-top${visible ? " visible" : ""}`}
      type="button"
      aria-label="العودة إلى أعلى الصفحة"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
