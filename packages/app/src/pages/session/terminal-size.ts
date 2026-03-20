const min = {
  cols: 20,
  rows: 6,
}

const pad = {
  x: 48,
  y: 16,
}

const cell = {
  cols: 8,
  rows: 22,
}

export function guessSize(input: {
  width: number
  height: number
}) {
  return {
    cols: Math.max(min.cols, Math.floor(Math.max(0, input.width - pad.x) / cell.cols)),
    rows: Math.max(min.rows, Math.round(Math.max(0, input.height - pad.y) / cell.rows)),
  }
}
