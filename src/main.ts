import * as core from '@actions/core'

import './fetch-polyfill.js'
import {Bot} from './bot.js'
import {Prompts, Options} from './options.js'
import {codeReview} from './review.js'
import {scorePullRequest} from './score.js'

async function run(): Promise<void> {
  const action: string = core.getInput('action')
  const prompts: Prompts = new Prompts(
    core.getInput('review_beginning'),
    core.getInput('review_patch'),
    core.getInput('scoring')
  )
  let options: Options = new Options(
    core.getBooleanInput('debug'),
    core.getInput('chatgpt_reverse_proxy'),
    core.getBooleanInput('review_comment_lgtm')
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

run()
