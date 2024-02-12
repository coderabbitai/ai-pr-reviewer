// define type to save parentMessageId and conversationId
export interface Ids {
  parentMessageId?: string
  conversationId?: string
}

export interface BotProtocol {
  // eslint-disable-next-line no-unused-vars
  chat(message: string, ids: Ids): Promise<[string, Ids]>
}
