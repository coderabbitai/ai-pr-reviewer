import * as core from '@actions/core'
import {Bot} from './bot.js'
import {OpenAIOptions, Options, Prompts} from './options.js'
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
    core.getInput('openai_summary_model'),
    core.getInput('openai_review_model'),
    core.getInput('openai_model_temperature'),
    core.getInput('openai_retries'),
    core.getInput('openai_timeout_ms'),
    core.getInput('openai_concurrency_limit')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    core.getInput('review_file_diff'),
    core.getInput('summarize_file_diff'),
    core.getInput('summarize'),
    core.getInput('summarize_release_notes'),
    core.getInput('comment')
  )

  // Create two bots, one for summary and one for review

  let lightBot: Bot | null = null
  try {
    lightBot = new Bot(
      options,
      new OpenAIOptions(
        options.openai_summary_model,
        options.summary_token_limits
      )
    )
  } catch (e: any) {
    core.warning(
      `Skipped: failed to create summary bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  let heavyBot: Bot | null = null
  try {
    heavyBot = new Bot(
      options,
      new OpenAIOptions(
        options.openai_review_model,
        options.review_token_limits
      )
    )
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
      await codeReview(lightBot, heavyBot, options, prompts)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(heavyBot, options, prompts)
    } else {
      core.warning(
        'Skipped: this action only works on push events or pull_request'
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
