import * as core from '@actions/core'

import { ChatGPTAPI } from 'chatgpt';

export class Bot {
  private bot: ChatGPTAPI;
  private MAX_PATCH_COUNT: number = 4000;

  constructor(openai_api_key: string) {
    if (!openai_api_key) {
      if (process.env.OPENAI_API_KEY) {
        openai_api_key = process.env.OPENAI_API_KEY;
      }
    }
    this.bot = new ChatGPTAPI({
      apiKey: openai_api_key,
    });
  }

  public talk = async (action: string, message: string) => {
    if (!message) {
      return '';
    }
    console.time(`chatgpt ${action} cost`);
    if (message.length > this.MAX_PATCH_COUNT) {
      message = message.substring(0, this.MAX_PATCH_COUNT);
    }
    core.debug(`sending to chatgpt: ${message}`);
    const res = await this.bot.sendMessage(message, {
      promptPrefix: 'hi,',
      promptSuffix: "\nlet's start",
    });
    core.debug(`chatgpt responses: ${message}`);
    console.timeEnd(`chatgpt ${action} cost`);
    return res.text;
  };
}
