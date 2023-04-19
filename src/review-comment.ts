import * as core from '@actions/core'
import * as github from '@actions/github'
import {Bot} from './bot.js'
import {
  Commenter,
  COMMENT_REPLY_TAG,
  COMMENT_TAG,
  EXTRA_CONTENT_TAG,
  SUMMARIZE_TAG
} from './commenter.js'
import {octokit} from './octokit.js'
import {Inputs, Options, Prompts} from './options.js'
import * as tokenizer from './tokenizer.js'

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
    inputs.description = commenter.get_description(
      context.payload.pull_request.body
    )
    inputs.release_notes = commenter.get_release_notes(
      context.payload.pull_request.body
    )
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
      await commenter.get_comment_chain(pull_number, comment)

    if (!topLevelComment) {
      core.warning(`Failed to find the top-level comment to reply to`)
      return
    }

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

      // use file diff if no diff was found in the comment
      if (inputs.diff.length === 0) {
        if (file_diff.length > 0) {
          inputs.diff = file_diff
          file_diff = ''
        } else {
          await commenter.review_comment_reply(
            pull_number,
            topLevelComment,
            'Cannot reply to this comment as diff could not be found.'
          )
          return
        }
      }

      // get summary of the PR
      const summary = await commenter.find_comment_with_tag(
        SUMMARIZE_TAG,
        pull_number
      )
      if (summary) {
        // remove all content below EXTRA_CONTENT_TAG
        inputs.summary = summary.body.split(EXTRA_CONTENT_TAG)[0]
      }

      // get tokens so far
      let tokens = tokenizer.get_token_count(prompts.render_comment(inputs))

      if (tokens > options.heavy_token_limits.request_tokens) {
        await commenter.review_comment_reply(
          pull_number,
          topLevelComment,
          'Cannot reply to this comment as diff being commented is too large and exceeds the token limit.'
        )
        return
      }

      // pack file content and diff into the inputs if they are not too long
      if (file_content.length > 0) {
        // count occurrences of $file_content in prompt
        const file_content_count =
          prompts.comment.split('$file_content').length - 1
        const file_content_tokens = tokenizer.get_token_count(file_content)
        if (
          file_content_count > 0 &&
          tokens + file_content_tokens * file_content_count <=
            options.heavy_token_limits.request_tokens
        ) {
          tokens += file_content_tokens * file_content_count
          inputs.file_content = file_content
        }
      }

      if (file_diff.length > 0) {
        // count occurrences of $file_diff in prompt
        const file_diff_count = prompts.comment.split('$file_diff').length - 1
        const file_diff_tokens = tokenizer.get_token_count(file_diff)
        if (
          file_diff_count > 0 &&
          tokens + file_diff_tokens * file_diff_count <=
            options.heavy_token_limits.request_tokens
        ) {
          tokens += file_diff_tokens * file_diff_count
          inputs.file_diff = file_diff
        }
      }

      const [reply] = await heavyBot.chat(prompts.render_comment(inputs), {})

      await commenter.review_comment_reply(pull_number, topLevelComment, reply)
    }
  } else {
    core.info(`Skipped: ${context.eventName} event is from the bot itself`)
  }
}
