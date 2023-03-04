import {Bot} from './bot.js'
import {Prompts, Options} from './options.js'
import {codeReview} from './review.js'
import {scorePullRequest} from './score.js'
import * as core from '@actions/core'

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
    core.getInput('review_patch'),
    core.getInput('scoring_beginning'),
    core.getInput('scoring')
  )

  // initialize chatgpt bot
  let bot: Bot | null = null
  try {
    bot = new Bot(options)
  } catch (e) {
    core.warning(
      `Skipped: failed to create bot, please check your openai_api_key: ${e}`
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
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p)
    core.warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown')
    core.warning(`Uncaught Exception thrown: ${err}`)
  })

await run()
