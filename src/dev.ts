import {Bot} from './bot'
import {OpenAIOptions, Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'
import {handleReviewComment} from './review-comment'

export async function run(settings: any, requestBody: any): Promise<void> {
  console.log({
    clientId: process.env.GITHUB_APP_CLIENT_ID,
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    installationId: process.env.INSTALLATION_ID,
    appId: process.env.GITHUB_APP_ID,
    privateKey:
      process.env.GITHUB_APP_PEM_FILE &&
      process.env.GITHUB_APP_PEM_FILE.replace(/\\n/g, '\n')
  })

  // end octokit
  const GITHUB_EVENT_NAME: string = settings.github_event_name
  const debug: boolean = settings.debug
  const disableReview: boolean = settings.disable_review
  const disableReleaseNotes: boolean = settings.disable_release_notes
  const maxFiles: string = settings.max_files
  const reviewSimpleChanges: boolean = settings.review_simple_changes
  const reviewCommentLGTM: boolean = settings.review_comment_lgtm
  const pathFilters: string[] = settings.path_filters
  const systemMessage: string = settings.system_message
  const openaiLightModel: string = settings.openai_light_model
  const openaiHeavyModel: string = settings.openai_heavy_model
  const openaiModelTemperature: string = settings.openai_model_temperature
  const openaiRetries: string = settings.openai_retries
  const openaiTimeoutMS: string = settings.openai_timeout_ms
  const openaiConcurrencyLimit: string = settings.openai_concurrency_limit
  const githubConcurrencyLimit: string = settings.github_concurrency_limit
  const apiBaseUrl: string = settings.api_base_url
  const language: string = settings.language
  const options: Options = new Options(
    debug,
    disableReview,
    disableReleaseNotes,
    maxFiles,
    reviewSimpleChanges,
    reviewCommentLGTM,
    pathFilters,
    systemMessage,
    openaiLightModel,
    openaiHeavyModel,
    openaiModelTemperature,
    openaiRetries,
    openaiTimeoutMS,
    openaiConcurrencyLimit,
    githubConcurrencyLimit,
    apiBaseUrl,
    language
  )

  const summarize: string = settings.summarize

  const summarizeReleaseNotes: string = settings.summarize_release_notes

  // print options
  options.print()

  const prompts: Prompts = new Prompts(summarize, summarizeReleaseNotes)

  // Create two bots, one for summary and one for review

  let lightBot: Bot | null = null
  try {
    lightBot = new Bot(
      options,
      new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
    )
  } catch (e: any) {
    console.log(
      `Skipped: failed to create summary bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  let heavyBot: Bot | null = null
  try {
    heavyBot = new Bot(
      options,
      new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
    )
  } catch (e: any) {
    console.log(
      `Skipped: failed to create review bot, please check your openai_api_key: ${e}, backtrace: ${e.stack}`
    )
    return
  }

  try {
    // check if the event is pull_request
    if (
      process.env.GITHUB_EVENT_NAME === 'pull_request' ||
      process.env.GITHUB_EVENT_NAME === 'pull_request_target' ||
      GITHUB_EVENT_NAME === 'pull_request'
    ) {
      await codeReview(lightBot, heavyBot, options, prompts, requestBody)
    } else if (
      process.env.GITHUB_EVENT_NAME === 'pull_request_review_comment'
    ) {
      await handleReviewComment(heavyBot, options, prompts)
    } else {
      console.log(
        'Skipped: this action only works on push events or pull_request'
      )
    }
  } catch (e: any) {
    if (e instanceof Error) {
      console.log(`Failed to run: ${e.message}, backtrace: ${e.stack}`)
    } else {
      console.log(`Failed to run: ${e}, backtrace: ${e.stack}`)
    }
  }
}

process
  .on('unhandledRejection', (reason, p) => {
    console.log(`Unhandled Rejection at Promise: ${reason}, promise is ${p}`)
  })
  .on('uncaughtException', (e: any) => {
    console.log(`Uncaught Exception thrown: ${e}, backtrace: ${e.stack}`)
  })
