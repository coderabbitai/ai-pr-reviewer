import './fetch-polyfill.js'

import * as core from '@actions/core'
import * as openai from 'chatgpt'
import * as optionsJs from './options.js'
import * as utils from './utils.js'

// define type to save parentMessageId and conversationId
export type Ids = {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private api: openai.ChatGPTAPI | null = null // not free

  private options: optionsJs.Options

  constructor(
    options: optionsJs.Options,
    openaiOptions: optionsJs.OpenAIOptions
  ) {
    this.options = options
    if (process.env.OPENAI_API_KEY) {
      this.api = new openai.ChatGPTAPI({
        systemMessage: options.system_message,
        apiKey: process.env.OPENAI_API_KEY,
        apiOrg: process.env.OPENAI_API_ORG ?? null,
        debug: options.debug,
        maxModelTokens: openaiOptions.token_limits.max_tokens,
        maxResponseTokens: openaiOptions.token_limits.response_tokens,
        completionParams: {
          temperature: options.openai_model_temperature,
          model: openaiOptions.model
        }
      })
    } else {
      const err =
        "Unable to initialize the OpenAI API, both 'OPENAI_API_KEY' environment variable are not available"
      throw new Error(err)
    }
  }

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    let res: [string, Ids] = ['', {}]
    try {
      res = await this.chat_(message, ids)
      return res
    } catch (e: unknown) {
      if (e instanceof openai.ChatGPTError)
        core.warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
      return res
    }
  }

  private chat_ = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    // record timing
    const start = Date.now()
    if (!message) {
      return ['', {}]
    }

    let response: openai.ChatMessage | undefined

    if (this.api) {
      const opts: openai.SendMessageOptions = {
        timeoutMs: this.options.openai_timeout_ms
      }
      if (ids.parentMessageId) {
        opts.parentMessageId = ids.parentMessageId
      }
      try {
        response = await utils.retry<openai.ChatMessage>(
          this.api.sendMessage.bind(this.api),
          [message, opts],
          this.options.openai_retries
        )
      } catch (e: unknown) {
        if (e instanceof openai.ChatGPTError)
          core.info(
            `response: ${response}, failed to send message to openai: ${e}, backtrace: ${e.stack}`
          )
      }
      const end = Date.now()
      core.info(`response: ${JSON.stringify(response)}`)
      core.info(
        `openai sendMessage (including retries) response time: ${
          end - start
        } ms`
      )
    } else {
      core.setFailed('The OpenAI API is not initialized')
    }
    let response_text = ''
    if (response) {
      response_text = response.text
    } else {
      core.warning('openai response is null')
    }
    // remove the prefix "with " in the response
    if (response_text.startsWith('with ')) {
      response_text = response_text.substring(5)
    }
    if (this.options.debug) {
      core.info(`openai responses: ${response_text}`)
    }
    const new_ids: Ids = {
      parentMessageId: response?.id,
      conversationId: response?.conversationId
    }
    return [response_text, new_ids]
  }
}
