export class SummarizeError extends Error {
  constructor(message, hint) {
    super(message)
    this.name = "SummarizeError"
    this.hint = hint
  }
}