import { describe, expect, test } from "bun:test"
import { guessSize } from "./terminal-size"

describe("guessSize", () => {
  test("estimates terminal rows and cols from panel bounds", () => {
    expect(
      guessSize({
        width: 960,
        height: 720,
      }),
    ).toEqual({
      cols: 114,
      rows: 32,
    })
  })

  test("keeps a safe minimum for very small panels", () => {
    expect(
      guessSize({
        width: 120,
        height: 80,
      }),
    ).toEqual({
      cols: 20,
      rows: 6,
    })
  })
})
