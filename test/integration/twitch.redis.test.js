jest.mock('ioredis', () => require('ioredis-mock'));

const { handler } = require('../../netlify/functions/twitch.js');

describe('Redis integration (mock)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.TWITCH_CLIENT_ID = 'testid';
    process.env.TWITCH_CLIENT_SECRET = 'secret';
    process.env.REDIS_URL = 'redis://localhost:6379';
  });

  test('uses redis cache when available', async () => {
    const fakeToken = { access_token: 'apptoken', expires_in: 3600 };
    const fakeUser = { data: [{ id: 'u-redis' }] };

    global.fetch = jest.fn()
      // token endpoint
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fakeToken })
      // helix users
      .mockResolvedValueOnce({ status: 200, json: async () => fakeUser });

    const res1 = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res1.statusCode).toBe(200);
    expect(JSON.parse(res1.body)).toEqual(fakeUser);

    // Second call should hit redis cache and not call fetch again for helix
    const res2 = await handler({ queryStringParameters: { type: 'user', login: 'cannabisusers' } });
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res2.body)).toEqual(fakeUser);
    expect(global.fetch).toHaveBeenCalledTimes(2); // token + first user call
  });
});
