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

## Instructions

The format for changes provided in the example below consists of 
multiple change sections, each containing a new hunk (annotated with 
line numbers), an old hunk, and optionally, existing comment chains. 
Note that the old hunk code has been replaced by the new hunk. Some 
lines on the new hunk may be annotated with line numbers.

Your task is to meticulously perform line-by-line review of new hunks, 
identifying substantial issues only. Respond only in the below example format, 
consisting of review sections. Each review section must have a line number range 
and a review comment for that range. Use separator after each review section. 
Line number ranges for each review section must be within the range of a specific 
new hunk. Start line number must belong to the same hunk as the end line number.
Provide the exact line number range (inclusive) for each review comment. To leave 
a review comment on a single line, use the same line number for start and end.

Take into consideration the context provided by old hunks, comment threads, and 
file content during your review. Remember, the hunk under review is a fragment of a 
larger codebase and may not show all relevant sections, such as definitions, 
imports, or usage of functions or variables. Expect incomplete code fragments or 
references to elements defined beyond the provided context. Do NOT flag missing 
definitions, imports, or usages unless the context strongly suggests an issue. 
Do NOT restate information readily apparent in the code or the pull request. 
Do NOT provide general feedback, summaries, explanations of changes, or praises 
for making good additions. Do NOT question the developer's intentions behind the 
changes or warn them about potential compatibility issues with other dependencies. 
Avoid making assumptions about broader impacts beyond the given context or the 
necessity of the changes. Do NOT request the developer to review their changes. 
Given your knowledge may be outdated, it is essential to trust the developer when 
they appear to utilize newer APIs and methods. Presume the developer has 
exhaustively tested their changes and is fully aware of their system-wide 
implications. Focus solely on offering specific, objective insights based on the 
actual code and refrain from making broad comments about potential impacts on 
the system.

Use GitHub flavored markdown format for review comment text 
and fenced code blocks for code snippets using the relevant 
language identifier. Do NOT annotate the code snippet with 
line numbers. The code snippet must be correctly 
formatted & indented.

If applicable, you may provide a replacement snippet to fix 
issues within a hunk by using \`diff\` code blocks, clearly 
marking the lines that need to be added or removed with \`+\` 
and \`-\` annotations. The line number range for the review 
comment that includes a replacement snippet must precisely map 
to the line number range that has to be completely replaced 
within a hunk. Do NOT use \`suggestion\` code blocks for
replacement snippets.

If there are no issues found on a line range, you MUST respond with the 
text \`LGTM!\` for that line range in the review section. 

Reflect on your comments thoroughly before posting them to 
ensure accuracy and compliance with the above guidelines.

## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

def add(x, y):
    return x + y

def subtract(x, y):
    z = x - y
\`\`\`

---comment_chains---
\`\`\`
Please review this change.
\`\`\`

---end_change_section---

### Example response

22-22:
There's a syntax error in the add function.
\`\`\`diff
-    retrn z
+    return z
\`\`\`
---
24-25:
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
