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
import {Prompts, Inputs, Options} from './options.js'

export const codeReview = async (
  bot: Bot,
  options: Options,
  prompts: Prompts
) => {
  if (
    context.eventName != 'pull_request' &&
    context.eventName != 'pull_request_target'
  ) {
    core.warning(
      `Skipped: current event is ${context.eventName}, only support pull_request event`
    )
    return
  }

  if (!context.payload.pull_request) {
    core.warning(`Skipped: context.payload.pull_request is null`)
    return
  }

  let inputs: Inputs = new Inputs()
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body) {
    inputs.description = context.payload.pull_request.body
  } else {
    inputs.description = context.payload.pull_request.title
  }

  // collect diff chunks
  const diff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  })
  let {files, commits} = diff.data
  if (!files) {
    core.warning(`Skipped: diff.data.files is null`)
    return
  }

  // find existing comments
  const comments = await list_review_comments(
    context.payload.pull_request.number
  )
  const comments_and_lines = comments.map(comment => {
    return {
      comment: comment,
      line: ensure_line_number(comment.line)
    }
  })

  // find patches to review
  let patches: Array<[string, number, string]> = []
  for (let file of files) {
    if (!options.check_path(file.filename)) {
      core.info(`skip for excluded path: ${file.filename}`)
      continue
    }
    for (let patch of split_patch(file.patch)) {
      let line = patch_comment_line(patch)
      // skip existing comments
      if (
        comments_and_lines.some(comment => {
          return comment.comment.path === file.filename && comment.line === line
        })
      ) {
        core.info(`skip for existing comment: ${file.filename}, ${line}`)
        continue
      }
      patches.push([file.filename, line, patch])
    }
  }

  if (patches.length > 0) {
    await bot.chat('review', prompts.render_review_beginning(inputs), true)
  }

  const commenter: Commenter = new Commenter()
  for (let [filename, line, patch] of patches) {
    core.info(`Reviewing ${filename}:${line} with chatgpt ...`)
    inputs.filename = filename
    inputs.patch = patch
    const response = await bot.chat(
      'review',
      prompts.render_review_patch(inputs)
    )
    if (!response) {
      core.info("review: nothing obtained from chatgpt")
      continue
    }
    if (!options.review_comment_lgtm && response.indexOf('LGTM!') != -1) {
      continue
    }
    try {
      await commenter.review_comment(
        context.payload.pull_request.number,
        commits[commits.length - 1].sha,
        filename,
        line,
        response.startsWith('ChatGPT')
          ? `:robot: ${response}`
          : `:robot: ChatGPT: ${response}`
      )
    } catch (e) {
      core.warning(`Failed to comment: ${e}, skip this comment.
        filename: ${filename}
        line: ${line}
        patch: ${patch}`)
    }
  }
}

const list_review_comments = async (target: number, page: number = 1) => {
  let {data: comments} = await octokit.pulls.listReviewComments({
    owner: repo.owner,
    repo: repo.repo,
    pull_number: target,
    page: page,
    per_page: 100
  })
  if (!comments) {
    return []
  }
  if (comments.length >= 100) {
    comments = comments.concat(await list_review_comments(target, page + 1))
    return comments
  } else {
    return comments
  }
}

const split_patch = (patch: string | null | undefined): Array<string> => {
  if (!patch) {
    return []
  }

  let pattern: RegExp = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm

  let result: Array<string> = []
  let last = -1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(patch)) !== null) {
    if (last == -1) {
      last = match.index
    } else {
      result.push(patch.substring(last, match.index))
    }
  }
  if (last != -1) {
    result.push(patch.substring(last))
  }
  return result
}

const patch_comment_line = (patch: string): number => {
  let pattern = /(^@@ -(\d+),(\d+) \+(?<begin>\d+),(?<diff>\d+) @@)/gm
  let match = pattern.exec(patch)
  if (match && match.groups) {
    return parseInt(match.groups.begin) + parseInt(match.groups.diff) - 1
  } else {
    return -1
  }
}

const ensure_line_number = (line: number | null | undefined): number => {
  return line === null || line === undefined ? 0 : line
}
