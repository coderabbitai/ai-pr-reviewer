export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number

  constructor(model = 'codechat-bison') {
    if (model === 'codechat-bison') {
      this.maxTokens = 6144 + 1024
      this.responseTokens = 1024
    } else if (model === 'codechat-bison-32k') {
      this.maxTokens = 32000
      this.responseTokens = 8192
    } else if (model === 'gemini-pro') {
      this.maxTokens = 32000
      this.responseTokens = 8192
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
