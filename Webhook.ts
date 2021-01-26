import { Client } from './mod.ts'
import { HmacSha256 } from 'https://deno.land/std@0.83.0/hash/sha256.ts'

export type WebhookEvent = 
    "channel.update" |
    "channel.follow" |
    "channel.subscribe" |
    "channel.cheer" |
    "channel.ban" |
    "channel.unban" |
    "channel.channel_points_custom_reward.add" |
    "channel.channel_points_custom_reward.update" |
    "channel.channel_points_custom_reward.remove" |
    "channel.channel_points_custom_reward_redemption.add" |
    "channel.channel_points_custom_reward_redemption.update" |
    "channel.hype_train.begin" |
    "channel.hype_train.progress" |
    "channel.hype_train.end" |
    "stream.online" |
    "stream.offline" |
    "user.authorization.revoke" |
    "user.update"

export type WebhookStatus =
    'enabled' |
    'webhook_callback_verification_pending' |
    'webhook_callback_verification_failed' |
    'notification_failures_exceeded' |
    'authorization_revoked' |
    'user_removed'

export interface WebhookEventCondition {
    /** The broadcaster user ID for the channel you want to get notifications for. */
    'broadcaster_user_id'?: string
    /** Specify a reward id to only receive notifications for a specific reward. */
    'reward_id'?: string
    /** Your application’s client id. The provided client_id must match the client id in the application access token. */
    'client_id'?: string
    /** The user ID for the user you want update notifications for. */
    'user_id'?: string
}

interface WebhookTransport {
    method: 'webhook'
    callback: string
}
export interface WebhookResponse {
    id: string
    status: WebhookStatus
    type: WebhookEvent
    condition: any
    created_at: string
    transport: WebhookTransport
}

export const EVENTSUB_VERSION = '1'
export class Webhook implements AsyncIterable<any> {
    #auto: Client
    
    id!: string
    status!: WebhookStatus
    type!: WebhookEvent
    condition!: any
    createdAt!: Date
    transport!: WebhookTransport

    constructor(auto: Client, response: WebhookResponse) {
        this.#auto = auto
        this._updateOwnValuesFromResp(response)
    }

    _updateOwnValuesFromResp(sub: WebhookResponse) {
        this.id = sub.id
        this.status = sub.status
        this.type = sub.type
        this.condition = sub.condition
        this.createdAt = new Date(sub.created_at)
        this.transport = sub.transport
    }

    unsubscribe(webhookId = this.id) {
        return this.#auto.fetch(`eventsub/subscriptions?id=${webhookId}`, {
            method: 'DELETE'
        })
    }

    async*[Symbol.asyncIterator]() {
        for await (const callback of this.#auto._webhookQ) {
            if (callback.subscription.id === this.id) {
                this._updateOwnValuesFromResp(callback.subscription as WebhookResponse)
                if (callback.event) yield callback.event
            }
        }
    }

    static async createWebhook(
        auto: Client,
        opts: {
            type: WebhookEvent,
            /** Callback URL. */
            callabck: string,
            /** An [event condition](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#conditions) */
            condition: WebhookEventCondition
        },
        secret: string
    ) {
        const json = await auto.getJSON('eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                type: opts.type,
                version: EVENTSUB_VERSION,
                condition: opts.condition,
                transport: {
                    method: 'webhook',
                    callback: opts.callabck,
                    secret
                }
            })
        })
        return new Webhook(auto, json.data[0])
    }

    static verifyMessage(secret: string, body: string) {
        const sha = new HmacSha256(secret)
        sha.update(body)
        return 'sha256=' + sha.hex()
    }
}
