import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { cwd } from "process"

describe("Storybook Configuration", () => {
  const baseDir = cwd()

  it("should have storybook main config", () => {
    const configPath = join(baseDir, ".storybook/main.ts")
    expect(existsSync(configPath)).toBe(true)
  })

  it("should have storybook preview config", () => {
    const configPath = join(baseDir, ".storybook/preview.tsx")
    expect(existsSync(configPath)).toBe(true)
  })

  it("should have Button.stories component", () => {
    const storyPath = join(baseDir, "src/components/ui/Button.stories.tsx")
    expect(existsSync(storyPath)).toBe(true)
  })

  it("should configure a11y addon in main config", () => {
    const configPath = join(baseDir, ".storybook/main.ts")
    const config = readFileSync(configPath, "utf-8")
    expect(config).toContain("@storybook/addon-a11y")
  })

  it("should include tailwind css in preview", () => {
    const previewPath = join(baseDir, ".storybook/preview.tsx")
    const preview = readFileSync(previewPath, "utf-8")
    expect(preview).toContain("@/index.css")
  })
})
