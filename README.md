# woodpecker

A pure **Node.js / TypeScript** port of
[shoutrrr](https://github.com/containrrr/shoutrrr) — the URL-driven notification
library. Send a message to Slack, Discord, Telegram, SMTP, and 16 more services
from a single `scheme://…` URL. Runs on [Bun](https://bun.sh); no Go at runtime.

> *woodpecker* — it knocks to get the word out.

## Install

```bash
bun add @woodpecker/woodpecker
```

## Library usage

```ts
import { send, createSender } from "@woodpecker/woodpecker";

// one-off
await send("slack://token-a/token-b/token-c@channel", "Deploy finished ✅");

// reuse a sender for several URLs
const sender = createSender("discord://token@id", "telegram://token@telegram?chats=@me");
const errors = await sender.send("Build broke ❌");
```

Individual services are also published standalone (e.g. `@woodpecker/slack`),
all sharing the canonical `@woodpecker/core`.

## CLI

```bash
woodpecker send   -u "logger://" -m "hello"
woodpecker verify -u "slack://token-a/token-b/token-c@channel"
```

## Services

`bark` · `discord` · `generic` · `googlechat` (+`hangouts`) · `gotify` · `ifttt` ·
`join` · `logger` · `matrix` · `mattermost` · `ntfy` · `opsgenie` · `pushbullet` ·
`pushover` · `rocketchat` · `slack` · `smtp` · `teams` · `telegram` · `zulip`

## Development

This is a [Bun](https://bun.sh) workspace orchestrated by
[Turborepo](https://turbo.build) and linted/formatted by
[Biome](https://biomejs.dev). Each service is its own package under `packages/`,
plugging into `@woodpecker/core`.

```bash
bun install
bun run build     # turbo build  (tsc --noEmit, cached)
bun run test      # turbo test   (bun test, cached)
bun run check     # biome check  (format + lint + import organize)
bun run format    # biome check --write
```

## Credits & license

A faithful port of [containrrr/shoutrrr](https://github.com/containrrr/shoutrrr)
(© 2019 Containrrr). MIT licensed — see [LICENSE](./LICENSE).
