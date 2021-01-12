# twitch-api

> Work in progress. Proceed with caution.

Interact with the Twitch API with ease

```ts
import 'https://deno.land/x/dotenv/load.ts'
import * as Twitch from './mod.ts'

// Connect to Twitch
// https://dev.twitch.tv/docs/api/#step-1-setup
const api = new Twitch.Client({
    clientId: Deno.env.get('TWITCH_CLIENT_ID') as string,
    clientSecret: Deno.env.get('TWITCH_SECRET') as string,
})

await api.login()

// Fetch a user
const user = await api.getUser({ login: 'mindfulminun' })
console.log(user)

// Get 5 streamers who are streaming Just Chatting
for await (const stream of api.getStreams({ gameId: '509658', count: 5 })) {
    console.log(stream)
}

// Count how many channels a user is following
const followerCount = await user.getFollowerCount('from')
console.log(`${user.displayName} is following ${followerCount} channels`)

Deno.exit()
```

See [`example.ts`](./example.ts)
