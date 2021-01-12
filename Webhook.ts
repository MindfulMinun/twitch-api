import { serve } from 'https://deno.land/std@0.83.0/http/server.ts'
import { Client } from './mod.ts'

type WebhookEvent = 
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

interface WebhookParams {
    event: WebhookEvent
    condition: any
}

export const EVENTSUB_VERSION = '1'

const WEBHOOK_SECRET = 'i love div soup'

export class Webhook {
    #auto: Client
    params: WebhookParams
    constructor(auto: Client, params: WebhookParams) {
        this.#auto = auto
        this.params = params
    }

    subscribe() {
        return this.#auto.getJSON('eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                type: this.params.event,
                version: EVENTSUB_VERSION,
                condition: this.params.condition,
                transport: {
                    method: 'webhook',
                    callback: 'https://307f30b88e68.ngrok.io/',
                    secret: WEBHOOK_SECRET
                }
            })
        })
    }

    unsubscribe(webhookId?: string) {
        return this.#auto.fetch(`eventsub/subscriptions?id=${webhookId}`, {
            method: 'DELETE'
        })
    }
}
