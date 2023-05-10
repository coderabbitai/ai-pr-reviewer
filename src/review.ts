import {error, info, warning} from '@actions/core'
// eslint-disable-next-line camelcase
import {context as github_context} from '@actions/github'
import pLimit from 'p-limit'
import {type Bot} from './bot'
import {
  Commenter,
  COMMENT_REPLY_TAG,
  RAW_SUMMARY_END_TAG,
  RAW_SUMMARY_START_TAG,
  SHORT_SUMMARY_END_TAG,
  SHORT_SUMMARY_START_TAG,
  SUMMARIZE_TAG
} from './commenter'
import {Inputs} from './inputs'
import {octokit} from './octokit'
import {type Options} from './options'
import {type Prompts} from './prompts'
import {getTokenCount} from './tokenizer'

// eslint-disable-next-line camelcase
const context = github_context
const repo = context.repo

const ignoreKeyword = '@redrover: ignore'

export const codeReview = async (
  lightBot: Bot,
  heavyBot: Bot,
  options: Options,
  prompts: Prompts
): Promise<void> => {
  const commenter: Commenter = new Commenter()

  const openaiConcurrencyLimit = pLimit(options.openaiConcurrencyLimit)

  if (
    context.eventName !== 'pull_request' &&
    context.eventName !== 'pull_request_target'
  ) {
    warning(
      `Skipped: current event is ${context.eventName}, only support pull_request event`
    )
    return
  }
  if (context.payload.pull_request == null) {
    warning('Skipped: context.payload.pull_request is null')
    return
  }

  const inputs: Inputs = new Inputs()
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body != null) {
    inputs.description = commenter.getDescription(
      context.payload.pull_request.body
    )
  }

  // if the description contains ignore_keyword, skip
  if (inputs.description.includes(ignoreKeyword)) {
    info('Skipped: description contains ignore_keyword')
    return
  }

  // as gpt-3.5-turbo isn't paying attention to system message, add to inputs for now
  inputs.systemMessage = options.systemMessage

  // get SUMMARIZE_TAG message
  const existingSummarizeCmt = await commenter.findCommentWithTag(
    SUMMARIZE_TAG,
    context.payload.pull_request.number
  )
  let existingCommitIdsBlock = ''
  if (existingSummarizeCmt != null) {
    inputs.rawSummary = commenter.getRawSummary(existingSummarizeCmt.body)
    inputs.shortSummary = commenter.getShortSummary(existingSummarizeCmt.body)
    existingCommitIdsBlock = commenter.getReviewedCommitIdsBlock(
      existingSummarizeCmt.body
    )
  }

  const allCommitIds = await commenter.getAllCommitIds()
  // find highest reviewed commit id
  let highestReviewedCommitId = ''
  if (existingCommitIdsBlock !== '') {
    highestReviewedCommitId = commenter.getHighestReviewedCommitId(
      allCommitIds,
      commenter.getReviewedCommitIds(existingCommitIdsBlock)
    )
  }

  if (
    highestReviewedCommitId === '' ||
    highestReviewedCommitId === context.payload.pull_request.head.sha
  ) {
    info(
      `Will review from the base commit: ${
        context.payload.pull_request.base.sha as string
      }`
    )
    highestReviewedCommitId = context.payload.pull_request.base.sha
  } else {
    info(`Will review from commit: ${highestReviewedCommitId}`)
  }

  // Fetch the diff between the highest reviewed commit and the latest commit of the PR branch
  const incrementalDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: highestReviewedCommitId,
    head: context.payload.pull_request.head.sha
  })

  // Fetch the diff between the target branch's base commit and the latest commit of the PR branch
  const targetBranchDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  })

  const incrementalFiles = incrementalDiff.data.files
  const targetBranchFiles = targetBranchDiff.data.files

  if (incrementalFiles == null || targetBranchFiles == null) {
    warning('Skipped: files data is missing')
    return
  }

  // Filter out any file that is changed compared to the incremental changes
  const files = targetBranchFiles.filter(targetBranchFile =>
    incrementalFiles.some(
      incrementalFile => incrementalFile.filename === targetBranchFile.filename
    )
  )

  if (files.length === 0) {
    warning('Skipped: files is null')
    return
  }

  const commits = incrementalDiff.data.commits

  if (commits.length === 0) {
    warning('Skipped: ommits is null')
    return
  }

  // skip files if they are filtered out
  const filterSelectedFiles = []
  const filterIgnoredFiles = []
  for (const file of files) {
    if (!options.checkPath(file.filename)) {
      info(`skip for excluded path: ${file.filename}`)
      filterIgnoredFiles.push(file)
    } else {
      filterSelectedFiles.push(file)
    }
  }

  // find hunks to review
  const filteredFiles: Array<
    [string, string, string, Array<[number, number, string]>] | null
  > = await Promise.all(
    filterSelectedFiles.map(async file => {
      // retrieve file contents
      let fileContent = ''
      if (context.payload.pull_request == null) {
        warning('Skipped: context.payload.pull_request is null')
        return null
      }
      try {
        const contents = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.repo,
          path: file.filename,
          ref: context.payload.pull_request.base.sha
        })
        if (contents.data != null) {
          if (!Array.isArray(contents.data)) {
            if (
              contents.data.type === 'file' &&
              contents.data.content != null
            ) {
              fileContent = Buffer.from(
                contents.data.content,
                'base64'
              ).toString()
            }
          }
        }
      } catch (e: any) {
        warning(
          `Failed to get file contents: ${
            e as string
          }. This is OK if it's a new file.`
        )
      }

      let fileDiff = ''
      if (file.patch != null) {
        fileDiff = file.patch
      }

      const patches: Array<[number, number, string]> = []
      for (const patch of splitPatch(file.patch)) {
        const patchLines = patchStartEndLine(patch)
        if (patchLines == null) {
          continue
        }
        const hunks = parsePatch(patch)
        if (hunks == null) {
          continue
        }
        const hunksStr = `
---new_hunk---
\`\`\`
${hunks.newHunk}
\`\`\`

---old_hunk---
\`\`\`
${hunks.oldHunk}
\`\`\`
`
        patches.push([
          patchLines.newHunk.startLine,
          patchLines.newHunk.endLine,
          hunksStr
        ])
      }
      if (patches.length > 0) {
        return [file.filename, fileContent, fileDiff, patches]
      } else {
        return null
      }
    })
  )

  // Filter out any null results
  const filesAndChanges = filteredFiles.filter(file => file !== null) as Array<
    [string, string, string, Array<[number, number, string]>]
  >

  if (filesAndChanges.length === 0) {
    error('Skipped: no files to review')
    return
  }

  const summariesFailed: string[] = []

  const doSummary = async (
    filename: string,
    fileContent: string,
    fileDiff: string
  ): Promise<[string, string, boolean] | null> => {
    info(`summarize: ${filename}`)
    const ins = inputs.clone()
    if (fileDiff.length === 0) {
      warning(`summarize: file_diff is empty, skip ${filename}`)
      summariesFailed.push(`${filename} (empty diff)`)
      return null
    }

    ins.filename = filename

    // render prompt based on inputs so far
    let tokens = getTokenCount(
      prompts.renderSummarizeFileDiff(ins, options.reviewSimpleChanges)
    )

    const diffTokens = getTokenCount(fileDiff)
    if (tokens + diffTokens > options.lightTokenLimits.requestTokens) {
      info(`summarize: diff tokens exceeds limit, skip ${filename}`)
      summariesFailed.push(`${filename} (diff tokens exceeds limit)`)
      return null
    }

    ins.fileDiff = fileDiff
    tokens += fileDiff.length

    // summarize content
    try {
      const [summarizeResp] = await lightBot.chat(
        prompts.renderSummarizeFileDiff(ins, options.reviewSimpleChanges),
        {}
      )

      if (summarizeResp === '') {
        info('summarize: nothing fetched from RedRover')
        summariesFailed.push(`${filename} (nothing fetched from RedRover)`)
        return null
      } else {
        if (options.reviewSimpleChanges === false) {
          // parse the comment to look for triage classification
          // Format is : [TRIAGE]: <NEEDS_REVIEW or APPROVED>
          // if the change needs review return true, else false
          const triageRegex = /\[TRIAGE\]:\s*(NEEDS_REVIEW|APPROVED)/
          const triageMatch = summarizeResp.match(triageRegex)

          if (triageMatch != null) {
            const triage = triageMatch[1]
            const needsReview = triage === 'NEEDS_REVIEW'

            // remove this line from the comment
            const summary = summarizeResp.replace(triageRegex, '').trim()
            info(`filename: ${filename}, triage: ${triage}`)
            return [filename, summary, needsReview]
          }
        }
        return [filename, summarizeResp, true]
      }
    } catch (e: any) {
      warning(`summarize: error from RedRover: ${e as string}`)
      summariesFailed.push(`${filename} (error from RedRover: ${e as string})})`)
      return null
    }
  }

  const summaryPromises = []
  const skippedFiles = []
  for (const [filename, fileContent, fileDiff] of filesAndChanges) {
    if (options.maxFiles <= 0 || summaryPromises.length < options.maxFiles) {
      summaryPromises.push(
        openaiConcurrencyLimit(
          async () => await doSummary(filename, fileContent, fileDiff)
        )
      )
    } else {
      skippedFiles.push(filename)
    }
  }

  const summaries = (await Promise.all(summaryPromises)).filter(
    summary => summary !== null
  ) as Array<[string, string, boolean]>

  if (summaries.length > 0) {
    const batchSize = 10
    // join summaries into one in the batches of batchSize
    // and ask the bot to summarize the summaries
    for (let i = 0; i < summaries.length; i += batchSize) {
      const summariesBatch = summaries.slice(i, i + batchSize)
      for (const [filename, summary] of summariesBatch) {
        inputs.rawSummary += `---
${filename}: ${summary}
`
      }
      // ask chatgpt to summarize the summaries
      const [summarizeResp] = await heavyBot.chat(
        prompts.renderSummarizeChangesets(inputs),
        {}
      )
      if (summarizeResp === '') {
        warning('summarize: nothing fetched from RedRover')
      } else {
        inputs.rawSummary = summarizeResp
      }
    }
  }

  // final summary
  const [summarizeFinalResponse] = await heavyBot.chat(
    prompts.renderSummarize(inputs),
    {}
  )
  if (summarizeFinalResponse === '') {
    info('summarize: nothing fetched from RedRover')
  }

  if (options.disableReleaseNotes === false) {
    // final release notes
    const [releaseNotesResponse] = await heavyBot.chat(
      prompts.renderSummarizeReleaseNotes(inputs),
      {}
    )
    if (releaseNotesResponse === '') {
      info('release notes: nothing fetched from RedRover')
    } else {
      let message = '### Summary by RedRover\n\n'
      message += releaseNotesResponse
      try {
        await commenter.updateDescription(
          context.payload.pull_request.number,
          message
        )
      } catch (e: any) {
        warning(`release notes: error from github: ${e.message as string}`)
      }
    }
  }

  // generate a short summary as well
  const [summarizeShortResponse] = await heavyBot.chat(
    prompts.renderSummarizeShort(inputs),
    {}
  )
  inputs.shortSummary = summarizeShortResponse

  let summarizeComment = `${summarizeFinalResponse}
${RAW_SUMMARY_START_TAG}
${inputs.rawSummary}
${RAW_SUMMARY_END_TAG}
${SHORT_SUMMARY_START_TAG}
${inputs.shortSummary}
${SHORT_SUMMARY_END_TAG}
---

### Chat with 🐶🤖 RedRover Bot (\`@redrover\`)
- Reply on review comments left by this bot to ask follow-up questions. A review comment is a comment on a diff or a file.
- Invite the bot into a review comment chain by tagging \`@redrover\` in a reply.

### Code suggestions
- The bot may make code suggestions, but please review them carefully before committing since the line number ranges may be misaligned.
- You can edit the comment made by the bot and manually tweak the suggestion if it is slightly off.

### Ignoring further reviews
- Type \`@redrover: ignore\` anywhere in the PR description to ignore further reviews from the bot.

---

${
  filterIgnoredFiles.length > 0
    ? `
