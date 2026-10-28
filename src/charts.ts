// Small SVG charts with a tap/hover tooltip and a table view.
import { esc } from './html';

const W = 340;
const H = 180;
const PAD = { top: 26, right: 10, bottom: 24, left: 38 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export interface BarPoint {
  label: string; // axis label
  title: string; // tooltip/table label
  value: number;
}

export interface LinePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Round tick steps (1, 2, 5 x 10^n) giving about four gridlines.
function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 4 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));

function frame(yTicks: number[], y: (v: number) => number, unit: string): string {
  return yTicks.map((t) => `
    <line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="tick" x="${PAD.left - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')
    + `<text class="tick" x="0" y="11">${esc(unit)}</text>`;
}

function table(head: [string, string], rows: [string, string][]): string {
  return `<details class="chart-table"><summary>Show as table</summary><table>
    <thead><tr><th>${esc(head[0])}</th><th>${esc(head[1])}</th></tr></thead>
    <tbody>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></details>`;
}

// Bars rise from a zero baseline with a 4 px rounded top; an optional dashed goal line.
export function barChart(pts: BarPoint[], unit: string, goal?: number): string {
  const max = Math.max(...pts.map((p) => p.value), goal ?? 0, 1) * 1.08;
  const yTicks = ticks(0, max);
  const top = yTicks[yTicks.length - 1];
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  const slot = PLOT_W / pts.length;
  const bw = Math.min(28, slot - 2);
  const r = Math.min(4, bw / 2);
  const bars = pts.map((p, i) => {
    const x = PAD.left + i * slot + (slot - bw) / 2;
    const h = Math.max(0, y(0) - y(p.value));
    const rr = Math.min(r, h);
    const path = h > 0
      ? `M${x},${y(0)} V${y(p.value) + rr} Q${x},${y(p.value)} ${x + rr},${y(p.value)} H${x + bw - rr} Q${x + bw},${y(p.value)} ${x + bw},${y(p.value) + rr} V${y(0)} Z`
      : '';
    return `<path class="bar" d="${path}"/>
      <text class="tick" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(p.label)}</text>
      <rect class="hit" x="${PAD.left + i * slot}" y="${PAD.top}" width="${slot}" height="${PLOT_H}"
        data-tip="${esc(`${p.title}: ${fmt(p.value)} ${unit}`)}" data-x="${x + bw / 2}"/>`;
  }).join('');
  const goalLine = goal ? `<line class="goal" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(goal)}" y2="${y(goal)}"/>
    <text class="goal-label" x="${W - PAD.right}" y="${y(goal) - 4}" text-anchor="end">Goal ${fmt(goal)}</text>` : '';
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
      ${frame(yTicks, y, unit)}<line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(0)}" y2="${y(0)}"/>
      ${bars}${goalLine}<line class="crosshair" y1="${PAD.top}" y2="${y(0)}" visibility="hidden"/>
    </svg><div class="tip" hidden></div></div>`
    + table(['Day', unit], pts.map((p) => [p.title, fmt(p.value)]));
}

