export interface Band { top: number; bottom: number }

// Measure short horizontal ink transitions to ignore a dark table or paper edge.
export function inkBands(pixels: Uint8ClampedArray, width: number, height: number): Band[] {
  const bands: Band[] = []
  let start = -1, last = -1
  const gap = Math.max(1, Math.round(width / 650))
  const finish = () => {
    if (start >= 0 && last - start >= 2) bands.push({ top: start, bottom: last + 1 })
    start = -1
  }
  for (let y = 0; y < height; y++) {
    let edges = 0
    for (let x = 2; x < width; x += 2) {
      const i = (y * width + x) * 4
      if (pixels[i - 8] - pixels[i] > 30) edges++
    }
    if (edges >= Math.max(3, width / 350)) {
      if (start < 0) start = y
      last = y
    } else if (y - last > gap) finish()
  }
  finish()
  return bands
}

export async function photoCanvas(photo: string, quarterTurn = false) {
  const img = new Image()
  img.src = photo
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = quarterTurn ? img.height : img.width
  canvas.height = quarterTurn ? img.width : img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Cannot read this photo.')
  if (quarterTurn) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2) }
  ctx.drawImage(img, 0, 0)
  return canvas
}

// Local background subtraction preserves faded ink in uneven lighting.
export function enhance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const stride = width + 1
  const integral = new Uint32Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10
      sum += data[i]
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum
    }
  }
  const radius = Math.max(10, Math.round(width / 28))
  for (let y = 0; y < height; y++) {
    const t = Math.max(0, y - radius), b = Math.min(height, y + radius + 1)
    for (let x = 0; x < width; x++) {
      const l = Math.max(0, x - radius), r = Math.min(width, x + radius + 1)
      const mean = (integral[b * stride + r] - integral[t * stride + r] - integral[b * stride + l] + integral[t * stride + l]) / ((r - l) * (b - t))
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 250 - Math.max(0, mean - data[i]) * 2.8
    }
  }
  ctx.putImageData(image, 0, 0)
  return inkBands(data, width, height)
}

// Score horizontal alignment at thumbnail resolution, then shear the full image.
// Padding retains both edges and gives a reversible mapping to the photo.
export function straighten(canvas: HTMLCanvasElement) {
  const probe = document.createElement('canvas')
  probe.width = Math.min(canvas.width, 420)
  probe.height = Math.max(1, Math.round(canvas.height * probe.width / canvas.width))
  const ctx = probe.getContext('2d')!
  ctx.drawImage(canvas, 0, 0, probe.width, probe.height)
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
  const points: number[] = []
  for (let y = 1; y < probe.height; y++) {
    for (let x = 1; x < probe.width; x += 2) {
      const i = 4 * (y * probe.width + x)
      if (data[i - 4] - data[i] > 40) points.push(x, y)
    }
  }
  const score = (slope: number) => {
    const counts = new Uint32Array(probe.height + probe.width)
    let sum = 0
    for (let i = 0; i < points.length; i += 2) {
      const y = Math.round(points[i + 1] - slope * points[i] + probe.width / 2)
      sum += 2 * counts[y]++ + 1
    }
    return sum
  }
  let best = score(0) * 1.08, slope = 0
  for (let degree = -7; degree <= 7; degree += 0.5) {
    const trial = Math.tan(degree * Math.PI / 180)
    const value = score(trial)
    if (value > best) { best = value; slope = trial }
  }
  probe.width = probe.height = 1
  const shift = slope * canvas.width
  const pad = Math.max(0, shift)
  const height = canvas.height
  if (slope) {
    const copy = document.createElement('canvas')
    copy.width = canvas.width; copy.height = height
    copy.getContext('2d')!.drawImage(canvas, 0, 0)
    canvas.height = height + Math.ceil(Math.abs(shift))
    const target = canvas.getContext('2d')!
    target.fillStyle = 'white'
    target.fillRect(0, 0, canvas.width, canvas.height)
    target.setTransform(1, -slope, 0, 1, 0, pad)
    target.drawImage(copy, 0, 0)
    target.resetTransform()
    copy.width = copy.height = 1
  }
  return (band: Band) => ({
    top: Math.max(0, (band.top - pad + Math.min(0, shift)) / height),
    bottom: Math.min(1, (band.bottom - pad + Math.max(0, shift)) / height),
  })
}
