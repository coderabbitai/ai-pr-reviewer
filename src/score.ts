import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

import {Bot} from './bot.js'
import {Commenter} from './commenter.js'
import {Prompts, Inputs} from './prompt.js'

export const scorePullRequest = async (bot: Bot, prompts: Prompts) => {
  if (
    context.eventName != 'pull_request' &&
    context.eventName != 'pull_request_target'
  ) {
    core.warning(
      `Skipped: current event is ${context.eventName}, only support pull_request event`
    )
    return
  }

  // compute the diff
  if (!context.payload.pull_request) {
    core.warning(`Skipped: context.payload.pull_request is null`)
    return
  }

  const inputs: Inputs = new Inputs()
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body) {
    inputs.description = context.payload.pull_request.body
  } else {
    inputs.description = context.payload.pull_request.title
  }

  // collect diff chunks
  const { data: diff } = await octokit.pulls.get({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: context.payload.pull_request.number,
    mediaType: {
      format: 'diff'
    }
  })
  inputs.diff = `${diff}`

  const tag = '<!-- This is an auto-generated comment: scoring by chatgpt -->'
  const response = await bot.talk('score', prompts.render_scoring(inputs))
  const commenter = new Commenter()
  await commenter.comment(`[chatgpt] ${response}`, tag, 'replace')
}
