import {
  getBooleanInput,
  getInput,
  getMultilineInput,
  setFailed,
  warning
} from '@actions/core'
import {AzureBot} from './azure-bot'
import {Bot} from './bot'
import {BotProtocol} from './bot-interface'

import {OpenAIOptions, Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'
import {handleReviewComment} from './review-comment'

async function run(): Promise<void> {
  const options: Options = new Options(
    getBooleanInput('debug'),
    getBooleanInput('disable_review'),
    getBooleanInput('disable_release_notes'),
    getInput('max_files'),
    getBooleanInput('review_simple_changes'),
    getBooleanInput('review_comment_lgtm'),
    getMultilineInput('path_filters'),
    getInput('system_message'),
    getInput('openai_light_model'),
    getInput('openai_heavy_model'),
    getInput('openai_model_temperature'),
    getInput('openai_retries'),
    getInput('openai_timeout_ms'),
    getInput('openai_concurrency_limit'),
    getInput('github_concurrency_limit'),
    getInput('openai_base_url'),
    getInput('language'),
    getInput('azure_api_instance_name'),
    getInput('azure_api_deployment_name'),
    getInput('azure_api_version')
  )

  // print options
  options.print()

  const prompts: Prompts = new Prompts(
    getInput('summarize'),
    getInput('summarize_release_notes')
  )

  // Create two bots, one for summary and one for review

  let lightBot: BotProtocol | null = null
  try {
    if (options.azureApiDeployment.length > 0) {
      lightBot = new AzureBot(
        options,
        new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
      )
    } else {
      lightBot = new Bot(
        options,
        new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
      )
    }
  } catch (e: any) {
    warning(
      `Skipped: failed to create summary bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  let heavyBot: BotProtocol | null = null
  try {
    if (options.azureApiDeployment.length > 0) {
      heavyBot = new AzureBot(
        options,
        new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
      )
    } else {
      heavyBot = new Bot(
        options,
        new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
      )
    }
  } catch (e: any) {
    warning(
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
      warning('Skipped: this action only works on push events or pull_request')
    }
  } catch (e: any) {
    if (e instanceof Error) {
      setFailed(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      setFailed(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    warning(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    warning(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })

await run()
