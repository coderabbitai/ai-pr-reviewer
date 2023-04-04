import * as core from '@actions/core'
import {Bot} from './bot.js'
import {Options, Prompts} from './options.js'
import {handleReviewComment} from './review-comment.js'
import {codeReview} from './review.js'

async function run(): Promise<void> {
  const options: Options = new Options(
    core.getBooleanInput('debug'),
    core.getInput('max_files_to_summarize'),
    core.getInput('max_files_to_review'),
    core.getBooleanInput('review_comment_lgtm'),
    core.getMultilineInput('path_filters'),
    core.getInput('system_message'),
    core.getInput('openai_model'),
    core.getInput('openai_model_temperature'),
    core.getInput('openai_retries'),
    core.getInput('openai_timeout_ms'),
    core.getInput('openai_concurrency_limit')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    core.getInput('review_beginning'),
    core.getInput('review_file'),
    core.getInput('review_file_diff'),
    core.getInput('review_patch_begin'),
    core.getInput('review_patch'),
    core.getInput('summarize_beginning_and_diff'),
    core.getInput('summarize'),
    core.getInput('summarize_release_notes'),
    core.getInput('comment_beginning'),
    core.getInput('comment_file'),
    core.getInput('comment_file_diff'),
    core.getInput('comment')
  )

  // Create two bots, one for summary and one for review
  let botModel = 'gpt-3.5-turbo'

  let summaryBot: Bot | null = null
  try {
    summaryBot = new Bot(options, botModel)
  } catch (e: any) {
    core.warning(
      `Skipped: failed to create summary bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }
  // initialize openai bot
  botModel = 'gpt-3.5-turbo'
  let reviewBot: Bot | null = null
  try {
    reviewBot = new Bot(options, botModel)
  } catch (e: any) {
    core.warning(
      `Skipped: failed to create review bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target'
    ) {
      await codeReview(summaryBot, reviewBot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(reviewBot, options, prompts)
    } else {
      core.warning(
        'Skipped: this action only works on push events or pull_reques'
      )
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
