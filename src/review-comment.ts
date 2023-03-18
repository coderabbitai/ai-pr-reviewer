import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {
  Commenter,
  COMMENT_GREETING,
  COMMENT_REPLY_TAG,
  COMMENT_TAG
} from './commenter.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN

const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo
const ASK_BOT = '@openai'

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

  // check if the comment was created and not edited or deleted
  if (context.payload.action !== 'created') {
    core.warning(`Skipped: ${context.eventName} event is not created`)
    return
  }

  // Check if the comment is not from the bot itself
  if (
    !comment.body.includes(COMMENT_TAG) &&
    !comment.body.includes(COMMENT_REPLY_TAG)
  ) {
    const pull_number = context.payload.pull_request.number
    const diffHunk = comment.diff_hunk

    const {chain, topLevelComment} = await commenter.getConversationChain(
      pull_number,
      comment
    )
    core.info(`Conversation chain: ${chain}`)
    // check whether this chain contains replies from the bot
    if (
      chain.includes(COMMENT_TAG) ||
      chain.includes(COMMENT_REPLY_TAG) ||
      comment.body.startsWith(ASK_BOT)
    ) {
      const prompt = `I would like you to reply to the new comment made on a conversation chain on a code review diff.

Diff:
\`\`\`diff
${diffHunk}
\`\`\`

Conversation chain (including the new comment):
\`\`\`
${chain}
\`\`\`

Please reply to the new comment in the conversation chain without extra prose as that reply will be posted as-is. Make sure to tag the user in your reply. Providing below the new comment again as reference:
\`\`\`
${comment.user.login}: ${comment.body}
\`\`\`
`

      const [reply] = await bot.chat(prompt, {})
      const message = `${COMMENT_GREETING}

${reply}

${COMMENT_REPLY_TAG}
`
      if (topLevelComment) {
        const topLevelCommentId = topLevelComment.id
        try {
          // Post the reply to the user comment
          await octokit.pulls.createReplyForReviewComment({
            owner: repo.owner,
            repo: repo.repo,
            pull_number,
            body: message,
            comment_id: topLevelCommentId
          })
          // replace COMMENT_TAG with COMMENT_REPLY_TAG in topLevelComment
          const newBody = topLevelComment.body.replace(
            COMMENT_TAG,
            COMMENT_REPLY_TAG
          )
          await octokit.pulls.updateReviewComment({
            owner: repo.owner,
            repo: repo.repo,
            comment_id: topLevelCommentId,
            body: newBody
          })
        } catch (error) {
          core.warning(`Failed to reply to the top-level comment`)
        }
      } else {
        core.warning(`Failed to find the top-level comment to reply to`)
      }
    }
  } else {
    core.info(`Skipped: ${context.eventName} event is from the bot itself`)
  }
}
