import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import pLimit from 'p-limit'
import {Bot} from './bot.js'
import {Commenter, COMMENT_REPLY_TAG, SUMMARIZE_TAG} from './commenter.js'
import {Inputs, Options, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

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
  const commenter: Commenter = new Commenter()

  const openai_concurrency_limit = pLimit(options.openai_concurrency_limit)

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
    inputs.description = commenter.get_description(
      context.payload.pull_request.body
    )
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
    await commenter.comment(
      `Skipped: no files to review`,
      SUMMARIZE_TAG,
      'replace'
    )
    return
  }

  // skip files if they are filtered out
  const filtered_files = []
  for (const file of files) {
    if (!options.check_path(file.filename)) {
      core.info(`skip for excluded path: ${file.filename}`)
      continue
    } else {
      filtered_files.push(file)
    }
  }

  // check if we are exceeding max_files and if max_files is <= 0 (no limit)
  if (filtered_files.length > options.max_files && options.max_files > 0) {
    core.warning("Skipped: too many files to review, can't handle it")
    await commenter.comment(
      `Skipped: too many files to review, can't handle it`,
      SUMMARIZE_TAG,
      'replace'
    )
    return
  }

  // find patches to review
  const filtered_files_to_review: (
    | [string, string, string, [number, string][]]
    | null
  )[] = await Promise.all(
    filtered_files.map(async file => {
      // retrieve file contents
      let file_content = ''
      if (!context.payload.pull_request) {
        core.warning(`Skipped: context.payload.pull_request is null`)
        return null
      }
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
        return [file.filename, file_content, file_diff, patches] as [
          string,
          string,
          string,
          [number, string][]
        ]
      } else {
        return null
      }
    })
  )

  // Filter out any null results
  const files_to_review = filtered_files_to_review.filter(
    file => file !== null
  ) as [string, string, string, [number, string][]][]

  if (files_to_review.length > 0) {
    // Summary Stage
    const [, summarize_begin_ids] = await bot.chat(
      prompts.render_summarize_beginning(inputs),
      {}
    )

    const generateSummary = async (
      filename: string,
      file_content: string,
      file_diff: string
    ): Promise<[string, string] | null> => {
      const ins = inputs.clone()
      ins.filename = filename

      if (file_content.length > 0) {
        ins.file_content = file_content
      }
      if (file_diff.length > 0) {
        ins.file_diff = file_diff
        const file_diff_tokens = tokenizer.get_token_count(file_diff)
        if (file_diff_tokens < options.max_tokens_for_extra_content) {
          // summarize diff
          try {
            const [summarize_resp] = await bot.chat(
              prompts.render_summarize_file_diff(ins),
              summarize_begin_ids
            )
            if (!summarize_resp) {
              core.info('summarize: nothing obtained from openai')
              return null
            } else {
              return [filename, summarize_resp]
            }
          } catch (error) {
            core.warning(`summarize: error from openai: ${error}`)
            return null
          }
        }
      }
      return null
    }
    const summaryPromises = files_to_review.map(
      async ([filename, file_content, file_diff]) =>
        openai_concurrency_limit(async () =>
          generateSummary(filename, file_content, file_diff)
        )
    )

    const summaries = (await Promise.all(summaryPromises)).filter(
      summary => summary !== null
    ) as [string, string][]

    if (summaries.length > 0) {
      inputs.summary = ''
      // join summaries into one
      for (const [filename, summary] of summaries) {
        inputs.summary += `---
${filename}: ${summary}
`
      }
    }

    let next_summarize_ids = summarize_begin_ids

    // final summary
    const [summarize_final_response, summarize_final_response_ids] =
      await bot.chat(prompts.render_summarize(inputs), next_summarize_ids)
    if (!summarize_final_response) {
      core.info('summarize: nothing obtained from openai')
    } else {
      inputs.summary = summarize_final_response

      const summarize_comment = `${summarize_final_response}

---

Tips: 
- Reply on the review comment left by this bot to ask follow-up questions.
- Invite the bot into a review conversation by typing \`@openai\` in the beginning of the comment.
`

      next_summarize_ids = summarize_final_response_ids
      await commenter.comment(`${summarize_comment}`, SUMMARIZE_TAG, 'replace')
    }

    // final release notes
    const [release_notes_response, release_notes_ids] = await bot.chat(
      prompts.render_summarize_release_notes(inputs),
      next_summarize_ids
    )
    if (!release_notes_response) {
      core.info('release notes: nothing obtained from openai')
    } else {
      next_summarize_ids = release_notes_ids
      let message = '### Summary by OpenAI\n\n'
      message += release_notes_response
      commenter.update_description(context.payload.pull_request.number, message)
    }

    // Review Stage
    const [, review_begin_ids] = await bot.chat(
      prompts.render_review_beginning(inputs),
      {}
    )
    // Use Promise.all to run file review processes in parallel
    const reviewPromises = files_to_review.map(
      async ([filename, file_content, file_diff, patches]) =>
        openai_concurrency_limit(async () => {
          // reset chat session for each file while reviewing
          let next_review_ids = review_begin_ids

          // make a copy of inputs
          const ins: Inputs = inputs.clone()

          ins.filename = filename

          if (file_content.length > 0) {
            ins.file_content = file_content
            const file_content_tokens = tokenizer.get_token_count(file_content)
            if (file_content_tokens < options.max_tokens_for_extra_content) {
              try {
                // review file
                const [resp, review_file_ids] = await bot.chat(
                  prompts.render_review_file(ins),
                  next_review_ids
                )
                if (!resp) {
                  core.info('review: nothing obtained from openai')
                } else {
                  next_review_ids = review_file_ids
                  if (!resp.includes('LGTM')) {
                    // TODO: add file level comments via API once it's available
                    // See: https://github.blog/changelog/2023-03-14-comment-on-files-in-a-pull-request-public-beta/
                    // For now comment on the PR itself
                    const tag = `<!-- openai-review-file-${filename} -->`
                    const comment = `${tag}\nReviewing existing code in: ${filename}\n\n${resp}`
                    await commenter.comment(comment, tag, 'replace')
                  }
                }
              } catch (error) {
                core.warning(`review: error from openai: ${error}`)
              }
            } else {
              core.info(
                `skip sending content of file: ${ins.filename} due to token count: ${file_content_tokens}`
              )
            }
          }

          if (file_diff.length > 0) {
            ins.file_diff = file_diff
            const file_diff_tokens = tokenizer.get_token_count(file_diff)
            if (file_diff_tokens < options.max_tokens_for_extra_content) {
              try {
                // review diff
                const [resp, review_diff_ids] = await bot.chat(
                  prompts.render_review_file_diff(ins),
                  next_review_ids
                )
                if (!resp) {
                  core.info('review: nothing obtained from openai')
                } else {
                  next_review_ids = review_diff_ids
                }
              } catch (error) {
                core.warning(`review: error from openai: ${error}`)
              }
            } else {
              core.info(
                `skip sending diff of file: ${ins.filename} due to token count: ${file_diff_tokens}`
              )
            }
          }

          // review_patch_begin
          const [, patch_begin_ids] = await bot.chat(
            prompts.render_review_patch_begin(ins),
            next_review_ids
          )
          next_review_ids = patch_begin_ids

          for (const [line, patch] of patches) {
            core.info(`Reviewing ${filename}:${line} with openai ...`)
            ins.patch = patch
            if (!context.payload.pull_request) {
              core.warning('No pull request found, skipping.')
              continue
            }

            try {
              // get existing comments on the line
              const all_chains =
                await commenter.get_conversation_chains_at_line(
                  context.payload.pull_request.number,
                  filename,
                  line,
                  COMMENT_REPLY_TAG
                )

              if (all_chains.length > 0) {
                ins.comment_chain = all_chains
              } else {
                ins.comment_chain = 'no previous comments'
              }
            } catch (e: any) {
              core.warning(
                `Failed to get comments: ${e}, skipping. backtrace: ${e.stack}`
              )
            }

            try {
              const [response, patch_ids] = await bot.chat(
                prompts.render_review_patch(ins),
                next_review_ids
              )
              if (!response) {
                core.info('review: nothing obtained from openai')
                continue
              }
              next_review_ids = patch_ids
              if (!options.review_comment_lgtm && response.includes('LGTM')) {
                continue
              }
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
        })
    )

    await Promise.all(reviewPromises)
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
