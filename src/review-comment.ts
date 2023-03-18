import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {
  Commenter,
  COMMENT_GREETING,
  COMMENT_REPLY_TAG,
  COMMENT_TAG,
  SUMMARIZE_TAG
} from './commenter.js'
import {Inputs, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN

const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo
const ASK_BOT = '@openai'
const MAX_TOKENS_FOR_EXTRA_CONTENT = 2500

export const handleReviewComment = async (bot: Bot, prompts: Prompts) => {
  const commenter: Commenter = new Commenter()
  const inputs: Inputs = new Inputs()

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
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body) {
    inputs.description = context.payload.pull_request.body
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
    const diff = comment.diff_hunk

    inputs.comment = `${comment.user.login}: ${comment.body}`
    inputs.diff = diff

    const {chain: comment_chain, topLevelComment} =
      await commenter.get_conversation_chain(pull_number, comment)
    inputs.comment_chain = comment_chain

    // check whether this chain contains replies from the bot
    if (
      comment_chain.includes(COMMENT_TAG) ||
      comment_chain.includes(COMMENT_REPLY_TAG) ||
      comment.body.startsWith(ASK_BOT)
    ) {
      let file_content = ''
      let file_diff = ''
      try {
        const contents = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.repo,
          path: comment.path,
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
        // get diff for this file by comparing the base and head commits
        const diffAll = await octokit.repos.compareCommits({
          owner: repo.owner,
          repo: repo.repo,
          base: context.payload.pull_request.base.sha,
          head: context.payload.pull_request.head.sha
        })
        if (diffAll.data) {
          const files = diffAll.data.files
          if (files) {
            const file = files.find(f => f.filename === comment.path)
            if (file && file.patch) {
              file_diff = file.patch
            }
          }
        }
      } catch (error) {
        core.warning(`Failed to get file contents: ${error}, skipping.`)
      }

      // get summary of the PR
      const summary = await commenter.find_comment_with_tag(
        SUMMARIZE_TAG,
        pull_number
      )
      if (summary) {
        inputs.summary = summary.body
      }

      inputs.filename = comment.path
      inputs.file_content = file_content
      inputs.file_diff = file_diff

      // begin comment generation
      const [, comment_begin_ids] = await bot.chat(
        prompts.render_comment_beginning(inputs),
        {}
      )
      let next_comment_ids = comment_begin_ids
      if (file_content.length > 0) {
        const file_content_tokens = tokenizer.get_token_count(file_content)
        if (file_content_tokens < MAX_TOKENS_FOR_EXTRA_CONTENT) {
          const [file_content_resp, file_content_ids] = await bot.chat(
            prompts.render_comment_file(inputs),
            next_comment_ids
          )
          if (file_content_resp) {
            next_comment_ids = file_content_ids
          }
        }
      }

      if (file_diff.length > 0) {
        const file_diff_tokens = tokenizer.get_token_count(file_diff)
        if (file_diff_tokens < MAX_TOKENS_FOR_EXTRA_CONTENT) {
          const [file_diff_resp, file_diff_ids] = await bot.chat(
            prompts.render_comment_file_diff(inputs),
            next_comment_ids
          )
          if (file_diff_resp) {
            next_comment_ids = file_diff_ids
          }
        }
      }

      const [reply] = await bot.chat(
        prompts.render_comment(inputs),
        next_comment_ids
      )

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
