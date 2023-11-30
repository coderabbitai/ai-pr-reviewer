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
    let piece;
    if (remainingPrompt.length > maxTokens && !remainingPrompt.includes(' ')) {
      piece = remainingPrompt.substring(0, maxTokens).trim();
    } else {
      const lastSpaceIndex = remainingPrompt.lastIndexOf(' ', maxTokens)
      if (lastSpaceIndex >= 0) {
        // Split at the last space
        piece = remainingPrompt.substring(0, lastSpaceIndex).trim()
      } else {
        // If no space found in the next `maxTokens` characters, split at `maxTokens` directly
        piece = remainingPrompt.substring(0, maxTokens).trim()
      }
    }
    promptPieces.push(piece)
    remainingPrompt = remainingPrompt.substring(piece.length).trim()
  }

  return promptPieces
}


