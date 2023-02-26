export class Prompts {
  public review_beginning: string
  public review_patch: string
  public scoring: string

  constructor(
    review_beginning: string = '',
    review_patch: string = '',
    scoring: string = ''
  ) {
    this.review_beginning = review_beginning
    this.review_patch = review_patch
    this.scoring = scoring
  }

  public render_review_beginning(inputs: Inputs): string {
    return inputs.render(this.review_beginning)
  }

  public render_review_patch(inputs: Inputs): string {
    return inputs.render(this.review_patch)
  }

  public render_scoring(inputs: Inputs): string {
    return inputs.render(this.scoring)
  }
}

export class Inputs {
  public title: string
  public description: string
  public filename: string
  public patch: string
  public diff: string

  constructor(
    title: string = '',
    description: string = '',
    filename: string = '',
    patch: string = '',
    diff: string = ''
  ) {
    this.title = title
    this.description = description
    this.filename = filename
    this.patch = patch
    this.diff = diff
  }

  public render(content: string): string {
    if (!content) {
      return '';
    }
    return content
      .replaceAll('$title', this.title)
      .replaceAll('$description', this.description)
      .replaceAll('$filename', this.filename)
      .replaceAll('$patch', this.patch)
      .replaceAll('$diff', this.diff)
  }
}

export class Options {
  public debug: boolean
  public chatgpt_reverse_proxy: string
  public review_comment_lgtm: boolean

  constructor(
    debug: boolean,
    chatgpt_reverse_proxy: string,
    review_comment_lgtm: boolean = false
  ) {
    this.debug = debug
    this.chatgpt_reverse_proxy = chatgpt_reverse_proxy
    this.review_comment_lgtm = review_comment_lgtm
  }
}
