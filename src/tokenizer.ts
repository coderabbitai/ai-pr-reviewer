import {countTokens} from '@anthropic-ai/tokenizer'

export function getTokenCount(input: string): number {
  return countTokens(input)
}
