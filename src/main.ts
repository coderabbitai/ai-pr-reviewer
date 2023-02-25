import * as core from '@actions/core'
import {Octokit} from '@octokit/action'

import './fetch-polyfill.js'
import {Bot} from './bot.js'
import {Prompts} from './prompt.js'
import {codeReview} from './review.js'
import {scorePullRequest} from './score.js'

async function run(): Promise<void> {
  const octokit = new Octokit()

  // initialize chatgpt bot
  var bot: Bot
  try {
    bot = new Bot(core.getInput('openai_api_key'))
  } catch (e) {
    core.warning(
      `Skipped: failed to create bot, please check your openai_api_key: ${e}`
    )
    return
  }

  const action: string = core.getInput('action')
  const prompts: Prompts = new Prompts(
    core.getInput('review_beginning'),
    core.getInput('review_patch'),
    core.getInput('scoring')
  )

  try {
    core.info(`running Github action: ${action}`)
    if (action === 'score') {
      await scorePullRequest(bot, prompts)
    } else if (action === 'review') {
      await codeReview(bot, prompts)
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
