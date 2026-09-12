#!/usr/bin/env python3
"""DEAD GATE party server: static files + WebSocket room relay (stdlib only).

Run:   python server.py [port]        (default 8901, serves this folder)
Play:  open http://<host-ip>:8901/  -> MULTIPLAYER -> CREATE, or JOIN + code.
On Render (or any host that assigns the port): the $PORT env var wins.

One client per device, up to 4 players per room (4-letter code). The first
player in a room is the host and simulates the world with the in-browser
engine; this server only relays messages between room members and serves
the game files. If the host leaves, the room ends.
"""
import base64
import hashlib
import json
import mimetypes
import os
import random
import socket
import struct
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
# Render-style hosts assign the port via $PORT; CLI arg wins only if set.
PORT = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8901))
ROOM_SIZE = 4

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'

_lock = threading.Lock()
_rooms = {}          # code -> {'members': {conn: member-dict}}
_next_id = [0]


def log(*a):
    print('[%s]' % time.strftime('%H:%M:%S'), *a, flush=True)


# ---------------- HTTP ----------------
def _send_head(conn, status, ctype, length):
    conn.sendall(('HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\n'
                   'Cache-Control: no-cache\r\nConnection: close\r\n\r\n'
                   % (status, ctype, length)).encode('latin-1'))


def serve_file(conn, path):
    safe = os.path.normpath(path.split('?')[0]).lstrip('/\\')
    if safe in ('', '.'):
        safe = 'index.html'
    full = os.path.join(ROOT, safe)
    if not full.startswith(ROOT) or not os.path.isfile(full):
        body = b'not found'
        _send_head(conn, '404 Not Found', 'text/plain', len(body))
        conn.sendall(body)
        return
    ctype, _ = mimetypes.guess_type(full)
    with open(full, 'rb') as f:
        data = f.read()
    _send_head(conn, '200 OK', ctype or 'application/octet-stream', len(data))
    conn.sendall(data)


# ---------------- WebSocket framing ----------------
def ws_send(conn, text):
    data = text.encode('utf-8')
    n = len(data)
    if n < 126:
        conn.sendall(struct.pack('!BB', 0x81, n) + data)
    elif n < 65536:
        conn.sendall(struct.pack('!BBH', 0x81, 126, n) + data)
    else:
        conn.sendall(struct.pack('!BBQ', 0x81, 127, n) + data)


class WSReader(object):
    """Blocking text-message reader (reassembles fragments, answers pings)."""

    def __init__(self, conn):
        self.c = conn
        self.buf = b''
        self.frag = b''
        self.frag_op = 0

    def _fill(self, n):
        while len(self.buf) < n:
            chunk = self.c.recv(65536)
            if not chunk:
                raise ConnectionError('closed')
            self.buf += chunk

    def _pong(self, payload):
        try:
            if len(payload) < 126:
                self.c.sendall(struct.pack('!BB', 0x8A, len(payload)) + payload)
        except OSError:
            pass

    def next_msg(self):
        while True:
            self._fill(2)
            b1, b2 = self.buf[0], self.buf[1]
            fin = b1 >> 7
            op = b1 & 15
            masked = b2 >> 7
            ln = b2 & 127
            idx = 2
            if ln == 126:
                self._fill(4)
                ln = struct.unpack('!H', self.buf[2:4])[0]
                idx = 4
            elif ln == 127:
                self._fill(10)
                ln = struct.unpack('!Q', self.buf[2:10])[0]
                idx = 10
            if masked:
                self._fill(idx + 4)
                mask = self.buf[idx:idx + 4]
                idx += 4
            self._fill(idx + ln)
            raw = self.buf[idx:idx + ln]
            self.buf = self.buf[idx + ln:]
            if masked:
                raw = bytes(x ^ mask[i % 4] for i, x in enumerate(raw))
            if op == 0x9:
                self._pong(raw)
                continue
            if op == 0xA:
                continue
            if op == 0x8:
                raise ConnectionError('closed by peer')
            if op == 0x0:
                self.frag += raw
                if fin:
                    msg, self.frag = self.frag, b''
                    return msg
                continue
            if op in (0x1, 0x2):
                if fin:
                    return raw
                self.frag, self.frag_op = raw, op
                continue
            # ignore other opcodes


# ---------------- rooms ----------------
def make_code():
    with _lock:
        while True:
            c = ''.join(random.choice(CODE_LETTERS) for _ in range(4))
            if c not in _rooms:
                return c


def roster_json(room):
    with _lock:
        mem = list(_rooms.get(room, {}).get('members', {}).values())
    mem.sort(key=lambda m: m['slot'])
    return json.dumps({'t': 'roster', 'room': room,
                       'players': [{'id': m['id'], 'slot': m['slot'],
                                    'name': m['name']} for m in mem]})


def send_roster(room):
    if not room:
        return
    msg = roster_json(room)
    with _lock:
        targets = list(_rooms.get(room, {}).get('members', {}).keys())
    for c in targets:
        try:
            ws_send(c, msg)
        except OSError:
            pass


