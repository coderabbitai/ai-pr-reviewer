import './fetch-polyfill'
import {info, warning} from '@actions/core'
import {VertexAIOptions, Options} from './options'

// define type to save parentMessageId and conversationId
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

export class Bot {
  private readonly api: null
  private readonly options: Options

  constructor(options: Options, vertexaiOptions: VertexAIOptions) {
    this.options = options
    this.api = null // TODO
    if (options.debug) {
      const dump = JSON.stringify({options, vertexaiOptions}, null, 2)
      info(`vertexai options: ${dump}`)
    }
  }

  chat = async (message: string): Promise<string> => {
    try {
      return await this.chat_(message)
    } catch (e: unknown) {
      if (e instanceof Error) {
        warning(`Failed to chat: ${e}, backtrace: ${e.stack}`)
      } else {
        warning(`Failed to chat: ${e}`)
      }
      return ''
    }
  }

  private readonly chat_ = async (message: string): Promise<string> => {
    if (!message) {
      return ''
    }
    return ''
  }
}