<details>
<summary>Files ignored due to filter (${filterIgnoredFiles.length})</summary>

### Ignored files

* ${filterIgnoredFiles.map(file => file.filename).join('\n* ')}

</details>
`
    : ''
}

${
  skippedFiles.length > 0
    ? `
<details>
<summary>Files not processed due to max files limit (${
        skippedFiles.length
      })</summary>

### Not processed

* ${skippedFiles.join('\n* ')}

</details>
`
    : ''
}

${
  summariesFailed.length > 0
    ? `
<details>
<summary>Files not summarized due to errors (${
        summariesFailed.length
      })</summary>

### Failed to summarize

* ${summariesFailed.join('\n* ')}

</details>
`
    : ''
}
`
  if (!options.disableReview) {
    const filesAndChangesReview = filesAndChanges.filter(([filename]) => {
      const needsReview =
        summaries.find(
          ([summaryFilename]) => summaryFilename === filename
        )?.[2] ?? true
      return needsReview
    })

    const reviewsSkipped = filesAndChanges
      .filter(
        ([filename]) =>
          !filesAndChangesReview.some(
            ([reviewFilename]) => reviewFilename === filename
          )
      )
      .map(([filename]) => filename)

    // failed reviews array
    const reviewsFailed: string[] = []
    const doReview = async (
      filename: string,
      fileContent: string,
      patches: Array<[number, number, string]>
    ): Promise<void> => {
      info(`reviewing ${filename}`)
      // make a copy of inputs
      const ins: Inputs = inputs.clone()
      ins.filename = filename

      // calculate tokens based on inputs so far
      let tokens = getTokenCount(prompts.renderReviewFileDiff(ins))
      // loop to calculate total patch tokens
      let patchesToPack = 0
      for (const [, , patch] of patches) {
        const patchTokens = getTokenCount(patch)
        if (tokens + patchTokens > options.heavyTokenLimits.requestTokens) {
          info(
            `only packing ${patchesToPack} / ${patches.length} patches, tokens: ${tokens} / ${options.heavyTokenLimits.requestTokens}`
          )
          break
        }
        tokens += patchTokens
        patchesToPack += 1
      }

      let patchesPacked = 0
      for (const [startLine, endLine, patch] of patches) {
        if (context.payload.pull_request == null) {
          warning('No pull request found, skipping.')
          continue
        }
        // see if we can pack more patches into this request
        if (patchesPacked >= patchesToPack) {
          info(
            `unable to pack more patches into this request, packed: ${patchesPacked}, total patches: ${patches.length}, skipping.`
          )
          if (options.debug) {
            info(`prompt so far: ${prompts.renderReviewFileDiff(ins)}`)
          }
          break
        }
        patchesPacked += 1

        let commentChain = ''
        try {
          const allChains = await commenter.getCommentChainsWithinRange(
            context.payload.pull_request.number,
            filename,
            startLine,
            endLine,
            COMMENT_REPLY_TAG
          )

          if (allChains.length > 0) {
            info(`Found comment chains: ${allChains} for ${filename}`)
            commentChain = allChains
          }
        } catch (e: any) {
          warning(
            `Failed to get comments: ${e as string}, skipping. backtrace: ${
              e.stack as string
            }`
          )
        }
        // try packing comment_chain into this request
        const commentChainTokens = getTokenCount(commentChain)
        if (
          tokens + commentChainTokens >
          options.heavyTokenLimits.requestTokens
        ) {
          commentChain = ''
        } else {
          tokens += commentChainTokens
        }

        ins.patches += `
${patch}
`
        if (commentChain !== '') {
          ins.patches += `
---comment_chains---
\`\`\`
${commentChain}
\`\`\`
`
        }

        ins.patches += `
---end_change_section---
`
      }

      // perform review
      try {
        const [response] = await heavyBot.chat(
          prompts.renderReviewFileDiff(ins),
          {}
        )
        if (response === '') {
          info('review: nothing fetched from RedRover')
          reviewsFailed.push(`${filename} (no response)`)
          return
        }
        // parse review
        const reviews = parseReview(response, patches, options.debug)
        for (const review of reviews) {
          // check for LGTM
          if (
            !options.reviewCommentLGTM &&
            (review.comment.includes('LGTM') ||
              review.comment.includes('looks good to me'))
          ) {
            continue
          }
          if (context.payload.pull_request == null) {
            warning('No pull request found, skipping.')
            continue
          }

          try {
            await commenter.bufferReviewComment(
              filename,
              review.startLine,
              review.endLine,
              `${review.comment}`
            )
          } catch (e: any) {
            reviewsFailed.push(`${filename} comment failed (${e as string})`)
          }
        }
      } catch (e: any) {
        warning(
          `Failed to review: ${e as string}, skipping. backtrace: ${
            e.stack as string
          }`
        )
        reviewsFailed.push(`${filename} (${e as string})`)
      }
    }

    const reviewPromises = []
    for (const [filename, fileContent, , patches] of filesAndChangesReview) {
      if (options.maxFiles <= 0 || reviewPromises.length < options.maxFiles) {
        reviewPromises.push(
          openaiConcurrencyLimit(async () => {
            await doReview(filename, fileContent, patches)
          })
        )
      } else {
        skippedFiles.push(filename)
      }
    }

    await Promise.all(reviewPromises)

    summarizeComment += `
---
In the recent run, only the files that changed from the \`base\` of the PR and between \`${highestReviewedCommitId}\` and \`${
      context.payload.pull_request.head.sha
    }\` commits were reviewed.

${
  reviewsFailed.length > 0
    ? `<details>
<summary>Files not reviewed due to errors in the recent run (${
        reviewsFailed.length
      })</summary>

### Failed to review in the last run

* ${reviewsFailed.join('\n* ')}

</details>
`
    : ''
}

${
  reviewsSkipped.length > 0
    ? `<details>
<summary>Files not reviewed due to simple changes (${
        reviewsSkipped.length
      })</summary>

### Skipped review in the recent run

* ${reviewsSkipped.join('\n* ')}

</details>
`
    : ''
}
`
    // add existing_comment_ids_block with latest head sha
    summarizeComment += `\n${commenter.addReviewedCommitId(
      existingCommitIdsBlock,
      context.payload.pull_request.head.sha
    )}`
  }

  // post the final summary comment
  await commenter.comment(`${summarizeComment}`, SUMMARIZE_TAG, 'replace')

  // post the review
  await commenter.submitReview(
    context.payload.pull_request.number,
    commits[commits.length - 1].sha
  )
}

