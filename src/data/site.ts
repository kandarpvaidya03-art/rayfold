// ─────────────────────────────────────────────────────────────
// All site content lives here. Edit this file to change text,
// links and numbers. Rule: only measured / verifiable numbers.
// ─────────────────────────────────────────────────────────────

export const person = {
  name: 'Kandarp Vaidya',
  role: 'Embedded Systems Engineer',
  location: 'Pune, India',
  email: 'kandarpvaidya03@gmail.com',
  github: 'https://github.com/kandarpvaidya03-art',
  linkedin: '', // TODO: paste your LinkedIn URL here; the button appears automatically
  resume: '/resume/Kandarp_Vaidya_Resume.pdf',
  repos: {
    iio: 'https://github.com/kandarpvaidya03-art/rpi-iio-driver', // TODO: confirm repo name
    boot: 'https://github.com/kandarpvaidya03-art/stm32-bootloader',
  },
};

export const heroStats = [
  { value: '3.2 kHz', label: 'sustained IIO capture, 0 dropped samples' },
  { value: '9.7 KB', label: 'signed bare-metal bootloader' },
  { value: '585–778', label: 'simulated power cuts per update, always recovered' },
  { value: '4', label: 'granted Indian design patents (2026)' },
];

export const layers = [
  { id: 'l0', code: 'L0', name: 'Gates', blurb: 'Logic down to the transistor pair' },
  { id: 'l1', code: 'L1', name: 'Registers', blurb: 'Bit fields, datasheets, memory maps' },
  { id: 'l2', code: 'L2', name: 'Firmware & drivers', blurb: 'Bare metal, bootloaders, kernel drivers' },
  { id: 'l3', code: 'L3', name: 'Operating systems', blurb: 'Linux IIO, Buildroot, FreeRTOS' },
  { id: 'l4', code: 'L4', name: 'Buses & networks', blurb: 'UART, I2C, SPI, MQTT, ZeroMQ, Wi-Fi' },
  { id: 'l5', code: 'L5', name: 'Systems & products', blurb: 'Architecture, BoMs, patents' },
];

export const iioSpec = [
  ['Sustained rate', '3.2 kHz', '0 dropped, 400 kHz I2C'],
  ['Polling peak', '~2.3 kHz', 'user-space baseline'],
  ['CPU / sample', '−57 to −62%', 'vs polling'],
  ['Long capture', '470,000', '10 min @ 800 Hz, no gaps'],
  ['Image size', '185 MB', 'Buildroot, loads at boot'],
  ['Style', 'clean', 'checkpatch --strict'],
];

export const bootSpec = [
  ['Footprint', '9.7 KB', 'no HAL, own startup + linker'],
  ['Signature', 'ECDSA P-256', '+ SHA-256, after transfer & every boot'],
  ['Transport', 'UART', 'CRC-32 framed protocol'],
  ['Flag states', '64 / 64', 'decision logic unit-tested'],
  ['Power cuts', '585–778', 'per update, simulated'],
  ['Recovery', 'always', 'unit + simulator tests in CI'],
];

export const debugLog: { id: string; where: string; title: string; symptom: string; ruledOut: string[]; cause: string; fix: string }[] = [
  {
    id: 'DBG-01',
    where: 'ESP32 · FreeRTOS · SPI',
    title: 'The LED matrix that went dark',
    symptom: 'After porting a P10 LED matrix driver from AVR to ESP32 (core 3.x), the panel stayed dark.',
    ruledOut: ['Logic-level mismatch', 'SPI timing'],
    cause: 'Init order: configuring the GPIOs after starting VSPI detached the pins from the SPI peripheral.',
    fix: 'Reordered initialisation, then added PWM-on-OE brightness control (0–100%).',
  },
  {
    id: 'DBG-02',
    where: 'Linux · Buildroot · I2C',
    title: 'Driver never bound at boot',
    symptom: 'In the minimal Buildroot image, the driver failed to bind to the ADXL345.',
    ruledOut: [],
    cause: 'The I2C controller module was not loading, so there was no bus for the device to appear on.',
    fix: 'Got the controller module loading at boot; the driver now autoloads by modalias.',
  },
  {
    id: 'DBG-03',
    where: 'Python · simulation · host tools',
    title: 'The simulator caught my own tool',
    symptom: 'The power-cut simulator flagged a failure during an update run.',
    ruledOut: [],
    cause: 'A bug in the host-side update tool, not in the firmware.',
    fix: 'Fixed the host tool; the simulator now runs in CI so it stays caught.',
  },
  {
    id: 'DBG-04',
    where: 'Mechanics · CNC plotter',
    title: 'Wobbly lines on a CNC plotter',
    symptom: 'Plotted output showed motion artifacts.',
    ruledOut: [],
    cause: 'Mechanical tolerance and gear-meshing faults.',
    fix: 'Iterative 3D-printed part revisions until the artifacts were gone.',
  },
];

export const toolbox = [
  { group: 'Languages', items: ['C', 'Embedded C', 'C++', 'Python', 'C# (.NET)'] },
  { group: 'Embedded', items: ['Bare-metal', 'FreeRTOS', 'Interrupts', 'Timers', 'PWM', 'ADC', 'GPIO', 'Bootloaders', 'Firmware update'] },
  { group: 'Embedded Linux', items: ['Kernel drivers', 'IIO', 'regmap', 'IRQs', 'Device-tree overlays', 'Buildroot', 'Cross-compilation'] },
  { group: 'Buses & networks', items: ['UART', 'I2C', 'SPI', 'MQTT', 'ZeroMQ'] },
  { group: 'MCUs & boards', items: ['STM32 (Cortex-M)', 'ESP32', 'ATmega328P', 'Raspberry Pi'] },
  { group: 'Toolchain & debug', items: ['arm-none-eabi-gcc', 'OpenOCD', 'Make', 'Git', 'GitHub Actions', 'pytest', 'checkpatch'] },
  { group: 'Bench', items: ['Oscilloscope', 'Multimeter', 'KiCad', '3D printing'] },
];

export const timeline = [
  { when: '2021', what: 'B.Tech, Electronics & Communication', where: 'IIIT Surat', note: 'Graduated 2025 · CGPA 7.8/10' },
  { when: 'Jan 2025', what: 'R&D Intern', where: 'PHN Technology, Pune', note: '35+ embedded projects, 60+ sensor validation rig' },
  { when: 'Aug 2025', what: 'Embedded Systems Engineer, R&D', where: 'PHN Technology, Pune', note: 'ESP32 drivers, system architecture, debugging' },
  { when: '2026', what: '4 Indian design patents granted', where: 'IoT & solar product designs', note: '' },
  { when: '2026', what: 'Presented at COMPUTEX', where: "To Acer's Taipei R&D team", note: '' },
  { when: '2026', what: 'Linux IIO driver + signed STM32 bootloader', where: 'Solo projects, open source', note: 'Measured, tested, in CI' },
];
