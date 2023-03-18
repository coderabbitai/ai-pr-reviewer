import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {Commenter, COMMENT_REPLY_TAG, COMMENT_TAG} from './commenter'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN

const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

export const handleReviewComment = async (bot: Bot) => {
  const commenter: Commenter = new Commenter()

  if (context.eventName !== 'pull_request_review_comment') {
    core.warning(
      `Skipped: ${context.eventName} is not a pull_request_review_comment event`
    )
    return
  }

  if (!context.payload) {
    core.warning(`Skipped: ${context.eventName} event is missing payload`)
    return
  }

  const comment = context.payload.comment
  if (!comment) {
    core.warning(`Skipped: ${context.eventName} event is missing comment`)
    return
  }
  if (!context.payload.pull_request || !context.payload.repository) {
    core.warning(`Skipped: ${context.eventName} event is missing pull_request`)
    return
  }

  // Check if the comment is not from the bot itself
  if (!comment.body.includes(COMMENT_TAG)) {
    const pull_number = context.payload.pull_request.number
    const diffHunk = comment.diff_hunk

    const conversationChain = await commenter.getConversationChain(
      pull_number,
      comment
    )
    // check whether this chain contains replies from the bot
    if (conversationChain.includes(COMMENT_TAG)) {
      const prompt = `I would like you to reply to the new review comment made on a conversation chain on a code review diff.
Diff:
\`\`\`diff
${diffHunk}
\`\`\`
Conversation chain:
\`\`\`
${conversationChain}
\`\`\`
Please reply to the latest comment in the conversation chain.
`
      const [reply] = await bot.chat(prompt, {})
      const message = `${COMMENT_REPLY_TAG}\n${reply}`
      // Post the reply to the user comment
      await octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: pull_number,
        body: message,
        in_reply_to: comment.id
      })
    }
  }
}