const dayNum = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// A 2 px line over time; markers when there are few enough points to read; an optional dashed goal line.
export function lineChart(pts: LinePoint[], unit: string, goal?: number | null): string {
  const vals = pts.map((p) => p.value).concat(goal ?? []);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const spread = Math.max(hi - lo, 1);
  const yTicks = ticks(lo - spread * 0.15, hi + spread * 0.15);
  const [y0, y1] = [yTicks[0], yTicks[yTicks.length - 1]];
  const y = (v: number) => PAD.top + PLOT_H - ((v - y0) / (y1 - y0)) * PLOT_H;
  const d0 = dayNum(pts[0].date);
  const span = Math.max(dayNum(pts[pts.length - 1].date) - d0, 1);
  const x = (date: string) => (pts.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + ((dayNum(date) - d0) / span) * PLOT_W);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.value)}`).join(' ');
  const markers = pts.length <= 31
    ? pts.map((p) => `<circle class="marker" cx="${x(p.date)}" cy="${y(p.value)}" r="4"/>`).join('') : '';
  const first = pts[0].date;
  const last = pts[pts.length - 1].date;
  const points = pts.map((p) => ({ x: x(p.date), y: y(p.value), tip: `${shortDate(p.date)}: ${fmt(p.value)} ${unit}` }));
  return `<div class="chart" data-points="${esc(JSON.stringify(points))}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart">
      ${frame(yTicks, y, unit)}<line class="axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${PAD.top + PLOT_H}" y2="${PAD.top + PLOT_H}"/>
      <text class="tick" x="${PAD.left}" y="${H - 6}">${esc(shortDate(first))}</text>
      ${last !== first ? `<text class="tick" x="${W - PAD.right}" y="${H - 6}" text-anchor="end">${esc(shortDate(last))}</text>` : ''}
      ${goal ? `<line class="goal" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(goal)}" y2="${y(goal)}"/>
        <text class="goal-label" x="${W - PAD.right}" y="${y(goal) - 4}" text-anchor="end">Goal ${fmt(goal)}</text>` : ''}
      <path class="line" d="${line}"/>${markers}
      <line class="crosshair" y1="${PAD.top}" y2="${PAD.top + PLOT_H}" visibility="hidden"/>
      <circle class="focus" r="5" visibility="hidden"/>
      <rect class="hit-area" x="${PAD.left}" y="${PAD.top}" width="${PLOT_W}" height="${PLOT_H}"/>
    </svg><div class="tip" hidden></div></div>`
    + table(['Date', unit], [...pts].reverse().map((p) => [shortDate(p.date), fmt(p.value)]));
}

// Tooltip + crosshair for every chart under `root`. Works with mouse hover and finger taps.
export function wireCharts(root: HTMLElement): void {
  for (const chart of root.querySelectorAll<HTMLElement>('.chart')) {
    const svg = chart.querySelector('svg')!;
    const tip = chart.querySelector<HTMLElement>('.tip')!;
    const cross = svg.querySelector<SVGLineElement>('.crosshair')!;
    const focus = svg.querySelector<SVGCircleElement>('.focus');
    const points = chart.dataset.points ? (JSON.parse(chart.dataset.points) as { x: number; y: number; tip: string }[]) : null;

    const show = (vx: number, vy: number, text: string) => {
      cross.setAttribute('x1', String(vx));
      cross.setAttribute('x2', String(vx));
      cross.setAttribute('visibility', 'visible');
      if (focus) {
        focus.setAttribute('cx', String(vx));
        focus.setAttribute('cy', String(vy));
        focus.setAttribute('visibility', 'visible');
      }
      tip.textContent = text;
      tip.hidden = false;
      const scale = svg.clientWidth / W;
      const left = Math.min(Math.max(vx * scale - tip.offsetWidth / 2, 0), chart.clientWidth - tip.offsetWidth);
      tip.style.left = `${left}px`;
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      focus?.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    };

    svg.addEventListener('pointermove', (e) => {
      if (points) {
        const vx = ((e.clientX - svg.getBoundingClientRect().left) / svg.clientWidth) * W;
        const near = points.reduce((a, b) => (Math.abs(b.x - vx) < Math.abs(a.x - vx) ? b : a));
        show(near.x, near.y, near.tip);
      } else {
        const hit = (e.target as Element).closest<SVGRectElement>('.hit');
        if (hit) show(Number(hit.dataset.x), 0, hit.dataset.tip!);
        else hide();
      }
    });
    svg.addEventListener('pointerdown', (e) => svg.dispatchEvent(new PointerEvent('pointermove', e)));
    svg.addEventListener('pointerleave', hide);
  }
}

// A circular meter: how much of `goal` is reached. `center` is HTML shown in the middle.
export function ring(value: number, goal: number, size: number, stroke: number, cls: string, center: string): string {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  const mid = size / 2;
  return `<div class="ring ${cls}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="track" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"/>
      ${share > 0 ? `<circle class="fill" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c * share} ${c}"
        transform="rotate(-90 ${mid} ${mid})"/>` : ''}
    </svg><div class="ring-center">${center}</div></div>`;
}

// Part-to-whole ring with a 2 px gap between segments. Each part's class sets its color.
export function donut(parts: { value: number; cls: string }[], size: number, stroke: number, center: string): string {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((sum, p) => sum + p.value, 0);
  const gap = shown.length > 1 ? 2 : 0;
  let at = 0;
  const segs = shown.map((p) => {
    const len = (p.value / total) * c;
    const seg = `<circle class="arc ${p.cls}" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(len - gap, 0.5)} ${c}" stroke-dashoffset="${-at}" transform="rotate(-90 ${mid} ${mid})"/>`;
    at += len;
    return seg;
  }).join('');
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="track" cx="${mid}" cy="${mid}" r="${r}" stroke-width="${stroke}"/>${segs}
    </svg><div class="ring-center">${center}</div></div>`;
}
