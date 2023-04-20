import * as core from '@actions/core'
import {minimatch} from 'minimatch'

export class Prompts {
  review_file_diff: string
  summarize_file_diff: string
  summarize: string
  summarize_release_notes: string
  comment: string

  constructor(
    review_file_diff = '',
    summarize_file_diff = '',
    summarize = '',
    summarize_release_notes = '',
    comment = ''
  ) {
    this.review_file_diff = review_file_diff
    this.summarize_file_diff = summarize_file_diff
    this.summarize = summarize
    this.summarize_release_notes = summarize_release_notes
    this.comment = comment
  }

  render_review_file_diff(inputs: Inputs): string {
    return inputs.render(this.review_file_diff)
  }

  render_summarize_file_diff(inputs: Inputs): string {
    const prompt = `${this.summarize_file_diff}

Below the summary, I would also like you to classify the 
complexity of the diff as \`COMPLEX\` or \`SIMPLE\` based 
on whether the change is a simple chore such are renaming
a variable or a complex change such as adding a new feature.
Any change that does not change the logic of the code is
considered a simple change.

Use the following format to classify the complexity of the
diff and add no additional text:
[COMPLEXITY]: <COMPLEX or SIMPLE>
`

    return inputs.render(prompt)
  }

  render_summarize(inputs: Inputs): string {
    return inputs.render(this.summarize)
  }

  render_summarize_release_notes(inputs: Inputs): string {
    return inputs.render(this.summarize_release_notes)
  }

  render_comment(inputs: Inputs): string {
    return inputs.render(this.comment)
  }
}

export class Inputs {
  system_message: string
  title: string
  description: string
  raw_summary: string
  release_notes: string
  filename: string
  file_content: string
  file_diff: string
  patches: string
  diff: string
  comment_chain: string
  comment: string

  constructor(
    system_message = '',
    title = 'no title provided',
    description = 'no description provided',
    summary = 'no summary so far',
    release_notes = 'no release notes so far',
    filename = 'unknown',
    file_content = 'file contents cannot be provided',
    file_diff = 'file diff cannot be provided',
    patches = '',
    diff = 'no diff',
    comment_chain = 'no other comments on this patch',
    comment = 'no comment provided'
  ) {
    this.system_message = system_message
    this.title = title
    this.description = description
    this.raw_summary = summary
    this.release_notes = release_notes
    this.filename = filename
    this.file_content = file_content
    this.file_diff = file_diff
    this.patches = patches
    this.diff = diff
    this.comment_chain = comment_chain
    this.comment = comment
  }

  clone(): Inputs {
    return new Inputs(
      this.system_message,
      this.title,
      this.description,
      this.raw_summary,
      this.release_notes,
      this.filename,
      this.file_content,
      this.file_diff,
      this.patches,
      this.diff,
      this.comment_chain,
      this.comment
    )
  }

  render(content: string): string {
    if (!content) {
      return ''
    }
    if (this.system_message) {
      content = content.replace('$system_message', this.system_message)
    }
    if (this.title) {
      content = content.replace('$title', this.title)
    }
    if (this.description) {
      content = content.replace('$description', this.description)
    }
    if (this.raw_summary) {
      content = content.replace('$raw_summary', this.raw_summary)
    }
    if (this.release_notes) {
      content = content.replace('$release_notes', this.release_notes)
    }
    if (this.filename) {
      content = content.replace('$filename', this.filename)
    }
    if (this.file_content) {
      content = content.replace('$file_content', this.file_content)
    }
    if (this.file_diff) {
      content = content.replace('$file_diff', this.file_diff)
    }
    if (this.patches) {
      content = content.replace('$patches', this.patches)
    }
    if (this.diff) {
      content = content.replace('$diff', this.diff)
    }
    if (this.comment_chain) {
      content = content.replace('$comment_chain', this.comment_chain)
    }
    if (this.comment) {
      content = content.replace('$comment', this.comment)
    }
    return content
  }
}

export class TokenLimits {
  max_tokens: number
  request_tokens: number
  response_tokens: number

  constructor(model = 'gpt-3.5-turbo') {
    if (model === 'gpt-4-32k') {
      this.max_tokens = 32600
      this.response_tokens = 4000
    } else if (model === 'gpt-4') {
      this.max_tokens = 8000
      this.response_tokens = 2000
    } else {
      this.max_tokens = 3900
      this.response_tokens = 1000
    }
    this.request_tokens = this.max_tokens - this.response_tokens
  }

  string(): string {
    return `max_tokens=${this.max_tokens}, request_tokens=${this.request_tokens}, response_tokens=${this.response_tokens}`
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