def broadcast(room, text, skip=None):
    with _lock:
        targets = [c for c in _rooms.get(room, {}).get('members', {}) if c is not skip]
    for c in targets:
        try:
            ws_send(c, text)
        except OSError:
            pass


def leave_room(conn, state):
    room = state.get('room')
    member = state.get('member')
    if not room or not member:
        return
    with _lock:
        rm = _rooms.get(room)
        if not rm or conn not in rm['members']:
            return
        del rm['members'][conn]
        rest = list(rm['members'])
        if not rest:
            del _rooms[room]
            log('room', room, 'closed (empty)')
            return
        if member.get('host'):
            for c in rest:
                try:
                    ws_send(c, json.dumps({'t': 'end', 'why': 'host left'}))
                except OSError:
                    pass
                try:
                    c.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            del _rooms[room]
            log('room', room, 'closed (host left)')
            return
    log('room', room, member['name'], 'left')
    send_roster(room)


def room_loop(conn, reader, state):
    with _lock:
        _next_id[0] += 1
        myid = _next_id[0]
    while True:
        raw = reader.next_msg()
        try:
            msg = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeError):
            continue
        t = msg.get('t')
        if t == 'join':
            room = state.get('room')
            if room:
                continue  # one room per connection
            name = str(msg.get('name', 'Player'))[:16] or 'Player'
            if msg.get('create'):
                code = make_code()
                with _lock:
                    _rooms[code] = {'members': {}}
            else:
                code = str(msg.get('room', '')).upper().strip()
            with _lock:
                rm = _rooms.get(code)
                if rm is None:
                    ws_send(conn, json.dumps({'t': 'error', 'why': 'no room ' + code}))
                    continue
                used = {m['slot'] for m in rm['members'].values()}
                slot = next((s for s in range(ROOM_SIZE) if s not in used), None)
                if slot is None:
                    ws_send(conn, json.dumps({'t': 'error', 'why': 'room full'}))
                    continue
                member = {'id': myid, 'slot': slot, 'name': name,
                          'host': len(rm['members']) == 0}
                rm['members'][conn] = member
                state['room'] = code
                state['member'] = member
            log('room', code, name, 'joined as slot', slot,
                '(host)' if member['host'] else '')
            ws_send(conn, json.dumps({'t': 'welcome', 'id': myid, 'slot': slot,
                                      'room': code, 'host': member['host']}))
            send_roster(code)
        elif t == 'start':
            room, member = state.get('room'), state.get('member')
            if room and member and member.get('host'):
                log('room', room, 'game started')
                broadcast(room, json.dumps({'t': 'start', 'map': msg.get('map', 'graveyard')}))
        elif state.get('room') and state.get('member'):
            msg['from'] = state['member']['slot']
            broadcast(state['room'], json.dumps(msg), skip=conn)
        # else: not in a room yet — ignore


def handle(conn):
    state = {}
    try:
        head = b''
        while b'\r\n\r\n' not in head:
            chunk = conn.recv(4096)
            if not chunk:
                conn.close()
                return
            head += chunk
            if len(head) > 65536:
                conn.close()
                return
        lines = head.decode('latin-1').split('\r\n')
        parts = lines[0].split(' ')
        method, path = (parts + ['', ''])[:2]
        hdr = {}
        for ln in lines[1:]:
            if ':' in ln:
                k, v = ln.split(':', 1)
                hdr[k.strip().lower()] = v.strip()
        if (method == 'GET' and path == '/ws'
                and hdr.get('upgrade', '').lower() == 'websocket'
                and 'upgrade' in hdr.get('connection', '').lower()):
            key = hdr.get('sec-websocket-key', '')
            acc = base64.b64encode(hashlib.sha1((key + GUID).encode()).digest()).decode()
            conn.sendall(('HTTP/1.1 101 Switching Protocols\r\n'
                          'Upgrade: websocket\r\nConnection: Upgrade\r\n'
                          'Sec-WebSocket-Accept: %s\r\n\r\n' % acc).encode('latin-1'))
            log('ws connected')
            room_loop(conn, WSReader(conn), state)
        elif method == 'GET':
            serve_file(conn, path)
            conn.close()
        else:
            conn.close()
    except (ConnectionError, OSError, ValueError):
        pass
    finally:
        leave_room(conn, state)
        try:
            conn.close()
        except OSError:
            pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('0.0.0.0', PORT))
    srv.listen(32)
    srv.settimeout(1.0)
    log('serving %s on port %d (open http://<this-pc-ip>:%d/)' % (ROOT, PORT, PORT))
    try:
        while True:
            try:
                conn, _ = srv.accept()
            except socket.timeout:
                continue
            th = threading.Thread(target=handle, args=(conn,))
            th.daemon = True
            th.start()
    except KeyboardInterrupt:
        pass
    log('bye')


if __name__ == '__main__':
    main()
