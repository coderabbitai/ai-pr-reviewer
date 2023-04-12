import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {retry} from '@octokit/plugin-retry'
import pLimit from 'p-limit'
import {Bot} from './bot.js'
import {Commenter, COMMENT_REPLY_TAG, SUMMARIZE_TAG} from './commenter.js'
import {Inputs, Options, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN

const RetryOctokit = Octokit.plugin(retry)
const octokit = new RetryOctokit({auth: `token ${token}`})

const context = github.context
const repo = context.repo

export const codeReview = async (
  lightBot: Bot,
  heavyBot: Bot,
  options: Options,
  prompts: Prompts
): Promise<void> => {
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
  const filter_selected_files = []
  const filter_ignored_files = []
  for (const file of files) {
    if (!options.check_path(file.filename)) {
      core.info(`skip for excluded path: ${file.filename}`)
      filter_ignored_files.push(file)
    } else {
      filter_selected_files.push(file)
    }
  }

  // find hunks to review
  const filtered_files_to_review: (
    | [string, string, string, [number, number, string][]]
    | null
  )[] = await Promise.all(
    filter_selected_files.map(async file => {
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
        file_diff = file.patch
      }

      const patches: [number, number, string][] = []
      for (const patch of split_patch(file.patch)) {
        const patch_lines = patch_start_end_line(patch)
        if (!patch_lines) {
          continue
        }
        const hunks = parse_patch(patch)
        if (!hunks) {
          continue
        }
        const hunks_str = `
---new_hunk_for_review---
\`\`\`
${hunks.new_hunk}
\`\`\`

---old_hunk_for_context---
\`\`\`
${hunks.old_hunk}
\`\`\`
`
        patches.push([
          patch_lines.new_hunk.start_line,
          patch_lines.new_hunk.end_line,
          hunks_str
        ])
      }
      if (patches.length > 0) {
        return [file.filename, file_content, file_diff, patches]
      } else {
        return null
      }
    })
  )

  // Filter out any null results
  const files_to_review = filtered_files_to_review.filter(
    file => file !== null
  ) as [string, string, string, [number, number, string][]][]

  if (files_to_review.length === 0) {
    core.error(`Skipped: no files to review`)
    return
  }

  const summaries_failed: string[] = []
  const do_summary = async (
    filename: string,
    file_content: string,
    file_diff: string
  ): Promise<[string, string] | null> => {
    const ins = inputs.clone()
    if (file_diff.length === 0) {
      core.warning(`summarize: file_diff is empty, skip ${filename}`)
      summaries_failed.push(`${filename} (empty diff)`)
      return null
    }

    ins.filename = filename
    // render prompt based on inputs so far
    let tokens = tokenizer.get_token_count(
      prompts.render_summarize_file_diff(ins)
    )

    const diff_tokens = tokenizer.get_token_count(file_diff)
    if (tokens + diff_tokens > options.light_token_limits.request_tokens) {
      core.info(`summarize: diff tokens exceeds limit, skip ${filename}`)
      summaries_failed.push(`${filename} (diff tokens exceeds limit)`)
      return null
    }

    ins.file_diff = file_diff
    tokens += file_diff.length

    // optionally pack file_content
    if (file_content.length > 0) {
      // count occurrences of $file_content in prompt
      const file_content_count =
        prompts.summarize_file_diff.split('$file_content').length - 1
      const file_content_tokens = tokenizer.get_token_count(file_content)
      if (
        file_content_count > 0 &&
        tokens + file_content_tokens * file_content_count <=
          options.light_token_limits.request_tokens
      ) {
        tokens += file_content_tokens * file_content_count
        ins.file_content = file_content
      }
    }
    // summarize content
    try {
      const [summarize_resp] = await lightBot.chat(
        prompts.render_summarize_file_diff(ins),
        {}
      )

      if (!summarize_resp) {
        core.info('summarize: nothing obtained from openai')
        summaries_failed.push(`${filename} (nothing obtained from openai)`)
        return null
      } else {
        return [filename, summarize_resp]
      }
    } catch (error) {
      core.warning(`summarize: error from openai: ${error}`)
      summaries_failed.push(`${filename} (error from openai: ${error})`)
      return null
    }
  }

  const summaryPromises = []
  const skipped_files_to_summarize = []
  for (const [filename, file_content, file_diff] of files_to_review) {
    if (
      options.max_files_to_summarize <= 0 ||
      summaryPromises.length < options.max_files_to_summarize
    ) {
      summaryPromises.push(
        openai_concurrency_limit(async () =>
          do_summary(filename, file_content, file_diff)
        )
      )
    } else {
      skipped_files_to_summarize.push(filename)
    }
  }

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

  let next_summarize_ids = {}

  // final summary
  const [summarize_final_response, summarize_final_response_ids] =
    await heavyBot.chat(prompts.render_summarize(inputs), next_summarize_ids)
  if (!summarize_final_response) {
    core.info('summarize: nothing obtained from openai')
  } else {
    inputs.summary = summarize_final_response

    const summarize_comment = `${summarize_final_response}

---

### Chat with 🤖 OpenAI Bot (\`@openai\`)
- Reply on review comments left by this bot to ask follow-up questions. A review comment is a comment on a diff or a file.
- Invite the bot into a review comment chain by tagging \`@openai\` in a reply.

### Code suggestions
- The bot may make code suggestions, but please review them carefully before committing since the line number ranges may be misaligned. 
- You can edit the comment made by the bot and manually tweak the suggestion if it is slightly off.

---

${
  filter_ignored_files.length > 0
    ? `
<details>
<summary>Files ignored due to filter (${filter_ignored_files.length})</summary>

### Ignored files

* ${filter_ignored_files.map(file => file.filename).join('\n* ')}

</details>
`
    : ''
}

${
  skipped_files_to_summarize.length > 0
    ? `
<details>
<summary>Files not summarized due to max files limit (${
        skipped_files_to_summarize.length
      })</summary>

### Not summarized

* ${skipped_files_to_summarize.join('\n* ')}

</details>
`
    : ''
}

${
  summaries_failed.length > 0
    ? `
<details>
<summary>Files not summarized due to errors (${
        summaries_failed.length
      })</summary>

### Failed to summarize

* ${summaries_failed.join('\n* ')}

</details>
`
    : ''
}
`

    await commenter.comment(`${summarize_comment}`, SUMMARIZE_TAG, 'replace')

    // final release notes
    next_summarize_ids = summarize_final_response_ids
    const [release_notes_response, release_notes_ids] = await heavyBot.chat(
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
  }

  if (options.summary_only === true) {
    core.info('summary_only is true, exiting')
    return
  }

  // failed reviews array
  const reviews_failed: string[] = []
  const do_review = async (
    filename: string,
    file_content: string,
    patches: [number, number, string][]
  ): Promise<void> => {
    // make a copy of inputs
    const ins: Inputs = inputs.clone()
    ins.filename = filename

    // Pack instructions
    ins.patches += `
Format for changes:
  ---new_hunk_for_review---
  \`\`\`
  <new hunk annotated with line numbers>
  \`\`\`

  ---old_hunk_for_context---
  \`\`\`
  <old hunk that was replaced by new hunk>
  \`\`\`

  ---comment_chains_for_context---
  \`\`\`
  <comment chains>
  \`\`\`

  ---end_change_section---
  ...

The above format for changes consistes of multiple change sections. 
Each change section consists of a new hunk (annotated with line numbers), 
an old hunk (that was replaced with new hunk) and optionally, comment 
chains for context.

Hunks for review are below:
`

    // calculate tokens based on inputs so far
    let tokens = tokenizer.get_token_count(prompts.render_review_file_diff(ins))
    // loop to calculate total patch tokens
    let patches_to_pack = 0
    for (const [, , patch] of patches) {
      const patch_tokens = tokenizer.get_token_count(patch)
      if (tokens + patch_tokens > options.heavy_token_limits.request_tokens) {
        break
      }
      tokens += patch_tokens
      patches_to_pack += 1
    }

    // try packing file_content into this request
    const file_content_count =
      prompts.review_file_diff.split('$file_content').length - 1
    const file_content_tokens = tokenizer.get_token_count(file_content)
    if (
      file_content_count > 0 &&
      tokens + file_content_tokens * file_content_count <=
        options.heavy_token_limits.request_tokens
    ) {
      ins.file_content = file_content
      tokens += file_content_tokens * file_content_count
    }

    let patches_packed = 0
    for (const [start_line, end_line, patch] of patches) {
      if (!context.payload.pull_request) {
        core.warning('No pull request found, skipping.')
        continue
      }
      // see if we can pack more patches into this request
      if (patches_packed >= patches_to_pack) {
        core.info(
          `unable to pack more patches into this request, packed: ${patches_packed}, to pack: ${patches_to_pack}`
        )
        break
      }
      patches_packed += 1

      let comment_chain = ''
      try {
        const all_chains = await commenter.get_comment_chains_within_range(
          context.payload.pull_request.number,
          filename,
          start_line,
          end_line,
          COMMENT_REPLY_TAG
        )

        if (all_chains.length > 0) {
          comment_chain = all_chains
        } else {
          comment_chain = ''
        }
      } catch (e: any) {
        core.warning(
          `Failed to get comments: ${e}, skipping. backtrace: ${e.stack}`
        )
      }
      // try packing comment_chain into this request
      const comment_chain_tokens = tokenizer.get_token_count(comment_chain)
      if (
        tokens + comment_chain_tokens >
        options.heavy_token_limits.request_tokens
      ) {
        comment_chain = ''
      } else {
        tokens += comment_chain_tokens
      }

      ins.patches += `
${patch}
`
      if (comment_chain !== '') {
        ins.patches += `
---comment_chains_for_review---
\`\`\`
${comment_chain}
\`\`\`
`
      }

      ins.patches += `
---end_change_section---
`
    }

    // add instructions
    ins.patches += `
Instructions for you:
- Your task is to do a line by line review of new hunks and point out 
  substantive issues in those line number ranges. When commenting, 
  you will need to provide the exact line number range (inclusive) 
  for each issue that is detected.
- Only respond in the below response format (consisting of review
  sections) and nothing else. Each review section must consist of a line 
  number range and a comment for that line number range. Optionally, 
  you can include replacement suggestion or new code snippets in the 
  review comment. There's a separator between review sections.
- It's important that line number ranges for each review section must 
  be within the line number range of a specific new hunk. i.e. 
  <start_line_number> must belong to the same hunk as the 
  <end_line_number>. The line number range is sufficient to map your 
  comment to the code changes in GitHub pull request.
- Consider the context provided by the old hunk and associated comment 
  chain when reviewing the new hunk.
- Use Markdown format for review comment text.
- Fenced code blocks must be used for new content and replacement 
  code/text snippets. 
- If needed, provide a replacement suggestion using fenced code blocks 
  with the \`suggestion\` as the language identifier. The line number range 
  in the review section must map exactly to the line number range (inclusive) 
  that need to be replaced within a new_hunk_for_review. These snippets will be 
  directly committed by the user using the GitHub UI. For instance, 
  if 2 lines of code in a hunk need to be replaced with 15 lines of code, 
  the line number range must be those exact 2 lines. If an entire hunk need 
  to be replaced with new code, then the line number range must be the entire 
  hunk. Replacement code/text snippets must be complete and correctly formatted. 
- If needed, suggest new code using the correct language identifier in the 
  fenced code blocks. These snippets may be added to a different file, such 
  as test cases.
- Do not annotate code snippets with line numbers inside the code blocks.
- If there are no issues in a hunk, comment "LGTM!" for the respective line range.
- Review your comments and line number ranges at least 3 times before sending 
  the final response to ensure accuracy of line number ranges and replacement
  snippets.

Response format expected:
  <start_line_number>-<end_line_number>:
  <review comment>
  ---
  <start_line_number>-<end_line_number>:
  <review comment>
  \`\`\`suggestion
  <code/text that replaces everything between start_line_number and end_line_number>
  \`\`\`
  ---
  <start_line_number>-<end_line_number>:
  <review comment>
  \`\`\`<language>
  <new code snippet>
  \`\`\`
  ---
  ...

Example changes:
  ---new_hunk_for_review---
  1: def add(x, y):
  2:     z = x+y
  3:     retrn z
  4:
  5: def multiply(x, y):
  6:     return x * y
  
  ---old_hunk_for_context---
  def add(x, y):
      return x + y

Example response:
  3-3:
  There's a typo in the return statement.
  \`\`\`suggestion
      return z
  \`\`\`
  ---
  5-6:
  LGTM!
  ---
`
    // perform review
    try {
      const [response] = await heavyBot.chat(
        prompts.render_review_file_diff(ins),
        {}
      )
      if (!response) {
        core.info('review: nothing obtained from openai')
        reviews_failed.push(`${filename} (no response)`)
        return
      }
      // parse review
      const reviews = parseReview(response, options.debug)
      for (const review of reviews) {
        // check for LGTM
        if (
          !options.review_comment_lgtm &&
          (review.comment.includes('LGTM') ||
            review.comment.includes('looks good to me'))
        ) {
          continue
        }
        if (!context.payload.pull_request) {
          core.warning('No pull request found, skipping.')
          continue
        }
        try {
          await commenter.review_comment(
            context.payload.pull_request.number,
            commits[commits.length - 1].sha,
            filename,
            review.start_line,
            review.end_line,
            `${review.comment}`
          )
        } catch (e: any) {
          reviews_failed.push(`${filename} comment failed (${e})`)
        }
      }
    } catch (e: any) {
      core.warning(`Failed to review: ${e}, skipping. backtrace: ${e.stack}`)
      reviews_failed.push(`${filename} (${e})`)
    }
  }

  const reviewPromises = []
  const skipped_files_to_review = []
  for (const [filename, file_content, , patches] of files_to_review) {
    if (
      options.max_files_to_review <= 0 ||
      reviewPromises.length < options.max_files_to_review
    ) {
      reviewPromises.push(
        openai_concurrency_limit(async () =>
          do_review(filename, file_content, patches)
        )
      )
    } else {
      skipped_files_to_review.push(filename)
    }
  }

  await Promise.all(reviewPromises)

  // comment about skipped files for review and summarize
  if (skipped_files_to_review.length > 0) {
    // make bullet points for skipped files
    const comment = `
      ${
        skipped_files_to_review.length > 0
          ? `<details>
<summary>Files not reviewed due to max files limit (${
              skipped_files_to_review.length
            })</summary>

### Not reviewed

* ${skipped_files_to_review.join('\n* ')}

</details>
`
          : ''
      }

      ${
        reviews_failed.length > 0
          ? `<details>
<summary>Files not reviewed due to errors (${reviews_failed.length})</summary>

### Not reviewed

* ${reviews_failed.join('\n* ')}

</details>
`
          : ''
      }
      `
    if (comment.length > 0) {
      await commenter.comment(comment, SUMMARIZE_TAG, 'append')
    }
  }
}

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

const patch_start_end_line = (
  patch: string
): {
  old_hunk: {start_line: number; end_line: number}
  new_hunk: {start_line: number; end_line: number}
} | null => {
  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match) {
    const old_begin = parseInt(match[2])
    const old_diff = parseInt(match[3])
    const new_begin = parseInt(match[4])
    const new_diff = parseInt(match[5])
    return {
      old_hunk: {
        start_line: old_begin,
        end_line: old_begin + old_diff - 1
      },
      new_hunk: {
        start_line: new_begin,
        end_line: new_begin + new_diff - 1
      }
    }
  } else {
    return null
  }
}

