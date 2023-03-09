import * as core from '@actions/core'
import {Bot} from './bot.js'
import {Options, Prompts} from './options.js'
import {codeReview} from './review.js'
import {scorePullRequest} from './score.js'

async function run(): Promise<void> {
  const action: string = core.getInput('action')
  let options: Options = new Options(
    core.getBooleanInput('debug'),
    core.getInput('chatgpt_reverse_proxy'),
    core.getBooleanInput('review_comment_lgtm'),
    core.getMultilineInput('path_filters')
  )
  const prompts: Prompts = new Prompts(
    core.getInput('review_beginning'),
    core.getInput('review_file'),
    core.getInput('review_file_diff'),
    core.getInput('review_patch'),
    core.getInput('scoring_beginning'),
    core.getInput('scoring')
  )

  // initialize chatgpt bot
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
    core.info(`running Github action: ${action}`)
    if (action === 'score') {
      await scorePullRequest(bot, options, prompts)
    } else if (action === 'review') {
      await codeReview(bot, options, prompts)
    } else {
      core.warning(`Unknown action: ${action}`)
    }
  } catch (e: any) {
    if (e instanceof Error) {
      core.setFailed(
        `Failed to run the chatgpt-actions: ${e.message}, backtrace: ${e.stack}`
      )
    } else {
      core.setFailed(
        `Failed to run the chatgpt-actions: ${e}, backtrace: ${e.stack}`
      )
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p)
    core.warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    console.error(e, 'Uncaught Exception thrown')
    core.warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
