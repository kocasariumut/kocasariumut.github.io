// ----- footer year ---------------------------------------------------------
document.getElementById("year").textContent = new Date().getFullYear();

// ----- scroll reveal -------------------------------------------------------
// Use threshold:0 (any visible pixel triggers) instead of a percentage.
// A percentage threshold breaks for tall sections — e.g. at 150% browser
// zoom, the Publications section is taller than 8× the viewport, so a
// 0.12 threshold can never be satisfied and the section stays hidden.
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0, rootMargin: "0px 0px -80px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

// ----- theme toggle --------------------------------------------------------
const root = document.documentElement;
const themeBtn = document.getElementById("theme-toggle");
if (localStorage.getItem("theme") === "light") root.setAttribute("data-theme", "light");
themeBtn.addEventListener("click", () => {
  const isLight = root.getAttribute("data-theme") === "light";
  if (isLight) {
    root.removeAttribute("data-theme");
    localStorage.setItem("theme", "dark");
  } else {
    root.setAttribute("data-theme", "light");
    localStorage.setItem("theme", "light");
  }
});

// ----- hero cursor spotlight ----------------------------------------------
// Updates two CSS custom properties on the .hero element so the radial
// gradient defined in CSS tracks the mouse. Pure CSS does the rendering.
const hero = document.querySelector(".hero");
if (hero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  hero.addEventListener("mousemove", (e) => {
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    hero.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  });
}

// ----- mouse parallax for the hero face mesh ------------------------------
// Combined with the CSS rotateY oscillation, this gives the impression of a
// face being "looked at" — drifts slightly toward the cursor.
const art = document.querySelector(".hero-art");
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (art && !reduced) {
  let tx = 0, ty = 0, x = 0, y = 0;
  document.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    tx = ((e.clientX - cx) / cx) * 14;
    ty = ((e.clientY - cy) / cy) * 14;
  });
  function tick() {
    x += (tx - x) * 0.06;
    y += (ty - y) * 0.06;
    // The CSS animation owns the rotateY; we add translation on top so the
    // two motions stack cleanly without fighting each other.
    art.style.transform = `translate(${x}px, calc(-50% + ${y}px))`;
    requestAnimationFrame(tick);
  }
  tick();
}

// ===== Hero particle network ==============================================
//
// A drifting field of points connected by faint lines whenever they're near
// each other — visually evokes the dense correspondence / point-tracking idea
// from FaceAnything. Pure 2D canvas, lightweight, ~80 points.
//
// The mouse subtly attracts nearby points, so it feels alive without being
// aggressive about it.

(function setupParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas || reduced) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0, H = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = canvas.width  = Math.floor(rect.width  * dpr);
    H = canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width  = rect.width  + "px";
    canvas.style.height = rect.height + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  // Density adapts to viewport area so it feels equally populated everywhere.
  const N = Math.min(110, Math.max(50, Math.floor((W * H) / (16000 * dpr * dpr))));
  const speed = 0.35 * dpr;
  const linkDist = 130 * dpr;
  const mouseRadius = 160 * dpr;

  const points = Array.from({ length: N }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * speed,
    vy: (Math.random() - 0.5) * speed,
  }));

  const mouse = { x: -9999, y: -9999, active: false };
  window.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * dpr;
    mouse.y = (e.clientY - r.top) * dpr;
    mouse.active = mouse.y >= 0 && mouse.y <= H;  // only when over the hero
  });
  window.addEventListener("mouseleave", () => { mouse.active = false; });

  // Read the current accent color so the canvas tracks light/dark theme.
  function accentRGB() {
    const css = getComputedStyle(document.documentElement)
                  .getPropertyValue("--accent").trim() || "#8b9bff";
    // Quick hex -> rgb parse (only handles #rrggbb, which is what we use).
    const m = css.match(/^#([0-9a-f]{6})$/i);
    if (!m) return "139,155,255";
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  let accent = accentRGB();
  // Re-read the accent when the theme toggle changes; observer is overkill,
  // a click handler is enough.
  themeBtn.addEventListener("click", () => {
    // give the CSS var time to update on this frame
    requestAnimationFrame(() => { accent = accentRGB(); });
  });

  function tick() {
    ctx.clearRect(0, 0, W, H);

    // Update positions with soft mouse attraction.
    for (const p of points) {
      p.x += p.vx;
      p.y += p.vy;

      // Bounce off canvas edges.
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      if (mouse.active) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < mouseRadius * mouseRadius) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / mouseRadius) * 0.05;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }

      // Soft cap on speed so the field doesn't accelerate forever.
      const v2 = p.vx * p.vx + p.vy * p.vy;
      const max = speed * 1.8;
      if (v2 > max * max) {
        const v = Math.sqrt(v2);
        p.vx = (p.vx / v) * max;
        p.vy = (p.vy / v) * max;
      }
    }

    // Lines between nearby points (alpha falls off with distance).
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const a = points[i];
      for (let j = i + 1; j < N; j++) {
        const b = points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist * linkDist) {
          const t = 1 - Math.sqrt(d2) / linkDist;
          ctx.strokeStyle = `rgba(${accent},${(t * 0.32).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Points themselves.
    ctx.fillStyle = `rgba(${accent},0.7)`;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }
  tick();
})();
