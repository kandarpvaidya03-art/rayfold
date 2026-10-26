// ─────────────────────────────────────────────────────────────
// Motion system: Lenis smooth scroll + GSAP (ScrollTrigger, SplitText,
// DrawSVG, MotionPath). Everything degrades to static content when
// prefers-reduced-motion is set or JS fails.
//
// Performance: only the hero is set up synchronously. Everything else is
// initialised in small chunks that yield to the main thread, headings are
// split lazily as they approach the viewport, and the Three.js board loads
// after the page is idle (desktop) or when it scrolls into view (mobile).
// ─────────────────────────────────────────────────────────────
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, MotionPathPlugin);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesk = window.matchMedia('(min-width: 1024px)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const yieldToMain = () => new Promise<void>((res) => {
  const s = (globalThis as any).scheduler;
  if (s?.yield) s.yield().then(res); else setTimeout(res, 0);
});
const idle = (fn: () => void, timeout = 1200) =>
  'requestIdleCallback' in window ? (window as any).requestIdleCallback(fn, { timeout }) : setTimeout(fn, 200);

// ── smooth scroll ──
let lenis: Lenis | null = null;
if (!reduce) {
  lenis = new Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href')!;
  const el = id === '#top' ? document.body : document.querySelector<HTMLElement>(id);
  if (!el) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(id === '#top' ? 0 : el, { offset: -76, duration: 1.4 });
  else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  history.replaceState(null, '', id);
  if (id !== '#top') { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
});

// ── nav progress bar ──
gsap.to('[data-progress]', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });

// ── hero: pin + explode (pins first, so later triggers measure correctly) ──
const hasWebGL = 'WebGL2RenderingContext' in window || 'WebGLRenderingContext' in window;
const stage = $('[data-pcb]');
let explode = 0;
let pcb: { setExplode(p: number): void } | null = null;
const onExplode = (p: number) => { explode = p; pcb?.setExplode(p); };

if (stage && hasWebGL) {
  gsap.matchMedia().add('(min-width: 1024px)', () => {
    const st = ScrollTrigger.create({ trigger: '[data-hero]', start: 'top top', end: '+=115%', pin: true, scrub: 0.6, onUpdate: (s) => onExplode(s.progress) });
    const hint = gsap.to('[data-stage-hint]', { autoAlpha: 0, scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '+=20%', scrub: true } });
    return () => { st.kill(); hint.scrollTrigger?.kill(); };
  });
  gsap.matchMedia().add('(max-width: 1023px)', () => {
    const st = ScrollTrigger.create({ trigger: '[data-stage]', start: 'top 55%', end: 'bottom 5%', scrub: 0.6, onUpdate: (s) => onExplode(s.progress) });
    return () => st.kill();
  });

  let booted = false;
  const boot = () => {
    if (booted) return; booted = true;
    import('./pcb-scene').then(async ({ initPcb }) => {
      const labels: Record<string, HTMLElement> = {};
      $$('[data-layer-label]').forEach((el) => { labels[el.dataset.layerLabel!] = el; });
      pcb = await initPcb(stage, labels, { reducedMotion: reduce });
      pcb.setExplode(explode);
      gsap.to('[data-pcb-fallback]', { autoAlpha: 0, duration: 0.6 });
      gsap.fromTo(stage.querySelector('canvas'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, ease: 'power2.out' });
    }).catch(() => { const f = $('[data-pcb-fallback] p'); if (f) f.textContent = '3D view unavailable'; });
  };
  if (isDesk) {
    const go = () => idle(boot, 1500);
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  } else {
    // phones: wait for the first sign of intent (or 6 s) so the 3D init never competes with first load
    const kick = () => { ['scroll', 'touchstart', 'pointerdown'].forEach((ev) => window.removeEventListener(ev, kick)); boot(); };
    ['scroll', 'touchstart', 'pointerdown'].forEach((ev) => window.addEventListener(ev, kick, { once: true, passive: true }));
    setTimeout(kick, 6000);
  }
} else if (stage) {
  const f = $('[data-pcb-fallback] p'); if (f) f.textContent = '3D view needs WebGL';
}

