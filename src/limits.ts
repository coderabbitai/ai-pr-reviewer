export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number

  constructor(model = 'gpt-3.5-turbo') {
    if (model === 'gpt-4-32k') {
      this.maxTokens = 32600
      this.responseTokens = 4000
    } else if (model === 'gpt-4') {
      this.maxTokens = 8000
      this.responseTokens = 2000
    } else {
      this.maxTokens = 3900
      this.responseTokens = 1000
    }
    this.requestTokens = this.maxTokens - this.responseTokens
  }

  string(): string {
    return `max_tokens=${this.maxTokens}, request_tokens=${this.requestTokens}, response_tokens=${this.responseTokens}`
  }
}
