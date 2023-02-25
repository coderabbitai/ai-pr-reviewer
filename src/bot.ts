import * as core from '@actions/core'

import {
  ChatGPTAPI,
  ChatGPTUnofficialProxyAPI,
  ChatMessage,
  SendMessageOptions,
  SendMessageBrowserOptions
} from 'chatgpt'

import {Options} from './options.js'

export class Bot {
  private bot: ChatGPTUnofficialProxyAPI | null = null
  private mimic: ChatGPTAPI | null = null
  private history: ChatMessage | null = null
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
      this.mimic = new ChatGPTAPI({
        apiKey: process.env.OPENAI_API_KEY,
        debug: options.debug
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

  public chat = async (action: string, message: string, initial = false) => {
    if (!message) {
      return ''
    }
    console.time(`chatgpt ${action} ${message.length} tokens cost`)
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
      if (this.history && !initial) {
        opts.parentMessageId = this.history.id
        opts.conversationId = this.history.conversationId
      }
      core.info('opts: ' + JSON.stringify(opts))
      response = await this.bot.sendMessage(message, opts)
      core.info('response: ' + JSON.stringify(response))
    } else if (this.mimic) {
      let opts: SendMessageOptions = {
        promptPrefix: ' ', // use a space to avoid the prefix from the "chatgpt" library
        promptSuffix: ' ' // use a space to avoid the suffix from the "chatgpt" library
      }
      if (this.history && !initial) {
        opts.parentMessageId = this.history.id
        opts.conversationId = this.history.conversationId
      }
      response = await this.mimic.sendMessage(message, opts)
    } else {
      core.setFailed('The chatgpt API is not initialized')
    }
    let response_text = ''
    if (response) {
      if (initial) {
        this.history = response
      }
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
    console.timeEnd(`chatgpt ${action} ${message.length} tokens cost`)
    return response_text
  }
}
