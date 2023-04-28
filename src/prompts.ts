import {type Inputs} from './inputs'

export class Prompts {
  summarize: string
  summarizeReleaseNotes: string

  summarizeFileDiff = `GitHub pull request title: 
\`$title\` 

Description:
\`\`\`
$description
\`\`\`

Diff:
\`\`\`diff
$file_diff
\`\`\`

I would like you to summarize the diff within 50 words.
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

You must follow the format below strictly for triaging the diff and 
do not add any additional text in your response:
[TRIAGE]: <NEEDS_REVIEW or APPROVED>
`
  summarizeChangesets = `Provided below are changesets in this pull request. Changesets 
are in chronlogical order and new changesets are appended to the
end of the list. The format consists of filename(s) and the summary 
of changes for those files. There is a separator between each changeset.
Your task is to de-deduplicate and group together files with
related/similar changes into a single changeset. Respond with the updated 
changesets using the same format as the input. 

$raw_summary
`

  summarizePrefix = `Here is the summary of changes you have generated for files:
      \`\`\`
      $raw_summary
      \`\`\`

`

  reviewFileDiff = `GitHub pull request title: 
\`$title\` 

Description:
\`\`\`
$description
\`\`\`

Content of \`$filename\` prior to changes:
\`\`\`
$file_content
\`\`\`

Format for changes:
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

Instructions:

- The format for changes provided above consists of multiple change 
  sections, each containing a new hunk (annotated with line numbers), 
  an old hunk, and optionally, existing comment chains. Note that the 
  old hunk code has been replaced by the new hunk. The line number 
  annotation on each line in the new hunk is of the format 
  \`<line_number><colon><whitespace>\` , i.e. \`^*(\\d+): \`.
- Your task is to review ONLY the new hunks line by line, ONLY pointing out 
  substantive issues within line number ranges. Provide the exact line 
  number range (inclusive) for each issue. Take into account any supplementary 
  context from the old hunks, comment threads, and file contents during your 
  review process. Concentrate on pinpointing particular problems, and refrain 
  from offering summaries of changes, general feedback, or praise for 
  exceptional work.
- IMPORTANT: Respond only in the response format (consisting of review 
  sections). Each review section must have a line number range and a review 
  comment for that range. Do not include general feedback or summaries. You 
  may optionally include a single replacement suggestion snippet and/or 
  multiple new code snippets in the review comment. Separate review sections 
  using separators.
- IMPORTANT: Line number ranges for each review section must be within the 
  range of a specific new hunk. <start_line_number> must belong to the same 
  hunk as the <end_line_number>. The line number range is sufficient to map 
  your comment to the code changes in the GitHub pull request.
- Use Markdown format for review comment text and fenced code blocks for
  code snippets. Do not annotate code snippets with line numbers.
- If needed, provide replacement code suggestions to fix the issue by using 
  fenced code blocks with the \`suggestion\` as the language identifier. The 
  line number range must map exactly to the range (inclusive) that needs to 
  be replaced within a new hunk. For instance, if 2 lines of code in a hunk 
  need to be replaced with 15 lines of code, the line number range must be 
  those exact 2 lines. If an entire hunk need to be replaced with new code, 
  then the line number range must be the entire hunk and the new code must
  exactly replace all the lines in the hunk.
- Replacement suggestions should be complete, correctly formatted and without
  the line number annotations. Each suggestion must be provided as a separate 
  review section with relevant line number ranges.
- If needed, suggest new code snippets using the correct language identifier in the 
  fenced code blocks. These snippets may be added to a different file 
  (e.g. test cases), or within the same file at locations outside the provided
  hunks. Multiple new code snippets are allowed within a single review section.
- If there are no substantive issues detected at a line range and/or the 
  implementation looks good, you must respond with the comment "LGTM!" and 
  nothing else for the respective line range in a review section.
- Reflect on your comments and line number ranges before sending the final 
  response to ensure accuracy of line number ranges and replacement snippets.

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

Example response:
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

Changes for review are below:
$patches
`

  comment = `A comment was made on a GitHub pull request review for a 
diff hunk on file \`$filename\`. I would like you to follow 
the instructions in that comment. 

Pull request title:
\`$title\`

Description:
\`\`\`
$description
\`\`\`

OpenAI generated summary:
\`\`\`
$raw_summary
\`\`\`

Content of file prior to changes:
\`\`\`
$file_content
\`\`\`

Entire diff:
\`\`\`diff
$file_diff
\`\`\`

Diff being commented on:
\`\`\`diff
$diff
\`\`\`

The format of a comment in the chain is:
\`user: comment\`

Comment chain (including the new comment):
\`\`\`
$comment_chain
\`\`\`

Please reply directly to the new comment (instead of suggesting 
a reply) and your reply will be posted as-is.

If the comment contains instructions/requests for you, please comply. 
For example, if the comment is asking you to generate documentation 
comments on the code, in your reply please generate the required code.

In your reply, please make sure to begin the reply by tagging the user 
with "@user".

The comment/request that you need to directly reply to:
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

  renderSummarizeReleaseNotes(inputs: Inputs): string {
    return inputs.render(this.summarizeReleaseNotes)
  }

  renderComment(inputs: Inputs): string {
    return inputs.render(this.comment)
  }

  renderReviewFileDiff(inputs: Inputs): string {
    return inputs.render(this.reviewFileDiff)
  }
}
