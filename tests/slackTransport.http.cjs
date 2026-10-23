const http = require('node:http');
const assert = require('node:assert/strict');
const {test, beforeEach, afterEach} = require('node:test');
const SlackTransport = require('../src/slackTransport');

const nativeFetch = global.fetch;
let server;

let requests;
let respond;

beforeEach(async () => {
    requests = [];
    server = http.createServer((request, response) => {
        let body = '';
        request.on('data', chunk => {body += chunk;});
        request.on('end', () => {
            requests.push({path: request.url, body: new URLSearchParams(body)});
            respond(response, requests.length);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = `http://127.0.0.1:${server.address().port}`;
    global.fetch = (url, init) => nativeFetch(`${address}${new URL(url).pathname}`, init);
});

afterEach(async () => {
    global.fetch = nativeFetch;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

function post() {
    const transport = new SlackTransport({token: 'test-token', channel: 'test-channel'});
    return new Promise(resolve => transport.log({level: 'error', message: 'Synthetic HTTP fixture'}, async error => {
        await transport.close();
        resolve(error);
    }));
}

function json(response, status, body) {
    response.writeHead(status, {'Content-Type': 'application/json'});
    response.end(JSON.stringify(body));
}

test('sends the preserved payload through the real SDK to a loopback server', async () => {
    respond = response => json(response, 200, {ok: true, ts: '1.0'});
    assert.equal(await post(), undefined);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, '/api/chat.postMessage');
    assert.equal(requests[0].body.get('channel'), 'test-channel');
    assert.equal(requests[0].body.get('text'), '*error*\nSynthetic HTTP fixture');
    assert.equal(requests[0].body.get('mrkdwn'), 'true');
});

test('retries a temporary HTTP failure and then succeeds', async () => {
    respond = (response, attempt) => json(response, attempt === 1 ? 503 : 200, {ok: attempt !== 1});
    assert.equal(await post(), undefined);
    assert.equal(requests.length, 2);
});

test('stops after two retries when HTTP failures persist', async () => {
    respond = response => json(response, 503, {ok: false});
    const error = await post();
    assert.equal(error.code, 'slack_webapi_http_error');
    assert.equal(error.statusCode, 503);
    assert.equal(requests.length, 3);
});

test('reports a long rate limit immediately without retrying or waiting', async () => {
    respond = response => {
        response.writeHead(429, {'Retry-After': '3600'});
        response.end();
    };
    const error = await post();
    assert.equal(error.code, 'slack_webapi_rate_limited_error');
    assert.equal(error.retryAfter, 3600);
    assert.equal(requests.length, 1);
});

test('reports Slack API errors without retrying', async () => {
    respond = response => json(response, 200, {ok: false, error: 'channel_not_found'});
    assert.equal((await post()).code, 'slack_webapi_platform_error');
    assert.equal(requests.length, 1);
});

test('times out three stalled attempts and drains close before settling', {timeout: 25000}, async context => {
    let started;
    const firstRequest = new Promise(resolve => {started = resolve;});
    respond = () => started();
    const transport = new SlackTransport({token: 'test-token', channel: 'test-channel'});
    let callbackCount = 0;
    let closeCount = 0;
    transport.on('closed', () => {closeCount += 1;});
    const start = performance.now();
    const delivery = new Promise(resolve => transport.log({level: 'error', message: 'Synthetic stalled fixture'}, error => {
        callbackCount += 1;
        resolve(error);
    }));
    await firstRequest;
    const closing = transport.close();
    assert.equal(transport.close(), closing);
    assert.equal(closeCount, 0);
    assert.equal(callbackCount, 0);
    const [error] = await Promise.all([delivery, closing]);
    const elapsed = performance.now() - start;
    assert.equal(error.code, 'slack_webapi_request_error');
    assert.equal(requests.length, 3);
    assert.equal(callbackCount, 1);
    assert.equal(closeCount, 1);
    assert.equal(transport.pending.size, 0);
    assert.ok(elapsed >= 14500, 'all three attempts must reach their five second timeout');
    assert.ok(elapsed < 22000, 'delivery and shutdown must settle within the bounded retry window');
    context.diagnostic(`Stalled delivery and close settled after ${Math.round(elapsed)} ms across three attempts`);
});
