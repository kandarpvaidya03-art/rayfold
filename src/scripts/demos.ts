// ─────────────────────────────────────────────────────────────
// Interactive demos: NAND (gate + CMOS), ADXL345 register
// explorer, and the A/B bootloader "pull the plug" simulator.
// ─────────────────────────────────────────────────────────────
import { REGS, renderReg } from '../data/registers';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));

// ── L0: NAND ──
const nand = $('[data-nand]');
if (nand) {
  const state = { a: true, b: false };
  const ON = '#FF220F', OFF = '#B8B8C2', INK = '#0B0B14';
  const paint = () => {
    const { a, b } = state, y = !(a && b);
    ([['a', a], ['b', b]] as const).forEach(([k, v]) => {
      const btn = $<HTMLButtonElement>(`[data-input="${k}"]`, nand)!;
      btn.textContent = `${k.toUpperCase()} = ${v ? 1 : 0}`;
      btn.setAttribute('aria-pressed', String(v));
      btn.classList.toggle('bg-ink', v); btn.classList.toggle('text-hazard', v); btn.classList.toggle('bg-white', !v);
      $(`[data-wire-${k}]`, nand)!.setAttribute('stroke', v ? ON : OFF);
      $(`[data-dot-${k}]`, nand)!.setAttribute('fill', v ? ON : OFF);
    });
    $('[data-wire-y]', nand)!.setAttribute('stroke', y ? ON : OFF);
    $('[data-led]', nand)!.setAttribute('fill', y ? ON : '#FFFFFF');
    $$('[data-row]', nand).forEach((r) => {
      const cur = r.dataset.row === `${+a}${+b}`;
      r.style.background = cur ? INK : ''; r.style.color = cur ? '#FEEA4D' : '';
    });
    // CMOS: PMOS conducts when its input is 0, NMOS when its input is 1
    const t = { pa: !a, pb: !b, na: a, nb: b };
    (Object.keys(t) as (keyof typeof t)[]).forEach((k) => $(`[data-t="${k}"]`, nand)!.setAttribute('fill', t[k] ? '#00D8A7' : '#FFFFFF'));
    $('[data-w="pa"]', nand)!.setAttribute('stroke', t.pa ? ON : INK);
    $('[data-w="pb"]', nand)!.setAttribute('stroke', t.pb ? ON : INK);
    $('[data-w="pd"]', nand)!.setAttribute('stroke', t.na && t.nb ? '#0000C4' : INK);
    $('[data-rail-gnd]', nand)!.setAttribute('stroke', t.na && t.nb ? '#0000C4' : INK);
    $('[data-rail-vdd]', nand)!.setAttribute('stroke', y ? ON : INK);
    $('[data-w="y"]', nand)!.setAttribute('stroke', y ? ON : '#0000C4');
    const who = [t.pa && 'PA', t.pb && 'PB'].filter(Boolean).join(' + ');
    $('[data-cmos-note]', nand)!.textContent = y ? `${who} conduct${who.includes('+') ? '' : 's'} → Y pulled to VDD` : 'NA + NB conduct in series → Y pulled to GND';
    $('[data-nand-live]', nand)!.textContent = `A is ${+a}, B is ${+b}, output Y is ${+y}.`;
  };
  $$<HTMLButtonElement>('[data-input]', nand).forEach((btn) => btn.addEventListener('click', () => {
    const k = btn.dataset.input as 'a' | 'b'; state[k] = !state[k]; paint();
  }));
  paint();
}

// ── L1: register explorer ──
const regx = $('[data-regx]');
if (regx) {
  let reg = REGS[0];
  let value = reg.preset?.value ?? reg.reset;
  const body = $('[data-reg-body]', regx)!;
  const presetBtn = $<HTMLButtonElement>('[data-reg-preset]', regx)!;
  const draw = () => {
    body.innerHTML = renderReg(reg, value);
    presetBtn.hidden = !reg.preset;
    if (reg.preset) presetBtn.textContent = `Load: ${reg.preset.label} (0x${reg.preset.value.toString(16).toUpperCase().padStart(2, '0')})`;
  };
  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-bit]');
    if (!b || b.disabled) return;
    value ^= 1 << Number(b.dataset.bit);
    draw();
    $<HTMLButtonElement>(`[data-bit="${b.dataset.bit}"]`, body)?.focus();
  });
  $$<HTMLButtonElement>('[data-reg-tab]', regx).forEach((tab) => tab.addEventListener('click', () => {
    reg = REGS.find((r) => r.key === tab.dataset.regTab)!;
    value = reg.preset?.value ?? reg.reset;
    $$<HTMLButtonElement>('[data-reg-tab]', regx).forEach((t) => {
      const on = t === tab; t.setAttribute('aria-selected', String(on));
      t.classList.toggle('bg-ink', on); t.classList.toggle('text-hazard', on); t.classList.toggle('bg-white', !on);
    });
    draw();
  }));
  presetBtn.addEventListener('click', () => { if (reg.preset) { value = reg.preset.value; draw(); } });
  $('[data-reg-reset]', regx)!.addEventListener('click', () => { value = reg.reset; draw(); });
  draw();
}

