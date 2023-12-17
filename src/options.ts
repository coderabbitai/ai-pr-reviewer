import {info} from '@actions/core'
import {minimatch} from 'minimatch'
import {TokenLimits} from './limits'

export class Options {
  debug: boolean
  disableReview: boolean
  disableReleaseNotes: boolean
  maxFiles: number
  reviewSimpleChanges: boolean
  reviewCommentLGTM: boolean
  pathFilters: PathFilter
  systemMessage: string
  replyForSystemMessage: string
  vertexaiProjectID: string
  vertexaiLocation: string
  vertexaiLightModel: string
  vertexaiHeavyModel: string
  vertexaiModelTemperature: number
  vertexaiModelTopK: number
  vertexaiModelTopP: number
  vertexaiRetries: number
  vertexaiConcurrencyLimit: number
  githubConcurrencyLimit: number
  lightTokenLimits: TokenLimits
  heavyTokenLimits: TokenLimits
  // apiBaseUrl: string
  language: string

  constructor(
    debug: boolean,
    disableReview: boolean,
    disableReleaseNotes: boolean,
    maxFiles = '0',
    reviewSimpleChanges = false,
    reviewCommentLGTM = false,
    pathFilters: string[] | null = null,
    systemMessage = '',
    replyForSystemMessage = '',
    vertexaiProjectID: string,
    vertexaiLocation = 'us-central1',
    vertexaiLightModel = 'gemini-pro',
    vertexaiHeavyModel = 'gemini-pro',
    vertexaiModelTemperature = '0.9',
    vertexaiModelTopK = '32',
    vertexaiModelTopP = '1.0',
    vertexaiRetries = '3',
    vertexaiConcurrencyLimit = '6',
    githubConcurrencyLimit = '6',
    // apiBaseUrl = 'https://api.vertexai.com/v1',
    language = 'en-US'
  ) {
    this.debug = debug
    this.disableReview = disableReview
    this.disableReleaseNotes = disableReleaseNotes
    this.maxFiles = parseInt(maxFiles)
    this.reviewSimpleChanges = reviewSimpleChanges
    this.reviewCommentLGTM = reviewCommentLGTM
    this.pathFilters = new PathFilter(pathFilters)
    this.systemMessage = systemMessage
    this.replyForSystemMessage = replyForSystemMessage
    this.vertexaiProjectID = vertexaiProjectID
    this.vertexaiLocation = vertexaiLocation
    this.vertexaiLightModel = vertexaiLightModel
    this.vertexaiHeavyModel = vertexaiHeavyModel
    this.vertexaiModelTemperature = parseFloat(vertexaiModelTemperature)
    this.vertexaiModelTopK = parseInt(vertexaiModelTopK)
    this.vertexaiModelTopP = parseFloat(vertexaiModelTopP)
    this.vertexaiRetries = parseInt(vertexaiRetries)
    this.vertexaiConcurrencyLimit = parseInt(vertexaiConcurrencyLimit)
    this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit)
    this.lightTokenLimits = new TokenLimits(vertexaiLightModel)
    this.heavyTokenLimits = new TokenLimits(vertexaiHeavyModel)
    // this.apiBaseUrl = apiBaseUrl
    this.language = language
  }

  // print all options using core.info
  print(): void {
    info(`debug: ${this.debug}`)
    info(`disable_review: ${this.disableReview}`)
    info(`disable_release_notes: ${this.disableReleaseNotes}`)
    info(`max_files: ${this.maxFiles}`)
    info(`review_simple_changes: ${this.reviewSimpleChanges}`)
    info(`review_comment_lgtm: ${this.reviewCommentLGTM}`)
    info(`path_filters: ${this.pathFilters}`)
    info(`system_message: ${this.systemMessage}`)
    info(`reply_for_system_message: ${this.replyForSystemMessage}`)
    info(`vertexai_project_id: ${this.vertexaiProjectID}`)
    info(`vertexai_location: ${this.vertexaiLocation}`)
    info(`vertexai_light_model: ${this.vertexaiLightModel}`)
    info(`vertexai_heavy_model: ${this.vertexaiHeavyModel}`)
    info(`vertexai_model_temperature: ${this.vertexaiModelTemperature}`)
    info(`vertexai_model_top_k: ${this.vertexaiModelTopK}`)
    info(`vertexai_model_top_p: ${this.vertexaiModelTopP}`)
    info(`vertexai_retries: ${this.vertexaiRetries}`)
    info(`vertexai_concurrency_limit: ${this.vertexaiConcurrencyLimit}`)
    info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`)
    info(`summary_token_limits: ${this.lightTokenLimits.string()}`)
    info(`review_token_limits: ${this.heavyTokenLimits.string()}`)
    // info(`api_base_url: ${this.apiBaseUrl}`)
    info(`language: ${this.language}`)
  }

  checkPath(path: string): boolean {
    const ok = this.pathFilters.check(path)
    info(`checking path: ${path} => ${ok}`)
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

export class VertexAIOptions {
  model: string
  tokenLimits: TokenLimits

  constructor(model = 'gemini-pro', tokenLimits: TokenLimits | null = null) {
    this.model = model
    if (tokenLimits != null) {
      this.tokenLimits = tokenLimits
    } else {
      this.tokenLimits = new TokenLimits(model)
    }
  }
}
