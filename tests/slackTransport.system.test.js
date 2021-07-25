const winston = require("winston");
const SlackTransport = require("../src/slackTransport");
const {levels} = require("./levels");

const realToken = process.env.SLACK_TOKEN;
const realChannel = process.env.SLACK_DEFAULT_CHANNEL;

describe.skip("SlackTransport system", () => {

    it("log info properly to slack", () => {
        const logger = winston.createLogger({
            level: 'info',
            transports: [
                new SlackTransport({
                    token: realToken,
                    channel: realChannel
                })
            ]
        });
        logger.info("This is a info message");
    });

    it.each(levels)(`log %s properly to slack`, async (logType) => {
        const logger = winston.createLogger({
            level: 'silly',
            transports: [
                new SlackTransport({
                    token: realToken,
                    channel: realChannel
                })
            ]
        });
        logger.log(logType, `This is a ${logType} message`);
    });

    it.only("use function for attachments", () => {

        const customAttachments = (info) => ([
            {
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "plain_text",
                            "text": `Level: ${info.level}`
                        }
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "plain_text",
                            "text": `Date: ${(new Date()).toString()}`
                        }
                    }
                ]
            }
            ]);

        const logger = winston.createLogger({
            level: 'info',
            transports: [
                new SlackTransport({
                    token: realToken,
                    channel: realChannel,
                    attachments: customAttachments
                })
            ]
        });
        logger.info("This is a info message");
    });
});