// ── L2: A/B bootloader simulator ──
const sim = $('[data-bootsim]');
if (sim) {
  const STEPS = ['recv', 'verify', 'mark', 'reboot', 'trial', 'confirm'] as const;
  type Step = (typeof STEPS)[number];
  const log = $('[data-boot-log]', sim)!;
  const startBtn = $<HTMLButtonElement>('[data-boot-start]', sim)!;
  const cutBtn = $<HTMLButtonElement>('[data-boot-cut]', sim)!;
  const broken = $<HTMLInputElement>('[data-boot-broken]', sim)!;
  const tamper = $<HTMLInputElement>('[data-boot-tamper]', sim)!;

  let running = false, idx = -1, recv = 0, timer = 0, ver = 1;
  type SlotState = { ver: string; tag: string; color: string; bar: number };
  const slots: Record<'A' | 'B', SlotState> = {
    A: { ver: 'v1.0', tag: 'ACTIVE', color: '#00D8A7', bar: 100 },
    B: { ver: '—', tag: 'EMPTY', color: '#EEEEEA', bar: 0 },
  };
  let active: 'A' | 'B' = 'A';
  const other = () => (active === 'A' ? 'B' : 'A');

  const say = (s: string) => { log.textContent += `\n${s}`; log.scrollTop = log.scrollHeight; };
  const paintSlots = () => (['A', 'B'] as const).forEach((k) => {
    const el = $(`[data-slot="${k}"]`, sim)!, s = slots[k];
    $('[data-slot-ver]', el)!.textContent = s.ver;
    const tag = $('[data-slot-tag]', el)!; tag.textContent = s.tag; tag.style.background = s.color;
    $<HTMLElement>('[data-slot-bar]', el)!.style.width = `${s.bar}%`;
    el.style.background = k === active ? '#FFFFFF' : '#F7F7F4';
  });
  const paintSteps = (failAt?: Step) => STEPS.forEach((k, i) => {
    const el = $(`[data-step="${k}"]`, sim)!;
    el.style.background = failAt === k ? '#FF220F' : i < idx ? '#00D8A7' : i === idx ? '#FEEA4D' : '#FFFFFF';
    el.style.color = failAt === k ? '#FFFFFF' : '';
  });
  const stop = () => { running = false; clearTimeout(timer); cutBtn.disabled = true; startBtn.disabled = false; };

  const rollback = (why: string) => {
    const t = other();
    say(why);
    say(idx <= 1 ? `boot: staying on slot ${active} ${slots[active].ver} (last known good)` : `boot: rolling back → slot ${active} ${slots[active].ver} (last known good)`);
    slots[t] = { ver: slots[t].ver, tag: 'REJECTED', color: '#FF220F', bar: slots[t].bar };
    say(`boot: verify slot ${active} · signature OK · jump`);
    paintSlots(); stop();
  };

  const advance = () => {
    if (!running) return;
    const t = other(), step = STEPS[idx];
    if (step === 'recv') {
      recv = Math.min(100, recv + 25);
      slots[t] = { ver: `v${ver + 1}.0`, tag: 'RECEIVING', color: '#FEEA4D', bar: recv };
      say(`uart: frame ${recv / 25}/4 · CRC-32 OK`);
      paintSlots();
      if (recv < 100) { timer = window.setTimeout(advance, 650); return; }
    }
    if (step === 'verify') {
      say('boot: SHA-256 digest computed · checking ECDSA P-256 signature…');
      if (tamper.checked) { paintSteps('verify'); rollback('boot: ✕ signature INVALID → image rejected, never executed'); return; }
      say('boot: ✓ signature valid');
      slots[t].tag = 'VERIFIED'; slots[t].color = '#00D8A7';
    }
    if (step === 'mark') { say(`flash: slot ${t} marked TRIAL (write-once flag)`); slots[t].tag = 'TRIAL'; slots[t].color = '#FEEA4D'; }
    if (step === 'reboot') { say('sys: reset → bootloader · VTOR relocated · jumping to trial image'); }
    if (step === 'trial') { say(`app ${slots[t].ver}: running on trial · confirmation timer started`); }
    if (step === 'confirm') {
      if (broken.checked) { paintSteps('confirm'); rollback(`app ${slots[t].ver}: ✕ never confirmed (crashed) → timer expired, reset`); return; }
      say(`app ${slots[t].ver}: self-check passed → CONFIRMED`);
      slots[active].tag = 'BACKUP'; slots[active].color = '#EEEEEA';
      slots[t].tag = 'ACTIVE'; slots[t].color = '#00D8A7';
      active = t; ver += 1; idx = STEPS.length;
      paintSlots(); paintSteps(); say('update complete ✓'); stop(); return;
    }
    paintSlots();
    idx += 1; paintSteps();
    timer = window.setTimeout(advance, 850);
  };

  startBtn.addEventListener('click', () => {
    if (running) return;
    const t = other();
    running = true; idx = 0; recv = 0;
    slots[t] = { ver: `v${ver + 1}.0`, tag: 'RECEIVING', color: '#FEEA4D', bar: 0 };
    startBtn.disabled = true; cutBtn.disabled = false;
    say(`\nhost: starting update → slot ${t}`);
    paintSlots(); paintSteps();
    timer = window.setTimeout(advance, 500);
  });

  cutBtn.addEventListener('click', () => {
    if (!running) return;
    clearTimeout(timer);
    const step = STEPS[Math.max(0, idx)];
    say(`\n⚡ POWER LOST during "${step}"`);
    say('boot: power-on · reading flash flags…');
    paintSteps(step);
    const t = other();
    if (idx <= 1) rollback(`boot: slot ${t} incomplete / unverified → ignored`);
    else rollback(`boot: slot ${t} in TRIAL but never confirmed → treat as failed`);
  });

  paintSlots(); paintSteps();
}
