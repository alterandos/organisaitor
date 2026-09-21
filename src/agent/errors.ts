export type AgentErrorCode = 'not_found' | 'invalid' | 'conflict' | 'refused';

// What a command throws to tell the model something it can act on (the message is sent back to it).
// Anything else a handler throws is treated as an internal error and its message is not passed on.
export class AgentError extends Error {
  code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
