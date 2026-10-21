/** In-memory fake ChatModel for unit tests. */
import type { ChatModel } from "../../core/ports";
import type { ChatMessage } from "../../core/types";

/** Replies with a canned answer and records every conversation it was sent. */
export class InMemoryChatModel implements ChatModel {
  readonly conversations: ChatMessage[][] = [];

  constructor(private readonly reply: string) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    this.conversations.push(messages);
    return this.reply;
  }
}
