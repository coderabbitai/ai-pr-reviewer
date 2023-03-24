import * as core from '@actions/core'
import {Bot} from './bot.js'
import {Options, Prompts} from './options.js'
import {handleReviewComment} from './review-comment.js'
import {codeReview} from './review.js'

async function run(): Promise<void> {
  const options: Options = new Options(
    core.getBooleanInput('debug'),
    core.getInput('max_files'),
    core.getBooleanInput('review_comment_lgtm'),
    core.getMultilineInput('path_filters'),
    core.getInput('system_message'),
    core.getInput('openai_model'),
    core.getInput('openai_model_temperature'),
    core.getInput('openai_retries'),
    core.getInput('openai_timeout_ms'),
    core.getInput('openai_concurrency_limit')
  )
  const prompts: Prompts = new Prompts(
    core.getInput('review_beginning'),
    core.getInput('review_file'),
    core.getInput('review_file_diff'),
    core.getInput('review_patch_begin'),
    core.getInput('review_patch'),
    core.getInput('summarize_beginning'),
    core.getInput('summarize_file_diff'),
    core.getInput('summarize'),
    core.getInput('summarize_release_notes'),
    core.getInput('comment_beginning'),
    core.getInput('comment_file'),
    core.getInput('comment_file_diff'),
    core.getInput('comment')
  )

  // initialize openai bot
  let bot: Bot | null = null
  try {
    bot = new Bot(options)
  } catch (e: any) {
    core.warning(
      `Skipped: failed to create bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(bot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(bot, options, prompts)
    } else {
      core.warning('Skipped: this action only works on push event')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      core.setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      core.setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    core.warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    core.warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