const parse_patch = (
  patch: string
): {old_hunk: string; new_hunk: string} | null => {
  const hunkInfo = patch_start_end_line(patch)
  if (!hunkInfo) {
    return null
  }

  const old_hunk_lines: string[] = []
  const new_hunk_lines: string[] = []

  //let old_line = hunkInfo.old_hunk.start_line
  let new_line = hunkInfo.new_hunk.start_line

  const lines = patch.split('\n').slice(1) // Skip the @@ line

  // Remove the last line if it's empty
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  for (const line of lines) {
    if (line.startsWith('-')) {
      old_hunk_lines.push(`${line.substring(1)}`)
      //old_line++
    } else if (line.startsWith('+')) {
      new_hunk_lines.push(`${new_line}: ${line.substring(1)}`)
      new_line++
    } else {
      old_hunk_lines.push(`${line}`)
      new_hunk_lines.push(`${new_line}: ${line}`)
      //old_line++
      new_line++
    }
  }

  return {
    old_hunk: old_hunk_lines.join('\n'),
    new_hunk: new_hunk_lines.join('\n')
  }
}

type Review = {
  start_line: number
  end_line: number
  comment: string
}

function parseReview(response: string, debug = false): Review[] {
  // instantiate an array of reviews
  const reviews: Review[] = []

  // Split the response into lines
  const lines = response.split('\n')

  // Regular expression to match the line number range and comment format
  const lineNumberRangeRegex = /(?:^|\s)(\d+)-(\d+):\s*$/
  const commentSeparator = '---'

  let currentStartLine: number | null = null
  let currentEndLine: number | null = null
  let currentComment = ''

  for (const line of lines) {
    // Check if the line matches the line number range format
    const lineNumberRangeMatch = line.match(lineNumberRangeRegex)

    if (lineNumberRangeMatch) {
      // If there is a previous comment, store it in the reviews
      if (currentStartLine !== null && currentEndLine !== null) {
        reviews.push({
          start_line: currentStartLine,
          end_line: currentEndLine,
          comment: currentComment.trim()
        })
        debug &&
          core.info(
            `Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`
          )
      }

      // Set the current line number range and reset the comment
      currentStartLine = parseInt(lineNumberRangeMatch[1], 10)
      currentEndLine = parseInt(lineNumberRangeMatch[2], 10)
      currentComment = ''
      debug &&
        core.info(
          `Found line number range: ${currentStartLine}-${currentEndLine}`
        )
      continue
    }

    // Check if the line is a comment separator
    if (line.trim() === commentSeparator) {
      // If there is a previous comment, store it in the reviews
      if (currentStartLine !== null && currentEndLine !== null) {
        reviews.push({
          start_line: currentStartLine,
          end_line: currentEndLine,
          comment: currentComment.trim()
        })
        debug &&
          core.info(
            `Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`
          )
      }

      // Reset the current line number range and comment
      currentStartLine = null
      currentEndLine = null
      currentComment = ''
      debug && core.info('Found comment separator')
      continue
    }

    // If there is a current line number range, add the line to the current comment
    if (currentStartLine !== null && currentEndLine !== null) {
      currentComment += `${line}\n`
    }
  }

  // If there is a comment at the end of the response, store it in the reviews
  if (currentStartLine !== null && currentEndLine !== null) {
    reviews.push({
      start_line: currentStartLine,
      end_line: currentEndLine,
      comment: currentComment.trim()
    })
    debug &&
      core.info(
        `Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`
      )
  }

  return reviews
}
