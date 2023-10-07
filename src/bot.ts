import './fetch-polyfill'

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandOutput
} from '@aws-sdk/client-bedrock-runtime'
import {info, warning} from '@actions/core'
import pRetry from 'p-retry'
import {BedrockOptions, Options} from './options'

// define type to save parentMessageId and conversationId
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private readonly client: BedrockRuntimeClient

  private readonly options: Options
  private readonly bedrockOptions: BedrockOptions

  constructor(options: Options, bedrockOptions: BedrockOptions) {
    this.options = options
    this.bedrockOptions = bedrockOptions
    this.client = new BedrockRuntimeClient({})
  }

  chat = async (message: string): Promise<[string, Ids]> => {
    let res: [string, Ids] = ['', {}]
    try {
      res = await this.chat_(message)
      return res
    } catch (e: unknown) {
      warning(`Failed to chat: ${e}`)
      return res
    }
  }

  private readonly chat_ = async (message: string): Promise<[string, Ids]> => {
    // record timing
    const start = Date.now()
    if (!message) {
      return ['', {}]
    }

    let response: InvokeModelCommandOutput | undefined

    try {
      response = await pRetry(
        () =>
          this.client.send(
            new InvokeModelCommand({
              modelId: this.bedrockOptions.model,
              body: JSON.stringify({
                prompt: message,
                temperature: 0,
                // eslint-disable-next-line camelcase
                top_p: 1,
                // eslint-disable-next-line camelcase
                top_k: 250,
                // eslint-disable-next-line camelcase
                max_tokens_to_sample: 200,
                // eslint-disable-next-line camelcase
                stop_sequences: ['\n\nHuman:']
              }),
              contentType: 'application/json'
            })
          ),
        {
          retries: this.options.openaiRetries
        }
      )
    } catch (e: unknown) {
      info(`response: ${response}, failed to send message to bedrock: ${e}`)
    }
    const end = Date.now()
    info(`response: ${JSON.stringify(response)}`)
    info(
      `bedrock sendMessage (including retries) response time: ${end - start} ms`
    )

    let responseText = ''
    if (response != null) {
      responseText = Buffer.from(response.body).toString('utf-8')
    } else {
      warning('openai response is null')
    }
    // remove the prefix "with " in the response
    if (responseText.startsWith('with ')) {
      responseText = responseText.substring(5)
    }
    if (this.options.debug) {
      info(`openai responses: ${responseText}`)
    }
    const newIds: Ids = {
      parentMessageId: response?.$metadata.requestId,
      conversationId: response?.$metadata.cfId
    }
    return [responseText, newIds]
  }
}
