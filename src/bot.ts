import * as core from '@actions/core'

import {ChatGPTAPI} from 'chatgpt'

export class Bot {
  private bot: ChatGPTAPI
  private MAX_PATCH_COUNT: number = 4000

  constructor(openai_api_key: string) {
    if (!openai_api_key) {
      if (process.env.OPENAI_API_KEY) {
        openai_api_key = process.env.OPENAI_API_KEY
      }
    }
    this.bot = new ChatGPTAPI({
      apiKey: openai_api_key
    })
  }

  public talk = async (action: string, message: string) => {
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
    core.debug(`sending to chatgpt: ${message}`)
    const response = await this.bot.sendMessage(message, {
      promptPrefix: 'hi,',
      promptSuffix: "\nlet's start"
    })
    let response_text = ''
    if (response) {
      response_text = response.text
    } else {
      core.warning('chatgpt response is null')
    }
    core.debug(`chatgpt responses: ${response_text}`)
    console.timeEnd(`chatgpt ${action} ${message.length} tokens cost`)
    return response_text
  }
}
