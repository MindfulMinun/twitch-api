import 'https://deno.land/x/dotenv/load.ts'
import * as Twitch from './mod.ts'

const api = new Twitch.Client({
    clientId: Deno.env.get('TWITCH_CLIENT_ID') as string,
    clientSecret: Deno.env.get('TWITCH_SECRET') as string,
})

await api.login()

// Fetch a user
const user = await api.getUser({ login: 'mindfulminun' })
console.log(user)

// Get 5 streamers who are streaming Just Chatting
// @ts-expect-error -- Deno top-level await
for await (const stream of api.getStreams({ gameId: '509658', count: 5 })) {
    console.log(stream)
}

// Count how many channels a user is following
const followerCount = await user.getFollowerCount('from')
console.log(`${user.displayName} is following ${followerCount} channels`)

Deno.exit()
