// eslint-disable-next-line camelcase
import {get_encoding} from '@dqbd/tiktoken'

const tokenizer = get_encoding('cl100k_base')

export function encode(input: string): Uint32Array {
  return tokenizer.encode(input)
}

export function getTokenCount(input: string): number {
  input = input.replace(/<\|endoftext\|>/g, '')
  return encode(input).length
}

export function splitPrompt(
  maxTokens: number,
  prompt: string
): string[] | string {
  if (getTokenCount(prompt) < maxTokens) {
    return prompt
  }
  const promptPieces: string[] = []
  let remainingPrompt = prompt
  while (remainingPrompt.length > 0) {
    const lastSpaceIndex = remainingPrompt.lastIndexOf(' ', maxTokens)
    if (lastSpaceIndex >= 0) {
      // Split at the last space
      const piece = remainingPrompt.substring(0, lastSpaceIndex).trim()
      promptPieces.push(piece)
      remainingPrompt = remainingPrompt.substring(lastSpaceIndex).trim()
    } else {
      // If no space found in the next `maxTokens` characters, split at `maxTokens` directly
      const piece = remainingPrompt.substring(0, maxTokens).trim()
      promptPieces.push(piece)
      remainingPrompt = remainingPrompt.substring(maxTokens).trim()
    }
  }

  return promptPieces
}
