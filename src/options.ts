import * as core from '@actions/core'
import {minimatch} from 'minimatch'

export class Prompts {
  public review_beginning: string
  public review_file: string
  public review_file_diff: string
  public review_patch: string
  public scoring_beginning: string
  public scoring: string

  constructor(
    review_beginning: string = '',
    review_file: string = '',
    review_file_diff: string = '',
    review_patch: string = '',
    scoring_beginning: string = '',
    scoring: string = ''
  ) {
    this.review_beginning = review_beginning
    this.review_file = review_file
    this.review_file_diff = review_file_diff
    this.review_patch = review_patch
    this.scoring_beginning = scoring_beginning
    this.scoring = scoring
  }

  public render_review_beginning(inputs: Inputs): string {
    return inputs.render(this.review_beginning)
  }

  public render_review_file(inputs: Inputs): string {
    return inputs.render(this.review_file)
  }

  public render_review_file_diff(inputs: Inputs): string {
    return inputs.render(this.review_file_diff)
  }

  public render_review_patch(inputs: Inputs): string {
    return inputs.render(this.review_patch)
  }

  public render_scoring_beginning(inputs: Inputs): string {
    return inputs.render(this.scoring_beginning)
  }

  public render_scoring(inputs: Inputs): string {
    return inputs.render(this.scoring)
  }
}

export class Inputs {
  public title: string
  public description: string
  public filename: string
  public file_content: string
  public file_diff: string
  public patch: string
  public diff: string

  constructor(
    title: string = '',
    description: string = '',
    filename: string = '',
    file_content: string = '',
    file_diff: string = '',
    patch: string = '',
    diff: string = ''
  ) {
    this.title = title
    this.description = description
    this.filename = filename
    this.file_content = file_content
    this.file_diff = file_diff
    this.patch = patch
    this.diff = diff
  }

  public render(content: string): string {
    if (!content) {
      return ''
    }
    if (this.title) {
      content = content.replace('$title', this.title)
    }
    if (this.description) {
      content = content.replace('$description', this.description)
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
    return content
  }
}

export class Options {
  public debug: boolean
  public chatgpt_reverse_proxy: string
  public review_comment_lgtm: boolean
  public path_filters: PathFilter

  constructor(
    debug: boolean,
    chatgpt_reverse_proxy: string,
    review_comment_lgtm: boolean = false,
    path_filters: Array<string> | null = null
  ) {
    this.debug = debug
    this.chatgpt_reverse_proxy = chatgpt_reverse_proxy
    this.review_comment_lgtm = review_comment_lgtm
    this.path_filters = new PathFilter(path_filters)
  }

  public check_path(path: string): boolean {
    let ok = this.path_filters.check(path)
    core.info(`checking path: ${path} => ${ok}`)
    return ok
  }
}

export class PathFilter {
  private rules: Array<[string /* rule */, boolean /* exclude */]>

  constructor(rules: Array<string> | null = null) {
    this.rules = []
    if (rules) {
      for (let rule of rules) {
        let trimmed = rule?.trim()
        if (trimmed) {
          if (trimmed[0] == '!') {
            this.rules.push([trimmed.substring(1).trim(), true])
          } else {
            this.rules.push([trimmed, false])
          }
        }
      }
    }
  }

  public check(path: string): boolean {
    let include_all = this.rules.length == 0
    let matched = false
    for (const [rule, exclude] of this.rules) {
      if (exclude) {
        if (minimatch(path, rule)) {
          return false
        }
        include_all = true
      } else {
        if (minimatch(path, rule)) {
          matched = true
          include_all = false
        } else {
          return false
        }
      }
    }
    return include_all || matched
  }
}
