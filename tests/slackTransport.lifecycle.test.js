const {WebClient} = require('@slack/web-api');
const SlackTransport = require('../src/slackTransport');
const winston = require('winston');

jest.mock('@slack/web-api', () => ({WebClient: jest.fn(), LogLevel: {ERROR: 'error'}}));

const options = {token: 'test-token', channel: 'test-channel'};
const info = {level: 'error', message: 'Synthetic test message'};
let postMessage;

beforeEach(() => {
    WebClient.mockReset();
    postMessage = jest.fn().mockResolvedValue({ok: true});
    WebClient.mockImplementation(() => ({chat: {postMessage}}));
});

function log(transport, message = info) {
    return new Promise(resolve => transport.log(message, resolve));
}

test('creates and reuses one client with bounded delivery settings', async () => {
    const transport = new SlackTransport(options);
    await log(transport);
    await log(transport);
    expect(WebClient).toHaveBeenCalledTimes(1);
    expect(WebClient).toHaveBeenCalledWith(options.token, {
        timeout: 5000,
        logLevel: 'error',
        retryConfig: {retries: 2, factor: 2, minTimeout: 250, maxTimeout: 1000, randomize: false},
        rejectRateLimitedCalls: true,
        maxRequestConcurrency: 1,
        allowAbsoluteUrls: false
    });
    expect(transport.getWebClientInstance()).toBe(transport.webClient);
    expect(postMessage).toHaveBeenCalledTimes(2);
});

test('preserves the default message and identity fields', async () => {
    const transport = new SlackTransport({...options, username: 'logger', icon_emoji: ':warning:', icon_url: 'https://example.invalid/icon.png'});
    const logged = jest.fn();
    transport.on('logged', logged);
    expect(await log(transport)).toBeUndefined();
    expect(postMessage).toHaveBeenCalledWith({
        channel: options.channel,
        username: 'logger',
        icon_emoji: ':warning:',
        icon_url: 'https://example.invalid/icon.png',
        text: '*error*\nSynthetic test message',
        mrkdwn: true
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(info);
});

test('preserves configured text, blocks, attachments and markdown callbacks', async () => {
    const blocks = [{type: 'section', text: {type: 'plain_text', text: info.message}}];
    const attachments = [{text: 'details'}];
    const transport = new SlackTransport({
        ...options,
        mrkdwn: false,
        text: message => message.message,
        blocks: () => blocks,
        attachments: () => attachments
    });
    await log(transport);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({text: info.message, blocks, attachments, mrkdwn: false}));
});

test.each(['reject', 'throw'])('settles the callback exactly once when the SDK fails by %s', async mode => {
    const failure = new Error('Synthetic SDK failure');
    postMessage.mockImplementation(() => {
        if (mode === 'throw') throw failure;
        return Promise.reject(failure);
    });
    const transport = new SlackTransport(options);
    const callback = jest.fn();
    const logged = jest.fn();
    transport.on('logged', logged);
    await new Promise(resolve => transport.log(info, error => {callback(error); resolve();}));
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(failure);
    expect(logged).not.toHaveBeenCalled();
    await expect(transport.close()).resolves.toBeUndefined();
});

test('reports synchronous payload errors through the callback without posting', async () => {
    const failure = new Error('Synthetic formatter failure');
    const transport = new SlackTransport({...options, text: () => {throw failure;}});
    expect(await log(transport)).toBe(failure);
    expect(postMessage).not.toHaveBeenCalled();
});

test('forwards delivery failure through the Winston stream error contract', async () => {
    const failure = new Error('Synthetic delivery failure');
    postMessage.mockRejectedValue(failure);
    const transport = new SlackTransport(options);
    const logger = winston.createLogger({transports: [transport]});
    const errors = jest.fn();
    logger.on('error', errors);
    const received = new Promise(resolve => logger.once('error', resolve));
    logger.error(info.message);
    expect(await received).toBe(failure);
    await Promise.resolve();
    expect(errors).toHaveBeenCalledTimes(1);
    await transport.close();
});

test('closes once after in-flight delivery and rejects later messages', async () => {
    let finish;
    postMessage.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const transport = new SlackTransport(options);
    const closed = jest.fn();
    transport.on('closed', closed);
    const delivery = log(transport);
    await Promise.resolve();
    const closing = transport.close();
    expect(transport.close()).toBe(closing);
    expect(closed).not.toHaveBeenCalled();
    expect(await log(transport)).toEqual(new Error('SlackTransport: transport is closed'));
    expect(postMessage).toHaveBeenCalledTimes(1);
    finish({ok: true});
    await delivery;
    await closing;
    expect(closed).toHaveBeenCalledTimes(1);
});


test('drains a failed in-flight request and delivers its error before closing', async () => {
    let fail;
    postMessage.mockImplementation(() => new Promise((resolve, reject) => {fail = reject;}));
    const transport = new SlackTransport(options);
    const order = [];
    const failure = new Error('Synthetic shutdown delivery failure');
    const delivery = new Promise(resolve => transport.log(info, error => {order.push('callback'); resolve(error);}));
    await Promise.resolve();
    transport.on('closed', () => order.push('closed'));
    const closing = transport.close();
    fail(failure);
    expect(await delivery).toBe(failure);
    await closing;
    expect(order).toEqual(['callback', 'closed']);
});


test('Winston finish waits for delivery and logger close drains the transport', async () => {
    let deliver;
    postMessage.mockImplementation(() => new Promise(resolve => {deliver = resolve;}));
    const transport = new SlackTransport(options);
    const logger = winston.createLogger({transports: [transport]});
    const finished = jest.fn();
    const onClosed = jest.fn();
    const closed = new Promise(resolve => transport.once('closed', () => {onClosed(); resolve();}));
    const completed = new Promise(resolve => logger.once('finish', () => {finished(); resolve();}));
    logger.end({level: info.level, message: info.message});
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    deliver({ok: true});
    await completed;
    expect(finished).toHaveBeenCalledTimes(1);
    logger.close();
    await closed;
    expect(transport.closing).toBe(true);
    expect(onClosed).toHaveBeenCalledTimes(1);
});
