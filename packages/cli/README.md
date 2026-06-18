# @woodpecker/cli

Node.js/Bun port of the [shoutrrr](https://github.com/containrrr/shoutrrr) CLI —
a URL-driven notification sender. Faithful port of the Go cobra CLI
(`shoutrrr/cmd`) onto [commander](https://github.com/tj/commander.js).

## Commands

### `send`

Send a notification to one or more service URLs concurrently.

```sh
shoutrrr send -u logger:// -m "hello from cli"
shoutrrr send -u logger:// -u logger:// -m "broadcast" -t "Title" -v
echo "piped body" | shoutrrr send -u logger:// -m -
```

| Flag | Description |
| --- | --- |
| `-u, --url <url...>` | Notification URL (repeatable, required) |
| `-m, --message <msg>` | Message to send, or `-` to read from stdin (required) |
| `-t, --title <title>` | Title for services that support it |
| `-v, --verbose` | Verbose diagnostics on stderr |

Sends to every URL concurrently and reports per-URL success/failure. Exits
non-zero on any failure (`78` ExConfig for a bad/unknown URL, `69` ExUnavailable
for a send failure), mirroring the Go CLI's sysexits codes.

### `verify`

Parse a URL into a service config and print the resolved config tree, without
sending.

```sh
shoutrrr verify -u logger://
```

| Flag | Description |
| --- | --- |
| `-u, --url <url>` | Notification URL (required) |

`generate` and `docs` are intentionally deferred.

## Scope note

This package vendors the minimal core (router + public API + config-tree
rendering) under `src/core/`. Only the built-in `logger://` service
self-registers here, so the CLI is runnable end-to-end. **The full service
registry (all 20 services) is wired up in the integration pass**, where each
service self-registers via its descriptor.

## Development

```sh
bun install
bun run build   # tsc --noEmit (type-check)
bun test        # unit + behavioral tests
```

Runtime: Bun. The `shoutrrr` bin runs `src/cli.ts` directly via Bun.
