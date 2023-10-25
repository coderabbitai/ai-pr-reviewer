import {getInput, warning} from '@actions/core'
import {Octokit} from '@octokit/action'
import {retry} from '@octokit/plugin-retry'
import {throttling} from '@octokit/plugin-throttling'
import dotenv from 'dotenv';
import { createAppAuth } from '@octokit/auth-app';
// // eslint-disable-next-line import/no-commonjs
// import { Octokit } from '@octokit/rest';

dotenv.config();

const token = getInput('token') || process.env.GITHUB_TOKEN

const RetryAndThrottlingOctokit = Octokit.plugin(throttling, retry)

console.log(process.env.NODE_DEV)

export const octokit = process.env.NODE_DEV ? new RetryAndThrottlingOctokit({
  authStrategy: createAppAuth,
  auth: {
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    installationId: process.env.INSTALLATION_ID,
    appId: process.env.GITHUB_APP_ID,
    privateKey:
      process.env.GITHUB_APP_PEM_FILE &&
      process.env.GITHUB_APP_PEM_FILE.replace(/\\n/g, '\n')
  },
  // auth: `${getGITToken()}`,
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: any,
      _o: any,
      retryCount: number
    ) => {
      console.log(
        `Request quota exhausted for request ${options.method} ${options.url}
Retry after: ${retryAfter} seconds
Retry count: ${retryCount}
`
      )
      return true
    },
    onSecondaryRateLimit: (_retryAfter: number, options: any) => {
      console.log(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`
      )
      return true
    }
  },
  retry: {
    doNotRetry: ['429'],
    maxRetries: 10
  }
}) : new RetryAndThrottlingOctokit({
  auth: `token ${token}`,
  throttle: {
    onRateLimit: (
      retryAfter: number,
      options: any,
      _o: any,
      retryCount: number
    ) => {
      warning(
        `Request quota exhausted for request ${options.method} ${options.url}
Retry after: ${retryAfter} seconds
Retry count: ${retryCount}
`
      )
      if (retryCount <= 3) {
        warning(`Retrying after ${retryAfter} seconds!`)
        return true
      }
    },
    onSecondaryRateLimit: (retryAfter: number, options: any) => {
      warning(
        `SecondaryRateLimit detected for request ${options.method} ${options.url} ; retry after ${retryAfter} seconds`
      )
      // if we are doing a POST method on /repos/{owner}/{repo}/pulls/{pull_number}/reviews then we shouldn't retry
      if (
        options.method === 'POST' &&
        options.url.match(/\/repos\/.*\/.*\/pulls\/.*\/reviews/)
      ) {
        return false
      }
      return true
    }
  }
})



