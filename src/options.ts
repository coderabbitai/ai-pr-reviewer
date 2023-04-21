import * as core from '@actions/core'
import {minimatch} from 'minimatch'
import {TokenLimits} from './limits.js'

export class Options {
  debug: boolean
  summaryOnly: boolean
  maxFiles: number
  reviewCommentLGTM: boolean
  pathFilters: PathFilter
  systemMessage: string
  openaiLightModel: string
  openaiHeavyModel: string
  openaiModelTemperature: number
  openaiRetries: number
  openaiTimeoutMS: number
  openaiConcurrencyLimit: number
  lightTokenLimits: TokenLimits
  heavyTokenLimits: TokenLimits

  constructor(
    debug: boolean,
    summaryOnly: boolean,
    maxFiles = '0',
    reviewCommentLGTM = false,
    pathFilters: string[] | null = null,
    systemMessage = '',
    openaiLightModel = 'gpt-3.5-turbo',
    openaiHeavyModel = 'gpt-3.5-turbo',
    openaiModelTemperature = '0.0',
    openaiRetries = '3',
    openaiTimeoutMS = '120000',
    openaiConcurrencyLimit = '4'
  ) {
    this.debug = debug
    this.summaryOnly = summaryOnly
    this.maxFiles = parseInt(maxFiles)
    this.reviewCommentLGTM = reviewCommentLGTM
    this.pathFilters = new PathFilter(pathFilters)
    this.systemMessage = systemMessage
    this.openaiLightModel = openaiLightModel
    this.openaiHeavyModel = openaiHeavyModel
    this.openaiModelTemperature = parseFloat(openaiModelTemperature)
    this.openaiRetries = parseInt(openaiRetries)
    this.openaiTimeoutMS = parseInt(openaiTimeoutMS)
    this.openaiConcurrencyLimit = parseInt(openaiConcurrencyLimit)
    this.lightTokenLimits = new TokenLimits(openaiLightModel)
    this.heavyTokenLimits = new TokenLimits(openaiHeavyModel)
  }

  // print all options using core.info
  print(): void {
    core.info(`debug: ${this.debug}`)
    core.info(`summary_only: ${this.summaryOnly}`)
    core.info(`max_files: ${this.maxFiles}`)
    core.info(`review_comment_lgtm: ${this.reviewCommentLGTM}`)
    core.info(`path_filters: ${this.pathFilters}`)
    core.info(`system_message: ${this.systemMessage}`)
    core.info(`openai_light_model: ${this.openaiLightModel}`)
    core.info(`openai_heavy_model: ${this.openaiHeavyModel}`)
    core.info(`openai_model_temperature: ${this.openaiModelTemperature}`)
    core.info(`openai_retries: ${this.openaiRetries}`)
    core.info(`openai_timeout_ms: ${this.openaiTimeoutMS}`)
    core.info(`openai_concurrency_limit: ${this.openaiConcurrencyLimit}`)
    core.info(`summary_token_limits: ${this.lightTokenLimits.string()}`)
    core.info(`review_token_limits: ${this.heavyTokenLimits.string()}`)
  }

  checkPath(path: string): boolean {
    const ok = this.pathFilters.check(path)
    core.info(`checking path: ${path} => ${ok}`)
    return ok
  }
}

export class PathFilter {
  private readonly rules: Array<[string /* rule */, boolean /* exclude */]>

  constructor(rules: string[] | null = null) {
    this.rules = []
    if (rules != null) {
      for (const rule of rules) {
        const trimmed = rule?.trim()
        if (trimmed) {
          if (trimmed.startsWith('!')) {
            this.rules.push([trimmed.substring(1).trim(), true])
          } else {
            this.rules.push([trimmed, false])
          }
        }
      }
    }
  }

  check(path: string): boolean {
    if (this.rules.length === 0) {
      return true
    }

    let included = false
    let excluded = false
    let inclusionRuleExists = false

    for (const [rule, exclude] of this.rules) {
      if (minimatch(path, rule)) {
        if (exclude) {
          excluded = true
        } else {
          included = true
        }
      }
      if (!exclude) {
        inclusionRuleExists = true
      }
    }

    return (!inclusionRuleExists || included) && !excluded
  }
}

export class OpenAIOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'gpt-3.5-turbo', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}
