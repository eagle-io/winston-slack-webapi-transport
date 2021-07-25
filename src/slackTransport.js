const Transport = require('winston-transport');
const {WebClient} = require('@slack/web-api');
const {getColor} = require("./colors");

module.exports = class SlackTransport extends Transport {
    constructor(opts) {
        super(opts);

        opts = opts || {};

        this.assignRequireOptions(opts);
        this.assignOptions(opts);

        this.webclient = undefined;
    }

    assignRequireOptions(opts) {
        this.token = opts.token;
        if (!this.token) {
            throw "SlackTransport: token or SLACK_TOKEN env var is required"
        }

        this.channel = opts.channel;
        if (!this.channel) {
            throw "SlackTransport: channel or SLACK_DEFAULT_CHANNEL is required"
        }
    }

    assignOptions(opts) {
        this.name = opts.name || 'slackTransport';
        this.level = opts.level || undefined;

        this.attachments = opts.attachments || undefined;
        this.blocks = opts.blocks || undefined;
        this.mrkdwn = opts.mrkdwn || false;
        this.text = opts.text || undefined;
    }

    getWebClientInstance() {
        return this.webClient || new WebClient(this.token);
    }

    log(info, callback) {
        let payload = {
            channel: this.channel,
            mrkdwn: this.mrkdwn
        };

        if (!this.text && !this.blocks && !this.attachments) {
            payload = {
                ...payload,
                ...this.buildDefaultPayload(info)
            }
        } else {
            payload = {
                ...payload,
                ...this.buildPayload(info)
            }
        }

        const webClient = this.getWebClientInstance();
        console.log(payload);
        webClient.chat.postMessage(payload)
            .then(response => {
                this.emit('logged', info);
                callback();
            })
            .catch(err => {
                this.emit('error', err);
                callback();
            });
    }

    buildDefaultPayload(info) {
        return {
            "attachments": [
                {
                    "color": getColor(info.level),
                    "blocks": [
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": `*Level*: ${info.level}\n*Message*: ${info.message}`
                            }
                        }
                    ],
                    "fallback": "This is an attachment's fallback"
                }
            ],
            "text": ``,
        }
    }

    buildPayload(info) {
        return {
            text: this.buildText(info),
            blocks: this.buildBlocks(info),
            attachments: this.buildAttachments(info)
        }
    }

    buildText(info) {
        if (this.text && typeof this.text === 'function') {
            return this.text(info);
        } else {
            return `${info.level}: ${info.message}`;
        }
    }

    buildBlocks(info) {
        if (this.blocks && typeof this.blocks === 'function') {
            return this.blocks(info);
        } else {
            return undefined;
        }
    }

    buildAttachments(info) {
        if (this.attachments && typeof this.attachments === 'function') {
            return this.attachments(info);
        } else {
            return undefined;
        }
    }
};
