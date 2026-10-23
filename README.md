# winston-slack-transport

A Slack transport for Winston 3+ that logs to a channel via webapi and api token.

## Options

| option      | required | default          | description |
| ----------- | :------: | ---------------- | ----------- |
| token       | x        |                  |             |
| channel     | x        |                  |             |
| name        |          | "slackTransport" |             |
| attachments |          |                  |             |
| blocks      |          |                  |             |
| mrkdwn      |          | true             |             |
| text        |          |                  |             |
| level       |          | info             |             |

## Delivery and shutdown

Requires Node.js 20 or later. Each transport reuses one Slack Web API client.
Messages retain their channel, identity fields, default Markdown text and optional
text, blocks and attachments callbacks.

Each HTTP attempt has a five second timeout. Temporary delivery failures receive
at most two retries with delays of 250 ms and 500 ms. Slack rate limits fail
immediately with the SDK error and `retryAfter`; they do not leave the logger
waiting for an arbitrarily long rate limit. Delivery and formatter failures reach
the Winston stream through the log callback. Listen for the logger's `error`
event to handle them.

`close()` rejects new messages and returns a promise that resolves after already
submitted delivery attempts settle. Closing repeatedly returns the same promise.
The transport emits `closed` once after the pending work has drained.

Tests use SDK mocks and a loopback HTTP server. They do not contact Slack.
