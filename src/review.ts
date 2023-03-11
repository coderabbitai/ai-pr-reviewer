import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {Commenter} from './commenter.js'
import {Inputs, Options, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo
const description_tag =
  '<!-- This is an auto-generated comment: release notes by chatgpt -->'
const description_tag_end =
  '<!-- end of auto-generated comment: release notes by chatgpt -->'

const MAX_TOKENS_FOR_EXTRA_CONTENT = 2500

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
    // remove our summary from description by looking for description_tag and description_tag_end
    const start = inputs.description.indexOf(description_tag)
    const end = inputs.description.indexOf(description_tag_end)
    if (start >= 0 && end >= 0) {
      inputs.description =
        inputs.description.slice(0, start) +
        inputs.description.slice(end + description_tag_end.length)
    }
  }
  // as gpt-3.5-turbo isn't paying attention to system message, add to inputs for now
  inputs.system_message = options.system_message

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
      patches.push([line, patch])
    }
    if (patches.length > 0) {
      files_to_review.push([file.filename, file_content, file_diff, patches])
    }
  }

  if (files_to_review.length > 0) {
    const commenter: Commenter = new Commenter()

    // Summary Stage
    const [, summarize_begin_ids] = await bot.chat(
      prompts.render_summarize_beginning(inputs),
      {}
    )
    let next_summarize_ids = summarize_begin_ids
    for (const [filename, file_content, file_diff] of files_to_review) {
      inputs.filename = filename
      inputs.file_content = file_content
      inputs.file_diff = file_diff
      if (file_diff.length > 0) {
        // summarize diff
        const [summarize_resp, summarize_diff_ids] = await bot.chat(
          prompts.render_summarize_file_diff(inputs),
          next_summarize_ids
        )
        if (!summarize_resp) {
          core.info('summarize: nothing obtained from chatgpt')
        } else {
          next_summarize_ids = summarize_diff_ids
        }
      }
    }
    // final summary
    const [summarize_final_response, summarize_final_response_ids] =
      await bot.chat(prompts.render_summarize(inputs), next_summarize_ids)
    if (!summarize_final_response) {
      core.info('summarize: nothing obtained from chatgpt')
    } else {
      inputs.summary = summarize_final_response

      next_summarize_ids = summarize_final_response_ids
      const tag =
        '<!-- This is an auto-generated comment: summarize by chatgpt -->'
      await commenter.comment(`${summarize_final_response}`, tag, 'replace')
    }

    // final release notes
    const [release_notes_response, release_notes_ids] = await bot.chat(
      prompts.render_summarize_release_notes(inputs),
      next_summarize_ids
    )
    if (!release_notes_response) {
      core.info('release notes: nothing obtained from chatgpt')
    } else {
      next_summarize_ids = release_notes_ids
      // add this response to the description field of the PR as release notes by looking
      // for the tag (marker)
      try {
        const description = inputs.description

        // find the tag in the description and replace the content between the tag and the tag_end
        // if not found, add the tag and the content to the end of the description
        const tag_index = description.indexOf(description_tag)
        const tag_end_index = description.indexOf(description_tag_end)
        if (tag_index === -1 || tag_end_index === -1) {
          let new_description = description
          new_description += description_tag
          new_description += '\n### Summary by ChatGPT\n'
          new_description += release_notes_response
          new_description += '\n'
          new_description += description_tag_end
          await octokit.pulls.update({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: context.payload.pull_request.number,
            body: new_description
          })
        } else {
          let new_description = description.substring(0, tag_index)
          new_description += description_tag
          new_description += '\n### Summary by ChatGPT\n'
          new_description += release_notes_response
          new_description += '\n'
          new_description += description_tag_end
          new_description += description.substring(
            tag_end_index + description_tag_end.length
          )
          await octokit.pulls.update({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: context.payload.pull_request.number,
            body: new_description
          })
        }
      } catch (e: any) {
        core.warning(
          `Failed to get PR: ${e}, skipping adding release notes to description.`
        )
      }
    }

    // Review Stage
    const [, review_begin_ids] = await bot.chat(
      prompts.render_review_beginning(inputs),
      {}
    )
    let next_review_ids = review_begin_ids

    for (const [
      filename,
      file_content,
      file_diff,
      patches
    ] of files_to_review) {
      inputs.filename = filename
      inputs.file_content = file_content
      inputs.file_diff = file_diff

      // reset chat session for each file while reviewing
      next_review_ids = review_begin_ids

      if (file_content.length > 0) {
        const file_content_tokens = tokenizer.get_token_count(file_content)
        if (file_content_tokens < MAX_TOKENS_FOR_EXTRA_CONTENT) {
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
        } else {
          core.info(
            `skip sending content of file: ${inputs.filename} due to token count: ${file_content_tokens}`
          )
        }
      }

      if (file_diff.length > 0) {
        const file_diff_tokens = tokenizer.get_token_count(file_diff)
        if (file_diff_tokens < MAX_TOKENS_FOR_EXTRA_CONTENT) {
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
        } else {
          core.info(
            `skip sending diff of file: ${inputs.filename} due to token count: ${file_diff_tokens}`
          )
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
        // if the response contains LGTM (case insensitive), then skip commenting
        if (!options.review_comment_lgtm && response.match(/lgtm/i)) {
          continue
        }
        try {
          await commenter.review_comment(
            context.payload.pull_request.number,
            commits[commits.length - 1].sha,
            filename,
            line,
            `${response}`
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
  }
}

// Write a function that takes diff for a single file as a string
// and splits the diff into separate patches

const split_patch = (patch: string | null | undefined): string[] => {
  if (!patch) {
    return []
  }

  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@).*$/gm

  const result: string[] = []
  let last = -1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(patch)) !== null) {
    if (last === -1) {
      last = match.index
    } else {
      result.push(patch.substring(last, match.index))
      last = match.index
    }
  }
  if (last !== -1) {
    result.push(patch.substring(last))
  }
  return result
}

const patch_comment_line = (patch: string): number => {
  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match) {
    const begin = parseInt(match[4])
    const diff = parseInt(match[5])
    return begin + diff - 1
  } else {
    return -1
  }
}