// ── reveal helper: IntersectionObserver, zero scroll-refresh cost ──
function onEnter(els: Element[], cb: (el: HTMLElement) => void, margin = '0px 0px -8% 0px') {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); cb(en.target as HTMLElement); } });
  }, { rootMargin: margin });
  els.forEach((el) => io.observe(el));
}

// ── headline reveal: hero now; others are split just before they arrive ──
function split(el: HTMLElement, animateNow: boolean) {
  SplitText.create(el, {
    type: 'lines', mask: 'lines', autoSplit: true,
    onSplit(self) {
      if (reduce) return;
      if (animateNow) return gsap.from(self.lines, { yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.09, delay: 0.15 });
      gsap.set(self.lines, { yPercent: 115 });
      onEnter([el], () => gsap.to(self.lines, { yPercent: 0, duration: 0.95, ease: 'expo.out', stagger: 0.09 }));
    },
  });
}
document.fonts.ready.then(() => {
  const heroH = $('[data-hero] [data-split]');
  if (heroH) split(heroH, true);
  onEnter($$('[data-split]').filter((el) => el !== heroH), (el) => split(el, false), '0px 0px 30% 0px');
});

// hero copy animates in immediately (it is above the fold)
if (!reduce) {
  gsap.from('[data-hero] [data-reveal]', { y: 28, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.1, delay: 0.35 });
  gsap.from('[data-hero-in]', { y: 24, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, delay: 0.55 });
}

