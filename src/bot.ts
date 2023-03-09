import './fetch-polyfill.js'
import {Options} from './options.js'
import * as core from '@actions/core'
import {
  ChatGPTAPI,
  ChatGPTUnofficialProxyAPI,
  ChatMessage,
  SendMessageBrowserOptions,
  SendMessageOptions
} from 'chatgpt'

// define type to save parentMessageId and conversationId
export type Ids = {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private bot: ChatGPTUnofficialProxyAPI | null = null // free
  private turbo: ChatGPTAPI | null = null // not free
  private MAX_PATCH_COUNT: number = 4000

  private options: Options

  constructor(options: Options) {
    this.options = options
    if (process.env.CHATGPT_ACCESS_TOKEN) {
      this.bot = new ChatGPTUnofficialProxyAPI({
        accessToken: process.env.CHATGPT_ACCESS_TOKEN,
        apiReverseProxyUrl: options.chatgpt_reverse_proxy,
        debug: options.debug
      })
    } else if (process.env.OPENAI_API_KEY) {
      this.turbo = new ChatGPTAPI({
        systemMessage: options.system_message,
        apiKey: process.env.OPENAI_API_KEY,
        debug: options.debug,
        completionParams: {
          temperature: 0.2
        }
        // assistantLabel: " ",
        // userLabel: " ",
      })
    } else {
      const err =
        "Unable to initialize the chatgpt API, both 'CHATGPT_ACCESS_TOKEN' " +
        "and 'OPENAI_API_KEY' environment variable are not available"
      throw new Error(err)
    }
  }

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    console.time(`chatgpt ${message.length} tokens cost`)
    let new_ids: Ids = {}
    let response = ''
    try {
      ;[response, new_ids] = await this.chat_(message, ids)
    } catch (e: any) {
      core.warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
    } finally {
      console.timeEnd(`chatgpt ${message.length} tokens cost`)
      return [response, new_ids]
    }
  }

  private chat_ = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    if (!message) {
      return ['', {}]
    }
    if (message.length > this.MAX_PATCH_COUNT) {
      core.warning(
        `Message is too long, truncate to ${this.MAX_PATCH_COUNT} tokens`
      )
      message = message.substring(0, this.MAX_PATCH_COUNT)
    }
    if (this.options.debug) {
      core.info(`sending to chatgpt: ${message}`)
    }

    let response: ChatMessage | null = null
    if (this.bot) {
      let opts: SendMessageBrowserOptions = {}
      if (ids.parentMessageId && ids.conversationId) {
        opts.parentMessageId = ids.parentMessageId
        opts.conversationId = ids.conversationId
      }
      core.info('opts: ' + JSON.stringify(opts))
      response = await this.bot.sendMessage(message, opts)
      try {
        core.info(`response: ${JSON.stringify(response)}`)
      } catch (e: any) {
        core.info(
          `response: ${response}, failed to stringify: ${e}, backtrace: ${e.stack}`
        )
      }
    } else if (this.turbo) {
      let opts: SendMessageOptions = {}
      if (ids.parentMessageId) {
        opts.parentMessageId = ids.parentMessageId
      }
      response = await this.turbo.sendMessage(message, opts)
      try {
        core.info(`response: ${JSON.stringify(response)}`)
      } catch (e: any) {
        core.info(
          `response: ${response}, failed to stringify: ${e}, backtrace: ${e.stack}`
        )
      }
    } else {
      core.setFailed('The chatgpt API is not initialized')
    }
    let response_text = ''
    if (response) {
      response_text = response.text
    } else {
      core.warning('chatgpt response is null')
    }
    // remove the prefix "with " in the response
    if (response_text.startsWith('with ')) {
      response_text = response_text.substring(5)
    }
    if (this.options.debug) {
      core.info(`chatgpt responses: ${response_text}`)
    }
    const new_ids: Ids = {
      parentMessageId: response?.id,
      conversationId: response?.conversationId
    }
    return [response_text, new_ids]
  }
}
