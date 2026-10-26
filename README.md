# rayfold.com

Portfolio of **Kandarp Vaidya**, embedded systems engineer. The site walks down the stack, from logic gates to networked products, with something live to poke at every layer.

**Stack:** [Astro](https://astro.build) (static output) · TypeScript · [Tailwind CSS v4](https://tailwindcss.com) · [Three.js](https://threejs.org) · [GSAP](https://gsap.com) (ScrollTrigger, SplitText, DrawSVG, MotionPath) · [Lenis](https://lenis.darkroom.engineering) smooth scroll. Deployed on Vercel.

## Run it locally

You need Node 22.23+ (Astro 7 requirement).

```bash
npm install
npm run dev        # http://localhost:4321, hot reload
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
```

## Where things live

```
src/
  data/site.ts            ← ALL text, links and numbers. Edit this first.
  data/registers.ts       ← ADXL345 register model for the explorer
  pages/index.astro       ← section order
  components/             ← one file per section (Hero, L0Gates … Contact)
  scripts/pcb-scene.ts    ← the Three.js PCB (procedural, no model files)
  scripts/motion.ts       ← Lenis + GSAP: pins, reveals, scope draw, packets
  scripts/demos.ts        ← NAND/CMOS, register explorer, bootloader simulator
  styles/global.css       ← design tokens (colours, fonts), shared classes
public/
  fonts/  resume/  og.png  favicon.svg  robots.txt  sitemap.xml
vercel.json               ← security headers + long-term caching
```

### Common edits

| Want to… | Do this |
|---|---|
| Add your LinkedIn | `src/data/site.ts` → `linkedin: 'https://…'`. The button appears automatically. |
| Fix a repo link | `src/data/site.ts` → `repos` |
| Change a number | `src/data/site.ts` (hero stats, spec tables, timeline). Measured values only. |
| Replace the résumé | Overwrite `public/resume/Kandarp_Vaidya_Resume.pdf` |
| Re-colour the site | `src/styles/global.css` → `@theme` block |
| Reorder sections | `src/pages/index.astro` |

### Adding your own animations / 3D

- **Scroll animation:** add it in `src/scripts/motion.ts` inside `initRest()`. GSAP and ScrollTrigger are already registered. Call `await yieldToMain()` between heavy setups.
- **Fade-in on scroll:** add `data-reveal` to any element. Put `data-reveal-stagger` on a list to animate its children in turn.
- **Split-line headline reveal:** add `data-split` to a heading.
- **3D:** `pcb-scene.ts` shows the pattern: render on demand, pause when off-screen, cap the pixel ratio, and `compileAsync` before the first frame. For real models, export GLB from Blender and compress with `npx @gltf-transform/cli optimize in.glb out.glb`.
- Always respect `prefers-reduced-motion`. The existing code does this everywhere.

## Performance budget

| Asset | gzip |
|---|---|
| HTML (CSS inlined) | ~26 KB |
| Main JS (GSAP + Lenis + demos) | ~70 KB |
| Three.js board (lazy-loaded) | ~137 KB |
| Fonts (preloaded, self-hosted) | ~185 KB woff2 |

The 3D chunk loads after the page is idle on desktop, and only when the board scrolls into view on phones.

---

# Deploying to rayfold.com (Vercel)

## 1. Push to GitHub

From the project folder (Git Bash / MSYS2):

```bash
git init -b main
git add -A
git commit -m "rayfold.com v1: Astro + Three.js + GSAP"
git remote add origin git@github.com:rayfoldenergy/rayfold_portfolio.git
git push -u origin main --force-with-lease   # replaces the old site on main
```

To keep the old site, first push it to a branch: `git push origin <old-commit>:refs/heads/old-site-backup`.

## 2. Vercel project

1. vercel.com → the project currently serving `portfolio-topaz-nu-69.vercel.app` → **Settings → Git**: connect `rayfoldenergy/rayfold_portfolio` if it isn't already.
2. **Settings → Build & Deployment**: Framework Preset **Astro**. `vercel.json` already sets build `npm run build` and output `dist`.
3. **Settings → General → Node.js Version**: 22.x (Astro 7 needs ≥ 22.23; 24.x also fine).
4. Push (or click **Redeploy**). **Check:** the deployment shows **Ready** and its `*.vercel.app` URL shows the new site.

## 3. Domain, DNS, HTTPS

1. **Nameservers.** In PowerShell, run `nslookup -type=NS rayfold.com 8.8.8.8`. It should return `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
2. **Settings → Domains:** both `rayfold.com` and `www.rayfold.com` must be on **this** project. Edit `www.rayfold.com` → **Redirect to** `rayfold.com` (308). Both should show **Valid Configuration**.
3. **DNS records** (Domains → rayfold.com): delete leftover A or CNAME records that point to the old host (wsimg / GoDaddy / builder). **Keep MX / TXT** if you use email on the domain.
4. **HTTPS:** Vercel issues the Let's Encrypt certificate automatically once DNS points to it. Verify:

```powershell
curl.exe -sI https://rayfold.com          # HTTP 200
curl.exe -sI https://www.rayfold.com      # 308 → https://rayfold.com/
curl.exe -sI http://rayfold.com           # 308 → https://rayfold.com/
```

Then, in an Incognito window, click the padlock on `https://rayfold.com` → **Certificate is valid**. It should be issued by Let's Encrypt to rayfold.com, with an expiry date in the future.

## 4. Launch checks

- [ ] Desktop: the board tilts with the mouse and explodes on scroll; the debug log scrolls sideways.
- [ ] Phone (real device, Safari **and** Chrome): no sideways scroll, and the board loads when you reach it.
- [ ] NAND buttons, register bits and bootloader ⚡ button all respond.
- [ ] Repo links, résumé and email work; `/anything` shows the 404 page.
- [ ] Share preview: linkedin.com/post-inspector shows `og.png`.
- [ ] Chrome DevTools → Lighthouse on the live URL.
