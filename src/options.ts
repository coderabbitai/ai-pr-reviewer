import * as core from '@actions/core'
import {minimatch} from 'minimatch'

export class Prompts {
  review_beginning: string
  review_file: string
  review_file_diff: string
  review_patch_begin: string
  review_patch: string
  summarize_beginning: string
  summarize_file_diff: string
  summarize: string
  summarize_release_notes: string
  comment_beginning: string
  comment_file: string
  comment_file_diff: string
  comment: string

  constructor(
    review_beginning = '',
    review_file = '',
    review_file_diff = '',
    review_patch_begin = '',
    review_patch = '',
    summarize_beginning = '',
    summarize_file_diff = '',
    summarize = '',
    summarize_release_notes = '',
    comment_beginning = '',
    comment_file = '',
    comment_file_diff = '',
    comment = ''
  ) {
    this.review_beginning = review_beginning
    this.review_file = review_file
    this.review_file_diff = review_file_diff
    this.review_patch_begin = review_patch_begin
    this.review_patch = review_patch
    this.summarize_beginning = summarize_beginning
    this.summarize_file_diff = summarize_file_diff
    this.summarize = summarize
    this.summarize_release_notes = summarize_release_notes
    this.comment_beginning = comment_beginning
    this.comment_file = comment_file
    this.comment_file_diff = comment_file_diff
    this.comment = comment
  }

  render_review_beginning(inputs: Inputs): string {
    return inputs.render(this.review_beginning)
  }

  render_review_file(inputs: Inputs): string {
    return inputs.render(this.review_file)
  }

  render_review_file_diff(inputs: Inputs): string {
    return inputs.render(this.review_file_diff)
  }

  render_review_patch_begin(inputs: Inputs): string {
    return inputs.render(this.review_patch_begin)
  }

  render_review_patch(inputs: Inputs): string {
    return inputs.render(this.review_patch)
  }

  render_summarize_beginning(inputs: Inputs): string {
    return inputs.render(this.summarize_beginning)
  }

  render_summarize_file_diff(inputs: Inputs): string {
    return inputs.render(this.summarize_file_diff)
  }

  render_summarize(inputs: Inputs): string {
    return inputs.render(this.summarize)
  }

  render_summarize_release_notes(inputs: Inputs): string {
    return inputs.render(this.summarize_release_notes)
  }
  render_comment_beginning(inputs: Inputs): string {
    return inputs.render(this.comment_beginning)
  }
  render_comment_file(inputs: Inputs): string {
    return inputs.render(this.comment_file)
  }
  render_comment_file_diff(inputs: Inputs): string {
    return inputs.render(this.comment_file_diff)
  }
  render_comment(inputs: Inputs): string {
    return inputs.render(this.comment)
  }
}

export class Inputs {
  system_message: string
  title: string
  description: string
  summary: string
  filename: string
  file_content: string
  file_diff: string
  patch: string
  diff: string
  comment_chain: string
  comment: string

  constructor(
    system_message = '',
    title = 'no title provided',
    description = 'no description provided',
    summary = 'no summary so far',
    filename = 'unknown',
    file_content = 'file contents cannot be provided',
    file_diff = 'file diff cannot be provided',
    patch = 'patch cannot be provided',
    diff = 'no diff',
    comment_chain = 'no other comments on this patch',
    comment = 'no comment provided'
  ) {
    this.system_message = system_message
    this.title = title
    this.description = description
    this.summary = summary
    this.filename = filename
    this.file_content = file_content
    this.file_diff = file_diff
    this.patch = patch
    this.diff = diff
    this.comment_chain = comment_chain
    this.comment = comment
  }

  clone(): Inputs {
    return new Inputs(
      this.system_message,
      this.title,
      this.description,
      this.summary,
      this.filename,
      this.file_content,
      this.file_diff,
      this.patch,
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
    if (this.summary) {
      content = content.replace('$summary', this.summary)
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
    if (this.patch) {
      content = content.replace('$patch', this.patch)
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

export class Options {
  debug: boolean
  max_files: number
  review_comment_lgtm: boolean
  path_filters: PathFilter
  system_message: string
  openai_model: string
  openai_model_temperature: number
  openai_retries: number
  openai_timeout_ms: number
  openai_concurrency_limit: number
  max_tokens_for_extra_content: number

  constructor(
    debug: boolean,
    max_files = '60',
    review_comment_lgtm = false,
    path_filters: string[] | null = null,
    system_message = '',
    openai_model = 'gpt-3.5-turbo',
    openai_model_temperature = '0.0',
    openai_retries = '3',
    openai_timeout_ms = '60000',
    openai_concurrency_limit = '4'
  ) {
    this.debug = debug
    this.max_files = parseInt(max_files)
    this.review_comment_lgtm = review_comment_lgtm
    this.path_filters = new PathFilter(path_filters)
    this.system_message = system_message
    this.openai_model = openai_model
    this.openai_model_temperature = parseFloat(openai_model_temperature)
    this.openai_retries = parseInt(openai_retries)
    this.openai_timeout_ms = parseInt(openai_timeout_ms)
    this.openai_concurrency_limit = parseInt(openai_concurrency_limit)

    if (this.openai_model === 'gpt-4') {
      this.max_tokens_for_extra_content = 4000
    } else if (this.openai_model === 'gpt-3.5-turbo') {
      this.max_tokens_for_extra_content = 2000
    } else {
      this.max_tokens_for_extra_content = 1000
    }
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
