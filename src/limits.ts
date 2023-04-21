export class TokenLimits {
  max_tokens: number
  request_tokens: number
  response_tokens: number

  constructor (model = 'gpt-3.5-turbo') {
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

  string (): string {
    return `max_tokens=${this.max_tokens}, request_tokens=${this.request_tokens}, response_tokens=${this.response_tokens}`
  }
}
