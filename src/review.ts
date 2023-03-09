import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {Commenter} from './commenter.js'
import {Inputs, Options, Prompts} from './options.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

export const codeReview = async (
  bot: Bot,
  options: Options,
  prompts: Prompts
) => {
  if (
    context.eventName !== 'pull_request' &&
    context.eventName !== 'pull_request_target'
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

  const inputs: Inputs = new Inputs()
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
  const {files, commits} = diff.data
  if (!files) {
    core.warning(`Skipped: diff.data.files is null`)
    return
  }

  // find existing comments
  // const comments = await list_review_comments(
  //   context.payload.pull_request.number
  // )
  // const comments_and_lines = comments.map(comment => {
  //   return {
  //     comment,
  //     line: ensure_line_number(comment.line)
  //   }
  // })

  // find patches to review
  const files_to_review: [string, string, string, [number, string][]][] = []
  for (const file of files) {
    if (!options.check_path(file.filename)) {
      core.info(`skip for excluded path: ${file.filename}`)
      continue
    }
    // retrieve file contents
    let file_content = ''
    try {
      const contents = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: file.filename,
        ref: context.payload.pull_request.base.sha
      })
      if (contents.data) {
        if (!Array.isArray(contents.data)) {
          if (contents.data.type === 'file' && contents.data.content) {
            file_content = Buffer.from(
              contents.data.content,
              'base64'
            ).toString()
          }
        }
      }
    } catch (error) {
      core.warning(`Failed to get file contents: ${error}, skipping.`)
    }

    let file_diff = ''
    if (file.patch) {
      core.info(`diff for ${file.filename}: ${file.patch}`)
      file_diff = file.patch
    }

    const patches: [number, string][] = []
    for (const patch of split_patch(file.patch)) {
      const line = patch_comment_line(patch)
      // skip existing comments
      // if (
      //   comments_and_lines.some(comment => {
      //     return comment.comment.path === file.filename && comment.line === line
      //   })
      // ) {
      //   core.info(`skip for existing comment: ${file.filename}, ${line}`)
      //   continue
      // }
      patches.push([line, patch])
    }
    if (patches.length > 0) {
      files_to_review.push([file.filename, file_content, file_diff, patches])
    }
  }

  if (files_to_review.length > 0) {
    const commenter: Commenter = new Commenter()
    const [, review_begin_ids] = await bot.chat(
      prompts.render_review_beginning(inputs),
      {}
    )
    let next_review_ids = review_begin_ids

    const [, scoring_begin_ids] = await bot.chat(
      prompts.render_scoring_beginning(inputs),
      {}
    )
    let next_scoring_ids = scoring_begin_ids

    for (const [
      filename,
      file_content,
      file_diff,
      patches
    ] of files_to_review) {
      inputs.filename = filename
      // reset session for each file while reviewing
      next_review_ids = review_begin_ids
      if (file_content.length > 0) {
        inputs.file_content = file_content
        // review file
        const [resp, review_file_ids] = await bot.chat(
          prompts.render_review_file(inputs),
          next_review_ids
        )
        if (!resp) {
          core.info('review: nothing obtained from chatgpt')
        } else {
          next_review_ids = review_file_ids
        }
      }

      if (file_diff.length > 0) {
        inputs.file_diff = file_diff
        // review diff
        const [resp, review_diff_ids] = await bot.chat(
          prompts.render_review_file_diff(inputs),
          next_review_ids
        )
        if (!resp) {
          core.info('review: nothing obtained from chatgpt')
        } else {
          next_review_ids = review_diff_ids
        }

        // score diff
        const [scoring_resp, scoring_diff_ids] = await bot.chat(
          prompts.render_scoring_file_diff(inputs),
          next_scoring_ids
        )
        if (!scoring_resp) {
          core.info('scoring: nothing obtained from chatgpt')
        } else {
          next_scoring_ids = scoring_diff_ids
        }
      }

      // review_patch_begin
      const [, patch_begin_ids] = await bot.chat(
        prompts.render_review_patch_begin(inputs),
        next_review_ids
      )
      next_review_ids = patch_begin_ids

      for (const [line, patch] of patches) {
        core.info(`Reviewing ${filename}:${line} with chatgpt ...`)
        inputs.patch = patch
        const [response, patch_ids] = await bot.chat(
          prompts.render_review_patch(inputs),
          next_review_ids
        )
        if (!response) {
          core.info('review: nothing obtained from chatgpt')
          continue
        }
        next_review_ids = patch_ids
        if (!options.review_comment_lgtm && response.includes('LGTM!')) {
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
        } catch (e: any) {
          core.warning(`Failed to comment: ${e}, skipping.
        backtrace: ${e.stack}
        filename: ${filename}
        line: ${line}
        patch: ${patch}`)
        }
      }
    }
    // final score
    const [scoring_final_response] = await bot.chat(
      prompts.render_scoring(inputs),
      next_scoring_ids
    )
    if (!scoring_final_response) {
      core.info('scoring: nothing obtained from chatgpt')
      return
    }

    const tag = '<!-- This is an auto-generated comment: scoring by chatgpt -->'
    await commenter.comment(
      `:robot: ChatGPT score: ${scoring_final_response}`,
      tag,
      'replace'
    )
  }
}

// const list_review_comments = async (target: number, page: number = 1) => {
//   let {data: comments} = await octokit.pulls.listReviewComments({
//     owner: repo.owner,
//     repo: repo.repo,
//     pull_number: target,
//     page: page,
//     per_page: 100
//   })
//   if (!comments) {
//     return []
//   }
//   if (comments.length >= 100) {
//     comments = comments.concat(await list_review_comments(target, page + 1))
//     return comments
//   } else {
//     return comments
//   }
// }

const split_patch = (patch: string | null | undefined): string[] => {
  if (!patch) {
    return []
  }

  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm

  const result: string[] = []
  let last = -1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(patch)) !== null) {
    if (last === -1) {
      last = match.index
    } else {
      result.push(patch.substring(last, match.index))
    }
  }
  if (last !== -1) {
    result.push(patch.substring(last))
  }
  return result
}

const patch_comment_line = (patch: string): number => {
  const pattern = /(^@@ -(\d+),(\d+) \+(?<begin>\d+),(?<diff>\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match && match.groups) {
    return parseInt(match.groups.begin) + parseInt(match.groups.diff) - 1
  } else {
    return -1
  }
}

// const ensure_line_number = (line: number | null | undefined): number => {
//   return line === null || line === undefined ? 0 : line
// }
