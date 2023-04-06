import * as core from '@actions/core'

export const retry = async <T = unknown>(
  fn: Function,
  args: unknown[],
  times: number
): Promise<T | undefined> => {
  for (let i = 0; i < times; i++) {
    try {
      return await fn(...args)
    } catch (error) {
      if (i === times - 1) {
        throw error
      }
      core.warning(`Function failed on try ${i + 1}, retrying...`)
      continue
    }
  }
}
