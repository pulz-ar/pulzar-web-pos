declare module 'exa-js' {
  export default class Exa {
    constructor(apiKey: string)
    search(query: string, options?: { numResults?: number, type?: string }): Promise<{ results?: Array<{ id?: string; title?: string; url?: string }> }>
  }
}


