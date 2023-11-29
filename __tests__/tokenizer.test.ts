import {splitPrompt} from './../src/tokenizer' // Import your module with the splitPrompt function

describe('splitPrompt function', () => {
  it('should split a prompt into smaller pieces', async () => {
    const maxTokens = 10 // Adjust this as needed
    const prompt = 'This is a test prompt for splitting into smaller pieces.'

    const result = await splitPrompt(maxTokens, prompt)

    // Calculate the expected output based on the maxTokens value
    const expectedOutput = [
      'This is a',
      'test',
      'prompt for',
      'splitting',
      'into',
      'smaller',
      'pieces.'
    ]

    expect(result).toEqual(expectedOutput)
  })

  it('should handle a prompt smaller than maxTokens', async () => {
    const maxTokens = 100 // A large value
    const prompt = 'A very short prompt.'

    const result = await splitPrompt(maxTokens, prompt)

    // The prompt is already smaller than maxTokens, so it should return an array with the entire prompt.
    const expectedOutput = 'A very short prompt.'

    expect(result).toEqual(expectedOutput)
  })

  it('should handle an empty prompt', async () => {
    const maxTokens = 10
    const prompt = ''

    const result = await splitPrompt(maxTokens, prompt)

    // An empty prompt should result in an empty array.
    const expectedOutput: string[] | string = ''

    expect(result).toEqual(expectedOutput)
  })
})
