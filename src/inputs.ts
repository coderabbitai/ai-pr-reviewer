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
