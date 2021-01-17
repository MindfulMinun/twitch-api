import { Client, ENDPOINT, TwitchPagination } from './mod.ts'

/**
 * https://dev.twitch.tv/docs/api/reference#get-users
 */
interface TwitchUserResponse {
    broadcaster_type: 'partner' | 'affiliate' | ''
    description: string
    display_name: string
    email?: string
    id: string,
    login: string
    offline_image_url: string
    profile_image_url: string
    type: 'staff' | 'admin' | 'global_mod' | ''
    view_count: number
    created_at: string
}

enum TwitchUserBroadcasterType {
    PARTNER = 'partner',
    AFFILIATE = 'affiliate',
    DEFAULT = ''
}
enum TwitchUserType {
    STAFF = 'staff',
    ADMIN = 'admin',
    GLOBAL_MOD = 'global_mod',
    DEFAULT = ''
}

interface TwitchUsersFollowListResp {
    total: number
    data: TwitchUsersFollowerResp[]
    pagination: TwitchPagination
}
interface TwitchUsersFollowerResp {
    from_id: string
    from_name: string
    to_id: string
    to_name: string
    followed_at: string
}

/**
 * Represents a Twitch user
 */
export class User {
    //#region Properties
    /** Represents the API instance that requested this user */
    #auto: Client
    broadcasterType: TwitchUserBroadcasterType
    description: string
    displayName: string
    /** Included if the request includes the `user:read:email` scope  */
    email?: string
    id: string
    login: string
    offlineImageUrl: string
    profileImageUrl: string
    type: TwitchUserType
    viewCount: number
    createdAt: Date
    //#endregion

    constructor(auto: Client, data: TwitchUserResponse) {
        this.#auto = auto
        this.description = data.description
        this.displayName = data.display_name
        this.email = data.email
        this.id = data.id
        this.login = data.login
        this.offlineImageUrl = data.offline_image_url
        this.profileImageUrl = data.profile_image_url
        this.viewCount = data.view_count
        this.createdAt = new Date(data.created_at)

        switch (data.broadcaster_type) {
            case TwitchUserBroadcasterType.AFFILIATE:
                this.broadcasterType = TwitchUserBroadcasterType.AFFILIATE
                break
            case TwitchUserBroadcasterType.PARTNER:
                this.broadcasterType = TwitchUserBroadcasterType.PARTNER
                break
            default:
                this.broadcasterType = TwitchUserBroadcasterType.DEFAULT
                break
        }

        switch (data.type) {
            case TwitchUserType.STAFF:
                this.type = TwitchUserType.STAFF
                break
            case TwitchUserType.ADMIN:
                this.type = TwitchUserType.ADMIN
                break
            case TwitchUserType.GLOBAL_MOD:
                this.type = TwitchUserType.GLOBAL_MOD
                break
            default:
                this.type = TwitchUserType.DEFAULT
                break
        }
    }

    /**
     * Get this user's followers asynchronously, from most recent follow to least recent.
     * Specifying `to` gets a list of users who follow this user, and
     * `from` gets a list of users this user follows
     */
    getFollowers(relation: 'from' | 'to' = 'to'): AsyncIterable<TwitchUsersFollowerResp> {
        const that = this
        // Pagination cursor
        let after = ''

        return {
            async*[Symbol.asyncIterator]() {
                // Keep looping until we've seen all the followers
                do {
                    // Get a chunk of 20 followers
                    const chunk = await that._getFollowerChunk({ [`${relation}_id`]: that.id, after })
                    
                    // Update the cursor
                    after = chunk.pagination.cursor ?? ''

                    // ...and yield them
                    yield* chunk.data
                } while (after)
            }
        }
    }

    /**
     * Get the number of this user's followers asynchronously.
     * Specifying `to` gets a count of users who follow this user, and
     * `from` gets a count of users this user follows
     */
    async getFollowerCount(relation: 'from' | 'to' = 'to') {
        const chunk = await this._getFollowerChunk({ [`${relation}_id`]: this.id, count: 0 })
        return Promise.resolve(chunk.total)
    }

    _getFollowerChunk(req: {
        after?: string, from_id?: string, to_id?: string, count?: number
    } = {}): Promise<TwitchUsersFollowListResp> {
        const url = new URL(`users/follows`, ENDPOINT)

        if (req.after)   url.searchParams.set('after', req.after)
        if (req.from_id) url.searchParams.set('from_id', req.from_id)
        if (req.to_id)   url.searchParams.set('to_id', req.to_id)
        if (req.count)   url.searchParams.set('first', req.count + '')

        return this.#auto.getJSON(url)
    }

    getChannel() {
        return this.#auto.getJSON(`channels?broadcaster_id=${this.id}`)
    }
}