// ── everything else, in small chunks ──
async function initRest() {

  // debug log: horizontal travel on desktop (a pin, so created early)
  const hwrap = $('[data-hwrap]'), track = $('[data-htrack]');
  if (hwrap && track) {
    gsap.matchMedia().add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const dist = () => Math.max(0, track.scrollWidth - (window.innerWidth - track.getBoundingClientRect().left) + 24);
      const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: hwrap, start: 'center 55%', end: () => `+=${dist()}`, pin: true, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      return () => tween.scrollTrigger?.kill();
    });
  }
  await yieldToMain();

  if (!reduce) {
    const rev = $$('[data-reveal]').filter((el) => !el.closest('[data-hero]'));
    gsap.set(rev, { autoAlpha: 0, y: 34 });
    onEnter(rev, (el) => gsap.to(el, { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out' }));
    await yieldToMain();
    const groups = $$('[data-reveal-stagger]');
    groups.forEach((g) => gsap.set(g.children, { autoAlpha: 0, y: 30 }));
    onEnter(groups, (g) => gsap.to(g.children, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06 }));
    await yieldToMain();
    $$('[data-layer-code]').forEach((el) => {
      gsap.fromTo(el, { yPercent: 25 }, { yPercent: -15, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    await yieldToMain();
  }

  // depth rail
  const rail = $('[data-rail]');
  if (rail && getComputedStyle(rail).display !== 'none') {
    const items = $$('[data-rail-item]');
    const fill = $('[data-rail-fill]');
    ScrollTrigger.create({
      trigger: '#l0', endTrigger: '#l5', start: 'top 60%', end: 'bottom 40%',
      onToggle: (s) => gsap.to(rail, { autoAlpha: s.isActive ? 1 : 0, duration: 0.3 }),
      onUpdate: (s) => { if (fill) fill.style.height = `${(s.progress * 100).toFixed(1)}%`; },
    });
    $$('[data-layer]').forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec, start: 'top 50%', end: 'bottom 50%',
        onToggle: (s) => {
          if (!s.isActive) return;
          items.forEach((it) => { const on = it.dataset.railItem === sec.dataset.layer; it.style.color = on ? '#0B0B14' : ''; it.style.transform = on ? 'translateX(4px)' : ''; });
        },
      });
    });
  }
  await yieldToMain();

  // scope trace draws itself
  const scope = $('[data-scope]');
  if (scope && !reduce) {
    const tl = gsap.timeline({ paused: true })
      .from($$('[data-draw]', scope), { drawSVG: 0, duration: 2.2, ease: 'power1.inOut' })
      .from($$('[data-bits] text', scope), { autoAlpha: 0, y: 6, stagger: 0.12, duration: 0.3 }, 0.6);
    tl.progress(0);
    onEnter([scope], () => tl.play(), '0px 0px -20% 0px');
  }

  // IIO pipeline: one sample walks the path
  const pipe = $('[data-pipeline]');
  if (pipe && !reduce) {
    const packet = $('[data-packet]', pipe)!;
    const nodes = $$('[data-pnode]', pipe);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5, paused: true });
    tl.fromTo(packet, { x: 0 }, { x: () => pipe.offsetWidth * 0.88 - 15, duration: 3.6, ease: 'none' });
    nodes.forEach((n, i) => tl.fromTo(n, { backgroundColor: '#0B0B14' }, { backgroundColor: '#2A2A12', duration: 0.18, yoyo: true, repeat: 1 }, (i / (nodes.length - 1)) * 3.5));
    ScrollTrigger.create({ trigger: pipe, start: 'top bottom', end: 'bottom top', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
  }
  if (!reduce) {
    const bars = $$('[data-bar]');
    gsap.set(bars, { scaleX: 0, transformOrigin: 'left center' });
    onEnter(bars, (b) => gsap.to(b, { scaleX: 1, duration: 1.4, ease: 'expo.out' }));
  }
  await yieldToMain();

  // network map: packets in flight
  const net = $<SVGSVGElement>('[data-net]');
  if (net && !reduce) {
    const group = $('[data-packets]', net)!;
    const colors = ['#FF220F', '#0000C4', '#00D8A7', '#0B0B14'];
    const tl = gsap.timeline({ paused: true });
    $$<SVGPathElement>('path[id^="spoke-"]', net).forEach((path, i) => {
      for (let k = 0; k < 2; k++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        c.setAttribute('width', '12'); c.setAttribute('height', '12'); c.setAttribute('x', '-6'); c.setAttribute('y', '-6');
        c.setAttribute('fill', colors[(i + k) % colors.length]); c.setAttribute('stroke', '#0B0B14'); c.setAttribute('stroke-width', '2');
        group.appendChild(c);
        const inward = k === 0;
        tl.to(c, {
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: inward ? 0 : 1, end: inward ? 1 : 0 },
          duration: 1.6 + i * 0.2, ease: 'power1.inOut', repeat: -1, repeatDelay: 0.8 + k * 0.5, delay: i * 0.35 + k * 0.9,
        }, 0);
      }
    });
    ScrollTrigger.create({ trigger: net, start: 'top bottom', end: 'bottom top', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
  }

  // probe cursor (fine pointers only)
  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    const probe = document.createElement('div');
    probe.className = 'probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.innerHTML = `<svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;left:-22px;top:-22px"><path d="M22 2V16M22 28V42M2 22H16M28 22H42" stroke="#0000C4" stroke-width="2"/><circle cx="22" cy="22" r="3" fill="none" stroke="#FF220F" stroke-width="2"/></svg><span style="position:absolute;left:16px;top:14px;white-space:nowrap;font:600 10px 'JetBrains Mono',monospace;color:#0000C4;background:rgba(247,247,244,.85);padding:1px 4px" data-probe-xy></span>`;
    document.body.appendChild(probe);
    const xy = probe.querySelector<HTMLElement>('[data-probe-xy]')!;
    const qx = gsap.quickTo(probe, 'x', { duration: 0.18, ease: 'power3' });
    const qy = gsap.quickTo(probe, 'y', { duration: 0.18, ease: 'power3' });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || (e.movementX === 0 && e.movementY === 0)) return;
      probe.classList.add('on');
      qx(e.clientX); qy(e.clientY);
      xy.textContent = `X ${String(Math.round(e.clientX)).padStart(4, '0')}  Y ${String(Math.round(e.clientY + window.scrollY)).padStart(5, '0')}`;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => probe.classList.remove('on'));
  }

  ScrollTrigger.sort();
  ScrollTrigger.refresh();
}

let restDone = false;
idle(() => { initRest().then(() => { restDone = true; }); }, 400);
window.addEventListener('load', () => { if (restDone) ScrollTrigger.refresh(); }, { once: true });
