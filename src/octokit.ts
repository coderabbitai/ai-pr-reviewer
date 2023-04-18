import * as core from '@actions/core'
import {Octokit} from '@octokit/action'
import {retry} from '@octokit/plugin-retry'
import {throttling} from '@octokit/plugin-throttling'

const token = core.getInput('token') || process.env.GITHUB_TOKEN

const RetryAndThrottlingOctokit = Octokit.plugin(throttling, retry)
export const octokit = new RetryAndThrottlingOctokit({
  auth: `token ${token}`,
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: any,
      o: Octokit,
      retryCount: number
    ) => {
      core.warning(
        `Request quota exhausted for request ${options.method} ${options.url}
Retry after: ${retryAfter} seconds
Retry count: ${retryCount}
`
      )
      return true
    },
    onSecondaryRateLimit: (retryAfter: number, options: any, o: Octokit) => {
      core.warning(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`
      )
      return true
    }
  },
  retry: {
    doNotRetry: ['429'],
    maxRetries: 10
  }
})
