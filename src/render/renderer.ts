import { CANVAS } from '../config';
import { rotate, type Vec2 } from '../math/vec2';

const COLOR_BG = '#000';
const COLOR_FG = '#fff';
const LINE_WIDTH = 1;
const FONT_FAMILY = 'monospace';
const FONT_SIZE_DEFAULT = 16;

export function clearScreen(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, CANVAS.WIDTH, CANVAS.HEIGHT);
}

export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: Vec2[],
  closed: boolean = true
): void {
  if (points.length < 2) return;
  ctx.strokeStyle = COLOR_FG;
  ctx.lineWidth = LINE_WIDTH;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
}

export function drawCircleOutline(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radius: number
): void {
  ctx.strokeStyle = COLOR_FG;
  ctx.lineWidth = LINE_WIDTH;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawTriangle(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  heading: number,
  size: number
): void {
  const local: Vec2[] = [
    { x: size, y: 0 },
    { x: -size * 0.7, y: size * 0.6 },
    { x: -size * 0.7, y: -size * 0.6 },
  ];
  const points = local.map((p) => {
    const r = rotate(p, heading);
    return { x: r.x + center.x, y: r.y + center.y };
  });
  drawPolyline(ctx, points, true);
}

export function drawPoint(ctx: CanvasRenderingContext2D, p: Vec2, size: number = 2): void {
  ctx.fillStyle = COLOR_FG;
  const half = size / 2;
  ctx.fillRect(p.x - half, p.y - half, size, size);
}

export interface DrawTextOptions {
  align?: CanvasTextAlign;
  size?: number;
  color?: string;
  baseline?: CanvasTextBaseline;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  p: Vec2,
  options: DrawTextOptions = {}
): void {
  const size = options.size ?? FONT_SIZE_DEFAULT;
  const align = options.align ?? 'left';
  const color = options.color ?? COLOR_FG;
  const baseline = options.baseline ?? 'alphabetic';
  ctx.font = `${size}px ${FONT_FAMILY}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
}

export function withWrap(
  ctx: CanvasRenderingContext2D,
  position: Vec2,
  radius: number,
  draw: (offset: Vec2) => void
): void {
  draw({ x: 0, y: 0 });
  let ox = 0;
  let oy = 0;
  if (position.x < radius) ox = CANVAS.WIDTH;
  else if (position.x > CANVAS.WIDTH - radius) ox = -CANVAS.WIDTH;
  if (position.y < radius) oy = CANVAS.HEIGHT;
  else if (position.y > CANVAS.HEIGHT - radius) oy = -CANVAS.HEIGHT;
  if (ox !== 0) draw({ x: ox, y: 0 });
  if (oy !== 0) draw({ x: 0, y: oy });
  if (ox !== 0 && oy !== 0) draw({ x: ox, y: oy });
  void ctx;
}
