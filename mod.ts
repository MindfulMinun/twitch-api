import { User } from './User.ts'
import { ServerRequest, Response } from 'https://deno.land/std@0.83.0/http/server.ts'
import { Webhook, WebhookEvent, WebhookEventCondition, WebhookResponse, WebhookStatus } from './Webhook.ts'

export * from './Webhook.ts'
export * from './User.ts'

interface OAuthRevalidationResp {
    access_token: string
    expires_in: number
    token_type: 'bearer'
}

interface LoginOptions {
    /** Your client ID */
    clientId: string
    /** Your client secret */
    clientSecret: string
    /** Space-separated list of [scopes](https://dev.twitch.tv/docs/authentication/#scopes) */
    scopes?: string
    /** Your webhook secret, used for verifying that messages come from Twitch */
    webhookSecret?: string
}

export interface TwitchPagination {
    cursor?: string
}

export const ENDPOINT = 'https://api.twitch.tv/helix/'

const decoder = new TextDecoder()

/**
 * Object for interacting with the Twitch API
 * @author MindfulMinun
 * @since 2021-01-09
 */
export class Client {
    /** Your client ID */
    clientId: string
    /** Your client secret */
    #clientSecret: string
    /** Your webhook secret, used for verifying that messages come from Twitch */
    #webhookSecret?: string
    /** Space-separated list of [scopes](https://dev.twitch.tv/docs/authentication/#scopes) */
    scopes?: string
    /** Current access token */
    accessToken?: string
    /** Keep track of the webhook message IDs in order to not respond to the same one twice */
    #seenWebhooks: Set<string>

    _webhookQ: AsyncQueue<{
        request: ServerRequest,
        response: Response
        data: any
    }>

    constructor(loginOptions: LoginOptions) {
        this.clientId = loginOptions.clientId
        this.#clientSecret = loginOptions.clientSecret
        this.scopes = loginOptions.scopes || ''
        this.#webhookSecret = loginOptions.webhookSecret || ''
        this.#seenWebhooks = new Set()
        this._webhookQ = new AsyncQueue()
    }

    async revalidationLoop() {
        const creds = await this.revalidateCredentials()
        this.accessToken = creds.access_token
        setTimeout(this.revalidationLoop, creds.expires_in)
        return creds
    }

    login(): Promise<void> {
        return this.revalidationLoop().then(() => undefined)
    }


    fetch(path: string | URL, fetchOptions: RequestInit = {}) {
        const url = path instanceof URL ? path : new URL(path, ENDPOINT)
        const opts: RequestInit = Object.assign(fetchOptions, {
            headers: Object.assign(fetchOptions?.headers || {}, {
                'authorization': `Bearer ${this.accessToken}`,
                'client-id': this.clientId
            })
        })
        return fetch(url, opts)
    }

    getJSON(path: string | URL, fetchOptions: RequestInit = {}) {
        return this.fetch(path, fetchOptions).then(r => r.json())
    }


    async revalidateCredentials() {
        // https://dev.twitch.tv/docs/authentication/getting-tokens-oauth#oauth-client-credentials-flow
        const credentials = await fetch([
            `https://id.twitch.tv/oauth2/token`,
            `?client_id=${this.clientId}`,
            `&client_secret=${this.#clientSecret}`,
            `&grant_type=client_credentials`,
            this.scopes ? `&scope=${this.scopes}` : ''
        ].join(''), { method: 'POST' }).then(r => r.json())
        
        if (400 <= credentials.status) {
            return Promise.reject(`OAuth revalidation failed: ${credentials.message}`)
        }
        return credentials as OAuthRevalidationResp
    }

    /**
     * Fetch a user asynchronously by providing either their id or their login name.
     */
    getUser(query: { id?: string, login?: string }) {
        const url = new URL('users', ENDPOINT)
        if (query.id) url.searchParams.set('id', query.id)
        if (query.login) url.searchParams.set('login', query.login)

        return this.getJSON(url).then(data => {
            const user = data.data[0]
            if (user) {
                return new User(this, user)
            }
            return Promise.reject(`No results found`)
        })
    }

    getStreams(options: {
        after?: string,
        before?: string,
        count?: number,
        gameId?: string,
        lang?: string,
        userId?: string,
        login?: string
    } = {}): AsyncIterable<any> {
        const url = new URL('streams', ENDPOINT)
        if (options?.after) url.searchParams.set('after', options.after)
        if (options?.before) url.searchParams.set('before', options.before)
        if (options?.gameId) url.searchParams.set('game_id', options.gameId)
        if (options?.lang) url.searchParams.set('language', options.lang)
        if (options?.userId) url.searchParams.set('user_id', options.userId)
        if (options?.login) url.searchParams.set('user_login', options.login)

        const that = this
        let after = ''
        let count = 0
        const max = options.count ?? Infinity

        return {
            async*[Symbol.asyncIterator]() {
                do {
                    const chunk = await that.getJSON(url)
                    after = chunk.pagination.cursor
                    url.searchParams.set('after', after)
                    count += chunk.data.length

                    if (max < count) {
                        const left = max - count
                        yield* chunk.data.slice(0, left)
                    } else {
                        yield* chunk.data
                    }
                    if (!after) break
                } while (count < max)
            }
        }
    }

