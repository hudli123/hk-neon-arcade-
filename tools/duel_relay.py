#!/usr/bin/env python3
# 名人亂鬥網上對戰 relay：兩個 client 用 4 位房間碼 pair，之後逐字轉發。
# /ws?r=<code>&role=host|guest  —— host 開房，guest 入房；其餘訊息原樣送畀對方。
import asyncio
import json
import time
import urllib.parse

import websockets

HOST, PORT = '127.0.0.1', 8765
MAX_ROOMS = 200
MAX_MSG = 8192          # bytes per message
RATE = 80               # messages per second per connection
IDLE = 600              # seconds without a message → close

rooms = {}              # code -> {'host': ws|None, 'guest': ws|None}
rooms_lock = asyncio.Lock()


def live(ws):
    if ws is None:
        return False
    if getattr(ws, 'closed', False):          # legacy impl
        return False
    st = getattr(ws, 'state', None)           # new impl: 1 == OPEN
    if st is not None and int(st) != 1:
        return False
    return True


async def tell(ws, obj):
    try:
        await ws.send(json.dumps(obj))
    except Exception:
        pass


def conn_path(ws):
    req = getattr(ws, 'request', None)         # websockets >= 13
    if req is not None and getattr(req, 'path', None):
        return req.path
    return getattr(ws, 'path', '') or ''       # websockets <= 12 legacy


async def handler(ws, _path=None):   # websockets >=13: handler(ws)；<=12: handler(ws, path)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(conn_path(ws)).query)
    code = (q.get('r') or [''])[0]
    role = (q.get('role') or [''])[0]
    room = None
    is_host = role == 'host'
    peer = None
    last_msg = time.time()
    window_t = time.time()
    window_n = 0
    try:
        if not code or role not in ('host', 'guest'):
            await tell(ws, {'t': 'err', 'e': 'bad'})
            return
        async with rooms_lock:
            if is_host:
                room = rooms.setdefault(code, {'host': None, 'guest': None})
                if live(room['host']):
                    room = None
                    await tell(ws, {'t': 'err', 'e': 'taken'})
                    return
                if len(rooms) > MAX_ROOMS:
                    rooms.pop(code, None)
                    room = None
                    await tell(ws, {'t': 'err', 'e': 'busy'})
                    return
                room['host'] = ws
                peer = room['guest']
            else:
                room = rooms.get(code)
                if not room or not live(room['host']):
                    room = None
                    await tell(ws, {'t': 'err', 'e': 'noroom'})
                    return
                if live(room['guest']):
                    room = None
                    await tell(ws, {'t': 'err', 'e': 'full'})
                    return
                room['guest'] = ws
                peer = room['host']
        if live(peer):
            await tell(ws, {'t': 'peer', 'on': 1})
            await tell(peer, {'t': 'peer', 'on': 1})
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
            except asyncio.TimeoutError:
                if time.time() - last_msg > IDLE:
                    break
                continue
            except websockets.ConnectionClosed:
                break
            last_msg = time.time()
            if not isinstance(raw, str) or len(raw.encode('utf-8', 'ignore')) > MAX_MSG:
                continue
            now = time.time()
            if now - window_t >= 1:
                window_t, window_n = now, 0
            window_n += 1
            if window_n > RATE:
                continue
            p = room['guest'] if is_host else room['host']
            if live(p):
                try:
                    await p.send(raw)
                except Exception:
                    pass
    finally:
        if room is not None:
            async with rooms_lock:
                me = room['host'] if is_host else room['guest']
                if me is ws:
                    if is_host:
                        other = room['guest']
                        rooms.pop(code, None)
                    else:
                        other = room['host']
                        room['guest'] = None
                    if live(other):
                        await tell(other, {'t': 'peer', 'on': 0})


async def sweeper():
    while True:
        await asyncio.sleep(60)
        async with rooms_lock:
            dead = [c for c, r in rooms.items() if not live(r['host']) and not live(r['guest'])]
            for c in dead:
                rooms.pop(c, None)


async def main():
    async with websockets.serve(handler, HOST, PORT, ping_interval=20, ping_timeout=20,
                                max_queue=64, max_size=MAX_MSG * 2):
        asyncio.create_task(sweeper())
        print(f'duel-relay listening on {HOST}:{PORT}', flush=True)
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
