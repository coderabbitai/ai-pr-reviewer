import './fetch-polyfill'
import {
  VertexAI,
  ChatSession,
  GenerateContentResult
} from '@google-cloud/vertexai'
import {info, setFailed, warning} from '@actions/core'
import pRetry from 'p-retry'
import {VertexAIOptions, Options} from './options'

// define type to save parentMessageId and conversationId
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private readonly api: ChatSession
  private readonly options: Options

  constructor(options: Options, vertexaiOptions: VertexAIOptions) {
    this.options = options
    const vertexAI = new VertexAI({
      project: options.vertexaiProjectID,
      location: options.vertexaiLocation
    })
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model: vertexaiOptions.model,
      // eslint-disable-next-line camelcase
      generation_config: {
        // eslint-disable-next-line camelcase
        max_output_tokens: vertexaiOptions.tokenLimits.responseTokens,
        temperature: options.vertexaiModelTemperature,
        // eslint-disable-next-line camelcase
        top_p: options.vertexaiTopP,
        // eslint-disable-next-line camelcase
        top_k: options.vertexaiTopK
      }
    })

    const systemMessage = `${options.systemMessage}
IMPORTANT: Entire response must be in the language with ISO code: ${options.language}
`
    this.api = generativeModel.startChat({
      history: [
        {role: 'user', parts: [{text: systemMessage}]},
        {role: 'model', parts: [{text: `Got it. Let's get started!`}]}
      ]
    })
  }

  chat = async (message: string): Promise<string> => {
    let res: string = ''
    try {
      res = await this.chat_(message)
      return res
    } catch (e: unknown) {
      if (e instanceof Error) {
        warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
      }
      return res
    }
  }

  private readonly chat_ = async (message: string): Promise<string> => {
    // record timing
    const start = Date.now()
    if (!message) {
      return ''
    }

    let response: GenerateContentResult | undefined

    if (this.api != null) {
      try {
        response = await pRetry(() => this.api!.sendMessage(message), {
          retries: this.options.vertexaiRetries
        })
      } catch (e: unknown) {
        if (e instanceof Error) {
          info(
            `response: ${response}, failed to send message to vertexai: ${e}, backtrace: ${e.stack}`
          )
        }
      }
      const end = Date.now()
      info(`response: ${JSON.stringify(response)}`)
      info(
        `vertexai sendMessage (including retries) response time: ${
          end - start
        } ms`
      )
    } else {
      setFailed('The Vertex AI API is not initialized')
    }
    let responseText = ''
    if (response != null) {
      responseText = response.response.candidates[0].content.parts[0].text || ''
    } else {
      warning('vertexai response is null')
    }
    // remove the prefix "with " in the response
    if (responseText.startsWith('with ')) {
      responseText = responseText.substring(5)
    }
    if (this.options.debug) {
      info(`vertexai responses: ${responseText}`)
    }
    return responseText
  }
}