    /**
     * Get an array of webhooks.
     * Pass an optional object with a `status` property to filter by status, or an `id` to filter by webhook id
     */
    async getWebhooks(filters: { status?: WebhookStatus, id?: string } = {}) {
        let path = 'eventsub/subscriptions'

        if (filters.status || filters.id) path += '?'

        path += [
            filters.status && `status=${filters.status}`,
            filters.id && `id=${filters.id}`
        ].filter(auto => auto).join('&')

        const resp: {
            data: WebhookResponse[],
            total: number,
            limit: number,
            pagination: TwitchPagination
        } = await this.getJSON(path)

        return resp.data.map(wr => new Webhook(this, wr))
    }

    async getWebhooksCount(filters: { status?: WebhookStatus } = {}) {
        let path = 'eventsub/subscriptions'
        if (filters.status) {
            path += '?status=' + filters.status
        }
        const resp: {
            data: WebhookResponse[],
            total: number,
            limit: number,
            pagination: TwitchPagination
        } = await this.getJSON(path)

        return resp.total
    }

    async createWebhook(opts: {
        type: WebhookEvent,
        /** Callback URL. */
        callabck: string,
        /** An [event condition](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#conditions) */
        condition: WebhookEventCondition
    }) {
        if (!this.#webhookSecret) {
            throw Error("A webhook secret wasn't provided, so messages from Twitch can't be verified.")
        }
        return Webhook.createWebhook(this, opts, this.#webhookSecret)
    }

    /**
     * Handle a potential webhook message.
     * If the message was identified as a message from Twitch, this function handles it
     * and resolves to true, otherwise false.
     * @example
     * for await (const req of serve({ port: 80 })) {
     *     // Respond to the request only if it came from Twitch
     *     const guard = await api.handleWebhook(req)
     *     // Do whatever you want if the message wasn't from Twitch
     *     if (!guard) req.respond({ status: 400 })
     * }
     */
    async handleWebhook(req: ServerRequest): Promise<boolean> {
        const r = await this.handleWebhookWithoutResponse(req)
        if (!r) return false
        req.respond(r)
        return true
    }

    /** Handle a webhook without responding. This may be useful for something like Vercel where you want to perform a task before responding. */
    async handleWebhookWithoutResponse(req: ServerRequest): Promise<Response | null> {
        if (!this.#webhookSecret) {
            throw Error("A webhook secret wasn't provided, so messages from Twitch can't be verified.")
        }

        // Get some headers
        const mId   = req.headers.get('Twitch-Eventsub-Message-Id')
        const mType = req.headers.get('Twitch-Eventsub-Message-Type')
        const mTime = req.headers.get('Twitch-Eventsub-Message-Timestamp')
        const body = decoder.decode(await Deno.readAll(req.body))

        // Expect all three headers to be present
        if (!(mId && mType && mTime)) return null

        // If we've seen this message before,
        // let Twitch know we've already handled it
        if (this.#seenWebhooks.has(mId)) {
            return { status: 204 }
        }

        // Refuse to handle messages that are older than 10 minutes
        const isStillValid = +new Date() - +new Date(mTime) < 1000 * 60 * 10

        // Verify that the message came from Twitch
        const matchesExpectedSignature = Webhook.verifyMessage(
            this.#webhookSecret,
            mId + mTime + body
        ) == req.headers.get('Twitch-Eventsub-Message-Signature')

        if (!(isStillValid && matchesExpectedSignature)) {
            return { status: 403 }
        }


        // Now that we've verified that the message is valid
        // we can properly handle the request
        const json = JSON.parse(body)

        switch (mType) {
            case 'webhook_callback_verification':
                return {
                    status: 200,
                    body: json.challenge as string
                }
            case 'notification':
                const notif = {
                    request: req,
                    response: { status: 200 },
                    data: json
                }
                this._webhookQ.push(notif)
                this.#seenWebhooks.add(mId)
                return notif.response
        }

        return null
    }
}

/** Helper class to handle events and turn them into async iterables */
class AsyncQueue<T> {
    #done: boolean
    #items: T[]
    #resolve: () => void
    // @ts-expect-error -- this._defer initializes this.#promise
    #promise: Promise<void>

    constructor() {
        this.#done = false
        this.#items = []
        this.#resolve = () => { }
        this._defer()
    }
    
    _defer() {
        this.#promise = new Promise(r => this.#resolve = r)
    }
    
    async*[Symbol.asyncIterator]() {
        while (!this.#done) {
            await this.#promise
            yield* this.#items
            this.#items = []
        }
    }

    /** Add an item to the queue. Note that once an item is pushed, it cannot be removed. */
    push(item: T) {
        this.#items.push(item)
        this.#resolve()
        this._defer()
    }

    /** Stops the iterator. Anything pushed to the queue after this is called won't be sent to the iterator. */
    end() {
        this.#done = true
        this.#resolve()
    }
}