const splitPatch = (patch: string | null | undefined): string[] => {
  if (patch == null) {
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

const patchStartEndLine = (
  patch: string
): {
  oldHunk: {startLine: number; endLine: number}
  newHunk: {startLine: number; endLine: number}
} | null => {
  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match != null) {
    const oldBegin = parseInt(match[2])
    const oldDiff = parseInt(match[3])
    const newBegin = parseInt(match[4])
    const newDiff = parseInt(match[5])
    return {
      oldHunk: {
        startLine: oldBegin,
        endLine: oldBegin + oldDiff - 1
      },
      newHunk: {
        startLine: newBegin,
        endLine: newBegin + newDiff - 1
      }
    }
  } else {
    return null
  }
}

const parsePatch = (
  patch: string
): {oldHunk: string; newHunk: string} | null => {
  const hunkInfo = patchStartEndLine(patch)
  if (hunkInfo == null) {
    return null
  }

  const oldHunkLines: string[] = []
  const newHunkLines: string[] = []

  // let old_line = hunkInfo.old_hunk.start_line
  let newLine = hunkInfo.newHunk.startLine

  const lines = patch.split('\n').slice(1) // Skip the @@ line

  // Remove the last line if it's empty
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  for (const line of lines) {
    if (line.startsWith('-')) {
      oldHunkLines.push(`${line.substring(1)}`)
      // old_line++
    } else if (line.startsWith('+')) {
      newHunkLines.push(`${newLine}: ${line.substring(1)}`)
      newLine++
    } else {
      oldHunkLines.push(`${line}`)
      newHunkLines.push(`${newLine}: ${line}`)
      // old_line++
      newLine++
    }
  }

  return {
    oldHunk: oldHunkLines.join('\n'),
    newHunk: newHunkLines.join('\n')
  }
}

interface Review {
  startLine: number
  endLine: number
  comment: string
}

function parseReview(
  response: string,
  patches: Array<[number, number, string]>,
  debug = false
): Review[] {
  const reviews: Review[] = []

  const lines = response.split('\n')
  const lineNumberRangeRegex = /(?:^|\s)(\d+)-(\d+):\s*$/
  const commentSeparator = '---'

  let currentStartLine: number | null = null
  let currentEndLine: number | null = null
  let currentComment = ''
  function storeReview(): void {
    if (currentStartLine !== null && currentEndLine !== null) {
      const sanitizedComment = sanitizeComment(currentComment.trim())
      const review: Review = {
        startLine: currentStartLine,
        endLine: currentEndLine,
        comment: sanitizedComment.trim()
      }

      let withinPatch = false
      let bestPatchStartLine = -1
      let bestPatchEndLine = -1
      let maxIntersection = 0

      for (const [startLine, endLine] of patches) {
        const intersectionStart = Math.max(review.startLine, startLine)
        const intersectionEnd = Math.min(review.endLine, endLine)
        const intersectionLength = Math.max(
          0,
          intersectionEnd - intersectionStart + 1
        )

        if (intersectionLength > maxIntersection) {
          maxIntersection = intersectionLength
          bestPatchStartLine = startLine
          bestPatchEndLine = endLine
          withinPatch =
            intersectionLength === review.endLine - review.startLine + 1
        }

        if (withinPatch) break
      }

      if (!withinPatch) {
        if (bestPatchStartLine !== -1 && bestPatchEndLine !== -1) {
          review.comment = `> Note: This review was outside of the patch, so it was mapped to the patch with the greatest overlap. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = bestPatchStartLine
          review.endLine = bestPatchEndLine
        } else {
          review.comment = `> Note: This review was outside of the patch, but no patch was found that overlapped with it. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = patches[0][0]
          review.endLine = patches[0][1]
        }
      }

      reviews.push(review)

      info(
        `Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`
      )
    }
  }

  function sanitizeComment(comment: string): string {
    const suggestionStart = '```suggestion'
    const suggestionEnd = '```'
    const lineNumberRegex = /^ *(\d+): /gm

    let suggestionStartIndex = comment.indexOf(suggestionStart)

    while (suggestionStartIndex !== -1) {
      const suggestionEndIndex = comment.indexOf(
        suggestionEnd,
        suggestionStartIndex + suggestionStart.length
      )

      if (suggestionEndIndex === -1) break

      const suggestionBlock = comment.substring(
        suggestionStartIndex + suggestionStart.length,
        suggestionEndIndex
      )
      const sanitizedBlock = suggestionBlock.replace(lineNumberRegex, '')

      comment =
        comment.slice(0, suggestionStartIndex + suggestionStart.length) +
        sanitizedBlock +
        comment.slice(suggestionEndIndex)

      suggestionStartIndex = comment.indexOf(
        suggestionStart,
        suggestionStartIndex +
          suggestionStart.length +
          sanitizedBlock.length +
          suggestionEnd.length
      )
    }

    return comment
  }

  for (const line of lines) {
    const lineNumberRangeMatch = line.match(lineNumberRangeRegex)

    if (lineNumberRangeMatch != null) {
      storeReview()
      currentStartLine = parseInt(lineNumberRangeMatch[1], 10)
      currentEndLine = parseInt(lineNumberRangeMatch[2], 10)
      currentComment = ''
      if (debug) {
        info(`Found line number range: ${currentStartLine}-${currentEndLine}`)
      }
      continue
    }

    if (line.trim() === commentSeparator) {
      storeReview()
      currentStartLine = null
      currentEndLine = null
      currentComment = ''
      if (debug) {
        info('Found comment separator')
      }
      continue
    }

    if (currentStartLine !== null && currentEndLine !== null) {
      currentComment += `${line}\n`
    }
  }

  storeReview()

  return reviews
}
