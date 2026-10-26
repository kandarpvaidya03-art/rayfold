// ADXL345 register model (bit layouts per the ADXL345 datasheet).
// Shared by the server render and the client-side explorer.

export interface Bit { name: string; reserved?: boolean }
export interface Reg { key: string; name: string; addr: number; reset: number; bits: Bit[]; preset?: { value: number; label: string } }

const R = (name: string): Bit => ({ name });
const Z: Bit = { name: '0', reserved: true };

export const REGS: Reg[] = [
  {
    key: 'bw', name: 'BW_RATE', addr: 0x2c, reset: 0x0a,
    bits: [Z, Z, Z, R('LOW_POWER'), R('RATE3'), R('RATE2'), R('RATE1'), R('RATE0')],
    preset: { value: 0x0f, label: "My driver's setting" },
  },
  {
    key: 'df', name: 'DATA_FORMAT', addr: 0x31, reset: 0x00,
    bits: [R('SELF_TEST'), R('SPI'), R('INT_INVERT'), Z, R('FULL_RES'), R('JUSTIFY'), R('RANGE1'), R('RANGE0')],
  },
  {
    key: 'pc', name: 'POWER_CTL', addr: 0x2d, reset: 0x00,
    bits: [Z, Z, R('LINK'), R('AUTO_SLEEP'), R('MEASURE'), R('SLEEP'), R('WAKEUP1'), R('WAKEUP0')],
    preset: { value: 0x08, label: 'Start measuring' },
  },
];

const ODR = ['0.10', '0.20', '0.39', '0.78', '1.56', '3.13', '6.25', '12.5', '25', '50', '100', '200', '400', '800', '1600', '3200'];

export function decode(reg: Reg, v: number): string[] {
  const b = (n: number) => (v >> n) & 1;
  if (reg.key === 'bw') {
    const rate = v & 0x0f, odr = parseFloat(ODR[rate]);
    const out = [`Output data rate <b>${ODR[rate]} Hz</b> · bandwidth ${(odr / 2).toString()} Hz`];
    if (b(4)) out.push(odr >= 12.5 && odr <= 400 ? 'Low-power mode (more noise, less current)' : '<span class="text-signal-text">Low-power mode is only valid from 12.5 to 400 Hz</span>');
    else out.push('Normal power mode');
    if (rate === 0x0f) out.push('↳ the rate my IIO driver sustained with <b>0 dropped samples</b>');
    return out;
  }
  if (reg.key === 'df') {
    const range = [2, 4, 8, 16][v & 3];
    const lsb = b(3) ? '4 mg/LSB, full resolution (up to 13-bit)' : `${(3.9 * 2 ** (v & 3)).toFixed(1)} mg/LSB, 10-bit`;
    return [
      `Range <b>±${range} g</b> · ${lsb}`,
      b(2) ? 'Left-justified (MSB) data' : 'Right-justified, sign-extended data',
      b(5) ? 'Interrupts active-low' : 'Interrupts active-high',
      b(6) ? '3-wire SPI (only matters on SPI)' : '4-wire SPI (only matters on SPI)',
      b(7) ? 'Self-test force applied to the sensor' : 'Self-test off',
    ];
  }
  const wake = [8, 4, 2, 1][v & 3];
  return [
    b(3) ? '<b>Measurement mode</b>, sampling' : '<b>Standby</b>, not sampling',
    b(2) ? `Sleep mode, reading at ${wake} Hz` : 'Sleep off',
    b(4) ? 'Auto-sleep on activity threshold' : 'Auto-sleep off',
    b(5) ? 'Activity / inactivity linked' : 'Activity / inactivity independent',
  ];
}

const hex = (n: number) => '0x' + n.toString(16).toUpperCase().padStart(2, '0');

export function renderReg(reg: Reg, v: number): string {
  const cells = reg.bits.map((bit, i) => {
    const n = 7 - i, on = (v >> n) & 1;
    return `<button type="button" class="group flex flex-col items-stretch text-left disabled:cursor-not-allowed" data-bit="${n}" ${bit.reserved ? 'disabled' : ''} aria-pressed="${on ? 'true' : 'false'}" aria-label="Bit D${n} ${bit.reserved ? 'reserved' : bit.name}, ${on}">
      <span class="h-9 truncate px-1 font-mono text-[9px] font-bold leading-tight text-muted sm:text-[10px]">D${n}<br>${bit.reserved ? '—' : bit.name}</span>
      <span class="grid h-12 place-items-center border-2 border-ink font-mono text-xl font-bold transition-colors ${bit.reserved ? 'bg-paper text-muted' : on ? 'bg-cobalt text-hazard' : 'bg-white group-hover:bg-hazard'}">${on}</span>
    </button>`;
  }).join('');
  const lines = decode(reg, v).map((l) => `<li class="flex gap-2"><span aria-hidden="true">▸</span><span>${l}</span></li>`).join('');
  const addrW = hex(0x53 << 1);
  return `
  <div class="grid grid-cols-8 gap-1">${cells}</div>
  <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
    <div class="bg-ink px-4 py-3 font-mono text-hazard">
      <div class="text-[11px] uppercase text-[#B9B9C4]">${reg.name} @ ${hex(reg.addr)}</div>
      <div class="text-3xl font-bold" data-reg-hex>${hex(v)}</div>
      <div class="text-xs text-[#D9D9E0]">0b${v.toString(2).padStart(8, '0')}</div>
    </div>
    <ul class="space-y-1 self-center text-[15px] leading-snug">${lines}</ul>
  </div>
  <div class="mt-5 overflow-x-auto">
    <div class="fig mb-1.5 text-muted">On the wire (I2C write to 0x53)</div>
    <div class="flex min-w-max font-mono text-[12px] font-bold">
      <span class="border-2 border-ink bg-paper px-2 py-1.5">S</span>
      <span class="-ml-[2px] border-2 border-ink bg-white px-2 py-1.5">${addrW} <span class="font-normal text-muted">addr+W</span></span>
      <span class="-ml-[2px] border-2 border-ink bg-mint px-2 py-1.5">A</span>
      <span class="-ml-[2px] border-2 border-ink bg-white px-2 py-1.5">${hex(reg.addr)} <span class="font-normal text-muted">reg</span></span>
      <span class="-ml-[2px] border-2 border-ink bg-mint px-2 py-1.5">A</span>
      <span class="-ml-[2px] border-2 border-ink bg-hazard px-2 py-1.5">${hex(v)} <span class="font-normal text-muted">data</span></span>
      <span class="-ml-[2px] border-2 border-ink bg-mint px-2 py-1.5">A</span>
      <span class="-ml-[2px] border-2 border-ink bg-paper px-2 py-1.5">P</span>
    </div>
  </div>
  <pre class="code mt-4"><span class="c">/* in the kernel driver */</span>
<span class="k">regmap_write</span>(st-&gt;regmap, <span class="n">ADXL345_REG_${reg.name}</span>, <span class="n">${hex(v)}</span>);</pre>`;
}
