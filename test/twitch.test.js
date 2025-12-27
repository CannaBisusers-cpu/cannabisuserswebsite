const { handler } = require('../netlify/functions/twitch.js');

describe('netlify twitch function', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.TWITCH_CLIENT_ID = 'testid';
    process.env.TWITCH_OAUTH = 'Bearer testtoken';
  });

  test('returns 400 for missing type', async () => {
    const res = await handler({ queryStringParameters: {} });
    expect(res.statusCode).toBe(400);
  });

  test('returns user data and caches it (using legacy TWITCH_OAUTH)', async () => {
    const fake = { data: [{ id: 'u1' }] };
    global.fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => fake });

    const res1 = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1).toEqual(fake);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should use cache (no extra fetch)
    const res2 = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2).toEqual(fake);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fetches app access token with client credentials and calls API', async () => {
    jest.resetModules();
    process.env.TWITCH_CLIENT_ID = 'testid';
    process.env.TWITCH_CLIENT_SECRET = 'secret';

    const fakeToken = { access_token: 'apptoken', expires_in: 3600 };
    const fakeUser = { data: [{ id: 'u2' }] };

    global.fetch = jest.fn()
      // first call: token endpoint
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fakeToken })
      // second call: helix users
      .mockResolvedValueOnce({ status: 200, json: async () => fakeUser });

    const { handler: h } = require('../netlify/functions/twitch.js');
    const res = await h({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(res.body);
    expect(body).toEqual(fakeUser);
  });

  test('returns cached data if fetch fails', async () => {
    const fake = { data: [{ id: 'u1' }] };
    global.fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => fake });
    await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });

    global.fetch = jest.fn().mockRejectedValue(new Error('network')); // simulate failure
    const res = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(fake);
  });

  test('requires env vars', async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_OAUTH;
    const res = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res.statusCode).toBe(500);
  });
});
