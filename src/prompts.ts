import {type Inputs} from './inputs'

export class Prompts {
  summarize: string
  summarizeReleaseNotes: string

  summarizeFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$file_diff
\`\`\`

## Instructions

I would like you to succinctly summarize the diff within 100 words.
If applicable, your summary should include a note about alterations 
to the signatures of exported functions, global data structures and 
variables, and any changes that might affect the external interface or 
behavior of the code.
`
  triageFileDiff = `Below the summary, I would also like you to triage the diff as \`NEEDS_REVIEW\` or 
\`APPROVED\` based on the following criteria:

- If the diff involves any modifications to the logic or functionality, even if they 
  seem minor, triage it as \`NEEDS_REVIEW\`. This includes changes to control structures, 
  function calls, or variable assignments that might impact the behavior of the code.
- If the diff only contains very minor changes that don't affect the code logic, such as 
  fixing typos, formatting, or renaming variables for clarity, triage it as \`APPROVED\`.

Please evaluate the diff thoroughly and take into account factors such as the number of 
lines changed, the potential impact on the overall system, and the likelihood of 
introducing new bugs or security vulnerabilities. 
When in doubt, always err on the side of caution and triage the diff as \`NEEDS_REVIEW\`.

You must strictly follow the format below for triaging the diff:
[TRIAGE]: <NEEDS_REVIEW or APPROVED>

Important:
- In your summary do not mention that the file needs a through review or caution about
  potential issues.
- Do not provide any reasoning why you triaged the diff as \`NEEDS_REVIEW\` or \`APPROVED\`.
- Do not mention that these changes affect the logic or functionality of the code in 
  the summary. You must only use the triage status format above to indicate that.
`
  summarizeChangesets = `Provided below are changesets in this pull request. Changesets 
are in chronlogical order and new changesets are appended to the
end of the list. The format consists of filename(s) and the summary 
of changes for those files. There is a separator between each changeset.
Your task is to deduplicate and group together files with
related/similar changes into a single changeset. Respond with the updated 
changesets using the same format as the input. 

$raw_summary
`

  summarizePrefix = `Here is the summary of changes you have generated for files:
      \`\`\`
      $raw_summary
      \`\`\`

`

  summarizeShort = `Your task is to provide a concise summary of the changes. This 
summary will be used as a prompt while reviewing each file and must be very clear for 
the AI bot to understand. 

Instructions:

- Focus on summarizing only the changes in the PR and stick to the facts.
- Do not provide any instructions to the bot on how to perform the review.
- Do not mention that files need a through review or caution about potential issues.
- Do not mention that these changes affect the logic or functionality of the code.
- The summary should not exceed 500 words.
`

  reviewFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Summary of changes

\`\`\`
$short_summary
\`\`\`

## Pseudo-code for \`$filename\` before changes

\`\`\`
$file_summary
\`\`\`

## Parsing changes

The format for changes provided below consists of multiple change 
sections, each containing a new hunk (annotated with line numbers), 
an old hunk, and optionally, existing comment chains. Note that the 
old hunk code has been replaced by the new hunk. The line number 
annotation on each line in the new hunk is of the 
format \`<line_number><colon><whitespace>\`.

### Format for changes

  ---new_hunk---
  \`\`\`
  <new hunk annotated with line numbers>
  \`\`\`

  ---old_hunk---
  \`\`\`
  <old hunk that was replaced by the new hunk above>
  \`\`\`

  ---comment_chains---
  \`\`\`
  <comment chains>
  \`\`\`

  ---end_change_section---
  ...

## IMPORTANT: Response Instructions

- Your task is to review ONLY the new hunks line by line, ONLY pointing out 
  substantive issues within line number ranges. Provide the exact line 
  number range (inclusive) for each issue. Take into account any supplementary 
  context from the old hunks, comment threads, and file contents during your 
  review process. 
- Understand that the hunk provided for review is a part of a larger codebase 
  and may not include all relevant parts, such as definitions, imports, or uses 
  of functions or variables. You may see incomplete fragments of code or 
  references to elements defined outside the provided context. Refrain from 
  flagging issues about missing definitions, imports, or uses unless there is 
  strong evidence within the provided context to suggest there might be a problem.
- Respond only in the below response format (consisting of review 
  sections). Each review section must have a line number range and a review 
  comment for that range. Do not include general feedback or summaries. You 
  may optionally include a single replacement suggestion snippet and/or 
  multiple new code snippets in the review comment. Use separator after each 
  review section.
- Line number ranges for each review section must be within the 
  range of a specific new hunk. <start_line_number> must belong to the same 
  hunk as the <end_line_number>. The line number range is sufficient to map 
  your comment to the code changes in the GitHub pull request.
- Use Markdown format for review comment text and fenced code blocks for
  code snippets.
- If needed, provide replacement code suggestions to fix the issue by using 
  fenced code blocks with the \`suggestion\` as the language identifier. The 
  line number range must map exactly to the range (inclusive) that needs to 
  be replaced within a new hunk. For instance, if 2 lines of code in a hunk 
  need to be replaced with 15 lines of code, the line number range must be 
  those exact 2 lines. If an entire hunk need to be replaced with new code, 
  then the line number range must be the entire hunk and the new code must
  exactly replace all the lines in the hunk.Replacement suggestions should be 
  complete, correctly formatted and without the line number annotations. 
  Each suggestion must be provided as a separate review section with relevant 
  line number ranges.
- If needed, suggest new code snippets using the correct language identifier 
  in the fenced code blocks. These snippets may be added to a different file 
  (e.g. test cases), or within the same file at locations outside the provided
  hunks. Multiple new code snippets are allowed within a single review section.
- As your knowledge may be outdated, trust the developer when newer
  APIs and methods are seemingly being used.
- Always presume that the developer has thoroughly tested their changes 
  and is aware of their implications on the entire system. Instead of 
  making generic comments about potential impacts on the system, focus 
  on providing specific, objective insights based on the code itself. 
- Do not repeat information that is already evident from the code or the pull
  request.
- Do not provide summaries, explanations of changes, or offer 
  compliments for following good practices aboud code modifications that 
  don't have any identifiable issue.
- Do not question the developer's intention behind the changes or caution 
  them to ensure that their modifications do not introduce compatibility
  issues with other dependencies.
- Do not make presumptions about the larger impact outside the given context 
  or the necessity of the changes.
- Do not ask the developer to review the changes.
- If there are no issues found on a line range, you MUST respond with the 
  text \`LGTM!\` for that line range in the review section. 
- Reflect on your comments and line number ranges before sending the final 
  response to ensure accuracy of line number ranges and replacement snippets.

### Response format expected

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

## Example

### Example changes

  ---new_hunk---
  1: def add(x, y):
  2:     z = x+y
  3:     retrn z
  4:
  5: def multiply(x, y):
  6:     return x * y
  
  ---old_hunk---
  def add(x, y):
      return x + y

### Example response

  1-3:
  There's a typo in the return statement.
  \`\`\`suggestion
  def add(x, y):
      z = x + y
      return z
  \`\`\`
  ---
  5-6:
  LGTM!
  ---

## Changes made to \`$filename\` for your review

$patches
`

  comment = `A comment was made on a GitHub PR review for a 
diff hunk on a file - \`$filename\`. I would like you to follow 
the instructions in that comment. 

## GitHub PR Title

\`$title\`

## Description

\`\`\`
$description
\`\`\`

## Summary generated by the AI bot

\`\`\`
$short_summary
\`\`\`

## Entire diff

\`\`\`diff
$file_diff
\`\`\`

## Diff being commented on

\`\`\`diff
$diff
\`\`\`

## Instructions

Please reply directly to the new comment (instead of suggesting 
a reply) and your reply will be posted as-is.

If the comment contains instructions/requests for you, please comply. 
For example, if the comment is asking you to generate documentation 
comments on the code, in your reply please generate the required code.

In your reply, please make sure to begin the reply by tagging the user 
with "@user".

## Comment format

\`user: comment\`

## Comment chain (including the new comment)

\`\`\`
$comment_chain
\`\`\`

## The comment/request that you need to directly reply to

\`\`\`
$comment
\`\`\`
`

  constructor(summarize = '', summarizeReleaseNotes = '') {
    this.summarize = summarize
    this.summarizeReleaseNotes = summarizeReleaseNotes
  }

  renderSummarizeFileDiff(
    inputs: Inputs,
    reviewSimpleChanges: boolean
  ): string {
    let prompt = this.summarizeFileDiff
    if (reviewSimpleChanges === false) {
      prompt += this.triageFileDiff
    }
    return inputs.render(prompt)
  }

  renderSummarizeChangesets(inputs: Inputs): string {
    return inputs.render(this.summarizeChangesets)
  }

  renderSummarize(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarize
    return inputs.render(prompt)
  }

  renderSummarizeShort(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarizeShort
    return inputs.render(prompt)
  }

  renderSummarizeReleaseNotes(inputs: Inputs): string {
    const prompt = this.summarizePrefix + this.summarizeReleaseNotes
    return inputs.render(prompt)
  }

  renderComment(inputs: Inputs): string {
    return inputs.render(this.comment)
  }

  renderReviewFileDiff(inputs: Inputs): string {
    return inputs.render(this.reviewFileDiff)
  }
}
