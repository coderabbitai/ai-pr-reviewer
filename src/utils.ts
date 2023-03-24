import * as core from '@actions/core'

export const retry = async (
  fn: Function,
  args: any[],
  times: number
): Promise<any> => {
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
