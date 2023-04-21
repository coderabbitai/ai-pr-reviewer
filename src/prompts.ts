import {type Inputs} from './inputs.js'

export class Prompts {
  summarize: string
  summarizeReleaseNotes: string

  summarizeFileDiff = `GitHub pull request title: 
\`$title\` 

Description:
\`\`\`
$description
\`\`\`

Content of file \`$filename\` prior to changes:
\`\`\`
$file_content
\`\`\`

Diff:
\`\`\`diff
$file_diff
\`\`\`

I would like you to summarize the diff within 50 words.

Below the summary, I would also like you to triage the diff as \`NEEDS_REVIEW\` or 
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

Changesets:
$raw_summary
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

OpenAI generated notes:
\`\`\`
$release_notes
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
  reviewFileDiff = `GitHub pull request title: 
\`$title\` 

Description:
\`\`\`
$description
\`\`\`

OpenAI generated notes:
\`\`\`
$release_notes
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
- The above format for changes consists of multiple change sections. Each change 
  section consists of a new hunk (annotated with line numbers), an old hunk and 
  optionally, existing comment chains. The line number annotation on each line 
  in the new hunk is of the format \`<line_number><colon><whitespace>\`.  
- Note that the code in the old hunk does not exist anymore as it was replaced 
  by the new hunk. The new hunk is the code that you need to review. Consider 
  the context provided by the old hunk and associated comment chain when reviewing 
  the new hunk.  
- Your task is to do a line by line review of new hunks and point out 
  substantive issues in those line number ranges. For each issue you 
  identify, please provide the exact line number range (inclusive) where 
  the issue occurs.
- Only respond in the below response format (consisting of review
  sections) and nothing else. Each review section must consist of a line 
  number range and a review comment for that line number range. Optionally, 
  you can include a single replacement suggestion snippet and/or multiple 
  new code snippets in the review comment. There's a separator between review 
  sections.
- It's important that line number ranges for each review section must 
  be within the line number range of a specific new hunk. i.e. 
  <start_line_number> must belong to the same hunk as the 
  <end_line_number>. The line number range is sufficient to map your 
  comment to the code changes in GitHub pull request.
- Do not summarize the changes or repeat back provided code in the review 
  comments and only focus on pointing out substantive issues.
- Use Markdown format for review comment text.
- Fenced code blocks must be used for new content and replacement 
  code/text snippets and must not be annotated with line numbers.
- If needed, provide a replacement suggestion using fenced code blocks 
  with the \`suggestion\` as the language identifier. The line number range 
  in the review section must map exactly to the line number range (inclusive) 
  that need to be replaced within a new_hunk.
  For instance, if 2 lines of code in a hunk need to be replaced with 15 lines 
  of code, the line number range must be those exact 2 lines. If an entire hunk 
  need to be replaced with new code, then the line number range must be the 
  entire hunk. Replacement suggestions should be complete units that can be
  directly committed by the user in the GitHub UI.
- Replacement code/text snippets must be complete and correctly 
  formatted. Each replacement suggestion must be provided as a separate review 
  section with relevant line number ranges.  
- If needed, suggest new code using the correct language identifier in the 
  fenced code blocks. These snippets may be added to a different file, such 
  as test cases. Multiple new code snippets are allowed within a single 
  review section.
- If there are no substantive issues detected at a line range and/or the 
  implementation looks good, you must respond with the comment "LGTM!" and 
  nothing else for the respective line range in a review section.
- Reflect on your comments and line number ranges before sending the final 
  response to ensure accuracy of line number ranges and replacement
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
  3-3:
  There's a typo in the return statement.
  \`\`\`suggestion
      return z
  \`\`\`
  ---
  5-6:
  LGTM!
  ---

Changes for review are below:
$patches
`

  constructor(summarize = '', summarizeReleaseNotes = '') {
    this.summarize = summarize
    this.summarizeReleaseNotes = summarizeReleaseNotes
  }

  renderSummarizeFileDiff(inputs: Inputs): string {
    return inputs.render(this.summarizeFileDiff)
  }

  renderSummarizeChangesets(inputs: Inputs): string {
    return inputs.render(this.summarizeChangesets)
  }

  renderSummarize(inputs: Inputs): string {
    return inputs.render(this.summarize)
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
