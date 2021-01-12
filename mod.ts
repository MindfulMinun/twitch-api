import { User } from './User.ts'

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
}

export const ENDPOINT = 'https://api.twitch.tv/helix/'

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
    /** Space-separated list of [scopes](https://dev.twitch.tv/docs/authentication/#scopes) */
    scopes?: string
    /** Current access token */
    accessToken?: string

    constructor(loginOptions: LoginOptions) {
        this.clientId = loginOptions.clientId
        this.#clientSecret = loginOptions.clientSecret
        this.scopes = loginOptions.scopes || ''
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
                    yield* chunk.data.slice(0, max - count)
                } while (after && count < max)
            }
        }
    }

    // getWebhooks(filters: {
    //     status:
    //         'enabled' |
    //         'webhook_callback_verification_pending' |
    //         'webhook_callback_verification_failed' |
    //         'notification_failures_exceeded' |
    //         'authorization_revoked' |
    //     'user_removed',
        
    // }) {
    //     let path = 'eventsub/subscriptions'
    //     if (filters) {
    //         path += '?'
    //     }
    //     return this.getJSON()
    // }
}
