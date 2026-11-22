import {DurableObject} from 'cloudflare:workers';
import {newGame, playMove, sheep, tiger} from './rules.mjs';

const ttl = 24 * 60 * 60 * 1000;
const roomRoute = /^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})\/(create|join|state|move)$/;
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const fail = (error, status) => json({error}, status);
const view = (room, seat) => json({state: room.state, names: room.seats.map(player => player.name), seat, version: room.version});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const route = roomRoute.exec(url.pathname);
    if (!route) return fail('unknown', 404);
    const origin = request.headers.get('Origin');
    const allowed = !origin || origin === url.origin || origin === 'https://tobychito92.github.io';
    if (!allowed) return fail('origin', 403);
    const cors = new Headers({
      'Access-Control-Allow-Origin': origin || url.origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin'
    });
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (request.method !== 'POST') return fail('method', 405);
    // Bound API input before forwarding it to a room.
    const reader = request.body?.getReader();
    if (!reader) return fail('invalid', 400);
    const payload = new Uint8Array(1024);
    let length = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (length + value.length > payload.length) {
        await reader.cancel();
        return fail('invalid', 413);
      }
      payload.set(value, length);
      length += value.length;
    }
    const response = await env.ROOMS.getByName(route[1]).fetch(url, {
      method: 'POST', body: payload.subarray(0, length)
    });
    response.headers.forEach((value, key) => cors.set(key, value));
    return new Response(response.body, {status: response.status, headers: cors});
  }
};

export class GameRoom extends DurableObject {
  async fetch(request) {
    let body;
    try { body = await request.json(); } catch { return fail('invalid', 400); }
    if (!body || typeof body.token !== 'string' || !/^[a-f0-9]{48}$/.test(body.token)) return fail('invalid', 400);
    const action = new URL(request.url).pathname.split('/').at(-1);
    // Serialize room changes, including simultaneous join or move requests.
    return this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get('room');
      const room = stored && stored.expires > Date.now() ? stored : null;
      if (room) {
        const seat = room.seats.findIndex(player => player.token === body.token);
        if (action === 'state') return seat < 0 ? fail('seat', 403) : view(room, seat);
        if (action === 'create') return seat === 0 ? view(room, seat) : fail('occupied', 409);
        if (action === 'join') {
          if (seat >= 0) return view(room, seat);
          if (room.seats.length === 2) return fail('full', 409);
          room.seats.push({token: body.token, name: nickname(body.name, '玩家二')});
          room.version++;
          await this.save(room);
          return view(room, 1);
        }
        if (seat < 0) return fail('seat', 403);
        if (room.seats.length < 2) return fail('waiting', 409);
        if (body.version !== room.version) return fail('stale', 409);
        const next = playMove(room.state, seat === 0 ? sheep : tiger, body.from, body.to);
        if (!next) return fail('move', 422);
        room.state = next;
        room.version++;
        await this.save(room);
        return view(room, seat);
      }
      if (action !== 'create') return fail('missing', 404);
      const fresh = {state: newGame(), seats: [{token: body.token, name: nickname(body.name, '玩家一')}], version: 0};
      await this.save(fresh);
      return view(fresh, 0);
    });
  }

  async save(room) {
    room.expires = Date.now() + ttl;
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.setAlarm(room.expires);
  }

  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get('room');
      if (!room || room.expires <= Date.now()) await this.ctx.storage.deleteAll();
      else await this.ctx.storage.setAlarm(room.expires);
    });
  }
}

function nickname(value, fallback) {
  return typeof value === 'string' ? Array.from(value.trim()).slice(0, 20).join('') || fallback : fallback;
}
