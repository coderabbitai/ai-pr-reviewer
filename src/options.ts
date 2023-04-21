import * as core from '@actions/core'
import {minimatch} from 'minimatch'
import {TokenLimits} from './limits.js'

export class Options {
  debug: boolean
  summary_only: boolean
  max_files: number
  review_comment_lgtm: boolean
  path_filters: PathFilter
  system_message: string
  openai_light_model: string
  openai_heavy_model: string
  openai_model_temperature: number
  openai_retries: number
  openai_timeout_ms: number
  openai_concurrency_limit: number
  light_token_limits: TokenLimits
  heavy_token_limits: TokenLimits

  constructor(
    debug: boolean,
    summary_only: boolean,
    max_files = '0',
    review_comment_lgtm = false,
    path_filters: string[] | null = null,
    system_message = '',
    openai_light_model = 'gpt-3.5-turbo',
    openai_heavy_model = 'gpt-3.5-turbo',
    openai_model_temperature = '0.0',
    openai_retries = '3',
    openai_timeout_ms = '120000',
    openai_concurrency_limit = '4'
  ) {
    this.debug = debug
    this.summary_only = summary_only
    this.max_files = parseInt(max_files)
    this.review_comment_lgtm = review_comment_lgtm
    this.path_filters = new PathFilter(path_filters)
    this.system_message = system_message
    this.openai_light_model = openai_light_model
    this.openai_heavy_model = openai_heavy_model
    this.openai_model_temperature = parseFloat(openai_model_temperature)
    this.openai_retries = parseInt(openai_retries)
    this.openai_timeout_ms = parseInt(openai_timeout_ms)
    this.openai_concurrency_limit = parseInt(openai_concurrency_limit)
    this.light_token_limits = new TokenLimits(openai_light_model)
    this.heavy_token_limits = new TokenLimits(openai_heavy_model)
  }

  // print all options using core.info
  print(): void {
    core.info(`debug: ${this.debug}`)
    core.info(`summary_only: ${this.summary_only}`)
    core.info(`max_files: ${this.max_files}`)
    core.info(`review_comment_lgtm: ${this.review_comment_lgtm}`)
    core.info(`path_filters: ${this.path_filters}`)
    core.info(`system_message: ${this.system_message}`)
    core.info(`openai_light_model: ${this.openai_light_model}`)
    core.info(`openai_heavy_model: ${this.openai_heavy_model}`)
    core.info(`openai_model_temperature: ${this.openai_model_temperature}`)
    core.info(`openai_retries: ${this.openai_retries}`)
    core.info(`openai_timeout_ms: ${this.openai_timeout_ms}`)
    core.info(`openai_concurrency_limit: ${this.openai_concurrency_limit}`)
    core.info(`summary_token_limits: ${this.light_token_limits.string()}`)
    core.info(`review_token_limits: ${this.heavy_token_limits.string()}`)
  }

  check_path(path: string): boolean {
    const ok = this.path_filters.check(path)
    core.info(`checking path: ${path} => ${ok}`)
    return ok
  }
}

export class PathFilter {
  private rules: [string /* rule */, boolean /* exclude */][]

  constructor(rules: string[] | null = null) {
    this.rules = []
    if (rules) {
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
  token_limits: TokenLimits

  constructor(
    model = 'gpt-3.5-turbo',
    token_limits: TokenLimits | null = null
  ) {
    this.model = model
    this.token_limits = token_limits || new TokenLimits(model)
  }
}
