const SlackTransport = require('../src/slackTransport');
const winston = require('winston');

const mockToken = "xoxb-123456789012-3456789012345-abcdefgABCDEF12345687890";
const mockChannel = "my-channel";
const mockOptions = {
    token: mockToken,
    channel: mockChannel
}

const helloWorldMarkdown = "*Hello world*!";

const mockFullOptions = {
    ...mockOptions,
    level: "info",
    attachments: "",
    blocks: [],
    mrkdwn: true,
    text: helloWorldMarkdown
}

describe("SlackTransport", () => {
    it("cannot be created on empty options", () => {
        expect(() => {
            new SlackTransport();
        }).toThrow();
    });

    it("can be created with minimal options", () => {
        const slackTransport = new SlackTransport(mockOptions);
        expect(slackTransport).toBeTruthy();
    });

    it("can be created with full options", () => {
        const slackTransport = new SlackTransport(mockOptions);
        expect(slackTransport).toBeTruthy();
    });

    it("can be added to winston", () => {
        const logger = winston.createLogger({
            level: 'info',
            transports: [
                new SlackTransport(mockOptions)
            ]
        });
        expect(logger).toBeTruthy();
    });

    it("can be added to winston with all options", () => {
        const logger = winston.createLogger({
            level: 'info',
            transports: [
                new SlackTransport(mockFullOptions)
            ]
        });
        expect(logger).toBeTruthy();
    });

});
