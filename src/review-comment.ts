import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'
import {Bot} from './bot.js'
import {
  Commenter,
  COMMENT_REPLY_TAG,
  COMMENT_TAG,
  SUMMARIZE_TAG
} from './commenter.js'
import {Inputs, Options, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN

const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo
const ASK_BOT = '@openai'

export const handleReviewComment = async (
  heavyBot: Bot,
  options: Options,
  prompts: Prompts
) => {
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

    inputs.comment = `${comment.user.login}: ${comment.body}`
    inputs.diff = comment.diff_hunk
    inputs.filename = comment.path

    const {chain: comment_chain, topLevelComment} =
      await commenter.get_conversation_chain(pull_number, comment)
    inputs.comment_chain = comment_chain

    // check whether this chain contains replies from the bot
    if (
      comment_chain.includes(COMMENT_TAG) ||
      comment_chain.includes(COMMENT_REPLY_TAG) ||
      comment.body.includes(ASK_BOT)
    ) {
      let file_content = ''
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
      } catch (error) {
        core.warning(`Failed to get file contents: ${error}, skipping.`)
      }

      let file_diff = ''
      try {
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
        core.warning(`Failed to get file diff: ${error}, skipping.`)
      }

      // get summary of the PR
      const summary = await commenter.find_comment_with_tag(
        SUMMARIZE_TAG,
        pull_number
      )
      if (summary) {
        inputs.summary = summary.body
      }

      if (file_content.length > 0) {
        const file_content_tokens = tokenizer.get_token_count(file_content)
        if (
          file_content_tokens < options.review_token_limits.extra_content_tokens
        ) {
          inputs.file_content = file_content
        }
      }

      if (file_diff.length > 0) {
        // use file diff if no diff was found in the comment
        if (inputs.diff.length === 0) {
          inputs.diff = file_diff
        }
        const file_diff_tokens = tokenizer.get_token_count(file_diff)
        if (
          file_diff_tokens < options.review_token_limits.extra_content_tokens
        ) {
          inputs.file_diff = file_diff
        }
      }

      const [reply] = await heavyBot.chat(prompts.render_comment(inputs), {})

      if (topLevelComment) {
        await commenter.review_comment_reply(
          pull_number,
          topLevelComment,
          reply
        )
      } else {
        core.warning(`Failed to find the top-level comment to reply to`)
      }
    }
  } else {
    core.info(`Skipped: ${context.eventName} event is from the bot itself`)
  }
}
