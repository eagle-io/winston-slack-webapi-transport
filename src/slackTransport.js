const Transport = require('winston-transport');
const {WebClient, LogLevel} = require('@slack/web-api');

module.exports = class SlackTransport extends Transport {
    constructor(opts) {
        super(opts);

        opts = opts || {};

        this.assignRequireOptions(opts);
        this.assignOptions(opts);

        this.webClient = new WebClient(this.token, {
            timeout: 5000,
            logLevel: LogLevel.ERROR,
            retryConfig: {
                retries: 2,
                factor: 2,
                minTimeout: 250,
                maxTimeout: 1000,
                randomize: false
            },
            rejectRateLimitedCalls: true,
            maxRequestConcurrency: 1,
            allowAbsoluteUrls: false
        });
        this.pending = new Set();
        this.closing = false;
        this.closePromise = undefined;
    }

    assignRequireOptions(opts) {
        this.token = opts.token;
        if (!this.token) {
            throw new Error("SlackTransport: token is required")
        }

        this.channel = opts.channel;
        if (!this.channel) {
            throw new Error("SlackTransport: channel is required")
        }
    }

    assignOptions(opts) {
        this.name = opts.name || 'slackTransport';
        this.level = opts.level || undefined;

        this.attachments = opts.attachments || undefined;
        this.blocks = opts.blocks || undefined;
        this.mrkdwn = opts.mrkdwn || false;
        this.text = opts.text || undefined;

        this.username = opts.username || undefined;
        this.icon_emoji = opts.icon_emoji || undefined;
        this.icon_url = opts.icon_url || undefined;
    }

    getWebClientInstance() {
        return this.webClient;
    }

    log(info, callback) {
        if (this.closing) {
            callback(new Error('SlackTransport: transport is closed'));
            return;
        }

        let payload;
        try {
            payload = this.buildMessage(info);
        } catch (error) {
            callback(error);
            return;
        }

        const request = Promise.resolve().then(() => this.getWebClientInstance().chat.postMessage(payload));
        this.pending.add(request);
        request.then(() => {
            this.pending.delete(request);
            try {
                this.emit('logged', info);
            } finally {
                callback();
            }
        }, error => {
            this.pending.delete(request);
            callback(error);
        });
    }

    buildMessage(info) {
        return {
            channel: this.channel,
            mrkdwn: this.mrkdwn,
            username: this.username,
            icon_emoji: this.icon_emoji,
            icon_url: this.icon_url,
            ...(!this.text && !this.blocks && !this.attachments
                ? this.buildDefaultPayload(info)
                : this.buildPayload(info))
        }
    }

    close() {
        if (!this.closePromise) {
            this.closing = true;
            this.closePromise = Promise.allSettled([...this.pending]).then(() => {
                this.emit('closed');
            });
        }
        return this.closePromise;
    }

    buildDefaultPayload(info) {
        return {
            "text" : `*${info.level}*\n${info.message}`,
            "mrkdwn": true
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
            return undefined;
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
