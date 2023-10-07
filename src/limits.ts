export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number

  constructor(model = 'anthropic.claude-instant-v1') {
    if (model === 'anthropic.claude-instant-v1') {
      this.maxTokens = 100_000
      this.responseTokens = 4000
    } else if (model === 'anthropic.claude-v2') {
      this.maxTokens = 100_000
      this.responseTokens = 3000
    } else {
      this.maxTokens = 4000
      this.responseTokens = 1000
    }
    // provide some margin for the request tokens
    this.requestTokens = this.maxTokens - this.responseTokens - 100
  }

  string(): string {
    return `max_tokens=${this.maxTokens}, request_tokens=${this.requestTokens}, response_tokens=${this.responseTokens}`
  }
}
