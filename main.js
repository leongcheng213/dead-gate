/* DEAD GATE — classic script (uses global THREE from three.min.js, so the game
   works by double-clicking index.html with no local server needed). */
(function () {
'use strict';
if (!window.THREE) {
  // 3D engine failed to load — leave a working button handler that explains why.
  window.startGame = function () {
    var el = document.getElementById('load-status');
    if (el) { el.style.display = 'block'; el.textContent = '⚠ 3D engine (three.min.js) failed to load. Check your internet connection and reload the page.'; }
  };
  window.restartToMenu = function () {};
  window.retrySameMap = function () {};
  return;
}

// ============ CONFIG ============
const ARENA_HALF = 28;

// ============ MULTIPLAYER (host-simulated co-op, server only relays) ============
// Solo play is untouched: with no room, players[] holds just you and every
// simHost() branch behaves exactly like the original single-player code.
const PCOLORS = [0x2266cc, 0xcc7722, 0x8833cc, 0x22cccc];
// Bump on every gameplay-affecting change so co-op partners can confirm
// matching builds (shown under the menu tabs + lobby status).
const BUILD = 'pred-2';
const NET = {
  ws: null, id: -1, slot: 0, host: false, room: null, name: 'Hunter',
  peers: [], seq: 0, snapTimer: 0, inTimer: 0, mapPick: 'graveyard', diffPick: 0,
  pendingWsel: -1, buyAs: null,
};
let players = [];
let ZID = 0;
function isNet() { return !!(NET.ws && NET.room); }
function isHost() { return isNet() && NET.host; }
function simHost() { return !isNet() || NET.host; }
function alivePlayers() { return players.filter((p) => p && p.alive && p.group); }
function makeNameSprite(name) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const cx = cv.getContext('2d');
  cx.font = 'bold 36px sans-serif'; cx.textAlign = 'center';
  cx.fillStyle = 'rgba(0,0,0,0.45)'; cx.fillRect(0, 0, 256, 64);
  cx.fillStyle = '#fff'; cx.fillText(String(name).slice(0, 12), 128, 44);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.scale.set(2.4, 0.6, 1);
  return sp;
}
function makePlayer(slot, name) {
  const color = PCOLORS[slot % PCOLORS.length];
  const g = new THREE.Group();
  // boots + legs
  vx(g, std(0x1a1a22), 0.24, 0.3, 0.3, -0.18, 0.15, 0);
  vx(g, std(0x1a1a22), 0.24, 0.3, 0.3, 0.18, 0.15, 0);
  vx(g, std(0x2a2f3d), 0.26, 0.45, 0.32, -0.18, 0.5, 0);
  vx(g, std(0x2a2f3d), 0.26, 0.45, 0.32, 0.18, 0.5, 0);
  // jacket torso + team chest plate + belt + buckle
  vx(g, std(0x2e2e3d), 0.82, 0.7, 0.52, 0, 1.05, 0, true);
  vx(g, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, emissive: color, emissiveIntensity: 0.25 }),
    0.55, 0.45, 0.1, 0, 1.1, 0.27);
  vx(g, std(0x101016), 0.84, 0.12, 0.54, 0, 0.68, 0);
  vx(g, glo(0xffdd66), 0.14, 0.1, 0.04, 0, 0.68, 0.28);
  // arms: pads, sleeves, gloves, hands
  const padMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  vx(g, padMat, 0.26, 0.13, 0.32, -0.56, 1.42, 0);
  vx(g, padMat, 0.26, 0.13, 0.32, 0.56, 1.42, 0);
  vx(g, std(0x1e1e28), 0.2, 0.45, 0.24, -0.55, 1.15, 0.05);
  vx(g, std(0x1e1e28), 0.2, 0.45, 0.24, 0.55, 1.15, 0.05);
  vx(g, std(0x14141c), 0.2, 0.2, 0.24, -0.55, 0.88, 0.1);
  vx(g, std(0x14141c), 0.2, 0.2, 0.24, 0.55, 0.88, 0.1);
  vx(g, std(0xffcc99), 0.18, 0.16, 0.2, -0.55, 0.72, 0.12);
  vx(g, std(0xffcc99), 0.18, 0.16, 0.2, 0.55, 0.72, 0.12);
  // pixel head: skin block + white eyes + helmet dome + brim
  vx(g, std(0xffcc99), 0.46, 0.42, 0.44, 0, 1.78, 0, true);
  vx(g, glo(0xffffff), 0.09, 0.11, 0.03, -0.11, 1.82, 0.23);
  vx(g, glo(0xffffff), 0.09, 0.11, 0.03, 0.11, 1.82, 0.23);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x333844, roughness: 0.5, metalness: 0.4 }));
  helmet.position.y = 1.86;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6, metalness: 0.3 }));
  brim.position.y = 1.86;
  g.add(helmet, brim);
  const gunMesh = buildGunMesh(0);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffee88 }));
  flash.position.set(MUZZLE[0][0], MUZZLE[0][1], MUZZLE[0][2]); flash.visible = false;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  // dark cloak + tattered strips
  const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x23232f, roughness: 0.95 }));
  cloak.position.set(0, 1.0, -0.36); cloak.castShadow = true;
  const stripM = new THREE.MeshStandardMaterial({ color: 0x1e1420, roughness: 1 });
  const st1 = new THREE.Mesh(unitBox, stripM);
  st1.scale.set(0.14, 0.6, 0.04); st1.position.set(-0.24, 0.5, -0.42); st1.rotation.x = 0.12;
  const st2 = st1.clone(); st2.position.x = 0.2; st2.rotation.x = -0.08;
  const tag = makeNameSprite(name);
  tag.position.y = 2.55; tag.visible = false;
  g.add(gunMesh, flash, ring, cloak, st1, st2, tag);
  g.position.set((slot - 1.5) * 3, 0, 10);
  scene.add(g);
  return { slot, name, color, group: g, gunMesh, flash, tag,
    hp: 100, maxHp: 100, speed: 9, radius: 0.7,
    aim: new THREE.Vector3(0, 0, -1), weaponIndex: 0,
    alive: true, ghost: false, kit: 0, money: 0,
    ars: null, charging: false, chargeT: 0,
    corpse: null, corpseArrow: null, corpseSeed: 0, corpsePos: null, _orig: null,
    cool: 0, hurtCd: 0, flashT: 0,
    net: { keys: {}, ax: 0, az: -1, fire: false, wsel: -1 } };
}
function clearPlayers() {
  for (const p of players) {
    if (!p) continue;
    try { if (p.corpse) scene.remove(p.corpse); } catch (e) {}
    p.corpse = null; p.corpseArrow = null; p.corpsePos = null;
    try { scene.remove(p.group); } catch (e) {}
  }
  players = [];
  player = null;
}

// ============ NET LAYER (host-authoritative, server only relays) ============
// Protocol (see server.py):
//   out: {t:'join', create?, room?, name}  ->  in: {t:'welcome',...} + {t:'roster',...}
//   host out: {t:'start', map}  (server rebroadcasts to all, including host)
//   relayed (server adds .from=slot, skips sender):
//     guest->host: {t:'in', keys, ax, az, fire, wsel}
//     guest->host: {t:'buy', what, a, b}
//     host->guests: {t:'snap', ...}
//     host->guests: {t:'ev', kind, ...}
//     host->guests: {t:'map', map}
function netSay(t) {
  try {
    if (window.netStatus) { window.netStatus(t); return; }
    const el = document.getElementById('net-status');
    if (el) el.textContent = t || '';
  } catch (e) {}
}
function netSend(o) {
  try {
    if (NET.ws && NET.ws.readyState === 1) NET.ws.send(JSON.stringify(o));
  } catch (e) {}
}
function netEv(o) {
  if (!isHost()) return;
  try {
    const m = { t: 'ev' };
    for (const k in o) m[k] = o[k];
    netSend(m);
  } catch (e) {}
}
function serverToWsUrl(srv) {
  srv = (srv || '').trim();
  if (!srv) {
    try {
      if (/^https?:/.test(location.protocol) && location.host) srv = location.host;
      else return null;
    } catch (e) { return null; }
  }
  srv = srv.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
  if (/\/ws$/i.test(srv)) srv = srv.replace(/\/ws$/i, '');
  let proto = 'ws://';
  try { if (/^https:/.test(location.protocol)) proto = 'wss://'; } catch (e) {}
  return proto + srv + '/ws';
}
function updateLobbyUI() {
  try {
    const inRoom = !!(NET.room);
    const setup = document.getElementById('net-setup');
    const lobby = document.getElementById('net-lobby');
    if (setup) setup.style.display = inRoom ? 'none' : '';
    if (lobby) lobby.style.display = inRoom ? 'block' : 'none';
    const rc = document.getElementById('net-roomcode');
    if (rc) rc.textContent = NET.room || '----';
    const hb = document.getElementById('net-hostbadge');
    if (hb) hb.textContent = inRoom ? (NET.host ? '👑 HOST' : '') : '';
    const ros = document.getElementById('net-roster');
    if (ros) {
      ros.innerHTML = '';
      const list = (NET.peers || []).slice().sort((a, b) => a.slot - b.slot);
      for (const m of list) {
        const li = document.createElement('li');
        const you = (m.slot === NET.slot) ? ' ← you' : '';
        const crown = (m.slot === 0) ? '👑 ' : '';
        li.textContent = crown + m.name + ' [P' + (m.slot + 1) + ']' + you;
        ros.appendChild(li);
      }
    }
    document.querySelectorAll('#net-maprow button').forEach((b) => {
      const mk = b.getAttribute('data-map');
      b.classList.toggle('sel', mk === NET.mapPick);
    });
    // Map + difficulty choice is host-only: guests never see the rows.
    try {
      const mr = document.getElementById('net-maprow');
      if (mr) mr.style.display = (inRoom && !NET.host) ? 'none' : '';
      const dr = document.getElementById('net-diffrow');
      if (dr) {
        dr.style.display = (inRoom && !NET.host) ? 'none' : '';
        dr.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('sel', +b.getAttribute('data-diff') === (NET.diffPick || 0));
        });
      }
    } catch (e) {}
    const st = document.getElementById('net-start');
    if (st) {
      st.disabled = inRoom && !NET.host;
      st.textContent = !inRoom ? 'START HUNT' : (NET.host ? 'START HUNT' : 'WAITING FOR HOST…');
    }
  } catch (e) {}
}
function ensurePlayersForPeers() {
  try {
    if (!scene) return;
    for (const m of (NET.peers || [])) {
      if (!players[m.slot]) {
        const np = makePlayer(m.slot, m.name);
        np.ars = newArsenal();
        players[m.slot] = np;
      }
      else if (players[m.slot].tag) {
        // refresh name sprite if changed
        try {
          const old = players[m.slot].tag;
          players[m.slot].group.remove(old);
          players[m.slot].tag = makeNameSprite(m.name);
          players[m.slot].tag.position.y = 2.55;
          players[m.slot].tag.visible = true;
          players[m.slot].group.add(players[m.slot].tag);
          players[m.slot].name = m.name;
        } catch (e) {}
      }
    }
    // drop players who left (but keep local slot structure sparse)
    const alive = {};
    for (const m of (NET.peers || [])) alive[m.slot] = true;
    for (let s = 0; s < 4; s++) {
      if (players[s] && !alive[s]) {
        try { scene.remove(players[s].group); } catch (e) {}
        players[s] = null;
        if (player && player.slot === s) player = players[NET.slot] || null;
      }
    }
    if (!player) player = players[NET.slot] || null;
    for (const p of players) if (p && p.tag) p.tag.visible = true;
  } catch (e) {}
}
function netConnect(create, code) {
  try { if (NET.ws) { try { NET.ws.close(); } catch (e) {} } } catch (e) {}
  NET.ws = null; NET.room = null; NET.host = false; NET.peers = [];
  const nameEl = document.getElementById('net-name');
  const srvEl = document.getElementById('net-server');
  const codeEl = document.getElementById('net-code');
  NET.name = ((nameEl && nameEl.value) || 'Hunter').slice(0, 12) || 'Hunter';
  const srv = (srvEl && srvEl.value) || '';
  const url = serverToWsUrl(srv);
  if (!url) { netSay('Enter HOST:PORT (run python server.py 8901 on the host PC)'); return; }
  netSay('Connecting…');
  let ws;
  try { ws = new WebSocket(url); } catch (e) { netSay('Bad server address'); return; }
  NET.ws = ws;
  ws.onopen = () => {
    const join = { t: 'join', name: NET.name };
    if (create) join.create = true;
    else join.room = ((code || (codeEl && codeEl.value) || '').toUpperCase().trim());
    if (!create && !join.room) { netSay('Enter a 4-letter room code to join'); try { ws.close(); } catch (e) {} return; }
    try { ws.send(JSON.stringify(join)); } catch (e) {}
  };
  ws.onmessage = (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    handleNetMsg(msg);
  };
  ws.onclose = () => {
    const wasRoom = !!NET.room;
    const wasPlaying = (typeof G !== 'undefined') && (G.state === 'playing' || G.state === 'intermission');
    NET.ws = null; NET.room = null; NET.host = false;
    try {
      const veil = document.getElementById('host-shop-veil');
      if (veil) veil.style.display = 'none';
    } catch (e) {}
    updateLobbyUI();
    if (wasRoom) netSay('Disconnected');
    if (wasPlaying && wasRoom) {
      try { window.restartToMenu(); } catch (e) {}
    }
  };
  ws.onerror = () => { netSay('Cannot reach server — check HOST:PORT and server.py'); };
  updateLobbyUI();
}
window.netCreate = function () { NET.mapPick = NET.mapPick || 'graveyard'; netConnect(true); };
window.netJoin = function () { netConnect(false); };
window.netLeave = function () {
  try { if (NET.ws) { try { NET.ws.close(); } catch (e) {} } } catch (e) {}
  NET.ws = null; NET.room = null; NET.host = false; NET.peers = [];
  NET.snapTimer = 0; NET.inTimer = 0; NET.pendingWsel = -1;
  try {
    const veil = document.getElementById('host-shop-veil');
    if (veil) veil.style.display = 'none';
  } catch (e) {}
  updateLobbyUI();
  netSay('');
};
window.netStart = function () {
  if (!isNet()) { netSay('Create or join a room first'); return; }
  if (!isHost()) { netSay('Only the host can start'); return; }
  const map = NET.mapPick || 'graveyard';
  netSend({ t: 'diff', diff: NET.diffPick || 0 }); // order-preserved: guests set it before start
  netSend({ t: 'start', map });
  // Host starts immediately; the echoed broadcast is ignored via debounce.
  // Guests start when the broadcast arrives.
  try { window.startGame(map, true); } catch (e) {}
};
window.netMap = function (map) {
  NET.mapPick = map || 'graveyard';
  updateLobbyUI();
  if (isNet() && isHost()) netSend({ t: 'map', map: NET.mapPick });
  else if (isNet() && !isHost()) netSay('Only the host picks the map');
};
window.netDiff = function (d) {
  NET.diffPick = Math.max(0, Math.min(2, d | 0));
  updateLobbyUI();
  if (isNet() && isHost()) netSend({ t: 'diff', diff: NET.diffPick });
  else if (isNet() && !isHost()) netSay('Only the host picks difficulty');
};
function handleNetMsg(msg) {
  if (!msg || typeof msg.t !== 'string') return;
  const t = msg.t;
  if (t === 'welcome') {
    NET.id = msg.id; NET.slot = msg.slot || 0; NET.room = msg.room; NET.host = !!msg.host;
    netSay('Joined room ' + NET.room + (NET.host ? ' as host' : ''));
    updateLobbyUI();
    return;
  }
  if (t === 'roster') {
    NET.peers = msg.players || [];
    if (NET.room && msg.room) NET.room = msg.room;
    updateLobbyUI();
    // If a run is already going, add late joiners as spectators-in-waiting.
    try {
      if (typeof G !== 'undefined' && (G.state === 'playing' || G.state === 'intermission')) ensurePlayersForPeers();
    } catch (e) {}
    return;
  }
  if (t === 'start') {
    const map = msg.map || NET.mapPick || 'graveyard';
    NET.mapPick = map;
    updateLobbyUI();
    // Ignore the host's own echo (host already started synchronously).
    try {
      const now = Date.now();
      if (isHost() && typeof G !== 'undefined' && (G.state === 'playing' || G.state === 'intermission')
        && G.mapKey === map && window.__lastStart && now - window.__lastStart < 4000) return;
    } catch (e) {}
    try { window.startGame(map, true); } catch (e) {}
    return;
  }
  if (t === 'end') {
    netSay(msg.why || 'Room ended');
    try { showMessage(msg.why || 'Host left', 3000); } catch (e) {}
    try {
      if (typeof G !== 'undefined' && (G.state === 'playing' || G.state === 'intermission')) window.restartToMenu();
      else window.netLeave();
    } catch (e) {}
    return;
  }
  if (t === 'error') { netSay(msg.why || 'Join failed'); return; }
  if (t === 'map') {
    if (msg.map) { NET.mapPick = msg.map; updateLobbyUI(); }
    return;
  }
  if (t === 'diff') {
    if (msg.diff !== undefined) { NET.diffPick = Math.max(0, Math.min(2, msg.diff | 0)); updateLobbyUI(); }
    return;
  }
  const from = msg.from;
  if (t === 'in') {
    if (!isHost()) return;
    const p = players[from];
    if (!p) return;
    p.net = p.net || {};
    p.net.keys = msg.keys || {};
    p.net.ax = (msg.ax === undefined) ? 0 : msg.ax;
    p.net.az = (msg.az === undefined) ? -1 : msg.az;
    p.net.fire = !!msg.fire;
    if (msg.wsel !== undefined) p.net.wsel = msg.wsel;
    p.net._t = performance.now();
    return;
  }
  if (t === 'buy') {
    if (!isHost()) return;
    handleBuyRequest(from, msg);
    return;
  }
  if (t === 'revive') {
    if (!isHost()) return;
    try { tryReviveForSlot(from); } catch (e) {}
    return;
  }
  if (t === 'snap') {
    if (isHost()) return; // host never applies snapshots
    applySnapshot(msg);
    return;
  }
  if (t === 'ev') {
    if (isHost()) return; // host sent it
    handleNetEv(msg);
    return;
  }
}
function handleBuyRequest(slot, m) {
  try {
    if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
    const what = m.what;
    // Guest purchases spend the guest's own wallet (see buyerSlot).
    NET.buyAs = slot;
    try {
      if (what === 'weapon') { try { window.buyWeapon(m.a); } catch (e) {} }
      else if (what === 'ammo') { try { window.buyAmmo(m.a); } catch (e) {} }
      else if (what === 'upgrade') { try { window.buyUpgrade(m.a); } catch (e) {} }
      else if (what === 'aspect') { try { window.buyUpgrade(m.a); } catch (e) {} }
      else if (what === 'hp') { try { window.buyHp(); } catch (e) {} }
      else if (what === 'def') { try { window.buyDef(); } catch (e) {} }
      else if (what === 'spd') { try { window.buySpd(); } catch (e) {} }
      else if (what === 'medkit') { try { buyMedkitFor(slot); } catch (e) {} }
      else if (what === 'kit') { try { buyKitFor(slot); } catch (e) {} }
      else if (what === 'life') { try { window.buyLife(); } catch (e) {} }
    } finally {
      NET.buyAs = null;
    }
    try { updateHUD(); if (G.shopOpen) renderShop(); } catch (e) {}
  } catch (e) {}
}
function buildSnapshot() {
  const g = {
    round: G.round, score: G.score, kills: G.kills, money: moneyOf(NET.slot), lives: G.lives,
    state: G.state, boss: !!G.isBossRound, hpUps: G.hpUps, defUps: G.defUps, spdUps: G.spdUps,
    defense: G.defense, spawnLeft: (G.spawnQueue || 0) + zombies.length + ((G.bossQueue || []).length),
    diff: G.diff || 0,
  };
  const ps = [];
  for (const p of players) {
    if (!p || !p.group) continue;
    ps.push({
      slot: p.slot, x: +p.group.position.x.toFixed(2), z: +p.group.position.z.toFixed(2),
      ax: +(p.aim ? p.aim.x : 0).toFixed(3), az: +(p.aim ? p.aim.z : -1).toFixed(3),
      hp: Math.ceil(p.hp), maxHp: p.maxHp, alive: !!p.alive, wi: p.weaponIndex,
      mny: Math.round(p.money || 0), spd: +(+p.speed || 9).toFixed(2),
      gh: p.ghost ? 1 : 0, kit: p.kit || 0,
      cx: p.corpsePos ? +p.corpsePos.x.toFixed(2) : null,
      cz: p.corpsePos ? +p.corpsePos.z.toFixed(2) : null,
    });
  }
  const zs = [];
  const ZMAX = 40;
  for (let i = 0; i < zombies.length && zs.length < ZMAX; i++) {
    const z = zombies[i];
    if (!z || !z.group) continue;
    zs.push({
      id: z.id, boss: z.isBoss ? (z.bossKind || 0) : -1, type: z.type || 'normal',
      x: +z.group.position.x.toFixed(2), z: +z.group.position.z.toFixed(2),
      hp: Math.ceil(z.hp), maxHp: z.maxHp, inv: !!z.invisible,
    });
  }
  const ds = [];
  for (let i = 0; i < drops.length && ds.length < 24; i++) {
    const d = drops[i];
    if (!d || !d.mesh) continue;
    ds.push({ x: +d.mesh.position.x.toFixed(2), z: +d.mesh.position.z.toFixed(2), v: d.value || 1 });
  }
  const ms = [];
  for (let i = 0; i < mines.length && ms.length < 8; i++) {
    const m = mines[i];
    if (!m || !m.mesh) continue;
    ms.push({ x: +m.mesh.position.x.toFixed(2), z: +m.mesh.position.z.toFixed(2) });
  }
  const w = {
    un: WEAPONS.map((x) => x.unlocked ? 1 : 0),
    rev: WEAPONS.map((x) => x.revealed ? 1 : 0),
    ammo: WEAPONS.map((x) => (x.ammo === Infinity ? -1 : x.ammo)),
    up: WEAPONS.map((x) => (x.up || 0)),
  };
  // Per-hunter arsenals (co-op): unlocks, levels, ammo per slot.
  const pa = {};
  if (isNet()) {
    for (const p of players) {
      if (!p || !p.group || !p.ars) continue;
      pa[p.slot] = {
        un: p.ars.map((x) => x.unlocked ? 1 : 0),
        up: p.ars.map((x) => (x.up || 0)),
        am: p.ars.map((x) => (x.ammo === Infinity ? -1 : x.ammo)),
      };
    }
  }
  return { t: 'snap', seq: ++NET.seq, g, ps, zs, ds, ms, w, pa };
}
function guestCoinMesh(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x664400, roughness: 0.3, metalness: 0.7 }));
  m.position.set(x, 0.4, z);
  scene.add(m);
  return m;
}
function guestMineMesh(x, z) {
  const mg = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  dot.position.y = 0.14;
  mg.add(disc, dot);
  mg.position.set(x, 0.1, z);
  scene.add(mg);
  return { mesh: mg, dot };
}
function applySnapshot(s) {
  try {
    if (!s || !s.g) return;
    if (typeof G === 'undefined' || !scene) return;
    const wasShopOpen = !!G.shopOpen;
    G.round = s.g.round; G.score = s.g.score; G.kills = s.g.kills;
    if (s.g.diff !== undefined) G.diff = Math.max(0, Math.min(2, s.g.diff | 0));
    G.lives = s.g.lives; G.state = s.g.state; G.isBossRound = !!s.g.boss;
    G.hpUps = s.g.hpUps || 0; G.defUps = s.g.defUps || 0; G.spdUps = s.g.spdUps || 0;
    G.defense = s.g.defense || 0;
    // Team-wide reveals come from the global track; unlocks/levels/ammo
    // are personal (s.pa per slot) in co-op.
    try {
      if (s.w) {
        for (let i = 0; i < WEAPONS.length; i++) {
          const w = WEAPONS[i];
          if (s.w.rev && s.w.rev[i] !== undefined) w.revealed = !!s.w.rev[i];
          if (isNet()) continue; // personal arsenals below; never touch globals
          if (s.w.un && s.w.un[i] !== undefined) w.unlocked = !!s.w.un[i];
          if (s.w.ammo && s.w.ammo[i] !== undefined) w.ammo = (s.w.ammo[i] < 0 ? Infinity : s.w.ammo[i]);
          if (s.w.up && s.w.up[i] !== undefined) {
            const v = s.w.up[i];
            // tolerant: old 4-track snapshots sent an array — collapse to combined
            w.up = Math.min(UP_MAX, Array.isArray(v) ? (v[0] + v[1] + v[2] + v[3]) : (v || 0));
            try { refreshWeapon(w); } catch (e) {}
            // Keep current ammo inside the (possibly grown) mag.
            if (w.ammo !== Infinity && s.w.ammo && s.w.ammo[i] >= 0) w.ammo = s.w.ammo[i];
          }
        }
      }
      if (isNet() && s.pa) {
        for (const slotKey in s.pa) {
          const sl = +slotKey;
          const p = players[sl];
          const sd = s.pa[slotKey];
          if (!p || !sd) continue;
          if (!p.ars) p.ars = newArsenal();
          for (let i = 0; i < WEAPONS.length && i < p.ars.length; i++) {
            const e = p.ars[i];
            if (sd.un && sd.un[i] !== undefined) e.unlocked = !!sd.un[i];
            if (sd.up && sd.up[i] !== undefined) e.up = Math.min(UP_MAX, sd.up[i] || 0);
            if (sd.am && sd.am[i] !== undefined) e.ammo = (sd.am[i] < 0 ? Infinity : sd.am[i]);
            try { refreshWeapon(e); } catch (err) {}
          }
        }
      }
    } catch (e) {}
    // Players: add missing, update targets.
    try {
      const seen = {};
      for (const d of (s.ps || [])) {
        seen[d.slot] = true;
        let p = players[d.slot];
        if (!p) {
          let nm = 'Hunter';
          try {
            const peer = (NET.peers || []).find((q) => q.slot === d.slot);
            if (peer) nm = peer.name;
          } catch (e) {}
          p = makePlayer(d.slot, nm);
          p.ars = newArsenal();
          players[d.slot] = p;
          if (d.slot === NET.slot) player = p;
        }
        p._tx = d.x; p._tz = d.z;
        // Own hunter is predicted locally (see updateGuestVisuals): keep a
        // short snapshot history so we can extrapolate to the host's NOW.
        // Teleport-scale jumps (revive/rebirth/round-start) snap immediately.
        // Aim/rotation stay local too — the snapshot only echoes our own input.
        if (p === player && p.group) {
          const now = performance.now() / 1000;
          p._hist = p._hist || [];
          const last = p._hist[p._hist.length - 1];
          if (!last) {
            p.group.position.x = d.x; p.group.position.z = d.z;
            p._hist = [{ x: d.x, z: d.z, t: now }];
          } else {
            const jx = d.x - last.x, jz = d.z - last.z;
            if (jx * jx + jz * jz > 12.25) { // >3.5u between snaps: teleport
              p.group.position.x = d.x; p.group.position.z = d.z;
              p._hist = [{ x: d.x, z: d.z, t: now }];
            } else {
              p._hist.push({ x: d.x, z: d.z, t: now });
              if (p._hist.length > 3) p._hist.shift();
            }
          }
        } else {
          p.aim.set(d.ax || 0, 0, (d.az === undefined ? -1 : d.az));
          if (p.aim.lengthSq() > 0.04) p.group.rotation.y = Math.atan2(p.aim.x, p.aim.z);
        }
        p.hp = d.hp; p.maxHp = d.maxHp; p.alive = !!d.alive;
        p.money = d.mny || 0;
        p.kit = d.kit || 0;
        const ng = !!d.gh;
        if (ng !== !!p.ghost) {
          p.ghost = ng;
          try { setGhostAppearance(p, ng); } catch (e) {}
        }
        if (d.cx === null || d.cx === undefined || d.cz === null || d.cz === undefined) {
          try { removeCorpse(p); } catch (e) {}
          p.corpsePos = null;
        } else {
          p.corpsePos = { x: d.cx, z: d.cz };
          if (!p.corpse) {
            try {
              const c = makeCorpseMesh(new THREE.Vector3(d.cx, 0, d.cz));
              p.corpse = c.group; p.corpseArrow = c.arrow; p.corpseSeed = c.seed;
            } catch (e) {}
          } else {
            p.corpse.position.set(d.cx, 0, d.cz);
          }
        }
        if (typeof d.wi === 'number' && d.wi !== p.weaponIndex) {
          try { setPlayerWeapon(p, d.wi); } catch (e) { p.weaponIndex = d.wi; }
        }
        p.tag.visible = true;
      }
      // Hide players that left (host omits them).
      for (let sl = 0; sl < 4; sl++) {
        if (players[sl] && !seen[sl] && (NET.peers || []).length) {
          const still = (NET.peers || []).some((q) => q.slot === sl);
          if (!still) {
            try { removeCorpse(players[sl]); } catch (e) {}
            try { scene.remove(players[sl].group); } catch (e) {} players[sl] = null;
          }
        }
      }
      if (!player) player = players[NET.slot] || null;
      // Mirror the local wallet so shared-wallet reads show your own coins.
      try { G.money = moneyOf(NET.slot); } catch (e) {}
    } catch (e) {}
    // Zombies: reconcile by id.
    try {
      const byId = {};
      for (const z of zombies) byId[z.id] = z;
      const want = {};
      for (const d of (s.zs || [])) {
        want[d.id] = true;
        const cur = byId[d.id];
        if (cur && cur.group) {
          cur._tx = d.x; cur._tz = d.z;
          cur.hp = d.hp; cur.maxHp = d.maxHp || cur.maxHp;
          if (!!d.inv !== !!cur.invisible) {
            cur.invisible = !!d.inv;
            try { if (cur.bodyMesh) cur.bodyMesh.visible = !cur.invisible; } catch (e) {}
          }
        } else {
          // Create a matching visual, then pin id/hp/pos.
          const px = d.x, pz = d.z;
          try {
            if (d.boss >= 0) spawnBoss(d.boss);
            else spawnZombie(d.type || 'normal', { x: px, z: pz });
          } catch (e) { continue; }
          const nz = zombies[zombies.length - 1];
          if (!nz) continue;
          nz.id = d.id;
          nz.hp = d.hp; nz.maxHp = d.maxHp || nz.hp;
          nz._tx = px; nz._tz = pz;
          nz.group.position.x = px; nz.group.position.z = pz;
          if (d.inv) { nz.invisible = true; try { if (nz.bodyMesh) nz.bodyMesh.visible = false; } catch (e) {} }
        }
      }
      for (let i = zombies.length - 1; i >= 0; i--) {
        if (!want[zombies[i].id]) {
          try {
            burst(zombies[i].group.position.clone(), zombies[i].isBoss ? 0xff3333 : 0x55ff33);
            scene.remove(zombies[i].group);
          } catch (e) {}
          zombies.splice(i, 1);
        }
      }
    } catch (e) {}
    // Coins + mines (index-reconciled; static so this is stable).
    try {
      const dd = s.ds || [];
      while (drops.length > dd.length) { try { scene.remove(drops[drops.length - 1].mesh); } catch (e) {} drops.pop(); }
      for (let i = 0; i < dd.length; i++) {
        if (!drops[i]) drops.push({ mesh: guestCoinMesh(dd[i].x, dd[i].z), kind: 'coin', value: dd[i].v, life: 25, bob: Math.random() * 6 });
        else { drops[i].mesh.position.x = dd[i].x; drops[i].mesh.position.z = dd[i].z; drops[i].value = dd[i].v; drops[i].life = 25; }
      }
      const mm = s.ms || [];
      while (mines.length > mm.length) { try { scene.remove(mines[mines.length - 1].mesh); } catch (e) {} mines.pop(); }
      for (let i = 0; i < mm.length; i++) {
        if (!mines[i]) {
          const g2 = guestMineMesh(mm[i].x, mm[i].z);
          mines.push({ mesh: g2.mesh, dot: g2.dot, life: 40, blast: 4.5, damage: 120, wi: 9, seed: Math.random() * 10 });
        } else { mines[i].mesh.position.x = mm[i].x; mines[i].mesh.position.z = mm[i].z; }
      }
    } catch (e) {}
    try { updateHUD(); } catch (e) {}
    try {
      if (wasShopOpen || G.shopOpen) {
        const sm = document.getElementById('shop-money');
        if (sm) sm.textContent = `💰 $${viewMoney()}`;
        const now = performance.now();
        if (now - (G._shopRT || 0) > 1000) { G._shopRT = now; renderShop(); }
      }
    } catch (e) {}
  } catch (e) {}
}
function handleNetEv(e) {
  try {
    const kind = e.kind;
    if (kind === 'unlock') {
      try { sfx.unlock(); showBanner(`🔓 ${String(e.name || 'WEAPON').toUpperCase()} IN SHOP!`, 2200); showMessage(`${e.icon || '🔫'} ${e.name || ''} ready to buy — open the shop (\`)!`, 3000); updateWeaponHUD(); if (G.shopOpen) renderShop(); } catch (err) {}
    } else if (kind === 'round') {
      try {
        G.round = e.n || G.round; G.isBossRound = !!e.boss;
        if (e.boss) { showBanner(`⚠ BOSS — ROUND ${e.n} ⚠`, 2600); showMessage(`☠ ${e.names || 'boss'} from the GATE…`, 3000); }
        else { showBanner(`ROUND ${e.n}`, 2200); showMessage(`☠ zombies incoming from the GATE!`, 2600); }
        sfx.round(); updateHUD();
      } catch (err) {}
    } else if (kind === 'shopveil') {
      try {
        const veil = document.getElementById('host-shop-veil');
        if (veil) veil.style.display = e.open ? 'block' : 'none';
      } catch (err) {}
    } else if (kind === 'msg') {
      try { showMessage(e.text || '', 2500); } catch (err) {}
    } else if (kind === 'clear') {
      try { showBanner(`ROUND ${e.n} CLEAR!`, 2000); showMessage(`+${e.bonus || 0} bonus • +$${e.cash || 0} cash • heal with E / shop (\`)!`, 4000); sfx.pickup(); updateHUD(); } catch (err) {}
    } else if (kind === 'over') {
      try { teamGameOver(); } catch (err) {}
    }
  } catch (e) {}
}
let NET_GUEST_SHOT = 0;
function netTick(dt) {
  if (!isNet()) return;
  try {
    if (isHost()) {
      // Expire stale guest inputs so a paused/disconnected mate never sticks keys/fire on.
      try {
        const now = performance.now();
        for (const p of players) {
          if (!p || p === player || !p.net || !p.net._t) continue;
          if (now - p.net._t > 400) { p.net.fire = false; p.net.keys = {}; }
        }
      } catch (e) {}
      NET.snapTimer += dt;
      if (NET.snapTimer >= 0.10) { // ~10Hz: fresher truth, still tiny packets
        NET.snapTimer = 0;
        if (typeof G !== 'undefined' && (G.state === 'playing' || G.state === 'intermission')) {
          try { netSend(buildSnapshot()); } catch (e) {}
        }
      }
    } else {
      NET.inTimer += dt;
      if (NET.inTimer >= 0.06) {
        NET.inTimer = 0;
        if (!player || typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
        const k = {};
        if (keys.KeyW || keys.ArrowUp) k.KeyW = true;
        if (keys.KeyS || keys.ArrowDown) k.KeyS = true;
        if (keys.KeyA || keys.ArrowLeft) k.KeyA = true;
        if (keys.KeyD || keys.ArrowRight) k.KeyD = true;
        const wsel = (NET.pendingWsel !== undefined && NET.pendingWsel >= 0) ? NET.pendingWsel : -1;
        try {
          netSend({ t: 'in', keys: k, ax: +(player.aim.x || 0).toFixed(3), az: +(player.aim.z || 0).toFixed(3), fire: !!(keys.Space || G.mouseFireHeld), wsel });
        } catch (e) {}
        if (wsel >= 0) NET.pendingWsel = -1;
      }
    }
  } catch (e) {}
}
// Guest-side visuals only: no sim, no damage, no pickups. The host's next
// snapshot corrects every position, so this just lerps + animates chrome.
function updateGuestVisuals(dt) {
  try {
    const k = 1 - Math.pow(0.0001, dt); // frame-rate independent lerp
    for (const p of players) {
      if (!p || !p.group) continue;
      if (p === player) {
        // Client-side prediction: walk yourself instantly with local keys,
        // then converge toward the host's truth (snapshots correct drift,
        // knockbacks and teleports). No firing/pickups/damage here — the
        // host stays authoritative for all of that.
        if (p.alive || p.ghost) {
          let mx = 0, mz = 0;
          if (keys.KeyW || keys.ArrowUp) mz -= 1;
          if (keys.KeyS || keys.ArrowDown) mz += 1;
          if (keys.KeyA || keys.ArrowLeft) mx -= 1;
          if (keys.KeyD || keys.ArrowRight) mx += 1;
          const len = Math.hypot(mx, mz);
          if (len > 0) {
            mx /= len; mz /= len;
            p.group.position.x += mx * p.speed * dt;
            p.group.position.z += mz * p.speed * dt;
          }
        }
        // Reconcile toward where the host is NOW: extrapolate the snapshot
        // history forward by its own velocity (+ a tick of batching lag).
        // This removes the systematic drag of chasing stale positions —
        // prediction and target agree, so only true drift gets corrected.
        const hh = p._hist || [];
        if (hh.length) {
          const last = hh[hh.length - 1];
          let hvx = 0, hvz = 0;
          if (hh.length >= 2) {
            const a = hh[hh.length - 2];
            const hdt = Math.max(0.05, last.t - a.t);
            hvx = (last.x - a.x) / hdt; hvz = (last.z - a.z) / hdt;
            const hsp = Math.hypot(hvx, hvz), msp = p.speed * 1.15 + 0.3;
            if (hsp > msp) { hvx *= msp / hsp; hvz *= msp / hsp; }
          }
          const now2 = performance.now() / 1000;
          const look = Math.min(0.5, Math.max(0, now2 - last.t) + 0.06);
          const tx = last.x + hvx * look, tz = last.z + hvz * look;
          const ck = 1 - Math.pow(0.001, dt); // firm: residual error is real drift
          p.group.position.x += (tx - p.group.position.x) * ck;
          p.group.position.z += (tz - p.group.position.z) * ck;
        }
      } else if (p._tx !== undefined) {
        p.group.position.x += (p._tx - p.group.position.x) * k;
        p.group.position.z += (p._tz - p.group.position.z) * k;
      }
      clampToArena(p.group.position, p.radius);
      if (p.flashT > 0) { p.flashT -= dt; if (p.flashT <= 0) p.flash.visible = false; }
      if (p.hurtCd > 0) p.hurtCd -= dt;
      if (p.cool > 0) p.cool -= dt;
    }
    // Local shooting feedback (sound + flash only; the host spawns real shots).
    try {
      if (player && player.alive && (keys.Space || G.mouseFireHeld)) {
        const now = performance.now() / 1000;
        const w = AW(player)[player.weaponIndex];
        if (w && w.unlocked && now - NET_GUEST_SHOT > Math.max(0.05, w.cooldown)) {
          NET_GUEST_SHOT = now;
          player.flash.visible = true; player.flashT = 0.06;
          try { sfx.shoot(player.weaponIndex); } catch (e) {}
        }
      }
    } catch (e) {}
    for (const z of zombies) {
      if (!z || !z.group) continue;
      if (z._tx !== undefined) {
        z.group.position.x += (z._tx - z.group.position.x) * k;
        z.group.position.z += (z._tz - z.group.position.z) * k;
        const dx = z._tx - z.group.position.x, dz = z._tz - z.group.position.z;
        if (dx * dx + dz * dz > 0.0004) z.group.rotation.y = Math.atan2(dx, dz);
        // guest-side shamble: march the limbs while closing distance
        const moving = (dx * dx + dz * dz) > 0.09;
        z.gwob = (z.gwob === undefined ? Math.random() * 6 : z.gwob) + dt * (moving ? 6.5 : 1.5);
        const s2 = moving ? Math.sin(z.gwob) : 0;
        if (z.legL) z.legL.rotation.x = (z.legL.userData.rx || 0) + s2 * 0.45;
        if (z.legR) z.legR.rotation.x = (z.legR.userData.rx || 0) - s2 * 0.45;
        if (z.armL) z.armL.rotation.x = (z.armL.userData.rx || 0) - s2 * 0.3;
        if (z.armR) z.armR.rotation.x = (z.armR.userData.rx || 0) + s2 * 0.3;
        if (z.type === 'splitter') {
          const pu = Math.sin(z.gwob * 1.4) * 0.04 * (moving ? 1 : 0.3);
          z.group.scale.set(1 + pu, 1 - pu, 1 + pu);
        }
      }
      if (z.flash > 0) {
        z.flash -= dt;
        try {
          if (z.flash <= 0) z.bodyMat.color.copy(z.baseColor);
        } catch (e) {}
      }
      try {
        z.hpFg.lookAt(camera.position);
        z.hpBg.lookAt(camera.position);
        const f = Math.max(0, z.hp / z.maxHp);
        z.hpFg.scale.x = f;
        const barY = z.isBoss ? 3.4 : 2.45;
        const barW = z.isBoss ? 1.8 : 1.0;
        z.hpFg.position.set(-(1 - f) * barW / 2, barY, 0.01);
        z.hpFg.material.color.setHex(f > 0.5 ? 0x33ff33 : f > 0.25 ? 0xffaa00 : 0xff2222);
      } catch (e) {}
    }
    // Coin bob + mine blink (visuals only; the host sims pickups/detonations).
    try {
      for (const d of drops) {
        if (!d || !d.mesh) continue;
        d.bob = (d.bob || 0) + dt * 3;
        d.mesh.rotation.y += dt * 3;
        d.mesh.position.y = 0.4 + Math.sin(d.bob) * 0.12;
      }
    } catch (e) {}
    try {
      const t = performance.now() * 0.006;
      for (const m of mines) {
        if (!m || !m.dot) continue;
        m.dot.visible = (Math.sin(t * 3 + (m.seed || 0)) > -0.2);
      }
    } catch (e) {}
    try {
      const bt = performance.now() * 0.004;
      for (const p of players) {
        if (!p || !p.corpseArrow) continue;
        p.corpseArrow.position.y = 2.6 + Math.sin(bt + (p.corpseSeed || 0)) * 0.3;
        p.corpseArrow.rotation.y += dt * 2.5;
      }
    } catch (e) {}
    try { updateBursts(dt); } catch (e) {}
    try {
      if (gateMesh) gateMesh.material.opacity = 0.85 + Math.sin(performance.now() * 0.005) * 0.1;
    } catch (e) {}
  } catch (e) {}
}
const MAPS = {
  graveyard: {
    label: '🪦 Graveyard',
    ground: 0x223322, floor: 0x385563, grout: 0x151f24,
    fogColor: 0x070d0c, fogDensity: 0.022,
    wall: 0x2c3540, gateColor: 0x552222,
    sky: 0x070d0c, light: 0x7a99aa, lightIntensity: 0.8,
    speedMult: 0.9, hpMult: 0.9, scoreMult: 1.0,
    desc: 'foggy'
  },
  city: {
    label: '🏢 City Ruins',
    ground: 0x3b3b42, floor: 0x39405a, grout: 0x181c28,
    fogColor: 0x080810, fogDensity: 0.016,
    wall: 0x484e5e, gateColor: 0x883300,
    sky: 0x080810, light: 0x8899bb, lightIntensity: 0.85,
    speedMult: 1.0, hpMult: 1.0, scoreMult: 1.2,
    desc: 'urban'
  },
  desert: {
    label: '🌵 Desert Outpost',
    ground: 0x8a7344, floor: 0x5d4632, grout: 0x241812,
    fogColor: 0x120c08, fogDensity: 0.013,
    wall: 0x7a5f42, gateColor: 0x662200,
    sky: 0x120c08, light: 0xddaa77, lightIntensity: 0.9,
    speedMult: 1.22, hpMult: 1.05, scoreMult: 1.5,
    desc: 'open'
  }
};

// Weapons unlock by total kill count; each weapon has ONE combined upgrade track
// (Lv15 max): every level boosts damage + fire rate + mag, and every 3 levels
// adds pierce (guns) or blast (explosives). kind: gun | grenade | rocket | mine.
// key: keyboard key (1-9,0). drop: ammo per ◆ bullets pickup. blast: AoE radius.
// wallIgnore: railgun bolts fly through walls AND zombies.
function baseWeaponDefs() { return [
  { name: 'Pistol',   icon: '🔫', key: '1', kind: 'gun',     damage: 34,  cooldown: 0.26,  bulletSpeed: 46, range: 18, spread: 0.02,  pellets: 1, ammo: Infinity, maxAmmo: Infinity, drop: 0,  color: 0xffff66, freq: 750, unlockKills: 0,    unlocked: true,  up: 0, pierce: 0, blast: 0, wallIgnore: false },
  { name: 'Rifle',    icon: '🔥', key: '2', kind: 'gun',     damage: 24,  cooldown: 0.115, bulletSpeed: 60, range: 24, spread: 0.07,  pellets: 1, ammo: 120,      maxAmmo: 400,      drop: 12, color: 0x66ccff, freq: 420, unlockKills: 20,   unlocked: false, up: 0, pierce: 0, blast: 0, wallIgnore: false },
  { name: 'Shotgun',  icon: '💥', key: '3', kind: 'gun',     damage: 20,  cooldown: 0.75,  bulletSpeed: 40, range: 14, spread: 0.24,  pellets: 6, ammo: 24,       maxAmmo: 100,      drop: 4,  color: 0xff8833, freq: 160, unlockKills: 50,   unlocked: false, up: 0, pierce: 0, blast: 0, wallIgnore: false },
  { name: 'SMG',      icon: '⚡', key: '4', kind: 'gun',     damage: 16,  cooldown: 0.07,  bulletSpeed: 55, range: 16, spread: 0.09,  pellets: 1, ammo: 200,      maxAmmo: 500,      drop: 30, color: 0xaaffff, freq: 600, unlockKills: 90,   unlocked: false, up: 0, pierce: 0, blast: 0, wallIgnore: false },
  { name: 'Sniper',   icon: '🔭', key: '5', kind: 'gun',     damage: 240, cooldown: 1.3,   bulletSpeed: 95, range: 34, spread: 0.005, pellets: 1, ammo: 20,       maxAmmo: 60,       drop: 4,  color: 0xccffcc, freq: 200, unlockKills: 140,  unlocked: false, up: 0, pierce: 2, blast: 0, wallIgnore: false },
  { name: 'Minigun',  icon: '🌀', key: '6', kind: 'gun',     damage: 20,  cooldown: 0.05,  bulletSpeed: 60, range: 20, spread: 0.09,  pellets: 1, ammo: 400,      maxAmmo: 800,      drop: 60, color: 0xffcc00, freq: 500, unlockKills: 280,  unlocked: false, up: 0, pierce: 0, blast: 0, wallIgnore: false },
  { name: 'Grenade',  icon: '💣', key: '7', kind: 'grenade', damage: 140, cooldown: 1.0,   bulletSpeed: 16, range: 26, spread: 0,     pellets: 1, ammo: 10,       maxAmmo: 30,       drop: 2,  color: 0x77ff44, freq: 180, unlockKills: 370,  unlocked: false, up: 0, pierce: 0, blast: 4.5, wallIgnore: false },
  { name: 'Rocket',   icon: '🚀', key: '8', kind: 'rocket',  damage: 130, cooldown: 1.1,   bulletSpeed: 40, range: 26, spread: 0,     pellets: 1, ammo: 12,       maxAmmo: 36,       drop: 3,  color: 0xff6644, freq: 140, unlockKills: 470,  unlocked: false, up: 0, pierce: 0, blast: 4, wallIgnore: false },
  { name: 'Mine',     icon: '⚫', key: '9', kind: 'mine',    damage: 200, cooldown: 0.8,   bulletSpeed: 0,  range: 0,  spread: 0,     pellets: 1, ammo: 8,        maxAmmo: 24,       drop: 2,  color: 0x888888, freq: 260, unlockKills: 580,  unlocked: false, up: 0, pierce: 0, blast: 5, wallIgnore: false },
  { name: 'Plasma',   icon: '🔮', key: '0', kind: 'gun',     damage: 80,  cooldown: 0.28,  bulletSpeed: 75, range: 26, spread: 0.05,  pellets: 2, ammo: 100,      maxAmmo: 200,      drop: 12, color: 0xcc66ff, freq: 660, unlockKills: 700,  unlocked: false, up: 0, pierce: 1, blast: 0, wallIgnore: false },
  { name: 'Bane',     icon: '☠️', key: '-', kind: 'gun',     damage: 170, cooldown: 0.45,  bulletSpeed: 80, range: 28, spread: 0.06,  pellets: 3, ammo: 60,       maxAmmo: 120,      drop: 8,  color: 0xff00ff, freq: 240, unlockKills: 850,  unlocked: false, up: 0, pierce: 1, blast: 0, wallIgnore: false },
  { name: 'Railgun',  icon: '🔱', key: '=', kind: 'gun',     damage: 280, cooldown: 0.9,   bulletSpeed: 90, range: 36, spread: 0.005, pellets: 1, ammo: 24,       maxAmmo: 72,       drop: 5,  color: 0x66ffff, freq: 180, unlockKills: 1000, unlocked: false, up: 0, pierce: 5, blast: 0, wallIgnore: true },
]; }
const WBLURB = [
  'Trusty sidearm with endless ammo. Simple and steady.',
  'Rapid-fire workhorse, good at everything.',
  'Twin barrels for point-blank devastation.',
  'Bullet hose. Tiny hits at insane speed.',
  'One shot one kill. Huge range, slow cycle.',
  'Hold the trigger for a storm of lead.',
  'Hold CLICK to charge, release to lob it far. It hurts YOU too, keep distance.',
  'Fast rocket with a hot blast. Mind the splash on yourself.',
  'Set it and forget it. Proximity boom, watch your step.',
  'Twin plasma bolts that melt packs.',
  'Skull cannon. Triple-shot room clearer.',
  'Fires supersonic slugs through walls AND zombies. Nothing hides.',
];
function initArsenal(A) {
  A.forEach((w, i) => {
    w.baseAmmo = w.ammo;
    w.revealed = w.unlockKills === 0;
    w.base = { damage: w.damage, cooldown: w.cooldown, range: w.range, pierce: w.pierce, blast: w.blast, maxAmmo: w.maxAmmo };
    w.blurb = WBLURB[i];
  });
  return A;
}
const WEAPONS = initArsenal(baseWeaponDefs());
// Per-hunter arsenal: solo shares the global WEAPONS; in co-op every player
// owns their unlocks, levels and ammo (reveals stay team-wide via WEAPONS).
function newArsenal() { return initArsenal(baseWeaponDefs()); }
function AW(p) { return (isNet() && p && p.ars) ? p.ars : WEAPONS; }
// Shop economy: $ prices parallel to WEAPONS; one combined upgrade track (Lv15 max).
// Order: Pistol Rifle Shotgun SMG Sniper Minigun Grenade Rocket Mine Plasma Bane Railgun.
const WPRICE = [0, 100, 200, 350, 550, 1100, 1500, 2000, 2600, 3200, 4000, 4800];
const WKNOCK = [0.4, 0.3, 1.2, 0.15, 1.5, 0.1, 0, 0, 0, 0.5, 1.0, 1.2]; // per-gun shove (explosives use blast)
const SHOP = { medkit: 150, medkitHeal: 50, life: 1500, kit: 800, kitHeal: 100 };
const UP_MAX = 15;
// total kills needed to reach each combined level (index = target level 1..15)
const UPGRADE_NEED = [0, 10, 25, 45, 70, 100, 135, 175, 220, 270, 325, 385, 450, 520, 600, 700];
// Later weapons demand more kills per level (still ordered: higher level and
// higher tier always need at least as many). Pistol Lv1 = 10, Rifle Lv1 = 11,
// Bane Lv1 = 21 … Bane Lv15 = 1470 team kills.
function upgradeNeedFor(i, lvl) { return Math.round((UPGRADE_NEED[lvl] || 0) * (1 + i * 0.1) * DG().killM); }
function upgradeCost(w, i) { return Math.round((Math.max(WP(i), 60) * 0.05 + 30) * (w.up + 1)); }
function hpCost() { return 150 + 150 * G.hpUps; }
function defCost() { return 250 + 200 * G.defUps; }
function spdCost() { return 250 + 200 * G.spdUps; }
// Ammo is priced by the bullet: a full refill costs 15% of the weapon price,
// and topping up costs that pro-rata for the missing rounds (rounded, min $1).
function ammoFullCost(i) { return Math.max(20, Math.round(WP(i) * 0.3)); }
function ammoCost(i, A) {
  A = A || AW(player);
  const w = A[i];
  if (!w || w.ammo === Infinity || w.maxAmmo === Infinity) return 0;
  const missing = Math.max(0, w.maxAmmo - w.ammo);
  if (missing <= 0) return 0;
  return Math.max(1, Math.round(ammoFullCost(i) * missing / w.maxAmmo));
}
// ---- wallets: solo shares one team wallet (G.money); co-op gives every
// hunter their own (players[slot].money). All buys go through these so the
// same code path works in both modes. On the host, guest purchases run with
// NET.buyAs set to the buyer's slot (see handleBuyRequest).
function teamSize() { let n = 0; for (const p of players) if (p) n++; return Math.max(1, n); }
// Co-op coin drops scale sub-linearly: 2 hunters = 1.5x, 3 = 2x, 4 = 2.5x.
function coinMult() { return isNet() ? (1 + 0.5 * (teamSize() - 1)) : 1; }
function moneyOf(slot) {
  if (!isNet()) return G.money;
  const p = players[slot];
  return p ? (p.money || 0) : 0;
}
function addMoney(slot, delta) {
  if (!isNet()) { G.money = Math.max(0, G.money + delta); return; }
  const p = players[slot];
  if (p) p.money = Math.max(0, (p.money || 0) + delta);
}
// What the local viewer pays with (shop prices, buttons, messages).
function viewMoney() { return isNet() ? moneyOf(NET.slot) : G.money; }
function buyerSlot() {
  if (isNet() && NET.buyAs !== null && NET.buyAs !== undefined) return NET.buyAs;
  return NET.slot;
}

// (drops are coins now; see spawnCoins)

// ============ BOSS ROSTER (a new kind every 10 rounds, then combos) ============
const BOSS_KINDS = ['BRUTE', 'SPITTER', 'BLINK', 'WRAITH', 'SUMMONER'];
const BOSS_DEF = [
  { resist: 0.1, touch: 1.2 },  // BRUTE: heavy, shoves hard
  { resist: 0.2, touch: 0.7 },  // SPITTER: ranged embers
  { resist: 0.25, touch: 0.8 }, // BLINK: teleports
  { resist: 0.3, touch: 0.6 },  // WRAITH: phases invisible
  { resist: 0.15, touch: 0.7 }, // SUMMONER: calls its brood
];
// ============ DOM ============
const canvas = document.getElementById('game-canvas');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const gameoverEl = document.getElementById('gameover');
const bannerEl = document.getElementById('round-banner');
const msgEl = document.getElementById('message');
const vignette = document.getElementById('damage-vignette');
const crosshair = document.getElementById('crosshair');
const shopEl = document.getElementById('shop');
const pauseEl = document.getElementById('pause');

// ============ AUDIO (no assets, WebAudio beeps) ============
let audioCtx = null;
function ac() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, dur, type, vol, slide) {
  type = type || 'square'; vol = (vol === undefined) ? 0.12 : vol; slide = slide || 0;
  try {
    const ctx = ac(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  shoot: (i) => beep(WEAPONS[i].freq, i === 2 ? 0.22 : 0.07, i === 2 ? 'sawtooth' : 'square', 0.12, i === 2 ? -80 : -200),
  empty: () => beep(140, 0.09, 'square', 0.12),
  locked: () => beep(160, 0.15, 'square', 0.12, -40),
  hit: () => beep(220, 0.05, 'sawtooth', 0.07, -60),
  zdie: () => beep(300, 0.25, 'sawtooth', 0.12, -220),
  pickup: () => { beep(660, 0.08, 'sine', 0.14); setTimeout(() => beep(990, 0.1, 'sine', 0.14), 70); },
  medkit: () => { beep(520, 0.1, 'sine', 0.14); setTimeout(() => beep(780, 0.18, 'sine', 0.14), 90); },
  hurt: () => beep(110, 0.25, 'sawtooth', 0.18, -40),
  round: () => { beep(330, 0.15, 'square', 0.14); setTimeout(() => beep(440, 0.15, 'square', 0.14), 150); setTimeout(() => beep(660, 0.3, 'square', 0.14), 300); },
  unlock: () => { beep(523, 0.12, 'square', 0.14); setTimeout(() => beep(659, 0.12, 'square', 0.14), 110); setTimeout(() => beep(784, 0.28, 'square', 0.14), 220); },
  boss: () => { beep(90, 0.6, 'sawtooth', 0.2, -30); setTimeout(() => beep(70, 0.8, 'sawtooth', 0.2, -20), 400); },
  swap: () => beep(520, 0.06, 'triangle', 0.12),
  blink: () => { beep(880, 0.18, 'sine', 0.12, 500); },
  boom: () => { beep(90, 0.35, 'sawtooth', 0.2, -50); setTimeout(() => beep(55, 0.5, 'sawtooth', 0.18, -20), 80); },
  over: () => { beep(220, 0.4, 'sawtooth', 0.16, -150); setTimeout(() => beep(140, 0.6, 'sawtooth', 0.16, -80), 350); },
};

// ============ THREE SETUP ============
// Full-resolution smooth render (characters read clean, not crunchy).
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function fitRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
fitRenderer();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a140a);
scene.fog = new THREE.FogExp2(0x0a140a, 0.02);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 24, 16);

const hemi = new THREE.HemisphereLight(0x7a99aa, 0x101018, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe4c0, 0.75);
sun.position.set(12, 24, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
scene.add(sun);
const muzzleLight = new THREE.PointLight(0xffcc66, 0, 12);
scene.add(muzzleLight);
// soft moonlight that follows the focus: characters always read, venue stays moody
const fillLight = new THREE.PointLight(0x8899ff, 0.75, 24);
fillLight.position.set(0, 8, 12);
scene.add(fillLight);

// world container (rebuilt per map)
let worldGroup = null;
let obstacles = [];   // {x,z,hx,hz,mesh}
let gatePos = new THREE.Vector3(0, 0, -ARENA_HALF + 1.5);
let gateMesh = null;
let gateGlow = null;
let gateShimmer = null;

// ============ MOOD (pixel-fantasy look: teal dark, torchlight pools) ============
function shadeHex(hex, amt) {
  const r = Math.max(0, Math.min(255, (hex >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (hex & 255) + amt));
  return (r << 16) | (g << 8) | b;
}
// Procedural flagstones: dark grout + per-slab value jitter + speckle cracks.
// NearestFilter keeps the texels crisp under the pixel upscale.
function flagstoneTexture(base, grout) {
  const S = 256, T = 4;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#' + grout.toString(16).padStart(6, '0'); cx.fillRect(0, 0, S, S);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const v = Math.round((Math.random() - 0.5) * 22);
    cx.fillStyle = '#' + shadeHex(base, v).toString(16).padStart(6, '0');
    const jx = (Math.random() - 0.5) * 3, jy = (Math.random() - 0.5) * 3;
    cx.fillRect(x * S / T + 2 + jx, y * S / T + 2 + jy, S / T - 4, S / T - 4);
    // bevel light: pale lip on the top/left of every slab
    cx.fillStyle = 'rgba(255,255,255,0.10)';
    cx.fillRect(x * S / T + 2 + jx, y * S / T + 2 + jy, S / T - 4, 2);
    cx.fillRect(x * S / T + 2 + jx, y * S / T + 2 + jy, 2, S / T - 4);
    cx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let s = 0; s < 6; s++) {
      cx.fillRect(x * S / T + 4 + Math.random() * (S / T - 8), y * S / T + 4 + Math.random() * (S / T - 8), 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.magFilter = THREE.LinearFilter;
  // bevel light: pale top/left lip on every slab, like sunken torchlit stone
  return tex;
}
let torches = []; // {light, flame, outer, seed, x, z}
let embers = [];  // {mesh, vy, vx, life, max}
const emberGeo = new THREE.SphereGeometry(0.07, 6, 6);
const emberMats = [new THREE.MeshBasicMaterial({ color: 0xffaa33 }), new THREE.MeshBasicMaterial({ color: 0xff5522 })];
function addTorch(x, z) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.0, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.95 }));
  base.position.y = 0.5; base.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 }));
  bowl.position.y = 1.15;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 7),
    new THREE.MeshBasicMaterial({ color: 0xff6611, transparent: true, opacity: 0.9 }));
  outer.position.y = 1.8;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 7),
    new THREE.MeshBasicMaterial({ color: 0xffcc44 }));
  flame.position.y = 1.75;
  const light = new THREE.PointLight(0xff7722, 1.9, 15);
  light.position.y = 2.1;
  g.add(base, bowl, outer, flame, light);
  g.position.set(x, 0, z);
  worldGroup.add(g);
  torches.push({ light, flame, outer, seed: Math.random() * 10, x, z });
}
function spawnEmber() {
  if (embers.length > 46) return;
  let sx = gatePos.x, sz = gatePos.z + 1;
  if (torches.length && Math.random() < 0.5) {
    const t = torches[Math.floor(Math.random() * torches.length)];
    sx = t.x; sz = t.z;
  }
  const m = new THREE.Mesh(emberGeo, emberMats[Math.floor(Math.random() * emberMats.length)]);
  m.position.set(sx + (Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6, sz + (Math.random() - 0.5) * 1.6);
  scene.add(m);
  const life = 2 + Math.random() * 2;
  embers.push({ mesh: m, vy: 1 + Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.7, life, max: life });
}
function updateEmbers(dt) {
  const wob = performance.now() * 0.003;
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.life -= dt;
    e.mesh.position.y += e.vy * dt;
    e.mesh.position.x += (e.vx + Math.sin(wob + i) * 0.4) * dt;
    const s = Math.max(0.01, e.life / e.max);
    e.mesh.scale.set(s, s, s);
    if (e.life <= 0 || e.mesh.position.y > 10) { scene.remove(e.mesh); embers.splice(i, 1); }
  }
}
function updateTorches() {
  const t = performance.now() * 0.001;
  for (const tc of torches) {
    const f = Math.sin(t * 11 + tc.seed) * 0.5 + Math.sin(t * 23 + tc.seed * 2) * 0.3 + Math.sin(t * 5 + tc.seed) * 0.2;
    tc.light.intensity = 1.9 + f * 0.45;
    tc.flame.scale.set(1 + f * 0.12, 1 + f * 0.2, 1 + f * 0.12);
    tc.outer.scale.set(1 - f * 0.06, 1 + f * 0.1, 1 - f * 0.06);
  }
}
// Fake bounce-light pools: additive radial decals under flames and the gate.
let glowPoolTex = null;
function glowPoolTexture() {
  if (glowPoolTex) return glowPoolTex;
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.28)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, S, S);
  glowPoolTex = new THREE.CanvasTexture(cv);
  return glowPoolTex;
}
function addGlowPool(x, z, size, color, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: glowPoolTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.04, z);
  worldGroup.add(m);
}
// Ruined silhouette: merlons on the walls, torch-bounce rim light,
// lit alcoves on the north wall. All static unit boxes.
function dressWalls() {
  const H = 3, E = ARENA_HALF + 0.5; // must match mkWall
  const merlonM = new THREE.MeshStandardMaterial({ color: 0x1d212b, roughness: 0.95 });
  const rimM = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
  for (let x = -26; x <= 26; x += 4) {
    for (const z of [-E, E]) {
      const mer = new THREE.Mesh(unitBox, merlonM);
      mer.scale.set(1.7, 0.8, 0.9); mer.position.set(x, H + 0.4, z);
      worldGroup.add(mer);
    }
  }
  for (let z = -26; z <= 26; z += 4) {
    for (const x of [-E, E]) {
      const mer = new THREE.Mesh(unitBox, merlonM);
      mer.scale.set(0.9, 0.8, 1.7); mer.position.set(x, H + 0.4, z);
      worldGroup.add(mer);
    }
  }
  const rimN = new THREE.Mesh(unitBox, rimM);
  rimN.scale.set(ARENA_HALF * 2, 0.09, 0.09); rimN.position.set(0, H + 0.02, -ARENA_HALF);
  const rimS = rimN.clone(); rimS.position.z = ARENA_HALF;
  const rimW = new THREE.Mesh(unitBox, rimM);
  rimW.scale.set(0.09, 0.09, ARENA_HALF * 2); rimW.position.set(-ARENA_HALF, H + 0.02, 0);
  const rimE = rimW.clone(); rimE.position.x = ARENA_HALF;
  worldGroup.add(rimN, rimS, rimW, rimE);
  for (const nx of [-13, 13]) {
    const frame = new THREE.Mesh(unitBox, merlonM);
    frame.scale.set(2.8, 3.6, 0.5); frame.position.set(nx, 1.8, -ARENA_HALF + 0.1);
    const glow = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff8833 }));
    glow.scale.set(1.8, 2.6, 0.15); glow.position.set(nx, 1.7, -ARENA_HALF + 0.32);
    worldGroup.add(frame, glow);
  }
}
// Low rubble drifts along the walls (walk-over height, no collision).
function scatterRubble() {
  const rubbleMats = [0x1e222c, 0x2a2f3a, 0x33272b].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  let placed = 0, guard = 0;
  while (placed < 42 && guard++ < 300) {
    const edge = Math.floor(Math.random() * 4);
    let x, z;
    if (edge === 0) { x = (Math.random() - 0.5) * 52; z = -ARENA_HALF + 1 + Math.random() * 5; }
    else if (edge === 1) { x = (Math.random() - 0.5) * 52; z = ARENA_HALF - 1 - Math.random() * 5; }
    else if (edge === 2) { x = -ARENA_HALF + 1 + Math.random() * 5; z = (Math.random() - 0.5) * 52; }
    else { x = ARENA_HALF - 1 - Math.random() * 5; z = (Math.random() - 0.5) * 52; }
    if (Math.hypot(x, z + 26) < 5) continue; // gate mouth stays clear
    if (Math.hypot(x, z - 12) < 7) continue; // player spawn stays clear
    const m = new THREE.Mesh(unitBox, rubbleMats[placed % 3]);
    const s = 0.3 + Math.random() * 0.6;
    m.scale.set(s * (0.7 + Math.random() * 0.7), 0.12 + Math.random() * 0.2, s * (0.7 + Math.random() * 0.7));
    m.position.set(x, m.scale.y / 2, z);
    m.rotation.y = Math.random() * Math.PI;
    worldGroup.add(m);
    placed++;
  }
}

// ============ GAME STATE ============
const G = {
  state: 'menu', // menu | playing | intermission | gameover
  mapKey: 'graveyard',
  round: 1, score: 0, kills: 0,
  spawnQueue: 0, spawnTimer: 0, spawnInterval: 1.2,
  isBossRound: false, bossesToSpawn: 0, bossSpawnTimer: 0,
  interTimer: 0,
  weaponIndex: 0,
  fireCooldown: 0,
  mouseFireHeld: false,
  shake: 0,
  paused: false, shopOpen: false,
  money: 0,
  lives: 0,
  hpUps: 0, defUps: 0, spdUps: 0, defense: 0,
  diff: 0, // 0 EASY (baseline) | 1 NORMAL | 2 HARD
};

let player = null; // {group, pos:Vector3, hp, maxHp, speed, radius, aim:Vector3, hurtCd}
let zombies = [];  // {group, bodyMat, hp, maxHp, speed, damage, attackCd, hpFg, radius, flash, isBoss, type, spitCd, core, scoreMult}
let bullets = [];  // {mesh, vel, life, damage, kind, blast, pierce, hit[], boom}
let spits = [];    // enemy globs {mesh, vel, life, damage}
let mines = [];    // placed mines {mesh, dot, life, blast, damage, wi, seed}
let drops = [];    // {mesh, kind:'bullets'|'medkit', life, rifle, shotgun, heal}
let bursts = [];   // hit-death particles {mesh, t}
let aimPoint = new THREE.Vector3(0, 0, -5);

const keys = {};
let mouseNDC = { x: 0, y: 0 };
let mouseScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// ============ INPUT ============
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'showroom') { window.restartToMenu(); return; }
  if (e.code === 'Backquote' && (G.state === 'playing' || G.state === 'intermission')) { toggleShop(); return; }
  if (e.code === 'Escape' && (G.state === 'playing' || G.state === 'intermission')) {
    if (G.shopOpen) window.closeShop();
    else if (isNet()) window.toggleEscMenu(); // co-op menu: never pauses, offers Leave Room
    else if (G.paused) window.resumeGame();
    else openPause();
    return;
  }
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (G.state === 'playing' || G.state === 'intermission') {
    if (e.code.indexOf('Digit') === 0) {
      const d = parseInt(e.code.slice(5), 10);
      const idx = d === 0 ? 9 : d - 1;
      if (idx >= 0 && idx < WEAPONS.length) switchWeapon(idx);
    }
    if (e.code === 'Minus') switchWeapon(10);
    if (e.code === 'Equal') switchWeapon(11);
    if (e.code === 'KeyR') { buyAmmoCurrent(); }
    if (e.code === 'KeyQ') { buyUpgradeCurrent(); }
    if (e.code === 'KeyE') { buyMedkitCurrent(); }
    if (e.code === 'KeyT') { tryRevive(); }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousemove', (e) => {
  mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  mouseScreen.x = e.clientX; mouseScreen.y = e.clientY;
});
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  ac();
  // HUD weapon boxes and overlay buttons must not trigger shooting
  try {
    if (e.target && e.target.closest && (e.target.closest('#weapons') || e.target.closest('.overlay'))) return;
  } catch (err) {}
  G.mouseFireHeld = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) G.mouseFireHeld = false; });
window.addEventListener('wheel', (e) => {
  if (G.state !== 'playing' && G.state !== 'intermission') return;
  const dir = e.deltaY > 0 ? 1 : -1;
  let i = G.weaponIndex;
  const LA = AW(player);
  for (let k = 0; k < LA.length; k++) {
    i = (i + dir + LA.length) % LA.length;
    if (LA[i].unlocked && WEAPONS[i].revealed) { switchWeapon(i); break; }
  }
}, { passive: true });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  fitRenderer();
});

// ============ MAP BUILDING ============
function clearWorld() {
  if (worldGroup) { scene.remove(worldGroup); }
  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  obstacles = [];
  for (const z of zombies) scene.remove(z.group);
  for (const b of bullets) scene.remove(b.mesh);
  for (const s of spits) scene.remove(s.mesh);
  for (const m of mines) scene.remove(m.mesh);
  for (const d of drops) scene.remove(d.mesh);
  for (const u of bursts) scene.remove(u.mesh);
  zombies = []; bullets = []; spits = []; mines = []; drops = []; bursts = [];
  torches = [];
  for (const e of embers) scene.remove(e.mesh);
  embers = [];
  gateShimmer = null;
  for (const p of players) {
    if (!p) continue;
    try { if (p.corpse) scene.remove(p.corpse); } catch (e) {}
    p.corpse = null; p.corpseArrow = null; p.corpsePos = null;
  }
  if (player) { scene.remove(player.group); player = null; }
}

const winLitMat = new THREE.MeshBasicMaterial({ color: 0xff9a33 });
const winDarkMat = new THREE.MeshBasicMaterial({ color: 0x0c0c14 });
const obTrimMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.95 });
// Pixel dressing on top of plain blockers: tomb caps, lit windows, car cabins,
// crate lids, crypt doors. Children ride the obstacle mesh (unit boxes).
function dressObstacle(m, w, h, d, detail) {
  if (!detail) return;
  if (detail === 'tomb') {
    const cap = new THREE.Mesh(unitBox, obTrimMat);
    cap.scale.set(w + 0.3, 0.18, d + 0.2); cap.position.set(0, h / 2 + 0.05, 0);
    const scrip = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0x050507 }));
    scrip.scale.set(w * 0.45, h * 0.4, 0.05); scrip.position.set(0, 0.1, d / 2 + 0.01);
    m.add(cap, scrip);
  } else if (detail === 'windows') {
    const cols = Math.max(2, Math.round(w / 2.5)), rows = Math.max(1, Math.round(h / 2.5));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const win = new THREE.Mesh(unitBox, Math.random() < 0.6 ? winLitMat : winDarkMat);
      win.scale.set(0.55, 0.75, 0.06);
      win.position.set(
        (c - (cols - 1) / 2) * (w / (cols + 0.3)),
        -h / 2 + 1.2 + r * (rows > 1 ? (h - 2.4) / (rows - 1) : 0),
        d / 2 + 0.02);
      m.add(win);
    }
    const cap = new THREE.Mesh(unitBox, obTrimMat);
    cap.scale.set(w + 0.3, 0.22, d + 0.3); cap.position.y = h / 2 + 0.06;
    m.add(cap);
  } else if (detail === 'crate') {
    const lid = new THREE.Mesh(unitBox, obTrimMat);
    lid.scale.set(w + 0.15, 0.14, d + 0.15); lid.position.y = h / 2 + 0.02;
    m.add(lid);
  } else if (detail === 'car') {
    const cab = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 }));
    cab.scale.set(w * 0.5, 0.6, d * 0.65); cab.position.y = h / 2 + 0.28; cab.castShadow = true;
    m.add(cab);
    const hl = new THREE.MeshBasicMaterial({ color: 0xffcc55 });
    const h1 = new THREE.Mesh(unitBox, hl);
    h1.scale.set(0.18, 0.14, 0.06); h1.position.set(-w * 0.28, -h / 2 + 0.35, d / 2 + 0.02);
    const h2 = h1.clone(); h2.position.x = w * 0.28;
    m.add(h1, h2);
  } else if (detail === 'crypt') {
    const door = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: 0xff5522 }));
    door.scale.set(w * 0.4, h * 0.62, 0.05); door.position.set(0, -h * 0.08, d / 2 + 0.02);
    const step = new THREE.Mesh(unitBox, obTrimMat);
    step.scale.set(w + 0.4, 0.12, d + 0.5); step.position.y = -h / 2 + 0.06;
    m.add(door, step);
  }
}

function addObstacle(x, z, w, h, d, color, emissive, detail) {
  emissive = emissive || 0x000000;
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.9 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  worldGroup.add(m);
  dressObstacle(m, w, h, d, detail);
  obstacles.push({ x, z, hx: w / 2, hz: d / 2, mesh: m });
  return m;
}

function buildMap(mapKey) {
  clearWorld();
  const cfg = MAPS[mapKey];
  scene.background = new THREE.Color(cfg.sky);
  scene.fog.color.setHex(cfg.fogColor);
  scene.fog.density = cfg.fogDensity;
  hemi.color.setHex(cfg.light); hemi.intensity = cfg.lightIntensity;

  // ground: procedural flagstones baked per map (dark grout, teal slabs)
  const gGeo = new THREE.PlaneGeometry(ARENA_HALF * 2 + 8, ARENA_HALF * 2 + 8);
  const gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: flagstoneTexture(cfg.floor, cfg.grout), roughness: 1 });
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // walls
  const wallMat = new THREE.MeshStandardMaterial({ color: cfg.wall, roughness: 0.95 });
  const wallH = 3, wallT = 1;
  const mkWall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
    m.position.set(x, wallH / 2, z); m.castShadow = true; m.receiveShadow = true;
    worldGroup.add(m);
  };
  mkWall(0, -ARENA_HALF - 0.5, ARENA_HALF * 2 + 2, wallT);
  mkWall(0, ARENA_HALF + 0.5, ARENA_HALF * 2 + 2, wallT);
  mkWall(-ARENA_HALF - 0.5, 0, wallT, ARENA_HALF * 2 + 2);
  mkWall(ARENA_HALF + 0.5, 0, wallT, ARENA_HALF * 2 + 2);
  dressWalls();
  scatterRubble();

  // ---- GATE (north side, zombies pour out here): basalt gothic arch ----
  gatePos.set(0, 0, -ARENA_HALF + 1.2);
  const basalt = new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.85 });
  const pillarGeo = new THREE.BoxGeometry(1.8, 8, 1.8);
  const p1 = new THREE.Mesh(pillarGeo, basalt); p1.position.set(-3.4, 4, gatePos.z); p1.castShadow = true;
  const p2 = new THREE.Mesh(pillarGeo, basalt); p2.position.set(3.4, 4, gatePos.z); p2.castShadow = true;
  const arch1 = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.0, 2.0), basalt);
  arch1.position.set(0, 8.3, gatePos.z); arch1.castShadow = true;
  const arch2 = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.9, 1.8), basalt);
  arch2.position.set(0, 9.2, gatePos.z); arch2.castShadow = true;
  // glowing rune strips up the inner faces
  const runeMat = new THREE.MeshBasicMaterial({ color: 0xff4433 });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.2, 0.18), runeMat);
  r1.position.set(-2.42, 3.4, gatePos.z + 0.95);
  const r2 = r1.clone(); r2.position.x = 2.42;
  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 6.4),
    new THREE.MeshBasicMaterial({ color: 0x0a0000, transparent: true, opacity: 0.94 })
  );
  portal.position.set(0, 3.2, gatePos.z + 0.1);
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 5.2),
    new THREE.MeshBasicMaterial({ color: 0xaa1818, transparent: true, opacity: 0.45 })
  );
  shimmer.position.set(0, 3.1, gatePos.z + 0.16);
  gateGlow = new THREE.PointLight(0xff2200, 2.6, 20);
  gateGlow.position.set(0, 3.5, gatePos.z + 2);
  // skull sign
  const signCanvas = document.createElement('canvas'); signCanvas.width = 256; signCanvas.height = 64;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#100'; sctx.fillRect(0, 0, 256, 64);
  sctx.fillStyle = '#f33'; sctx.font = 'bold 34px sans-serif'; sctx.textAlign = 'center';
  sctx.fillText('☠ DEAD GATE ☠', 128, 44);
  const signTex = new THREE.CanvasTexture(signCanvas);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.set(0, 10.4, gatePos.z + 0.2);
  worldGroup.add(p1, p2, arch1, arch2, r1, r2, portal, shimmer, sign);
  worldGroup.add(gateGlow);
  gateMesh = portal;
  gateShimmer = shimmer;
  // braziers: gate flanks + south corners (decor only, no collision)
  addTorch(-5.5, -24); addTorch(5.5, -24);
  addTorch(-20, 22); addTorch(20, 22);
  addGlowPool(0, gatePos.z + 2.5, 11, 0xff4422, 0.5);
  for (const t of torches) addGlowPool(t.x, t.z, 7, 0xff8833, 0.45);

  // ---- map-specific obstacles ----
  if (mapKey === 'graveyard') {
    const stoneMat = 0x6a7075;
    const spots = [[-10, -6], [-4, -10], [5, -8], [11, -4], [-14, 4], [-6, 2], [0, 6], [8, 4], [15, 8], [-12, 14], [4, 14], [12, 16], [-3, -16], [7, -18], [-18, -12], [19, -12]];
    for (const [x, z] of spots) addObstacle(x, z, 1.6, 1.4, 0.7, stoneMat, 0, 'tomb');
    const treeM = new THREE.MeshStandardMaterial({ color: 0x2a1e14, roughness: 1 });
    const deadTree = (x, z, flip) => {
      const t = addObstacle(x, z, 1.0, 5, 1.0, 0x3a2a1a);
      const s = flip ? -1 : 1;
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.7, 6), treeM);
      b1.position.set(s * 0.55, 1.3, 0); b1.rotation.z = s * -0.7; t.add(b1);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.3, 6), treeM);
      b2.position.set(s * -0.45, 1.9, 0.1); b2.rotation.z = s * 0.8; t.add(b2);
    };
    deadTree(-18, -2, false); deadTree(18, 2, true);
    addObstacle(0, -2, 2.2, 1.0, 2.2, 0x4a5a4a, 0, 'crypt'); // crypt
  } else if (mapKey === 'city') {
    addObstacle(-12, -12, 8, 6, 7, 0x4a4a55, 0, 'windows');
    addObstacle(12, -12, 8, 7, 7, 0x55505a, 0, 'windows');
    addObstacle(-14, 8, 7, 5, 9, 0x50505c, 0, 'windows');
    addObstacle(13, 9, 9, 6, 6, 0x484852, 0, 'windows');
    addObstacle(0, 2, 5, 4, 5, 0x5a5a66, 0, 'windows');
    addObstacle(-4, 18, 6, 4, 3, 0x44444e, 0, 'windows');
    addObstacle(8, 19, 4, 3.5, 4, 0x44444e, 0, 'windows');
    addObstacle(-6, -3, 3.2, 1.2, 1.6, 0x772222, 0x220000, 'car'); // burnt cars
    addObstacle(7, -2, 3.2, 1.2, 1.6, 0x224477, 0x000022, 'car');
  } else {
    // desert: rocks + crates, mostly open
    addObstacle(-10, -8, 3, 2, 3, 0x7a6a55, 0, 'crate');
    addObstacle(10, -6, 2.4, 1.6, 2.4, 0x7a6a55, 0, 'crate');
    addObstacle(-6, 8, 2.2, 2.2, 2.2, 0x9a7a45, 0, 'crate');
    addObstacle(6, 10, 2.2, 2.2, 2.2, 0x9a7a45, 0, 'crate');
    addObstacle(0, 16, 4, 1.6, 2, 0x6a5a3a, 0, 'crate');
    const cactus = (x, z) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 }));
      m.position.set(x, 1.7, z); m.castShadow = true; worldGroup.add(m);
      const am = new THREE.MeshStandardMaterial({ color: 0x2a7a3a, roughness: 0.9 });
      const s = x > 0 ? -1 : 1; // arms alternate sides
      const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.0, 8), am);
      a1.rotation.z = Math.PI / 2; a1.position.set(s * 0.7, 0.3, 0); m.add(a1);
      const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.9, 8), am);
      a2.position.set(s * 1.1, 0.75, 0); m.add(a2);
      obstacles.push({ x, z, hx: 0.6, hz: 0.6, mesh: m });
    };
    cactus(-18, 6); cactus(18, -14); cactus(-16, -18); cactus(16, 16); cactus(0, -8);
  }

  createPlayer();
}

// ============ HAND WEAPONS (a visible model per weapon, held at the hip) ============
// Order: Pistol Rifle Shotgun SMG Sniper Minigun Grenade Rocket Mine Plasma Bane Railgun.
const MUZZLE = [ // muzzle-flash position per weapon [x,y,z]; [0,0,0] = no flash
  [0.35,1.15,1.1],[0.35,1.15,1.55],[0.35,1.15,1.3],[0.35,1.15,1.1],[0.35,1.25,1.95],
  [0.35,1.15,1.45],[0,0,0],[0.35,1.2,1.55],[0,0,0],[0.35,1.15,1.35],
  [0.35,1.2,1.6],[0.35,1.25,2.0]
];
function gunPart(group, geo, color, x, y, z, emissive) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, emissive: emissive || 0x000000 }));
  m.position.set(x, y, z);
  group.add(m);
  return m;
}
// ============ VOXEL KIT (chunky pixel-art characters from unit boxes) ============
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function std(color, emissive, ei) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, emissive: emissive || 0x000000, emissiveIntensity: ei === undefined ? 1 : ei });
}
function glo(color) { return new THREE.MeshBasicMaterial({ color }); }
function vx(parent, mat, sx, sy, sz, x, y, z, shadow) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  if (shadow) m.castShadow = true;
  parent.add(m);
  return m;
}
// Skull face: pale cube + sunk dark sockets + glowing eyes + jaw + teeth gap.
function skullHead(g, y, s, glowColor, boneColor, ghost) {
  const bone = boneColor === undefined ? 0xd8d4c4 : boneColor;
  const bm = ghost
    ? new THREE.MeshStandardMaterial({ color: bone, roughness: 1, transparent: true, opacity: 0.2 })
    : std(bone);
  const head = vx(g, bm, s, s * 0.9, s * 0.85, 0, y, 0.02, true);
  const sockM = glo(0x0a0a0c);
  vx(g, sockM, s * 0.2, s * 0.22, 0.06, -s * 0.18, y + 0.05, s * 0.4);
  vx(g, sockM, s * 0.2, s * 0.22, 0.06, s * 0.18, y + 0.05, s * 0.4);
  const eyeM = glo(glowColor);
  vx(g, eyeM, s * 0.09, s * 0.09, 0.04, -s * 0.18, y + 0.05, s * 0.45);
  vx(g, eyeM, s * 0.09, s * 0.09, 0.04, s * 0.18, y + 0.05, s * 0.45);
  vx(g, bm, s * 0.55, s * 0.2, s * 0.6, 0, y - s * 0.55, 0.05);
  vx(g, sockM, s * 0.4, s * 0.07, 0.05, 0, y - s * 0.52, s * 0.32);
  return { head, boneMat: bm };
}
// Ribcage torso: cloth block + pale ribs + glowing chest wound.
function ribTorso(g, y, w, h, clothColor, boneColor) {
  const cloth = std(clothColor);
  vx(g, cloth, w, h, w * 0.62, 0, y, 0, true);
  const bone = std(boneColor === undefined ? 0xcfc9b8 : boneColor);
  for (let r = -1; r <= 1; r++) {
    vx(g, bone, w * 0.72, 0.07, 0.06, 0, y + r * 0.18, w * 0.32);
  }
  vx(g, glo(0xff2222), 0.14, 0.14, 0.05, w * 0.18, y + 0.1, w * 0.33);
  return { cloth, bone };
}
// Reaching arms (forward zombie shamble) + boney legs. Returns [armL, armR, legL, legR].
function shambleLimbs(g, y, spread, clothColor, boneColor) {
  const armMat = std(clothColor);
  const a1 = vx(g, armMat, 0.18, 0.18, 0.7, -spread, y, 0.4);
  const a2 = vx(g, armMat, 0.18, 0.18, 0.7, spread, y, 0.4);
  const handM = std(boneColor === undefined ? 0xcfc9b8 : boneColor);
  vx(g, handM, 0.18, 0.14, 0.22, -spread, y - 0.05, 0.8);
  vx(g, handM, 0.18, 0.14, 0.22, spread, y - 0.05, 0.8);
  const legM = std(clothColor);
  const l1 = vx(g, legM, 0.2, 0.5, 0.26, -0.17, 0.25, 0);
  const l2 = vx(g, legM, 0.2, 0.5, 0.26, 0.17, 0.25, 0);
  return [a1, a2, l1, l2];
}
function buildGunMesh(i) {
  const g = new THREE.Group();
  const dark = 0x222222;
  if (i === 0) { // pistol
    gunPart(g, new THREE.BoxGeometry(0.14,0.16,0.7), dark, 0.35,1.15,0.6);
    gunPart(g, new THREE.BoxGeometry(0.12,0.22,0.16), 0x444444, 0.35,1.02,0.4);
  } else if (i === 1) { // rifle: long body + mag + stock
    gunPart(g, new THREE.BoxGeometry(0.12,0.14,1.3), dark, 0.35,1.15,0.75);
    gunPart(g, new THREE.BoxGeometry(0.1,0.25,0.14), 0x555555, 0.35,1.0,0.6);
    gunPart(g, new THREE.BoxGeometry(0.14,0.2,0.3), 0x5a3a22, 0.35,1.12,0.15);
  } else if (i === 2) { // shotgun: twin barrels + wooden pump
    const b1 = gunPart(g, new THREE.CylinderGeometry(0.06,0.06,1.1,8), dark, 0.3,1.18,0.7);
    const b2 = gunPart(g, new THREE.CylinderGeometry(0.06,0.06,1.1,8), dark, 0.4,1.18,0.7);
    b1.rotation.x = b2.rotation.x = Math.PI / 2;
    gunPart(g, new THREE.BoxGeometry(0.2,0.14,0.4), 0x6a4422, 0.35,1.08,0.55);
  } else if (i === 3) { // smg + suppressor
    gunPart(g, new THREE.BoxGeometry(0.14,0.16,0.7), dark, 0.35,1.15,0.5);
    const s = gunPart(g, new THREE.CylinderGeometry(0.06,0.06,0.4,8), 0x111111, 0.35,1.15,1.0);
    s.rotation.x = Math.PI / 2;
    gunPart(g, new THREE.BoxGeometry(0.1,0.28,0.12), 0x444444, 0.35,0.98,0.45);
  } else if (i === 4) { // sniper: long barrel + scope
    const b = gunPart(g, new THREE.CylinderGeometry(0.045,0.045,1.7,8), dark, 0.35,1.18,0.9);
    b.rotation.x = Math.PI / 2;
    const sc = gunPart(g, new THREE.CylinderGeometry(0.07,0.07,0.3,8), 0x111111, 0.35,1.32,0.45);
    sc.rotation.x = Math.PI / 2;
    gunPart(g, new THREE.BoxGeometry(0.13,0.16,0.6), 0x3a5a2a, 0.35,1.1,0.35);
  } else if (i === 5) { // minigun: triple barrels + motor box
    for (let k = -1; k <= 1; k++) {
      const b = gunPart(g, new THREE.CylinderGeometry(0.045,0.045,1.0,6), 0x333333, 0.35 + k * 0.09, 1.15, 0.7);
      b.rotation.x = Math.PI / 2;
    }
    gunPart(g, new THREE.BoxGeometry(0.34,0.24,0.5), 0x225522, 0.35,1.12,0.25);
  } else if (i === 6) { // grenade in hand
    gunPart(g, new THREE.SphereGeometry(0.16, 10, 10), 0x2a7a2a, 0.35,1.05,0.45);
    gunPart(g, new THREE.BoxGeometry(0.06,0.08,0.06), 0x888888, 0.35,1.2,0.45);
  } else if (i === 7) { // rocket tube + warhead tip
    const t = gunPart(g, new THREE.CylinderGeometry(0.16,0.18,1.3,10), 0x446644, 0.35,1.2,0.6);
    t.rotation.x = Math.PI / 2;
    const r = gunPart(g, new THREE.CylinderGeometry(0.19,0.19,0.15,10), dark, 0.35,1.2,0.1);
    r.rotation.x = Math.PI / 2;
    gunPart(g, new THREE.SphereGeometry(0.09,8,8), 0xff3333, 0.35,1.2,1.28);
  } else if (i === 8) { // mine layer: box + red arming light
    gunPart(g, new THREE.BoxGeometry(0.3,0.14,0.3), 0x555555, 0.35,1.0,0.45);
    gunPart(g, new THREE.SphereGeometry(0.06,8,8), 0xff2222, 0.35,1.1,0.45, 0xff2222);
  } else if (i === 9) { // plasma: twin coils + violet tips
    for (let k = -1; k <= 1; k += 2) {
      const b = gunPart(g, new THREE.CylinderGeometry(0.05,0.05,1.1,8), 0x331144, 0.35 + k * 0.1, 1.15, 0.7);
      b.rotation.x = Math.PI / 2;
      gunPart(g, new THREE.SphereGeometry(0.06,8,8), 0xcc66ff, 0.35 + k * 0.1, 1.15, 1.28, 0xcc66ff);
    }
    gunPart(g, new THREE.BoxGeometry(0.3,0.2,0.5), 0x221122, 0.35,1.1,0.25);
  } else if (i === 10) { // bane: wide triple cannon + skull bell
    for (let k = -1; k <= 1; k++) {
      const b = gunPart(g, new THREE.CylinderGeometry(0.06,0.06,1.2,8), 0x441144, 0.35 + k * 0.12, 1.15, 0.75);
      b.rotation.x = Math.PI / 2;
    }
    gunPart(g, new THREE.SphereGeometry(0.12,8,8), 0xff00ff, 0.35,1.32,0.4, 0xff00ff);
  } else { // railgun: long twin rails + cyan coils, shoots through walls
    for (let k = -1; k <= 1; k += 2) {
      const b = gunPart(g, new THREE.CylinderGeometry(0.04,0.04,1.9,6), 0x224444, 0.35 + k * 0.1, 1.18, 0.9);
      b.rotation.x = Math.PI / 2;
      gunPart(g, new THREE.SphereGeometry(0.055,8,8), 0x66ffff, 0.35 + k * 0.1, 1.18, 1.5, 0x66ffff);
      gunPart(g, new THREE.SphereGeometry(0.055,8,8), 0x66ffff, 0.35 + k * 0.1, 1.18, 1.0, 0x66ffff);
    }
    gunPart(g, new THREE.BoxGeometry(0.26,0.2,0.5), 0x113333, 0.35,1.1,0.2);
  }
  return g;
}
// ============ PLAYER ============
function createPlayer() {
  clearPlayers();
  if (isNet()) {
    for (const m of NET.peers) {
      const p = makePlayer(m.slot, m.name);
      p.ars = newArsenal(); // co-op: personal unlocks, levels and ammo
      players[m.slot] = p;
    }
  } else {
    players = [makePlayer(0, 'You')];
  }
  player = players[isNet() ? NET.slot : 0] || null;
  for (const p of players) if (p) p.tag.visible = isNet();
}

// ============ ZOMBIES ============
const zombieGreens = [0x3a7a2a, 0x4a8a2a, 0x2a6a3a, 0x5a7a1a];
function spawnZombie(forceType, atPos) {
  const cfg = MAPS[G.mapKey];
  const round = G.round;
  const type = forceType || pickZombieType();
  const teamN = Math.max(1, players.filter((p) => p).length);
  const DF = DG();
  let hp = Math.round((55 + round * 20) * cfg.hpMult * (1 + 0.35 * (teamN - 1)) * DF.hpM);
  let speed = Math.min(6.2, ((1.7 + round * 0.28) * cfg.speedMult + Math.random() * 0.6) * DF.spdM);
  let damage = Math.round((7 + round * 1.8) * DF.dmgM);
  let scoreMult = 1;
  if (type === 'spitter') { hp = Math.round(hp * 0.8); speed *= 0.8; scoreMult = 1.3; }
  else if (type === 'bomber') { hp = Math.round(hp * 0.7); speed = Math.min(7, speed * 1.5); scoreMult = 1.5; }
  else if (type === 'speeder') { hp = Math.round(hp * 0.4); speed = Math.min(8, speed * 2.1); damage = Math.round(5 + round); scoreMult = 1.2; }
  else if (type === 'dasher') { hp = Math.round(hp * 0.6); speed *= 1.1; scoreMult = 1.3; }
  else if (type === 'leaper') { hp = Math.round(hp * 0.9); speed *= 0.9; scoreMult = 1.4; }
  else if (type === 'splitter') { hp = Math.round(hp * 1.2); speed *= 0.7; scoreMult = 1.6; }
  else if (type === 'mender') { hp = Math.round(hp * 0.6); speed *= 0.75; scoreMult = 1.8; }
  else if (type === 'shade') { hp = Math.round(hp * 0.7); speed = Math.min(7.5, speed * 1.25); scoreMult = 1.5; }

  const g = new THREE.Group();
  let bodyMat, baseColor, core = null;
  let armL = null, armR = null; // tagged for the attack swing
  let legL = null, legR = null; // walk-cycle steppers
  let headMat = null; // shade fade needs the head material too
  let dashCd = 2 + Math.random(), dashT = 0;
  let leapCd = 2 + Math.random() * 2, leapT = 0, leapDur = 0.55, leaping = false;
  let leapFrom = null, leapTo = null;
  let healCd = 2;
  if (type === 'spitter') {
    // purple spitter: crystal growths, long arms, a live glob throbbing in hand
    const rt = ribTorso(g, 1.0, 0.7, 0.65, 0x7a2a9a, 0x9a4aaa);
    bodyMat = rt.cloth;
    baseColor = new THREE.Color(0x7a2a9a);
    const sk = skullHead(g, 1.62, 0.42, 0xccff33, 0x9a4aaa);
    headMat = sk.boneMat;
    for (const s of [-1, 1]) { // crystal shoulder growths
      for (let k = 0; k < 2; k++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 5), std(0x5a2a6a));
        shard.position.set(s * (0.42 + k * 0.1), 1.35 + k * 0.25, -0.05);
        shard.rotation.z = s * -0.5;
        g.add(shard);
      }
    }
    vx(g, glo(0x66ff22), 0.22, 0.14, 0.1, 0, 1.32, 0.3); // dripping maw
    vx(g, glo(0x226622), 0.16, 0.06, 0.06, 0, 1.22, 0.31);
    const armMat = std(0x7a2a9a); // long dangling arms
    const a1 = vx(g, armMat, 0.15, 0.15, 0.85, -0.42, 0.95, 0.45);
    const a2 = vx(g, armMat, 0.15, 0.15, 0.85, 0.42, 0.95, 0.45);
    vx(g, std(0x9a4aaa), 0.14, 0.12, 0.2, -0.42, 0.88, 0.9);
    vx(g, std(0x9a4aaa), 0.14, 0.12, 0.2, 0.42, 0.88, 0.9);
    armL = a1; armR = a2;
    core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), // live glob in right hand
      new THREE.MeshBasicMaterial({ color: 0x99ff33 }));
    core.position.set(0.42, 0.82, 0.95);
    g.add(core);
    legL = vx(g, std(0x7a2a9a), 0.2, 0.5, 0.26, -0.17, 0.25, 0);
    legR = vx(g, std(0x7a2a9a), 0.2, 0.5, 0.26, 0.17, 0.25, 0);
    vx(g, std(0x3a1a4a), 0.12, 0.5, 0.04, -0.2, 0.45, 0.28);
    vx(g, std(0x3a1a4a), 0.12, 0.5, 0.04, 0.2, 0.45, 0.28);
  } else if (type === 'bomber') {
    // fat orange bomber: cracked gut glowing from inside, tiny skull, stub limbs
    bodyMat = std(0xcc5510);
    baseColor = new THREE.Color(0xcc5510);
    const gut = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12), bodyMat);
    gut.position.y = 0.85; gut.castShadow = true;
    g.add(gut);
    for (let cr = 0; cr < 4; cr++) { // molten cracks
      const crack = vx(g, glo(0xff3300), 0.07, 0.3 + (cr % 2) * 0.15, 0.05,
        -0.3 + cr * 0.2, 0.7 + (cr % 3) * 0.15, 0.55 - Math.abs(cr - 1.5) * 0.08);
      crack.rotation.z = (cr - 1.5) * 0.3;
    }
    const sk = skullHead(g, 1.62, 0.36, 0xff6600, 0x883300);
    headMat = sk.boneMat;
    core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    core.position.set(0, 0.95, 0.55);
    g.add(core);
    const armMat = std(0xcc5510);
    const a1 = vx(g, armMat, 0.24, 0.24, 0.55, -0.62, 0.95, 0.3);
    const a2 = vx(g, armMat, 0.24, 0.24, 0.55, 0.62, 0.95, 0.3);
    armL = a1; armR = a2;
    legL = vx(g, std(0x552200), 0.24, 0.45, 0.3, -0.3, 0.22, 0);
    legR = vx(g, std(0x552200), 0.24, 0.45, 0.3, 0.3, 0.22, 0);
  } else if (type === 'speeder') {
    // tiny yellow knuckle-walker: hunched low, long arms dragging, darting head
    const rt = ribTorso(g, 0.62, 0.5, 0.5, 0xaacc22, 0xccdd44);
    bodyMat = rt.cloth;
    baseColor = new THREE.Color(0xaacc22);
    const sk = skullHead(g, 1.0, 0.32, 0xff0000, 0xccdd44);
    headMat = sk.boneMat;
    const armMat = std(0xaacc22); // knuckles nearly scrape the floor
    const a1 = vx(g, armMat, 0.13, 0.13, 0.62, -0.3, 0.42, 0.3);
    const a2 = vx(g, armMat, 0.13, 0.13, 0.62, 0.3, 0.42, 0.3);
    vx(g, std(0xccdd44), 0.13, 0.1, 0.16, -0.3, 0.32, 0.6);
    vx(g, std(0xccdd44), 0.13, 0.1, 0.16, 0.3, 0.32, 0.6);
    armL = a1; armR = a2;
    legL = vx(g, std(0x8a9a1a), 0.16, 0.4, 0.2, -0.13, 0.2, -0.05);
    legR = vx(g, std(0x8a9a1a), 0.16, 0.4, 0.2, 0.13, 0.2, -0.05);
  } else if (type === 'dasher') {
    // lean orange sprinter: hunched runner's crouch, headband, arms mid-pump
    const rt = ribTorso(g, 0.9, 0.58, 0.66, 0xcc6622, 0xdd8833);
    bodyMat = rt.cloth;
    baseColor = new THREE.Color(0xcc6622);
    const sk = skullHead(g, 1.52, 0.38, 0xffff00, 0xdd8833);
    headMat = sk.boneMat;
    vx(g, std(0x552200), 0.42, 0.09, 0.38, 0, 1.64, 0.02); // sweatband
    const armMat = std(0xcc6622); // frozen mid-pump: left forward, right back
    const a1 = vx(g, armMat, 0.16, 0.16, 0.62, -0.34, 1.0, 0.45);
    a1.rotation.x = -0.5; a1.userData.rx = -0.5;
    const a2 = vx(g, armMat, 0.16, 0.16, 0.62, 0.34, 0.95, -0.15);
    a2.rotation.x = 0.5; a2.userData.rx = 0.5;
    vx(g, std(0xdd8833), 0.15, 0.12, 0.18, -0.34, 0.92, 0.74);
    vx(g, std(0xdd8833), 0.15, 0.12, 0.18, 0.34, 0.9, -0.42);
    armL = a1; armR = a2;
    legL = vx(g, std(0xcc6622), 0.18, 0.5, 0.24, -0.16, 0.25, 0.12);
    legR = vx(g, std(0xcc6622), 0.18, 0.5, 0.24, 0.16, 0.25, -0.12);
  } else if (type === 'leaper') {
    // squat teal leaper: skull, springy haunches, pounces clean over cover
    bodyMat = std(0x2a9a8a);
    baseColor = new THREE.Color(0x2a9a8a);
    vx(g, bodyMat, 0.8, 0.6, 0.6, 0, 0.62, 0, true);
    const sk = skullHead(g, 1.2, 0.4, 0xff0000, 0x3abbaa);
    headMat = sk.boneMat;
    vx(g, std(0x1a6a5a), 0.3, 0.55, 0.34, -0.28, 0.28, 0); // haunches
    vx(g, std(0x1a6a5a), 0.3, 0.55, 0.34, 0.28, 0.28, 0);
    for (let s = -1; s <= 1; s++) { // dorsal spikes down the back
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 5), std(0x1a6a5a));
      spike.position.set(s * 0.2, 1.05 - Math.abs(s) * 0.1, -0.32);
      spike.rotation.x = -0.5;
      g.add(spike);
    }
    legL = vx(g, std(0x1a6a5a), 0.2, 0.4, 0.24, -0.28, 0.12, 0.15);
    legR = vx(g, std(0x1a6a5a), 0.2, 0.4, 0.24, 0.28, 0.12, 0.15);
    const armMat = std(0x2a9a8a);
    const a1 = vx(g, armMat, 0.18, 0.18, 0.6, -0.45, 0.95, 0.35);
    const a2 = vx(g, armMat, 0.18, 0.18, 0.6, 0.45, 0.95, 0.35);
    armL = a1; armR = a2;
  } else if (type === 'splitter') {
    // wobbling pale splitter: skull-capped sac, pops into two speeders
    bodyMat = std(0x9acc66);
    baseColor = new THREE.Color(0x9acc66);
    const gut = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12), bodyMat);
    gut.position.y = 0.8; gut.castShadow = true;
    g.add(gut);
    for (let vn = 0; vn < 5; vn++) { // pulsing red veins over the sac
      const vein = vx(g, glo(0xcc2222), 0.06, 0.7 + (vn % 2) * 0.25, 0.05,
        -0.4 + vn * 0.2, 0.85, 0.5 - Math.abs(vn - 2) * 0.09);
      vein.rotation.z = (vn - 2) * 0.18;
    }
    const sk = skullHead(g, 1.62, 0.38, 0x336622, 0xbbdd88);
    headMat = sk.boneMat;
    core = vx(g, glo(0xddff88), 0.2, 0.2, 0.12, 0, 0.85, 0.55);
    const armMat = std(0x9acc66);
    const a1 = vx(g, armMat, 0.2, 0.2, 0.45, -0.6, 0.9, 0.25);
    const a2 = vx(g, armMat, 0.2, 0.2, 0.45, 0.6, 0.9, 0.25);
    armL = a1; armR = a2;
  } else if (type === 'mender') {
    // white mender: skull + red cross + green halo, patches up its pack
    const rt = ribTorso(g, 0.95, 0.7, 0.65, 0xddddcc, 0xeeeedd);
    bodyMat = rt.cloth;
    baseColor = new THREE.Color(0xddddcc);
    const sk = skullHead(g, 1.62, 0.4, 0x66ff99, 0xeeeedd);
    headMat = sk.boneMat;
    vx(g, glo(0xff3333), 0.3, 0.1, 0.05, 0, 1.05, 0.24);
    vx(g, glo(0xff3333), 0.1, 0.3, 0.05, 0, 1.05, 0.24);
    vx(g, std(0x6a2a2a), 0.4, 0.55, 0.25, 0, 1.0, -0.32); // medic backpack
    vx(g, std(0x4a1a1a), 0.42, 0.12, 0.27, 0, 1.2, -0.32);
    vx(g, glo(0xff3333), 0.22, 0.08, 0.04, 0, 1.35, -0.44); // cross on the back
    vx(g, glo(0xff3333), 0.08, 0.22, 0.04, 0, 1.35, -0.44);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x66ff99 }));
    halo.position.set(0, 2.1, 0);
    g.add(halo);
    const limbs = shambleLimbs(g, 1.0, 0.4, 0xddddcc, 0xeeeedd);
    armL = limbs[0]; armR = limbs[1]; legL = limbs[2]; legR = limbs[3];
  } else if (type === 'shade') {
    // near-invisible shade: skull + tatters that only solidify up close
    const ghostCloth = new THREE.MeshStandardMaterial({ color: 0x3a3a55, roughness: 0.9, transparent: true, opacity: 0.2 });
    bodyMat = ghostCloth;
    baseColor = new THREE.Color(0x3a3a55);
    vx(g, ghostCloth, 0.7, 0.7, 0.45, 0, 1.0, 0, true);
    const sk = skullHead(g, 1.62, 0.42, 0xff00ff, 0x4a4a66, true);
    headMat = sk.boneMat;
    for (let s = -2; s <= 2; s++) { // ragged veil strips
      const strip = vx(g, ghostCloth, 0.16, 0.85, 0.05, s * 0.22, 0.55, 0.26 + (s % 2) * 0.05);
      strip.rotation.x = 0.1;
    }
    const limbs = shambleLimbs(g, 1.0, 0.4, 0x3a3a55, 0x4a4a66);
    armL = limbs[0]; armR = limbs[1]; legL = limbs[2]; legR = limbs[3];
    // shamble limbs use opaque mats — swap this shade's to the ghost cloth
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial && !o.material.transparent) {
        o.material = ghostCloth;
      }
    });
  } else {
    // classic green ghoul: skull, exposed ribs, tattered shirt strips
    const c = zombieGreens[Math.floor(Math.random() * zombieGreens.length)];
    const rt = ribTorso(g, 1.05, 0.8, 0.7, c);
    bodyMat = rt.cloth;
    baseColor = new THREE.Color(c);
    const sk = skullHead(g, 1.72, 0.46, 0xff2222);
    headMat = sk.boneMat;
    const shirtM = std(0x2a3138); // torn shirt hanging off the shoulders
    vx(g, shirtM, 0.9, 0.3, 0.6, 0, 1.32, 0);
    for (const s of [-1, 0, 1]) {
      const strip = vx(g, shirtM, 0.16, 0.5, 0.04, s * 0.24, 0.85, 0.31);
      strip.rotation.x = 0.08;
    }
    const limbs = shambleLimbs(g, 1.12, 0.48, c);
    armL = limbs[0]; armR = limbs[1]; legL = limbs[2]; legR = limbs[3];
    vx(g, std(0x1a2a1a), 0.12, 0.55, 0.04, -0.22, 0.42, 0.26);
    vx(g, std(0x1a2a1a), 0.12, 0.55, 0.04, 0.22, 0.42, 0.26);
  }
  // hp bar (billboard)
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.13), new THREE.MeshBasicMaterial({ color: 0x330000, depthTest: false }));
  bg.position.y = 2.45;
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.13), new THREE.MeshBasicMaterial({ color: 0x33ff33, depthTest: false }));
  fg.position.set(0, 2.45, 0.01);
  g.add(bg, fg);

  // spawn at gate (or at a given point, for summoned minions)
  const sx = atPos ? atPos.x + (Math.random() - 0.5) * 2 : gatePos.x + (Math.random() - 0.5) * 4;
  const sz = atPos ? atPos.z + (Math.random() - 0.5) * 2 : gatePos.z + 1;
  g.position.set(sx, 0, sz);
  g.rotation.y = Math.PI; // facing player (+z)
  scene.add(g);
  zombies.push({
    group: g, bodyMat, baseColor, headMat, armL, armR, legL, legR,
    hp, maxHp: hp, speed, damage, attackCd: 0,
    hpBg: bg, hpFg: fg, radius: 0.65, flash: 0,
    wob: Math.random() * Math.PI * 2, isBoss: false,
    type, scoreMult, spitCd: 1.5 + Math.random() * 1.5, core, id: ++ZID,
    dashCd, dashT, leapCd, leapT, leapDur, leaping, leapFrom, leapTo, healCd
  });
  // gate pulse
  if (gateGlow) gateGlow.intensity = 5;
}

// Big-boy kit: skeletal legs + feet, war belt with gold buckle, loin strips.
function bossLegs(g, boneColor) {
  const bone = std(boneColor);
  const l1 = vx(g, bone, 0.34, 0.9, 0.4, -0.28, 0.45, 0, true);
  const l2 = vx(g, bone, 0.34, 0.9, 0.4, 0.28, 0.45, 0, true);
  vx(g, bone, 0.36, 0.16, 0.52, -0.28, 0.08, 0.05);
  vx(g, bone, 0.36, 0.16, 0.52, 0.28, 0.08, 0.05);
  vx(g, std(0x4a3222), 1.15, 0.22, 0.8, 0, 1.0, 0);
  vx(g, glo(0xffdd66), 0.2, 0.16, 0.06, 0, 1.0, 0.42);
  for (let s = -1; s <= 1; s++) {
    const strip = vx(g, std(0x5a1a1a), 0.2, 0.7, 0.05, s * 0.26, 0.6, 0.44);
    strip.rotation.x = 0.1;
  }
  return [l1, l2];
}
// Spiked war-crown.
function bossCrown(g, y, color) {
  vx(g, std(color), 0.72, 0.16, 0.72, 0, y, 0);
  for (let s = -2; s <= 2; s++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42 + (s === 0 ? 0.2 : 0), 5), std(color));
    spike.position.set(s * 0.22, y + 0.28, 0);
    g.add(spike);
  }
}
// Tattered war-cape: back panel + strips.
function bossCape(g, y0, color) {
  const cm = std(color);
  const panel = vx(g, cm, 1.35, 1.7, 0.08, 0, y0, -0.58);
  panel.rotation.x = -0.08;
  for (let s = -2; s <= 2; s++) {
    const strip = vx(g, cm, 0.2, 0.95, 0.05, s * 0.27, y0 - 1.15, -0.64);
    strip.rotation.x = 0.12;
  }
}
// Wide battle ribs across a torso front.
function bossRibs(g, y, w, zoff, boneColor) {
  const bone = std(boneColor);
  for (let r = -1; r <= 1; r++) vx(g, bone, w, 0.13, 0.1, 0, y + r * 0.32, zoff);
  return bone;
}

// Boss: a new kind every 10th round (BRUTE → SPITTER → BLINK → WRAITH →
// SUMMONER), then combos. Slow, huge HP, hits like a truck.
function spawnBoss(kind) {
  kind = (kind === undefined) ? 0 : kind;
  const cfg = MAPS[G.mapKey];
  const round = G.round;
  const teamN = Math.max(1, players.filter((p) => p).length);
  const base = (55 + round * 20) * cfg.hpMult * (1 + 0.35 * (teamN - 1)) * DG().hpM;
  const spdM = DG().spdM;
  let hp, speed, damage;

  const g = new THREE.Group();
  let bodyMat, baseColor, bodyMesh;
  let armL = null, armR = null; // tagged for the attack swing
  let legL = null, legR = null; // walk-cycle steppers
  const eye = (color) => new THREE.MeshBasicMaterial({ color });
  if (kind === 1) {
    // SPITTER: crystalline horror — shard shoulders, long claws, ember heart
    hp = Math.round(base * (4 + round * 0.4));
    speed = Math.min(3.2, (2.1 + round * 0.05) * spdM);
    damage = zdmg(16 + round * 1.5);
    const legs1 = bossLegs(g, 0x4a2a4e); legL = legs1[0]; legR = legs1[1];
    bodyMat = std(0x5a2a6a);
    baseColor = new THREE.Color(0x5a2a6a);
    bodyMesh = vx(g, bodyMat, 1.35, 1.05, 0.9, 0, 1.6, 0, true);
    bossRibs(g, 1.6, 1.0, 0.47, 0x9a6aba);
    skullHead(g, 2.6, 0.56, 0xcc66ff, 0x8a5a9a);
    for (const s of [-1, 1]) { // horns
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), std(0x8a5a9a));
      horn.position.set(s * 0.34, 2.95, 0); horn.rotation.z = s * -0.4;
      g.add(horn);
    }
    for (const s of [-1, 1]) { // great crystal shoulder shards
      for (let k = 0; k < 3; k++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.75 + k * 0.15, 5), std(0x6a3a7a));
        shard.position.set(s * (0.9 + k * 0.14), 2.15 + k * 0.3, -0.1);
        shard.rotation.z = s * -(0.5 + k * 0.2);
        g.add(shard);
      }
    }
    vx(g, glo(0x66ff22), 0.44, 0.24, 0.12, 0, 2.26, 0.48); // great maw
    for (let f = -2; f <= 2; f++) {
      vx(g, std(0xd8cfd8), 0.06, 0.14, 0.06, f * 0.09, 2.12, 0.52); // fangs
    }
    vx(g, glo(0xff4422), 0.26, 0.26, 0.1, 0, 1.68, 0.48); // ember heart
    const armMat1 = std(0x5a2a6a);
    const a1 = vx(g, armMat1, 0.3, 0.3, 1.3, -0.85, 1.55, 0.7);
    const a2 = vx(g, armMat1, 0.3, 0.3, 1.3, 0.85, 1.55, 0.7);
    for (const s of [-1, 1]) for (let cl = -1; cl <= 1; cl++) {
      const claw = vx(g, std(0x8a5a9a), 0.07, 0.07, 0.4, s * 0.85 + cl * 0.09, 1.45, 1.5);
      claw.rotation.x = 0.25;
    }
    armL = a1; armR = a2;
    for (let s = -2; s <= 2; s++) { // tattered skirt
      const strip = vx(g, std(0x3a1a3e), 0.22, 0.85, 0.05, s * 0.27, 0.75, 0.5);
      strip.rotation.x = 0.1;
    }
  } else if (kind === 2) {
    // BLINK: sleek teal duelist — head crest, blade arms, layered skirt
    hp = Math.round(base * (4 + round * 0.4));
    speed = Math.min(3.8, (2.6 + round * 0.05) * spdM);
    damage = zdmg(18 + round * 2);
    const legs2 = bossLegs(g, 0x1e4a52); legL = legs2[0]; legR = legs2[1];
    bodyMat = std(0x16606a);
    baseColor = new THREE.Color(0x16606a);
    bodyMesh = vx(g, bodyMat, 1.25, 1.05, 0.85, 0, 1.6, 0, true);
    bossRibs(g, 1.6, 0.95, 0.45, 0x4abaac);
    skullHead(g, 2.6, 0.54, 0x66ffee, 0x2a8a84);
    const crest = vx(g, std(0x3abbaa), 0.1, 0.7, 0.75, 0, 3.0, -0.15); // head fin
    crest.rotation.x = -0.35;
    for (const s of [-1, 1]) { // shoulder fins
      const fin = vx(g, std(0x2a8a84), 0.5, 0.4, 0.1, s * 0.85, 2.25, -0.1);
      fin.rotation.z = s * 0.5;
    }
    vx(g, glo(0x66eeff), 0.1, 0.7, 0.06, -0.25, 1.6, 0.45); // runes
    vx(g, glo(0x66eeff), 0.1, 0.7, 0.06, 0.25, 1.6, 0.45);
    const armMat2 = std(0x16606a);
    const b1 = vx(g, armMat2, 0.3, 0.3, 1.0, -0.8, 1.6, 0.6);
    const b2 = vx(g, armMat2, 0.3, 0.3, 1.0, 0.8, 1.6, 0.6);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0x9adacc, roughness: 0.3, metalness: 0.6, flatShading: true });
    const bl1 = vx(g, bladeM, 0.1, 0.24, 0.85, -0.8, 1.5, 1.35); // forearm blades
    const bl2 = vx(g, bladeM, 0.1, 0.24, 0.85, 0.8, 1.5, 1.35);
    armL = b1; armR = b2;
    for (let s = -2; s <= 2; s++) { // layered skirt flaps
      const flap = vx(g, std(0x14424e), 0.24, 0.8, 0.06, s * 0.27, 0.8, 0.48);
      flap.rotation.x = 0.1;
    }
    const sh3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshStandardMaterial({ color: 0x33aaff, roughness: 0.3, emissive: 0x22aabb, emissiveIntensity: 0.8, flatShading: true }));
    sh3.position.set(0, 2.2, -0.62); g.add(sh3); // single back crystal
  } else if (kind === 3) {
    // WRAITH: veiled phaser — hood, spiked shoulders, ragged shroud, pale rune
    hp = Math.round(base * (3.5 + round * 0.35));
    speed = Math.min(3.2, (2.0 + round * 0.05) * spdM);
    damage = zdmg(15 + round * 1.5);
    const wm = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true, transparent: true, opacity: 0.92 });
    const legs3 = bossLegs(g, 0x555566); legL = legs3[0]; legR = legs3[1];
    // legs built opaque — veil them to match the shroud
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
        o.material.transparent = true; o.material.opacity = 0.92;
      }
    });
    bodyMat = wm(0x555566);
    baseColor = new THREE.Color(0x555566);
    bodyMesh = vx(g, bodyMat, 1.2, 1.2, 0.8, 0, 1.65, 0, true);
    bossRibs(g, 1.65, 0.95, 0.42, 0x777788);
    g.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial && o.material.opacity === 1) {
        o.material.transparent = true; o.material.opacity = 0.92;
      }
    });
    skullHead(g, 2.68, 0.56, 0xffffff, 0x888899);
    const hood3 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.15, 4), wm(0x444455));
    hood3.position.y = 3.0; hood3.rotation.y = Math.PI / 4; g.add(hood3);
    for (const s of [-1, 1]) { // spiked shoulder shards
      for (let k = 0; k < 2; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 4), wm(0x3f3f4f));
        spike.position.set(s * (0.8 + k * 0.14), 2.3 + k * 0.28, -0.05);
        spike.rotation.z = s * -0.55;
        g.add(spike);
      }
    }
    vx(g, glo(0xbfe8ff), 0.12, 0.3, 0.06, 0, 1.7, 0.43); // pale chest rune
    for (let s = -2; s <= 2; s++) { // ragged shroud strips
      const strip = vx(g, wm(0x3f3f4f), 0.22, 1.0, 0.06, s * 0.28, 0.9, -0.5);
      strip.rotation.x = 0.1;
    }
    const armMat3 = wm(0x555566);
    const c1 = vx(g, armMat3, 0.36, 0.36, 1.4, -0.9, 1.65, 0.8);
    const c2 = vx(g, armMat3, 0.36, 0.36, 1.4, 0.9, 1.65, 0.8);
    vx(g, wm(0x777788), 0.3, 0.26, 0.34, -0.9, 1.55, 1.55);
    vx(g, wm(0x777788), 0.3, 0.26, 0.34, 0.9, 1.55, 1.55);
    armL = c1; armR = c2;
  } else if (kind === 4) {
    // SUMMONER: masked caller — bone mask, feathered mantle, skull-topped staff
    hp = Math.round(base * (4.5 + round * 0.45));
    speed = Math.min(3.0, (2.0 + round * 0.05) * spdM);
    damage = zdmg(14 + round * 1.5);
    const legs4 = bossLegs(g, 0x8a6a3a); legL = legs4[0]; legR = legs4[1];
    bodyMat = std(0x6a4a1a);
    baseColor = new THREE.Color(0x6a4a1a);
    bodyMesh = vx(g, bodyMat, 1.5, 1.1, 1.0, 0, 1.6, 0, true);
    bossRibs(g, 1.6, 1.15, 0.52, 0xaa8a4a);
    const sk4 = skullHead(g, 2.66, 0.58, 0xff6600, 0xaa7a2a);
    bossCrown(g, 3.06, 0xc9a86a); // small horned crown of command
    for (const s of [-1, 1]) { // horn nubs beside the crown
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), std(0xaa7a2a));
      horn.position.set(s * 0.42, 3.0, 0); horn.rotation.z = s * -0.5;
      g.add(horn);
    }
    vx(g, std(0x3a2a1a), 0.7, 0.14, 0.66, 0, 2.62, -0.02); // bone brow-mask band
    for (const s of [-1, 1]) { // feathered mantle
      for (let f = 0; f < 3; f++) {
        const fe = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 5), std(f % 2 ? 0x8a3a2a : 0x5a4a2a));
        fe.position.set(s * (0.85 + f * 0.12), 2.35 - f * 0.3, -0.25 - f * 0.1);
        fe.rotation.z = s * -0.5;
        g.add(fe);
      }
      const pou = vx(g, std(0x4a3222), 0.24, 0.3, 0.18, s * 0.45, 1.05, 0.52);
    }
    const staffMat = std(0x3a2a1a);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.8, 8), staffMat);
    staff.position.set(1.05, 1.5, 0.3); staff.castShadow = true; g.add(staff);
    vx(g, std(0xddddcc), 0.28, 0.26, 0.25, 1.05, 3.1, 0.3); // mini skull crowning the staff
    vx(g, glo(0x0a0a0c), 0.06, 0.07, 0.04, 0.99, 3.12, 0.44);
    vx(g, glo(0x0a0a0c), 0.06, 0.07, 0.04, 1.11, 3.12, 0.44);
    vx(g, glo(0xff6600), 0.035, 0.035, 0.03, 0.99, 3.12, 0.47);
    vx(g, glo(0xff6600), 0.035, 0.035, 0.03, 1.11, 3.12, 0.47);
    const armMat4 = std(0x6a4a1a);
    const d1 = vx(g, armMat4, 0.4, 0.4, 1.35, -0.95, 1.6, 0.8);
    armL = d1;
  } else {
    // BRUTE: horned skull warlord — spiked bone pauldrons, layered war-skirt
    hp = Math.round(base * (5 + round * 0.5));
    speed = Math.min(3.4, (2.2 + round * 0.05) * spdM);
    damage = zdmg(20 + round * 2);
    const legs = bossLegs(g, 0x4a3226); legL = legs[0]; legR = legs[1];
    bodyMat = std(0x8a2323);
    baseColor = new THREE.Color(0x8a2323);
    bodyMesh = vx(g, bodyMat, 1.5, 1.1, 1.0, 0, 1.65, 0, true);
    bossRibs(g, 1.65, 1.2, 0.52, 0xd8cfb8);
    vx(g, glo(0xff2222), 0.2, 0.2, 0.06, 0.3, 1.75, 0.53);
    skullHead(g, 2.72, 0.62, 0xff2222, 0xd8cfb8);
    for (const s of [-1, 1]) { // war horns
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), std(0xd8cfb8));
      horn.position.set(s * 0.38, 3.05, 0); horn.rotation.z = s * -0.45;
      g.add(horn);
    }
    for (const s of [-1, 1]) { // spiked pauldrons
      vx(g, std(0xd8cfb8), 0.6, 0.34, 0.66, s * 1.02, 2.28, 0);
      for (let k = -1; k <= 1; k++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 5), std(0xd8cfb8));
        spike.position.set(s * 1.02 + k * 0.18, 2.62, 0);
        g.add(spike);
      }
    }
    for (let s = -2; s <= 2; s++) { // layered war-skirt
      const panel = vx(g, std(0x6a1a1a), 0.26, 0.85, 0.07, s * 0.28, 0.85, 0.52);
      panel.rotation.x = 0.08;
    }
    const armMat = std(0x6a2a22);
    const a1 = vx(g, armMat, 0.4, 0.4, 1.5, -0.98, 1.7, 0.85);
    const a2 = vx(g, armMat, 0.4, 0.4, 1.5, 0.98, 1.7, 0.85);
    const fistM = std(0x4a3226);
    vx(g, fistM, 0.34, 0.3, 0.4, -0.98, 1.55, 1.65);
    vx(g, fistM, 0.34, 0.3, 0.4, 0.98, 1.55, 1.65);
    vx(g, fistM, 0.1, 0.3, 0.12, -1.1, 1.35, 1.68);
    vx(g, fistM, 0.1, 0.3, 0.12, 1.1, 1.35, 1.68);
    armL = a1; armR = a2;
    bossCape(g, 1.9, 0x5a1420);
  }
  // wide hp bar (billboard)
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.2), new THREE.MeshBasicMaterial({ color: 0x330000, depthTest: false }));
  bg.position.y = 3.55;
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2222, depthTest: false }));
  fg.position.set(0, 3.55, 0.01);
  g.add(bg, fg);

  g.position.set(gatePos.x, 0, gatePos.z + 1);
  g.rotation.y = Math.PI;
  scene.add(g);
  zombies.push({
    group: g, bodyMat, baseColor, bodyMesh, armL, armR, legL, legR,
    hp, maxHp: hp,
    speed, damage, attackCd: 0,
    hpBg: bg, hpFg: fg, radius: 1.15, flash: 0,
    wob: 0, isBoss: true, type: 'boss', bossKind: kind,
    spitCd: 2, tpCd: 4 + Math.random() * 2, phaseCd: 7, invisible: false, sumCd: 5, id: ++ZID
  });
  if (gateGlow) gateGlow.intensity = 6;
  sfx.boss();
}

// Combined upgrade (shop or Q key, Lv15 max): every level boosts damage,
// fire rate and mag size; every 3 levels adds pierce (guns) or blast.
// Stats always recompute forward from the base values.
function refreshWeapon(w) {
  const up = w.up || 0;
  w.cooldown = +(w.base.cooldown * Math.pow(0.96, up)).toFixed(3);
  w.damage = Math.round(w.base.damage * (1 + 0.12 * up));
  if (w.kind !== 'gun') w.blast = +(w.base.blast * (1 + 0.06 * up)).toFixed(2);
  else w.pierce = w.base.pierce + Math.floor(up / 3);
  w.maxAmmo = w.base.maxAmmo === Infinity ? Infinity : Math.round(w.base.maxAmmo * (1 + 0.15 * up));
}
function upgradeNote(w) {
  const up = w.up || 0;
  const nd = Math.round(w.base.damage * (1 + 0.12 * (up + 1)));
  const nc = +(w.base.cooldown * Math.pow(0.96, up + 1)).toFixed(3);
  const extra = w.kind !== 'gun'
    ? `blast ${(+(w.base.blast * (1 + 0.06 * (up + 1)))).toFixed(2)}`
    : (((w.base.pierce + Math.floor((up + 1) / 3)) > (w.base.pierce + Math.floor(up / 3)))
      ? `pierce ${w.base.pierce + Math.floor((up + 1) / 3)} (+1!)` : `pierce ${w.base.pierce + Math.floor(up / 3)}`);
  return `Lv${up} to Lv${up + 1}: damage ${w.damage} goes to ${nd}, every ${w.cooldown}s goes to ${nc}s, ${extra}`;
}
// Kills reveal weapons in the shop — thresholds stay hidden on purpose.
// syncUnlocks is idempotent, and the shop re-syncs on every open, so a
// reveal can never be missed no matter when the kills happen.
function syncUnlocks() {
  const fresh = [];
  WEAPONS.forEach((w) => {
    if (!w.revealed && G.kills >= unlockNeed(w)) { w.revealed = true; fresh.push(w); }
  });
  return fresh;
}
function checkUnlocks() {
  const fresh = syncUnlocks();
  if (fresh.length) {
    const w = fresh[fresh.length - 1];
    sfx.unlock();
    showBanner(`🔓 ${w.name.toUpperCase()} IN SHOP!`, 2200);
    showMessage(`${w.icon} ${w.name} ready to buy — open the shop (\`)!`, 3000);
    if (isHost()) netEv({ kind: 'unlock', name: w.name, icon: w.icon });
    updateWeaponHUD();
    if (G.paused) renderShop();
  }
}

// ============ BULLETS & DROPS ============
function fireWeapon(p) {
  p = p || player;
  if (!p || !p.alive || G.state === 'gameover' || G.state === 'menu') return;
  const A = AW(p);
  const w = A[p.weaponIndex];
  if (!w) return;
  if (p.cool > 0) return;
  if (!w.unlocked) { if (p === player) switchWeapon(0); else if (isHost()) setPlayerWeapon(p, 0); return; }
  if (w.ammo <= 0) {
    if (p === player) { sfx.empty(); showMessage(`No ${w.name} ammo! Grab ◆ drops — switching to Pistol`, 1800); switchWeapon(0); }
    else if (isHost()) setPlayerWeapon(p, 0);
    return;
  }

  // grenades charge while the trigger is held and throw on release
  // (see updatePlayerOne) — nothing leaves the hand here.
  if (w.kind === 'grenade') {
    if (!p.charging) { p.charging = true; p.chargeT = 0; }
    return;
  }

  // mines are placed at the hunter's feet, not fired
  if (w.kind === 'mine') {
    if (mines.length >= 8) { if (p === player) { sfx.empty(); showMessage('Mine limit reached (8)!', 1200); } return; }
    p.cool = w.cooldown;
    w.ammo--;
    if (p === player) sfx.shoot(p.weaponIndex);
    const mg = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }));
    disc.castShadow = true;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    dot.position.y = 0.14;
    mg.add(disc, dot);
    mg.position.copy(p.group.position); mg.position.y = 0.1;
    scene.add(mg);
    mines.push({ mesh: mg, dot, life: 40, blast: w.blast, damage: w.damage, wi: p.weaponIndex, seed: Math.random() * 10 });
    updateWeaponHUD();
    return;
  }

  p.cool = w.cooldown;
  if (w.ammo !== Infinity) { w.ammo--; }
  if (p === player) sfx.shoot(p.weaponIndex);

  const dir = p.aim.clone(); dir.y = 0; dir.normalize();
  const start = p.group.position.clone().add(dir.clone().multiplyScalar(1.1));
  start.y = 1.2;
  for (let i = 0; i < w.pellets; i++) {
    const spread = w.spread;
    const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 2 * spread;
    const v = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(w.bulletSpeed);
    const geo = new THREE.SphereGeometry(w.kind === 'gun' ? (w.pellets > 1 ? 0.11 : 0.14) : 0.2, 8, 8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: w.color }));
    mesh.position.copy(start);
    scene.add(mesh);
    bullets.push({ mesh, vel: v, life: w.range / w.bulletSpeed, damage: w.damage, kind: w.kind, blast: w.blast || 0, pierce: w.pierce || 0, hit: [], boom: false, wi: p.weaponIndex, phaze: !!w.wallIgnore });
  }
  if (w.kind === 'gun' || w.kind === 'rocket') { p.flash.visible = true; p.flashT = 0.06; }
  if (p === player) {
    muzzleLight.position.copy(start); muzzleLight.intensity = 3;
    G.shake = Math.min(0.5, G.shake + (w.pellets > 2 ? 0.35 : 0.12));
  }
  updateWeaponHUD();
}

// Charged grenade throw: hold to charge (0–1.2s), release to lob in a
// parabola — longer hold flies further (6–26 units), then it blows on landing.
function throwGrenade(p, power) {
  const A = AW(p);
  const w = A[p.weaponIndex];
  if (!w || w.kind !== 'grenade' || !w.unlocked) return;
  if (p.cool > 0) return;
  if (w.ammo <= 0) {
    if (p === player) { sfx.empty(); showMessage(`No ${w.name} ammo! Grab ◆ drops — switching to Pistol`, 1800); switchWeapon(0); }
    else if (isHost()) setPlayerWeapon(p, 0);
    return;
  }
  power = Math.max(0.15, Math.min(1, power || 0.15));
  p.cool = w.cooldown;
  w.ammo--;
  if (p === player) sfx.shoot(p.weaponIndex);
  const dir = p.aim.clone(); dir.y = 0; dir.normalize();
  const start = p.group.position.clone().add(dir.clone().multiplyScalar(1.0));
  start.y = 1.2;
  const spd = 8 + 16 * power, vy0 = 7 + 4 * power;
  const v = new THREE.Vector3(dir.x * spd, 0, dir.z * spd);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshBasicMaterial({ color: w.color }));
  mesh.position.copy(start);
  scene.add(mesh);
  bullets.push({ mesh, vel: v, vy: vy0, life: 4, damage: w.damage, kind: w.kind,
    blast: w.blast || 0, pierce: 0, hit: [], boom: false, wi: p.weaponIndex, grav: 20 });
  if (p === player) {
    muzzleLight.position.copy(start); muzzleLight.intensity = 3;
    G.shake = Math.min(0.5, G.shake + 0.2);
  }
  updateWeaponHUD();
}

// Coins: zombies drop money for the shop (`). Split big values into clusters.
// Co-op drops scale sub-linearly with team size (2 hunters = 1.5x coins).
function spawnCoins(pos, value) {
  value = Math.max(1, Math.round(value * coinMult()));
  const n = value >= 60 ? 3 : value >= 15 ? 2 : 1;
  let left = value;
  for (let k = 0; k < n; k++) {
    const v = k === n - 1 ? left : Math.max(1, Math.round(value / n));
    left -= v;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x664400, roughness: 0.3, metalness: 0.7 }));
    m.castShadow = true;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
    m.position.set(
      Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, pos.x + Math.cos(a) * r)),
      0.4,
      Math.max(-ARENA_HALF + 1, Math.min(ARENA_HALF - 1, pos.z + Math.sin(a) * r)));
    scene.add(m);
    drops.push({ mesh: m, kind: 'coin', value: v, life: 25, bob: Math.random() * 6 });
  }
}
// Difficulty: EASY is the baseline; NORMAL/HARD scale zombie strength,
// shop prices, coin rewards, scores and kill gates. Picked on the homepage
// (solo) or by the host (co-op, synced to guests).
const DIFFS = [
  { name: 'EASY',   short: '',       hpM: 1,    spdM: 1,    dmgM: 1,    priceM: 1,    coinM: 1,   killM: 1,   scoreM: 1 },
  { name: 'NORMAL', short: 'NORMAL', hpM: 1.35, spdM: 1.08, dmgM: 1.2,  priceM: 1.15, coinM: 1.2, killM: 1.2, scoreM: 1.25 },
  { name: 'HARD',   short: 'HARD',   hpM: 1.7,  spdM: 1.15, dmgM: 1.45, priceM: 1.3,  coinM: 1.5, killM: 1.5, scoreM: 1.5 },
];
function DG() { return DIFFS[G.diff || 0]; }
// Price of weapon i at current difficulty.
function WP(i) { return Math.round(WPRICE[i] * DG().priceM); }
// Kills to reveal weapon w at current difficulty.
function unlockNeed(w) { return Math.round(w.unlockKills * DG().killM); }
// Zombie damage at current difficulty.
function zdmg(v) { return Math.round(v * DG().dmgM); }
function coinValue(z) {
  return Math.round((5 + G.round) * (z.scoreMult || 1) * DG().coinM);
}

// ============ HELPERS ============
function clampToArena(p, r) {
  p.x = Math.max(-ARENA_HALF + r, Math.min(ARENA_HALF - r, p.x));
  p.z = Math.max(-ARENA_HALF + r, Math.min(ARENA_HALF - r, p.z));
}
function resolveObstacles(p, r) {
  for (const ob of obstacles) {
    const cx = Math.max(ob.x - ob.hx, Math.min(ob.x + ob.hx, p.x));
    const cz = Math.max(ob.z - ob.hz, Math.min(ob.z + ob.hz, p.z));
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // center inside box: push out along min axis
        const px = ob.hx + r - Math.abs(p.x - ob.x);
        const pz = ob.hz + r - Math.abs(p.z - ob.z);
        if (px < pz) p.x += (p.x >= ob.x ? px : -px);
        else p.z += (p.z >= ob.z ? pz : -pz);
      }
    }
  }
}
function pointHitsObstacle(x, z) {
  for (const ob of obstacles) {
    if (Math.abs(x - ob.x) < ob.hx && Math.abs(z - ob.z) < ob.hz) return true;
  }
  return false;
}

let msgTimeout = null;
function showMessage(t, ms) {
  ms = (ms === undefined) ? 2200 : ms;
  msgEl.textContent = t;
  if (msgTimeout) clearTimeout(msgTimeout);
  if (ms > 0) msgTimeout = setTimeout(() => { msgEl.textContent = ''; }, ms);
}
function showBanner(t, ms) {
  ms = ms || 2000;
  bannerEl.textContent = t;
  bannerEl.style.display = 'block';
  bannerEl.style.opacity = '1';
  setTimeout(() => { bannerEl.style.display = 'none'; }, ms);
}
function pickupLog(t) {
  const el = document.getElementById('pickup-log');
  el.textContent = t;
  setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 2500);
}

// ============ ROUND FLOW ============
function startRound(n) {
  if (!simHost()) {
    // Guests never spawn: the host's snapshot drives zombies, but enter the
    // run immediately so HUD/camera/inputs are live before the first snap.
    G.round = n;
    G.state = 'playing';
    G.isBossRound = (n % 10 === 0);
    G.spawnQueue = 0;
    G.bossQueue = [];
    for (const p of players) {
      if (!p) continue;
      try { removeCorpse(p); } catch (e) {}
      p.corpsePos = null;
      p.ghost = false;
      try { setGhostAppearance(p, false); } catch (e) {}
      p.alive = true;
      p.hp = p.maxHp;
    }
    updateHUD();
    return;
  }
  G.round = n;
  G.state = 'playing';
  const teamN = Math.max(1, players.filter((p) => p).length);
  const co = isNet();
  for (const p of players) {
    if (!p) continue;
    if (co) {
      // Co-op: HP carries into the next round untouched and the fallen stay
      // fallen — top up with First Aid (E / shop) and rescue ghosts with a
      // revive kit (T). Only the living march on.
      if (!p.alive || p.ghost) continue;
      p.hurtCd = 0;
      continue;
    }
    const out = !p.alive || p.ghost;
    try { removeCorpse(p); } catch (e) {}
    p.corpsePos = null;
    p.ghost = false;
    try { setGhostAppearance(p, false); } catch (e) {}
    p.alive = true;
    // No free heal: HP carries into the next round untouched in every mode.
    // Top up with First Aid (E / shop) before the wave hits.
    p.hurtCd = 0;
    p.charging = false; p.chargeT = 0;
    if (out) p.group.position.set((p.slot - 1.5) * 3, 0, 12);
  }
  G.isBossRound = (n % 10 === 0);
  G.bossQueue = [];
  G.bossCounter = G.bossCounter || 0;
  if (G.isBossRound) {
    // one more brute per completed 5-kind loop (10..50: 1, 60..100: 2, ... max 5)
    const nBoss = Math.min(5, 1 + Math.floor((n - 10) / 50));
    for (let k = 0; k < nBoss; k++) G.bossQueue.push((G.bossCounter + k) % 5);
    G.bossCounter += nBoss;
  }
  G.bossSpawnTimer = 2.5;
  const count = (G.isBossRound ? (2 + n) : (4 + n * 2)) + (teamN - 1) * 3;
  G.spawnQueue = count;
  G.spawnInterval = Math.max(0.32, 1.25 - n * 0.09);
  G.spawnTimer = 0.5;
  if (G.isBossRound) {
    const names = G.bossQueue.map((k) => BOSS_KINDS[k]).join(' + ');
    showBanner(`⚠ BOSS — ROUND ${n} ⚠`, 2600);
    showMessage(`☠ ${count} zombies plus ${names} from the GATE…`, 3000);
  } else {
    showBanner(`ROUND ${n}`, 2200);
    showMessage(`☠ ${count} zombies incoming from the GATE!`, 2600);
  }
  sfx.round();
  if (isHost()) netEv({ kind: 'round', n, boss: G.isBossRound, names: G.isBossRound ? G.bossQueue.map((k) => BOSS_KINDS[k]).join(' + ') : '' });
  updateHUD();
}
function setPlayerWeapon(p, i) {
  if (!p || !AW(p)[i]) return;
  if (i === p.weaponIndex) return;
  p.charging = false; p.chargeT = 0; // swapping cancels a grenade wind-up
  const sw = AW(p)[i];
  // reveals are team-wide (global), unlocks are personal (own arsenal)
  if (!WEAPONS[i] || !WEAPONS[i].revealed || !sw.unlocked) return; // silent for remote requests
  p.weaponIndex = i;
  if (p === player) G.weaponIndex = i;
  if (p.gunMesh) p.group.remove(p.gunMesh);
  p.gunMesh = buildGunMesh(i);
  p.group.add(p.gunMesh);
  const mz = MUZZLE[i];
  p.flash.position.set(mz[0], mz[1], mz[2]);
  if (p === player) {
    sfx.swap();
    document.querySelectorAll('.wslot').forEach((el, k) => el.classList.toggle('active', k === i));
    try { updateQuickHint(); } catch (e) {} // prices follow the newly wielded weapon
    showMessage(`${sw.icon} ${sw.name}`, 900);
  }
}
function switchWeapon(i) {
  const base = WEAPONS[i];
  if (!base) return;
  if (player && player.ghost) { showMessage('👻 Ghosts cannot use weapons — wait for rescue!', 1500); return; }
  const mine = AW(player)[i];
  const unlocked = mine ? mine.unlocked : base.unlocked;
  if (isNet() && !isHost()) {
    // guest: validate locally for feedback, host applies authoritatively
    if (!base.revealed) { showMessage(`🔒 ??? — keep hunting to reveal new weapons!`, 2000); sfx.locked(); return; }
    if (!unlocked) { showMessage(`${base.icon} ${base.name} costs $${WP(i)} — open the shop (\`)!`, 2000); sfx.locked(); return; }
    NET.pendingWsel = i;
    setPlayerWeapon(player, i); // optimistic visual, snapshot confirms
    return;
  }
  if (!base.revealed) { showMessage(`🔒 ??? — keep hunting to reveal new weapons!`, 2000); sfx.locked(); return; }
  if (!unlocked) { showMessage(`${base.icon} ${base.name} costs $${WP(i)} — open the shop (\`)!`, 2000); sfx.locked(); return; }
  setPlayerWeapon(player, i);
}

// ============ HUD ============
function updateHUD() {
  document.getElementById('hud-round').textContent = G.isBossRound ? `ROUND ${G.round} 👹` : `ROUND ${G.round}`;
  const left = zombies.length + G.spawnQueue + (G.bossQueue || []).length;
  document.getElementById('hud-zombies').textContent = `🧟 ${left} left`;
  document.getElementById('hud-score').textContent = `SCORE ${G.score}`;
  document.getElementById('hud-kills').textContent = `KILLS ${G.kills}`;
  document.getElementById('hud-map').textContent = MAPS[G.mapKey].label + (DG().short ? ' • ' + DG().short : '');
  document.getElementById('hud-money').textContent = `$${viewMoney()}`;
  if (isNet()) {
    const k = (player && player.kit) || 0;
    document.getElementById('hud-lives').textContent = k > 0 ? `💉×${k}` : '';
  } else {
    document.getElementById('hud-lives').textContent = G.lives > 0 ? `💖×${G.lives}` : '';
  }
  const pct = Math.max(0, (player ? player.hp / player.maxHp : 1) * 100);
  document.getElementById('health-bar').style.width = pct + '%';
  const _lh = document.getElementById('lowhp');
  if (_lh) _lh.classList.toggle('on', !!player && player.hp > 0 && player.hp < player.maxHp * 0.2 && (G.state === 'playing' || G.state === 'intermission'));
  try { updateQuickHint(); } catch (e) {}
  updateWeaponHUD();
  // Co-op shop stays open while the hunt goes on: keep the wallet fresh and
  // re-render at most once a second so open-shop buttons stay clickable.
  if (G.shopOpen && isNet()) {
    try {
      const sm = document.getElementById('shop-money');
        if (sm) sm.textContent = `💰 $${viewMoney()}`;
      const now = performance.now();
      if (now - (G._shopRT || 0) > 1000) { G._shopRT = now; renderShop(); }
    } catch (e) {}
  }
}
// Bottom quick-hint prices (R ammo / Q upgrade for the current weapon).
// Values sit in fixed-width slots so digit changes never move the labels.
function updateQuickHint() {
  const ammoEl = document.getElementById('qh-ammo');
  const upEl = document.getElementById('qh-up');
  const medEl = document.getElementById('qh-med');
  if (!ammoEl && !upEl && !medEl) return;
  const wi = (player ? player.weaponIndex : G.weaponIndex) || 0;
  const w = AW(player)[wi];
  if (ammoEl) {
    if (!w || !w.unlocked || w.ammo === Infinity) ammoEl.textContent = '—';
    else if (w.ammo >= w.maxAmmo) ammoEl.textContent = 'FULL';
    else ammoEl.textContent = '$' + ammoCost(wi);
  }
  if (upEl) {
    if (!w || !w.unlocked) upEl.textContent = '—';
    else if ((w.up || 0) >= UP_MAX) upEl.textContent = 'MAX';
    else {
      const need = upgradeNeedFor(wi, (w.up || 0) + 1);
      upEl.textContent = (G.kills < need) ? '🔒' + need : '$' + upgradeCost(w, wi);
    }
  }
  if (medEl) {
    if (!player || player.ghost || player.hp >= player.maxHp) medEl.textContent = 'FULL';
    else medEl.textContent = '$' + SHOP.medkit;
  }
}
function updateWeaponHUD() {
  const A = AW(player); // co-op: your own unlocks, levels and ammo
  A.forEach((w, i) => {
    const el = document.getElementById('w-' + i);
    if (!el) return;
    el.classList.toggle('active', i === G.weaponIndex);
    el.classList.toggle('locked', !w.unlocked);
    if (!WEAPONS[i].revealed) { el.style.display = 'none'; return; }
    el.style.display = '';
    const nameEl = el.querySelector('.name');
    const ammoEl = el.querySelector('.ammo');
    if (w.unlocked) {
      const plus = w.up || 0;
      nameEl.textContent = plus > 0 ? `${w.icon} ${w.name} Lv${plus}` : `${w.icon} ${w.name}`;
      ammoEl.textContent = w.ammo === Infinity ? '∞' : w.ammo;
    } else {
      nameEl.textContent = `${w.icon} ${w.name}`;
      ammoEl.textContent = `$${WP(i)}`;
    }
  });
}
// HUD weapon boxes are clickable during the hunt (needs pointer-events:auto
// on #weapons since #hud itself ignores the mouse).
(function () {
  const slots = document.querySelectorAll('.wslot');
  if (!slots || !slots.length) return;
  slots.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
      const m = (el.id || '').match(/^w-(\d+)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      try {
        const A = AW(player);
        const w = A[idx];
        const base = WEAPONS[idx];
        // Revealed but not yet bought: click buys it (switching to it if it worked).
        if (w && base && base.revealed && !w.unlocked) {
          if (viewMoney() < WP(idx)) {
            showMessage(`${w.icon} ${w.name} costs $${WP(idx)} — need $${WP(idx) - viewMoney()} more!`, 1800);
            sfx.locked();
            return;
          }
          window.buyWeapon(idx); // guests: request is forwarded to the host
          const cur = AW(player)[idx];
          if (cur.unlocked && !(player && player.ghost)) switchWeapon(idx);
          else if (cur.unlocked) showMessage(`${cur.icon} ${cur.name} purchased!`, 1500);
          else showMessage(`${w.icon} ${w.name} purchase sent!`, 1200);
          return;
        }
        switchWeapon(idx);
      } catch (err) {}
    });
  });
})();

// ============ GAME CONTROL (exposed to menu buttons) ============
function resetWeapons() {
  // Global track (solo arsenal + team-wide reveals in co-op).
  WEAPONS.forEach((w) => {
    w.ammo = w.baseAmmo;
    w.unlocked = w.unlockKills === 0;
    w.revealed = w.unlockKills === 0;
    w.up = 0;
    refreshWeapon(w);
  });
  // Fresh personal arsenals for any existing net players.
  for (const p of players) if (p && p.ars) p.ars = newArsenal();
}
window.startGame = function (mapKey, fromNet) {
  // debounce: card click + button click both fire (bubbling) — only start once
  var now = Date.now();
  if (window.__lastStart && now - window.__lastStart < 600) return;
  window.__lastStart = now;
  ac();
  if (isNet() && !fromNet) netLeave();
  G.mapKey = mapKey || 'graveyard';
  G.diff = isNet() ? (NET.diffPick || 0) : (window.__diffSolo || 0);
  NET.mapPick = G.mapKey;
  NET.snapTimer = 0; NET.inTimer = 0; NET.pendingWsel = -1; NET.seq = 0;
  try {
    const veil = document.getElementById('host-shop-veil');
    if (veil) veil.style.display = 'none';
  } catch (e) {}
  G.round = 1; G.score = 0; G.kills = 0;
  G.money = 0; G.lives = 0; G.shopOpen = false;
  G.hpUps = 0; G.defUps = 0; G.spdUps = 0; G.defense = 0;
  G.weaponIndex = 0; G.fireCooldown = 0; G.shake = 0;
  G.isBossRound = false; G.bossQueue = []; G.bossCounter = 0;
  resetWeapons();
  buildMap(G.mapKey);
  shopEl.style.display = 'none';
  pauseEl.style.display = 'none';
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
  G.paused = false; G.shopOpen = false;
  menuEl.style.display = 'none';
  gameoverEl.style.display = 'none';
  hudEl.style.display = 'block';
  crosshair.style.display = 'block';
  try { const qh = document.getElementById('quick-hint'); if (qh) qh.style.display = 'block'; } catch (e) {}
  startRound(1);
};
window.restartToMenu = function () {
  if (isNet()) netLeave();
  G.state = 'menu';
  gameoverEl.style.display = 'none';
  hudEl.style.display = 'none';
  crosshair.style.display = 'none';
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
  try { const qh = document.getElementById('quick-hint'); if (qh) qh.style.display = 'none'; } catch (e) {}
  crosshair.style.display = 'none';
  menuEl.style.display = 'flex';
  buildMap(G.mapKey); // backdrop
};
window.retrySameMap = function () {
  if (isNet() && !isHost()) { showMessage('Only the host can restart the run', 2500); return; }
  if (isHost()) netSend({ t: 'start', map: G.mapKey });
  window.startGame(G.mapKey, true);
};
function toggleShop() {
  if (G.shopOpen) { window.closeShop(); return; }
  G.shopOpen = true;
  pauseEl.style.display = 'none';
  // Co-op: the hunt goes on while you browse — zombies won't wait.
  // Solo keeps the classic pause.
  if (isNet()) G.paused = false;
  else G.paused = true;
  renderShop();
  shopEl.style.display = 'flex';
  document.getElementById('resume-hint').style.display = 'block';
  if (isHost()) netEv({ kind: 'shopveil', open: true });
}
window.closeShop = function () {
  G.shopOpen = false;
  if (!isNet()) G.paused = false;
  shopEl.style.display = 'none';
  document.getElementById('resume-hint').style.display = 'none';
  if (isHost()) netEv({ kind: 'shopveil', open: false });
};
function openPause() {
  if (isNet()) return; // co-op has no pause screen at all (ESC opens the menu instead)
  G.paused = true;
  pauseEl.style.display = 'flex';
}
window.resumeGame = function () {
  G.paused = false;
  pauseEl.style.display = 'none';
};
// Co-op ESC menu: purely visual, the simulation keeps running behind it.
window.toggleEscMenu = function () {
  const m = document.getElementById('esc-menu');
  if (!m) return;
  m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
};
window.closeEscMenu = function () {
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
};
window.leaveRoomToMenu = function () {
  window.closeEscMenu();
  G.shopOpen = false;
  try { shopEl.style.display = 'none'; } catch (e) {}
  try { document.getElementById('resume-hint').style.display = 'none'; } catch (e) {}
  window.restartToMenu(); // also leaves the net room
};
(function () {
  const m = document.getElementById('esc-menu');
  if (!m) return;
  // click the backdrop to resume (buttons are handled by their own onclick)
  m.addEventListener('click', (e) => {
    if (e.target === m) window.closeEscMenu();
  });
})();
window.exitToMenu = function () {
  G.paused = false; G.shopOpen = false;
  shopEl.style.display = 'none';
  pauseEl.style.display = 'none';
  window.restartToMenu();
};
// ============ SHOWROOM (art viewer: full cast, orbit camera, no gameplay) ============
window.showRoom = function () {
  ac();
  try { if (isNet()) netLeave(); } catch (e) {}
  G.mapKey = 'graveyard';
  resetWeapons();
  buildMap('graveyard');
  menuEl.style.display = 'none';
  gameoverEl.style.display = 'none';
  hudEl.style.display = 'none';
  crosshair.style.display = 'none';
  pauseEl.style.display = 'none';
  try { document.getElementById('quick-hint').style.display = 'none'; } catch (e) {}
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
  clearPlayers();
  // front row: the four hunters (each flaunting a different gun)
  const showcaseGuns = [0, 5, 9, 11];
  for (let s = 0; s < 4; s++) {
    const p = makePlayer(s, 'P' + (s + 1));
    try {
      p.group.remove(p.gunMesh);
      p.gunMesh = buildGunMesh(showcaseGuns[s]);
      p.group.add(p.gunMesh);
      p.weaponIndex = showcaseGuns[s];
    } catch (e) {}
    p.tag.visible = true;
    p.group.position.set(-9 + s * 6, 0, 9);
    p.group.rotation.y = 0;
    players.push(p);
  }
  // middle row: all nine breeds
  const breeds = ['normal', 'spitter', 'dasher', 'bomber', 'leaper', 'speeder', 'splitter', 'mender', 'shade'];
  const muteB = sfx.boss, muteZ = sfx.zdie;
  sfx.boss = () => {}; sfx.zdie = () => {};
  try {
    breeds.forEach((t, k) => {
      spawnZombie(t, { x: 0, z: 0 });
      const z = zombies[zombies.length - 1];
      z.group.position.set(-20 + k * 5, 0, 0);
      z.group.rotation.y = 0;
      const tag = makeNameSprite(t.toUpperCase());
      tag.position.y = 2.9;
      z.group.add(tag);
    });
    // back row: all five bosses
    for (let k = 0; k < 5; k++) {
      spawnBoss(k);
      const z = zombies[zombies.length - 1];
      z.group.position.set(-14 + k * 7, 0, -11);
      z.group.rotation.y = 0;
      const tag = makeNameSprite(BOSS_KINDS[k]);
      tag.position.y = 4.4;
      z.group.add(tag);
    }
  } finally {
    sfx.boss = muteB; sfx.zdie = muteZ;
  }
  player = null;
  G.state = 'showroom';
  showMessage('', 1);
};
// Single combined upgrade button per weapon (Lv15 max). Each level boosts
// damage + fire rate + mag, and every 3rd level adds pierce/blast.
function upgradeBtn(w, i) {
  const up = w.up || 0;
  if (up >= UP_MAX) return `<button disabled data-note="${w.icon} ${w.name} already maxed out">⬆ MAX</button>`;
  const need = upgradeNeedFor(i, up + 1);
  if (G.kills < need) return `<button disabled data-note="Upgrade to Lv${up + 1} unlocks at ${need} total kills (you have ${G.kills})">⬆ 🔒</button>`;
  const c = upgradeCost(w, i);
  return `<button ${viewMoney() >= c ? '' : 'disabled'} onclick="window.buyUpgrade(${i})" data-note="${upgradeNote(w)} — costs $${c}">⬆ $${c}</button>`;
}
function boxNote(w) {
  const ammo = w.ammo === Infinity ? 'unlimited ammo' : `ammo ${w.ammo} of ${w.maxAmmo}`;
  const extra = w.kind !== 'gun' ? `blast ${w.blast}` : (w.pierce > 0 ? `pierce ${w.pierce}` : 'no pierce');
  const dps = w.kind === 'gun' ? `DPS ~${Math.round(w.damage * w.pellets / w.cooldown)}, ` : '';
  return `${w.icon} ${w.name}: ${w.blurb} Damage ${w.damage}, ${dps}every ${w.cooldown}s, range ${w.range}, ${extra}, ${ammo}.`;
}
function statCard(name, sub, cost, maxed, fn, note) {
  return `<div class="sbox" data-note="${note}"><div class="sname">${name}</div><div class="slevel">${sub}</div><button ${(maxed || viewMoney() < cost) ? 'disabled' : ''} onclick="${fn}">${maxed ? 'MAX' : 'UP $' + cost}</button></div>`;
}
(function () {
  const RESUME_TXT = 'Press ` or ESC to resume';
  const box = document.getElementById('shop-items');
  if (!box) return;
  const show = (t) => { const n = document.getElementById('resume-hint'); if (n) n.textContent = t; };
  box.addEventListener('mouseover', (e) => {
    const el = (e.target && e.target.closest) ? e.target.closest('[data-note]') : null;
    show(el ? el.getAttribute('data-note') : RESUME_TXT);
  });
  box.addEventListener('mouseleave', () => show(RESUME_TXT));
  // click outside the items window resumes the game
  shopEl.addEventListener('click', (e) => {
    if (!G.shopOpen) return;
    if (e.target !== shopEl) return; // backdrop only: buttons/text stay put
    window.closeShop();
  });
})();
function renderShop() {
  syncUnlocks();
  document.getElementById('shop-money').textContent = `💰 $${viewMoney()}${G.lives > 0 ? '  💖×' + G.lives : ''}`;
  let h = '<div class="shop-sec">WEAPONS — 12</div><div class="shop-grid">';
  const A = AW(player); // co-op: browse (and buy) your own arsenal
  A.forEach((w, i) => {
    if (!WEAPONS[i].revealed) {
      h += `<div class="sbox"><div class="sname">🔒 ???</div><div class="slevel">???</div><div class="sdesc">keep hunting to reveal</div><button disabled>???</button></div>`;
      return;
    }
    if (!w.unlocked) {
      const p = WP(i), afford = viewMoney() >= p;
      h += `<div class="sbox" data-note="${boxNote(w)}"><div class="sname">${w.icon} ${w.name}</div><div class="slevel">${afford ? 'NEW' : `need $${p - viewMoney()} more`}</div><button ${afford ? '' : 'disabled'} onclick="window.buyWeapon(${i})">BUY $${p}</button></div>`;
      return;
    }
    let btns = upgradeBtn(w, i);
    if (w.ammo !== Infinity) {
      const a = ammoCost(i);
      const missing = w.maxAmmo - w.ammo;
      if (missing <= 0) btns += `<button disabled data-note="${w.name} ammo already full">◆ FULL</button>`;
      else btns += `<button ${viewMoney() >= a ? '' : 'disabled'} onclick="window.buyAmmo(${i})" data-note="Refill ${missing} ${w.name} rounds (to ${w.maxAmmo}) for $${a} (or press R in game)">${window.AMMO_SVG || '◆'} $${a}</button>`;
    }
    h += `<div class="sbox" data-note="${boxNote(w)}"><div class="sname">${w.icon} ${w.name}</div><div class="slevel">${(w.up || 0) >= UP_MAX ? 'Lv max' : 'Lv' + (w.up || 0)}</div>${btns}</div>`;
  });
  h += '</div><div class="shop-sec">CHARACTER</div><div class="stat-grid">';
  h += statCard('❤ Max HP', `Total ${player ? player.maxHp : 100} HP`, hpCost(), G.hpUps >= 8, 'window.buyHp()', `Max HP is ${player ? player.maxHp : 100}: buy +25 max and heal 25 right away`);
  h += statCard('🛡 Defense', `-${Math.round(G.defense * 100)}% dmg`, defCost(), G.defUps >= 5, 'window.buyDef()', `Damage taken minus ${Math.round(G.defense * 100)} percent, each buy cuts 10 more, max minus 50`);
  h += statCard('👟 Speed', `+${G.spdUps * 8}% move`, spdCost(), G.spdUps >= 5, 'window.buySpd()', `Move speed plus 8 percent per buy, max plus 40 percent`);
  h += '</div><div class="shop-sec">SUPPLIES</div><div class="supply-grid">';
  const fullHp = player && player.hp >= player.maxHp;
  h += `<div class="sbox" data-note="First Aid: heal ${SHOP.medkitHeal} HP immediately for $${SHOP.medkit}"><div class="sname">✚ First Aid</div><div class="slevel">+${SHOP.medkitHeal} HP now</div><button ${(!fullHp && viewMoney() >= SHOP.medkit) ? '' : 'disabled'} onclick="window.buyMedkit()">BUY $${SHOP.medkit}</button></div>`;
  if (isNet()) {
    // Co-op has no self-rebirth: carry a kit, walk to a fallen mate's red
    // arrow and press T to bring them back.
    const myKit = (player && player.kit) || 0;
    h += `<div class="sbox" data-note="Revive Kit: carry it to a fallen teammate's body (red arrow) and press T to revive them at full HP"><div class="sname">💉 Revive Kit</div><div class="slevel">${myKit > 0 ? 'HELD (max 1)' : 'save a teammate with T'}</div><button ${(myKit === 0 && viewMoney() >= SHOP.kit) ? '' : 'disabled'} onclick="window.buyKit()">BUY $${SHOP.kit}</button></div>`;
  } else {
    h += `<div class="sbox" data-note="Extra Life: survive death once, reborn at full HP with a shield"><div class="sname">💖 Extra Life</div><div class="slevel">${G.lives > 0 ? 'HELD (max 1)' : 'die once and reborn'}</div><button ${(G.lives === 0 && G.money >= SHOP.life) ? '' : 'disabled'} onclick="window.buyLife()">BUY $${SHOP.life}</button></div>`;
  }
  h += '</div>';
  document.getElementById('shop-items').innerHTML = h;
}
window.buyWeapon = function (i) {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'weapon', a: i }); return; }
  const bs = buyerSlot();
  const A = isNet() ? players[bs].ars : WEAPONS;
  if (!A) return;
  const w = A[i];
  if (!WEAPONS[i].revealed || w.unlocked || moneyOf(bs) < WP(i)) return;
  addMoney(bs, -WP(i));
  w.unlocked = true;
  w.ammo = w.maxAmmo;
  sfx.unlock();
  renderShop(); updateHUD();
};
window.buyAmmo = function (i) {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'ammo', a: i }); return; }
  const bs = buyerSlot();
  const A = isNet() ? players[bs].ars : WEAPONS;
  if (!A) return;
  const w = A[i];
  const c = ammoCost(i, A);
  if (!w.unlocked || w.ammo === Infinity || w.ammo >= w.maxAmmo || moneyOf(bs) < c) return;
  addMoney(bs, -c);
  w.ammo = w.maxAmmo;
  sfx.pickup();
  renderShop(); updateHUD(); updateWeaponHUD();
};
window.buyUpgrade = function (i) {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'upgrade', a: i }); return; }
  const bs = buyerSlot();
  const A = isNet() ? players[bs].ars : WEAPONS;
  if (!A) return;
  const w = A[i];
  if (!w || !w.unlocked) return;
  const up = w.up || 0;
  if (up >= UP_MAX) return;
  if (G.kills < upgradeNeedFor(i, up + 1)) return;
  const c = upgradeCost(w, i);
  if (moneyOf(bs) < c) return;
  addMoney(bs, -c);
  w.up = up + 1;
  refreshWeapon(w);
  // top up ammo to the grown mag so upgrades always feel rewarding
  if (w.ammo !== Infinity) w.ammo = w.maxAmmo;
  sfx.unlock();
  if (G.shopOpen) renderShop();
  updateHUD(); updateWeaponHUD();
};
// old 4-track shop sent {what:'aspect'} — treat it as the combined upgrade
window.buyAspect = function (i) { window.buyUpgrade(i); };
// Quick-buy without opening the shop: R refills current weapon, Q upgrades it.
function currentWeaponIndex() {
  if (player) return player.weaponIndex;
  return G.weaponIndex || 0;
}
function buyAmmoCurrent() {
  if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
  const i = currentWeaponIndex();
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'ammo', a: i }); return; }
  const w = AW(player)[i];
  if (!w || !w.unlocked) return;
  if (w.ammo === Infinity) { showMessage(`${w.icon} ${w.name} never needs ammo!`, 1200); return; }
  if (w.ammo >= w.maxAmmo) { showMessage(`${w.icon} ${w.name} ammo already full!`, 1200); return; }
  const c = ammoCost(i);
  if (viewMoney() < c) { showMessage(`Need $${c - viewMoney()} more for ${w.name} ammo!`, 1500); sfx.locked(); return; }
  window.buyAmmo(i);
  if (!G.shopOpen) showMessage(`\u25C6 ${w.name} refilled!`, 1200);
}
function buyUpgradeCurrent() {
  if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
  const i = currentWeaponIndex();
  const w = AW(player)[i];
  if (!w || !w.unlocked) return;
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'upgrade', a: i }); return; }
  const up = w.up || 0;
  if (up >= UP_MAX) { showMessage(`${w.icon} ${w.name} already MAX (Lv${UP_MAX})!`, 1500); return; }
  if (G.kills < upgradeNeedFor(i, up + 1)) { showMessage(`Upgrade unlocks at ${upgradeNeedFor(i, up + 1)} kills (you have ${G.kills})!`, 1800); sfx.locked(); return; }
  const c = upgradeCost(w, i);
  if (viewMoney() < c) { showMessage(`Need $${c - viewMoney()} more to upgrade ${w.name}!`, 1500); sfx.locked(); return; }
  window.buyUpgrade(i);
  if (!G.shopOpen) showMessage(`${w.icon} ${w.name} upgraded to Lv${w.up}!`, 1500);
}
// Quick-buy First Aid without opening the shop (E key).
function buyMedkitCurrent() {
  if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
  const p = player;
  if (!p || p.ghost) return;
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'medkit' }); return; }
  if (p.hp >= p.maxHp) { showMessage('HP already full!', 1200); return; }
  if (viewMoney() < SHOP.medkit) { showMessage(`Need $${SHOP.medkit - viewMoney()} more for First Aid!`, 1500); sfx.locked(); return; }
  window.buyMedkit();
  if (!G.shopOpen) showMessage(`✚ +${SHOP.medkitHeal} HP!`, 1200);
}
window.buyHp = function () {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'hp' }); return; }
  if (G.hpUps >= 8 || !player || moneyOf(buyerSlot()) < hpCost() || G.kills < 15 * (G.hpUps + 1)) return;
  addMoney(buyerSlot(), -hpCost());
  G.hpUps++;
  for (const p of players) { if (!p) continue; p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); }
  sfx.medkit();
  renderShop(); updateHUD();
};
window.buyDef = function () {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'def' }); return; }
  if (G.defUps >= 5 || moneyOf(buyerSlot()) < defCost() || G.kills < 25 * (G.defUps + 1)) return;
  addMoney(buyerSlot(), -defCost());
  G.defUps++;
  G.defense = Math.min(0.5, G.defUps * 0.1);
  sfx.unlock();
  renderShop(); updateHUD();
};
window.buySpd = function () {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'spd' }); return; }
  if (G.spdUps >= 5 || !player || moneyOf(buyerSlot()) < spdCost() || G.kills < 25 * (G.spdUps + 1)) return;
  addMoney(buyerSlot(), -spdCost());
  G.spdUps++;
  for (const p of players) { if (p) p.speed = +(9 * (1 + 0.08 * G.spdUps)).toFixed(2); }
  sfx.swap();
  renderShop(); updateHUD();
};
window.buyMedkit = function () {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'medkit' }); return; }
  buyMedkitFor(NET.slot);
};
function buyMedkitFor(slot) {
  const p = players[slot] || player;
  if (!p || p.ghost || p.hp >= p.maxHp || moneyOf(slot) < SHOP.medkit) return;
  addMoney(slot, -SHOP.medkit);
  p.hp = Math.min(p.maxHp, p.hp + SHOP.medkitHeal);
  sfx.medkit();
  renderShop(); updateHUD();
};
window.buyLife = function () {
  if (isNet()) return; // co-op uses Revive Kits instead of self-rebirth
  if (G.lives > 0 || G.money < SHOP.life) return;
  G.money -= SHOP.life;
  G.lives = 1;
  sfx.unlock();
  renderShop(); updateHUD();
};
window.buyKit = function () {
  if (isNet() && !isHost()) { netSend({ t: 'buy', what: 'kit' }); return; }
  buyKitFor(NET.slot);
};
function buyKitFor(slot) {
  const p = players[slot] || player;
  if (!p || (p.kit || 0) > 0 || moneyOf(slot) < SHOP.kit) return;
  addMoney(slot, -SHOP.kit);
  p.kit = 1;
  sfx.unlock();
  renderShop(); updateHUD();
}

// ============ UPDATE LOOP ============
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function updateAim() {
  raycaster.setFromCamera(mouseNDC, camera);
  const pt = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(groundPlane, pt)) {
    aimPoint.copy(pt);
    if (player) {
      const d = pt.clone().sub(player.group.position); d.y = 0;
      if (d.lengthSq() > 0.04) {
        d.normalize();
        player.aim.copy(d);
        player.group.rotation.y = Math.atan2(d.x, d.z);
      }
    }
  }
  // crosshair follows mouse (+ grenade charge ring while winding up)
  crosshair.style.left = mouseScreen.x + 'px';
  crosshair.style.top = mouseScreen.y + 'px';
  try {
    let ch = 0;
    const gp = player && AW(player)[player.weaponIndex];
    if (gp && gp.kind === 'grenade' && player.alive && !player.ghost &&
        (G.state === 'playing' || G.state === 'intermission') &&
        (keys['Space'] || G.mouseFireHeld)) {
      if (simHost()) ch = (player.charging || player.chargeT > 0) ? Math.min(1, player.chargeT / 1.2) : 0;
      else {
        G.grenHold = Math.min(1.2, (G.grenHold || 0) + 0.016);
        ch = G.grenHold / 1.2;
      }
    } else G.grenHold = 0;
    const cs = 1 + ch * 1.2;
    crosshair.style.width = (20 * cs) + 'px';
    crosshair.style.height = (20 * cs) + 'px';
    crosshair.style.borderColor = ch > 0 ? '#77ff44' : 'rgba(255,255,255,.9)';
  } catch (e) {}
}

function playerInput(p) {
  // local keyboard/mouse for your own hunter, net buffer for mates (host sim)
  if (p === player) {
    return { keys, ax: 0, az: 0, fire: !!(keys['Space'] || G.mouseFireHeld), wsel: -1 };
  }
  const n = p.net || {};
  return { keys: n.keys || {}, ax: n.ax || 0, az: n.az === undefined ? -1 : n.az, fire: !!n.fire, wsel: (n.wsel === undefined ? -1 : n.wsel) };
}
function updatePlayerOne(p, inp, dt) {
  if (!p || (!p.alive && !p.ghost)) return;
  const ghost = !!p.ghost;
  if (p !== player && !ghost) p.aim.set(inp.ax || 0, 0, inp.az === undefined ? -1 : inp.az);
  let mx = 0, mz = 0;
  const K = inp.keys || {};
  if (K.KeyW || K.ArrowUp) mz -= 1;
  if (K.KeyS || K.ArrowDown) mz += 1;
  if (K.KeyA || K.ArrowLeft) mx -= 1;
  if (K.KeyD || K.ArrowRight) mx += 1;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    p.group.position.x += mx * p.speed * dt;
    p.group.position.z += mz * p.speed * dt;
  }
  clampToArena(p.group.position, p.radius);
  resolveObstacles(p.group.position, p.radius);

  if (ghost) return; // ghosts drift but can't shoot, grab coins, or swap weapons

  if (p.hurtCd > 0) p.hurtCd -= dt;
  if (p.flashT > 0) { p.flashT -= dt; if (p.flashT <= 0) p.flash.visible = false; }
  if (p.cool > 0) p.cool -= dt;

  // grenade charge: hold the trigger to wind up, release to lob
  const cw = AW(p)[p.weaponIndex];
  if (!ghost && cw && cw.kind === 'grenade') {
    if (inp.fire) {
      if (!p.charging) { p.charging = true; p.chargeT = 0; }
      p.chargeT = Math.min(1.2, p.chargeT + dt);
    } else if (p.charging) {
      p.charging = false;
      throwGrenade(p, Math.max(0.15, p.chargeT / 1.2));
      p.chargeT = 0;
    }
  } else if (p.charging) { p.charging = false; p.chargeT = 0; }

  // host applies remote weapon requests
  if (isHost() && inp.wsel !== undefined && inp.wsel >= 0 && inp.wsel !== p.weaponIndex) setPlayerWeapon(p, inp.wsel);
  if (inp.fire) fireWeapon(p);

  // pick up coins (host/single sim only — guests never run this).
  // Whoever touches a coin first keeps it; the drop is gone for everyone.
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.mesh.position.distanceTo(p.group.position) < 1.6) {
      addMoney(p.slot, d.value);
      if (p === player) { pickupLog(`+$${d.value}`); sfx.pickup(); }
      scene.remove(d.mesh);
      drops.splice(i, 1);
      updateHUD();
    }
  }
}

function updateZombies(dt) {
  // spawning from gate
  if (G.state === 'playing' && G.spawnQueue > 0) {
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      G.spawnTimer = G.spawnInterval;
      // spawn 1, or 2 at higher rounds for pressure
      spawnZombie();
      if (G.round >= 5 && G.spawnQueue > 1 && Math.random() < 0.4) { spawnZombie(); G.spawnQueue--; }
      G.spawnQueue--;
      updateHUD();
    }
  }
  // the boss lumbers out a few seconds into boss rounds
  if (G.state === 'playing' && G.bossQueue && G.bossQueue.length > 0) {
    G.bossSpawnTimer -= dt;
    if (G.bossSpawnTimer <= 0) {
      const kind = G.bossQueue.shift();
      spawnBoss(kind);
      G.bossSpawnTimer = 3.0; // stagger multiple brutes
      showMessage(`👹 THE ${BOSS_KINDS[kind]} IS HERE — keep moving!`, 2500);
      if (isHost()) netEv({ kind: 'msg', text: '👹 THE ' + BOSS_KINDS[kind] + ' IS HERE — keep moving!' });
      updateHUD();
    }
  }
  if (gateGlow && gateGlow.intensity > 2.2) gateGlow.intensity += (2.2 - gateGlow.intensity) * dt * 4;

  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    const zp = z.group.position;
    const tgt = nearestPlayer(zp);
    const pp = tgt ? tgt.group.position : null;
    if (z.flash > 0) {
      z.flash -= dt;
      z.bodyMat.color.copy(z.baseColor).lerp(new THREE.Color(0xffffff), Math.max(0, z.flash * 5));
      if (z.flash <= 0) z.bodyMat.color.copy(z.baseColor);
    }
    if (z.attackCd > 0) z.attackCd -= dt;
    if (z.core) { const pr = 1 + 0.35 * Math.sin(performance.now() * 0.012); z.core.scale.set(pr, pr, pr); }
    // attack swing: hands raise then chop down (rest pose restores after)
    if (z.swingT > 0) {
      z.swingT -= dt;
      const ph = 1 - Math.max(0, z.swingT) / 0.35; // 0 → 1 over the swing
      const raise = Math.sin(Math.min(1, ph * 1.4) * Math.PI) * 0.45;
      const chop = ph < 0.45 ? 0 : Math.sin((ph - 0.45) / 0.55 * Math.PI) * 0.5;
      for (const arm of [z.armL, z.armR]) {
          if (!arm) continue;
          if (arm.userData.y0 === undefined) { arm.userData.y0 = arm.position.y; arm.userData.z0 = arm.position.z; }
          arm.position.y = arm.userData.y0 + raise;
          arm.position.z = arm.userData.z0 + chop;
          arm.rotation.x = (arm.userData.rx || 0) - raise;
        }
      } else if (z.armL || z.armR) {
        for (const arm of [z.armL, z.armR]) {
          if (arm && arm.userData.y0 !== undefined) { arm.position.y = arm.userData.y0; arm.position.z = arm.userData.z0; arm.rotation.x = (arm.userData.rx || 0); }
        }
      }

    if (pp && G.state !== 'gameover') {
      const toP = new THREE.Vector3().subVectors(pp, zp); toP.y = 0;
      const dist = toP.length();
      // breed behaviour: spitters keep range and lob globs, others swarm.
      // The boss also hurls ember spreads.
      let advance = 1;
      if (z.isBoss) {
        const bk = z.bossKind || 0;
        if (bk === 1) {
          z.spitCd -= dt;
          if (z.spitCd <= 0 && dist < 30) {
            z.spitCd = 3.2;
            spitAt(z, { color: 0xff4422, speed: 11, damage: zdmg(14 + G.round * 1.5), size: 0.26, count: 3 }, tgt);
          }
        } else if (bk === 2) {
          // BLINK: teleport to a ring around the player
          z.tpCd -= dt;
          if (z.tpCd <= 0) {
            z.tpCd = 6;
            burst(zp.clone(), 0x33aaff, 1.2);
            const ta = Math.random() * Math.PI * 2, tr = 6 + Math.random() * 3;
            zp.x = pp.x + Math.sin(ta) * tr; zp.z = pp.z + Math.cos(ta) * tr;
            clampToArena(zp, z.radius);
            resolveObstacles(zp, z.radius);
            burst(zp.clone(), 0x33aaff, 1.2);
            sfx.blink();
          }
        } else if (bk === 3) {
          // WRAITH: phase in and out (body hides, HP bar stays)
          z.phaseCd -= dt;
          if (z.phaseCd <= 0) {
            z.invisible = !z.invisible;
            z.phaseCd = z.invisible ? 4 : 7;
            if (z.bodyMesh) z.bodyMesh.visible = !z.invisible;
            burst(zp.clone(), 0x888899, 0.9);
            sfx.blink();
          }
        } else if (bk === 4) {
          // SUMMONER: calls two minions (capped so the arena never floods)
          z.sumCd -= dt;
          if (z.sumCd <= 0 && zombies.length < 25) {
            z.sumCd = 8;
            for (let m = 0; m < 2; m++) spawnZombie(null, zp);
            burst(zp.clone(), 0x44ff44, 1.2);
            showMessage('👹 The Summoner calls its brood!', 2000);
            sfx.boss();
          }
        }
      }
      if (z.type === 'spitter') {
        z.spitCd -= dt;
        if (dist < 7) advance = -0.6;
        else if (dist < 11) advance = 0;
        if (z.spitCd <= 0 && dist < 28) { z.spitCd = 2.4 + Math.random(); spitAt(z, null, tgt); }
      }
      // dasher: stalks, then explodes into a sprint
      if (z.type === 'dasher') {
        z.dashCd -= dt;
        if (z.dashT > 0) { z.dashT -= dt; advance = 3; }
        else if (z.dashCd <= 0) { z.dashCd = 2.5; z.dashT = 0.5; }
        else advance = 0.5;
      }
      // leaper: crouches, then pounces clean over cover straight at you
      if (z.type === 'leaper') {
        z.leapCd -= dt;
        if (z.leaping) {
          z.leapT += dt;
          const ph = Math.min(1, z.leapT / (z.leapDur || 0.55));
          if (z.leapFrom && z.leapTo) {
            zp.x = z.leapFrom.x + (z.leapTo.x - z.leapFrom.x) * ph;
            zp.z = z.leapFrom.z + (z.leapTo.z - z.leapFrom.z) * ph;
          }
          z.group.position.y = Math.sin(ph * Math.PI) * 2.5;
          if (ph >= 1) { z.leaping = false; z.group.position.y = 0; burst(zp.clone(), 0x2a9a8a, 0.6); }
          advance = 0;
        } else if (z.leapCd <= 0 && dist > 5 && dist < 20) {
          z.leaping = true; z.leapT = 0; z.leapDur = 0.55;
          z.leapCd = 4;
          z.leapFrom = zp.clone();
          z.leapTo = pp.clone();
          sfx.blink();
        }
      }
      // mender: channels a heal pulse for wounded zombies around it
      if (z.type === 'mender') {
        z.healCd -= dt;
        if (z.healCd <= 0) {
          z.healCd = 3;
          let patched = false;
          for (const o of zombies) {
            if (o === z || o.hp >= o.maxHp) continue;
            const dx = o.group.position.x - zp.x, dz = o.group.position.z - zp.z;
            if (dx * dx + dz * dz < 36) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.15); patched = true; }
          }
          if (patched) burst(zp.clone(), 0x66ff99, 0.9);
        }
      }
      // shade: a ghost while far away, solid and fast once it closes in
      if (z.type === 'shade' && z.bodyMat) {
        z.hidden = dist >= 12;
        const op = z.hidden ? 0.18 : 0.9;
        try {
          z.bodyMat.opacity = op;
          if (z.headMat) z.headMat.opacity = op;
        } catch (e) {}
      }
      if (dist > 0.001) {
        toP.normalize();
        // wobble for zombie feel
        z.wob += dt * 3;
        const wx = Math.sin(z.wob) * 0.35;
        const side = new THREE.Vector3(-toP.z, 0, toP.x).multiplyScalar(wx);
        zp.add(toP.clone().multiplyScalar(z.speed * advance * dt));
        zp.add(side.clone().multiplyScalar(dt));
        z.group.rotation.y = Math.atan2(toP.x, toP.z);
        // zombie walk bob (leapers own their arc mid-pounce)
        if (!z.leaping) z.group.position.y = Math.abs(Math.sin(z.wob * 2)) * 0.08;
        // shamble stride: legs alternate, arms counter-swing, torso sways
        // (added on top of each breed's rest pose in userData.rx)
        const striding = (advance > 0.1 || advance < -0.1) ? 1 : 0;
        const swy = Math.sin(z.wob * 2.2) * striding;
        if (z.legL) z.legL.rotation.x = (z.legL.userData.rx || 0) + swy * 0.45;
        if (z.legR) z.legR.rotation.x = (z.legR.userData.rx || 0) - swy * 0.45;
        if (z.armL && z.swingT <= 0) z.armL.rotation.x = (z.armL.userData.rx || 0) - swy * 0.3;
        if (z.armR && z.swingT <= 0) z.armR.rotation.x = (z.armR.userData.rx || 0) + swy * 0.3;
        z.group.rotation.z = Math.sin(z.wob) * (striding ? 0.045 : 0.015);
        // splitter wobbles like jelly instead of stepping
        if (z.type === 'splitter') {
          const pu = Math.sin(z.wob * 3) * 0.04 * (striding ? 1 : 0.3);
          z.group.scale.set(1 + pu, 1 - pu, 1 + pu);
        }
      }
      clampToArena(zp, z.radius);
      if (!z.leaping) resolveObstacles(zp, z.radius); // pounces sail over cover

      // bomber detonates instead of melee (hurts player + chain-hits zombies)
      if (z.type === 'bomber' && dist < 1.8) {
        const bp = zp.clone();
        scene.remove(z.group);
        zombies.splice(i, 1);
        explode(bp, 3.2, zdmg(22 + G.round * 2), { hurtPlayer: true, hurtZombies: true, color: 0xff5522, size: 1.4 });
        updateHUD();
        continue;
      }
      // attack nearest hunter on contact (boss has longer reach)
      const reach = z.isBoss ? 2.2 : 1.35;
      if (tgt && dist < reach && z.attackCd <= 0 && tgt.hurtCd <= 0) {
        z.attackCd = 0.9;
        z.swingT = 0.35; // wind up the hands
        const kbAmt = z.isBoss ? BOSS_DEF[z.bossKind || 0].touch : 0.7;
        hurtPlayer(z.damage, zp.clone(), tgt, kbAmt);
      }
    }
    // hp bar billboard + scale
    z.hpFg.lookAt(camera.position);
    z.hpBg.lookAt(camera.position);
    const f = Math.max(0, z.hp / z.maxHp);
    z.hpFg.scale.x = f;
    // keep left-aligned as it shrinks: shift in local space
    const barY = z.isBoss ? 3.4 : 2.45;
    const barW = z.isBoss ? 1.8 : 1.0;
    z.hpFg.position.set(-(1 - f) * barW / 2, barY, 0.01);
    z.hpFg.material.color.setHex(f > 0.5 ? 0x33ff33 : f > 0.25 ? 0xffaa00 : 0xff2222);
  }

  // separation (avoid stacking)
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i].group.position, b = zombies[j].group.position;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001 && d < 1.1) {
        const push = (1.1 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }

  // round cleared? (regulars + boss all dead). HP does NOT recover — find medkits.
  if (G.state === 'playing' && G.spawnQueue <= 0 && (G.bossQueue || []).length <= 0 && zombies.length === 0) {
    G.state = 'intermission';
    G.interTimer = 5;
    const bonus = 50 + G.round * 10;
    G.score += bonus;
    const cash = Math.round((25 + G.round * 5) * DG().coinM);
    if (!isNet()) G.money += cash;
    else for (const p of players) if (p) addMoney(p.slot, cash);
    showBanner(`ROUND ${G.round} CLEAR!`, 2000);
    showMessage(`+${bonus} bonus • +$${cash} cash • heal with E / shop (\`)! Next wave in 5s…`, 4000);
    if (isHost()) netEv({ kind: 'clear', n: G.round, bonus, cash });
    sfx.pickup();
    updateHUD();
  } else if (G.state === 'intermission') {
    G.interTimer -= dt;
    if (Math.ceil(G.interTimer) > 0) showMessage(`Next wave in ${Math.ceil(G.interTimer)}… spend $ in the shop (\`)!`, 600);
    if (G.interTimer <= 0) startRound(G.round + 1);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    const p = b.mesh.position;
    const explosive = b.kind === 'grenade' || b.kind === 'rocket';
    let dead = false;
    if (b.life <= 0 || Math.abs(p.x) > ARENA_HALF || Math.abs(p.z) > ARENA_HALF) {
      if (explosive) detonate(b);
      dead = true;
    }
    // thrown grenades arc through the air and blow up where they land
    if (!dead && b.grav) {
      b.vy -= b.grav * dt;
      p.y += b.vy * dt;
      if (p.y <= 0.15) {
        p.y = 0.15;
        if (explosive) detonate(b);
        dead = true;
      }
    }
    // railgun slugs ignore walls; everything else stops at cover
    if (!dead && !b.phaze && pointHitsObstacle(p.x, p.z)) {
      if (explosive) detonate(b);
      dead = true;
    }
    if (!dead) {
      for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        const zp = z.group.position;
        const dx = p.x - zp.x, dz = p.z - zp.z;
        const hitR = z.isBoss ? 1.5 : 1.0;
        if (dx * dx + dz * dz < hitR && p.y < 3.6) {
          if (z.invisible || (z.type === 'shade' && z.hidden)) continue; // phased-out wraiths and veiled shades cannot be hit
          if (explosive) { detonate(b); dead = true; break; }
          if (b.hit.indexOf(z) >= 0) continue; // already pierced: fly through
          z.hp -= b.damage;
          z.flash = 0.12;
          sfx.hit();
          const _kb = (WKNOCK[b.wi] || 0) * (z.isBoss ? BOSS_DEF[z.bossKind || 0].resist : 1);
          if (_kb > 0) {
            const _vl = Math.hypot(b.vel.x, b.vel.z) || 1;
            zp.x += b.vel.x / _vl * _kb; zp.z += b.vel.z / _vl * _kb;
            clampToArena(zp, z.radius); resolveObstacles(zp, z.radius);
          }
          b.hit.push(z);
          if (z.hp <= 0) killZombie(j);
          else updateHUD();
          if (b.hit.length > (b.pierce || 0)) { dead = true; break; }
        }
      }
    }
    if (dead) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose(); b.mesh.material.dispose();
      bullets.splice(i, 1);
    }
  }
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 30);
}

function killZombie(index) {
  const z = zombies[index];
  const cfg = MAPS[G.mapKey];
  const pos = z.group.position.clone();
  const wasBoss = !!z.isBoss;
  scene.remove(z.group);
  zombies.splice(index, 1);
  G.kills++;
  const pts = wasBoss
    ? Math.round((1000 + G.round * 100) * cfg.scoreMult * DG().scoreM)
    : Math.round((100 + G.round * 15) * cfg.scoreMult * (z.scoreMult || 1) * DG().scoreM);
  G.score += pts;
  sfx.zdie();
  burst(pos, wasBoss ? 0xff3333 : 0x55ff33);
  if (z.type === 'bomber' && !wasBoss) {
    explode(pos, 3.2, zdmg(22 + G.round * 2), { hurtPlayer: true, hurtZombies: true, color: 0xff5522, size: 1.4 });
  }
  // splitter pops into two speeders (capped so the arena never floods)
  if (z.type === 'splitter' && !wasBoss && zombies.length < 22) {
    for (let m = 0; m < 2; m++) spawnZombie('speeder', pos);
    showMessage('🫧 The splitter burst apart!', 1500);
  }
  if (wasBoss) {
    spawnCoins(pos, Math.round((200 + G.round * 20) * DG().coinM));
    showMessage(`👹 BOSS SLAIN! +${pts} pts — grab the coins!`, 3000);
  } else {
    spawnCoins(pos, coinValue(z));
  }
  checkUnlocks();
  updateHUD();
}

// Area explosion. opts: {hurtZombies=true, hurtPlayer=false, color, size}
function explode(pos, radius, damage, opts) {
  opts = opts || {};
  const hurtZ = opts.hurtZombies !== false;
  const hurtP = !!opts.hurtPlayer;
  burst(pos, opts.color === undefined ? 0xff8833 : opts.color, opts.size || 1.1);
  muzzleLight.position.set(pos.x, 1.5, pos.z); muzzleLight.intensity = 5;
  G.shake = Math.min(0.9, G.shake + 0.45);
  sfx.boom();
  if (hurtZ) {
    for (let j = zombies.length - 1; j >= 0; j--) {
      const z = zombies[j];
      const zp = z.group.position;
      const dx = pos.x - zp.x, dz = pos.z - zp.z;
      const rr = radius + z.radius;
      if (dx * dx + dz * dz < rr * rr) {
        z.hp -= damage;
        z.flash = 0.15;
        const _dd = Math.sqrt(dx * dx + dz * dz) || 0.001;
        // shove AWAY from the blast (towards the zombie, out from ground zero)
        const _push = ((opts.power || 2.5) * (1 - _dd / rr) + 0.5) * (z.isBoss ? BOSS_DEF[z.bossKind || 0].resist : 1);
        zp.x -= dx / _dd * _push; zp.z -= dz / _dd * _push;
        clampToArena(zp, z.radius); resolveObstacles(zp, z.radius);
        if (z.hp <= 0) killZombie(j);
      }
    }
    updateHUD();
  }
  if (hurtP && (G.state === 'playing' || G.state === 'intermission')) {
    for (const p of alivePlayers()) {
      const pp = p.group.position;
      const dx = pos.x - pp.x, dz = pos.z - pp.z;
      const rr = radius + p.radius;
      if (dx * dx + dz * dz < rr * rr) hurtPlayer(damage, pos, p);
    }
  }
}
function detonate(b) {
  if (b.boom) return;
  b.boom = true;
  explode(b.mesh.position.clone(), b.blast, b.damage,
    { hurtPlayer: true, hurtZombies: true, color: b.kind === 'grenade' ? 0x77ff44 : 0xff5533, size: 1.2 });
}
// Damage a hunter (zombie melee, explosions, spit). Shared team: single-player
// keeps the original game-over screen flow, multiplayer spectates/revives.
function nearestPlayer(pos) {
  let best = null, bd = Infinity;
  for (const p of players) {
    if (!p || !p.alive || !p.group) continue;
    const d2 = pos.distanceToSquared(p.group.position);
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}
function hurtPlayer(dmg, fromPos, tgt, kbAmt) {
  tgt = tgt || player;
  if (!tgt || G.state === 'gameover' || tgt.hurtCd > 0 || tgt.ghost) return;
  tgt.hurtCd = 0.25;
  tgt.hp -= Math.max(1, Math.round(dmg * (1 - G.defense)));
  if (tgt === player) {
    sfx.hurt();
    G.shake = Math.min(0.8, G.shake + 0.3);
    vignette.style.boxShadow = 'inset 0 0 140px rgba(255,0,0,.85)';
    setTimeout(() => { vignette.style.boxShadow = 'inset 0 0 120px rgba(255,0,0,0)'; }, 220);
  }
  if (fromPos) {
    const tpp = tgt.group.position;
    const kb = new THREE.Vector3().subVectors(tpp, fromPos); kb.y = 0;
    if (kb.lengthSq() > 0.001) { kb.normalize().multiplyScalar(kbAmt === undefined ? 0.7 : kbAmt); tpp.add(kb); clampToArena(tpp, tgt.radius); }
  }
  updateHUD();
  if (tgt.hp <= 0) { tgt.hp = 0; killPlayer(tgt); }
}
function rebornPlayer(tgt) {
  tgt.hp = tgt.maxHp; tgt.hurtCd = 3; tgt.alive = true;
  tgt.group.position.set((tgt.slot - 1.5) * 3, 0, 12);
  for (let i = zombies.length - 1; i >= 0; i--) {
    const zp = zombies[i].group.position;
    const dx = zp.x - tgt.group.position.x, dz = zp.z - tgt.group.position.z;
    if (dx * dx + dz * dz < 64) {
      burst(zp.clone(), 0xffdd66, 0.8);
      scene.remove(zombies[i].group);
      zombies.splice(i, 1);
    }
  }
  updateHUD();
}
// ============ CO-OP GHOSTS + REVIVE (multiplayer only) ============
// A dead hunter lingers as a blueish-grey ghost that can walk but do nothing.
// Their body stays behind with a floating red arrow; a living teammate carrying
// a revive kit walks up to it and presses T to bring them back.
function setGhostAppearance(p, on) {
  if (!p || !p.group) return;
  try {
    if (on) {
      if (!p._orig) {
        p._orig = [];
        p.group.traverse((o) => {
          if (o.isMesh && o.material && o.material.color) {
            p._orig.push({ m: o.material, c: o.material.color.getHex(), o: o.material.opacity, t: o.material.transparent });
          }
        });
      }
      p.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          o.material.color.setHex(0x8fa8bf);
          o.material.transparent = true;
          o.material.opacity = 0.45;
        }
      });
      if (p.gunMesh) p.gunMesh.visible = false;
      if (p.flash) p.flash.visible = false;
    } else {
      if (p._orig) for (const s of p._orig) {
        try { s.m.color.setHex(s.c); s.m.opacity = s.o; s.m.transparent = s.t; } catch (e) {}
      }
      if (p.gunMesh) p.gunMesh.visible = true;
    }
  } catch (e) {}
}
function makeCorpseMesh(pos) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x5a1518, roughness: 0.9 }));
  body.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 24),
    new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4),
    new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  arrow.rotation.x = Math.PI; arrow.position.y = 2.6;
  g.add(body, ring, arrow);
  g.position.set(pos.x, 0, pos.z);
  scene.add(g);
  return { group: g, arrow, seed: Math.random() * 10 };
}
function removeCorpse(p) {
  if (!p || !p.corpse) return;
  try { scene.remove(p.corpse); } catch (e) {}
  p.corpse = null; p.corpseArrow = null;
}
function updateCorpses(dt) {
  try {
    const t = performance.now() * 0.004;
    for (const p of players) {
      if (!p || !p.corpseArrow) continue;
      p.corpseArrow.position.y = 2.6 + Math.sin(t + (p.corpseSeed || 0)) * 0.3;
      p.corpseArrow.rotation.y += dt * 2.5;
    }
  } catch (e) {}
}
function makeGhost(tgt) {
  if (!tgt || tgt.ghost) return;
  const pos = tgt.group.position.clone();
  tgt.alive = false; tgt.ghost = true; tgt.hp = 0;
  tgt.cool = 0; tgt.hurtCd = 0; tgt.charging = false; tgt.chargeT = 0;
  if (tgt.flash) tgt.flash.visible = false;
  setGhostAppearance(tgt, true);
  try { removeCorpse(tgt); } catch (e) {}
  try {
    const c = makeCorpseMesh(pos);
    tgt.corpse = c.group; tgt.corpseArrow = c.arrow; tgt.corpseSeed = c.seed;
    tgt.corpsePos = { x: pos.x, z: pos.z };
  } catch (e) {}
  burst(pos, 0x8899bb, 1.0);
  if (tgt === player) showMessage('☠ You are down! Drift your ghost clear — a teammate must buy 💉 then press T at your red arrow!', 4500);
  else showMessage(`☠ ${tgt.name} is down! Buy 💉 in the shop (\`) then press T at their red arrow!`, 4000);
  updateHUD();
  if (!players.some((q) => q && q.alive)) teamGameOver();
}
function revivePlayer(tgt) {
  if (!tgt || !tgt.ghost) return;
  try { removeCorpse(tgt); } catch (e) {}
  tgt.corpsePos = null;
  tgt.ghost = false; tgt.alive = true;
  tgt.hp = tgt.maxHp; tgt.hurtCd = 3; tgt.cool = 0; tgt.charging = false; tgt.chargeT = 0;
  setGhostAppearance(tgt, false);
  burst(tgt.group.position.clone(), 0x66ff99, 1.2);
  updateHUD();
}
function tryReviveForSlot(slot) {
  const p = players[slot];
  const local = (slot === NET.slot);
  const say = (t, ms) => { if (local) showMessage(t, ms || 2200); };
  if (!p || !p.alive || p.ghost) { say('Only the living can revive!'); return false; }
  if ((p.kit || 0) < 1) { say('Buy a 💉 revive kit in the shop (`) first!', 2200); try { sfx.locked(); } catch (e) {} return false; }
  let best = null, bd = 3.5 * 3.5;
  for (const q of players) {
    if (!q || !q.ghost || !q.corpsePos) continue;
    const dx = q.corpsePos.x - p.group.position.x, dz = q.corpsePos.z - p.group.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bd) { bd = d2; best = q; }
  }
  if (!best) { say('No fallen teammate nearby — go to the red arrow!'); return false; }
  p.kit = 0;
  const rescued = best.name;
  // The rescued hunter wakes up where their body fell.
  try { best.group.position.set(best.corpsePos.x, 0, best.corpsePos.z); } catch (e) {}
  revivePlayer(best);
  try { sfx.unlock(); } catch (e) {}
  showBanner('💉 REVIVED!', 1800);
  showMessage(`💉 ${p.name} revived ${rescued}!`, 3000);
  if (isHost()) netEv({ kind: 'msg', text: `💉 ${p.name} revived ${rescued}!` });
  updateHUD();
  if (G.shopOpen) renderShop();
  return true;
}
function tryRevive() {
  // T key: co-op revive. Solo has no ghosts (extra life rebirths instantly).
  if (typeof G === 'undefined' || (G.state !== 'playing' && G.state !== 'intermission')) return;
  if (!isNet()) return;
  if (isHost()) { try { tryReviveForSlot(NET.slot); } catch (e) {} return; }
  // Guest: check locally for feedback, the host validates authoritatively.
  const p = player;
  if (!p || !p.alive || p.ghost) { showMessage('You are a ghost — wait for rescue!', 2000); return; }
  if ((p.kit || 0) < 1) { showMessage('Buy a 💉 revive kit in the shop (`) first!', 2200); try { sfx.locked(); } catch (e) {} return; }
  let ok = false;
  for (const q of players) {
    if (!q || !q.ghost || !q.corpsePos) continue;
    const dx = q.corpsePos.x - p.group.position.x, dz = q.corpsePos.z - p.group.position.z;
    if (dx * dx + dz * dz < 3.5 * 3.5) { ok = true; break; }
  }
  if (!ok) { showMessage('No fallen teammate nearby — go to the red arrow!'); return; }
  netSend({ t: 'revive' });
  showMessage('💉 Reviving...', 1200);
}
function killPlayer(tgt) {
  if (!isNet()) { gameOver(); return; } // single-player keeps existing screen flow
  // Co-op: no self-rebirth — linger as a ghost until a teammate revives you.
  makeGhost(tgt);
}
function teamGameOver() {
  G.state = 'gameover';
  sfx.over();
  hudEl.style.display = 'none';
  crosshair.style.display = 'none';
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
  try { const qh = document.getElementById('quick-hint'); if (qh) qh.style.display = 'none'; } catch (e) {}
  document.getElementById('final-stats').innerHTML =
    `Team wipe at <b style="color:#f66">ROUND ${G.round}</b><br>` +
    `Zombies killed: <b>${G.kills}</b><br>Final score: <b style="color:#ffdd66">${G.score}</b>`;
  gameoverEl.style.display = 'flex';
  if (isHost()) netEv({ kind: 'over' });
}
function updateSpits(dt) {
  for (let i = spits.length - 1; i >= 0; i--) {
    const s = spits[i];
    s.life -= dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    const p = s.mesh.position;
    let dead = s.life <= 0;
    if (!dead && (Math.abs(p.x) > ARENA_HALF || Math.abs(p.z) > ARENA_HALF)) dead = true;
    if (!dead && pointHitsObstacle(p.x, p.z)) dead = true;
    if (!dead && G.state !== 'gameover') {
      for (const q of alivePlayers()) {
        const pp = q.group.position;
        const dx = p.x - pp.x, dz = p.z - pp.z;
        if (dx * dx + dz * dz < 0.81 && p.y < 2.0) { hurtPlayer(s.damage, p, q); dead = true; break; }
      }
    }
    if (dead) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); spits.splice(i, 1); }
  }
}
function updateMines(dt) {
  const t = performance.now() * 0.006;
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.life -= dt;
    m.dot.visible = (Math.sin(t * 3 + m.seed) > -0.2);
    if (m.life <= 0) { scene.remove(m.mesh); mines.splice(i, 1); continue; }
    let boom = false;
    for (const z of zombies) {
      const zp = z.group.position;
      const dx = m.mesh.position.x - zp.x, dz = m.mesh.position.z - zp.z;
      const rr = 1.8 + z.radius;
      if (dx * dx + dz * dz < rr * rr) { boom = true; break; }
    }
    if (boom) {
      const p = m.mesh.position.clone();
      scene.remove(m.mesh);
      mines.splice(i, 1);
      explode(p, m.blast, m.damage, { hurtPlayer: true, hurtZombies: true, color: 0xffaa33, size: 1.3 });
    }
  }
}
// Spitter lobs a glob; the boss hurls a 3-way spread of heavy embers.
function spitAt(z, opts, tgt) {
  tgt = tgt || nearestPlayer(z.group.position) || player;
  if (!tgt) return;
  opts = opts || {};
  const color = opts.color === undefined ? 0x66ff22 : opts.color;
  const speed = opts.speed || 14;
  const size = opts.size || 0.17;
  const count = opts.count || 1;
  const dmg = opts.damage === undefined ? zdmg(8 + G.round) : opts.damage;
  const from = z.group.position.clone(); from.y = 1.4;
  const base = tgt.group.position.clone().sub(from); base.y = 0;
  if (base.lengthSq() < 0.01) return;
  const baseA = Math.atan2(base.x, base.z);
  for (let k = 0; k < count; k++) {
    const a = baseA + (k - (count - 1) / 2) * 0.18;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8),
      new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from);
    scene.add(mesh);
    spits.push({ mesh, vel: dir.multiplyScalar(speed), life: 3.5, damage: dmg });
  }
  beep(300, 0.15, 'sawtooth', 0.08, 150);
}
// Which zombie breed spawns: new powers join the pool every 10 rounds.
// Which zombie breed spawns: trickier breeds join as rounds climb —
// spitters (7), dashers (10), bombers (14), leapers (16), speeders (21),
// splitters (22), menders (28), shades (34).
function pickZombieType() {
  const r = G.round, roll = Math.random();
  if (r >= 34) {
    if (roll < 0.10) return 'shade'; if (roll < 0.20) return 'mender';
    if (roll < 0.32) return 'splitter'; if (roll < 0.42) return 'leaper';
    if (roll < 0.50) return 'dasher'; if (roll < 0.60) return 'speeder';
    if (roll < 0.70) return 'bomber'; if (roll < 0.85) return 'spitter';
  } else if (r >= 28) {
    if (roll < 0.10) return 'mender'; if (roll < 0.22) return 'splitter';
    if (roll < 0.32) return 'leaper'; if (roll < 0.42) return 'dasher';
    if (roll < 0.54) return 'speeder'; if (roll < 0.66) return 'bomber';
    if (roll < 0.81) return 'spitter';
  } else if (r >= 22) {
    if (roll < 0.12) return 'splitter'; if (roll < 0.24) return 'leaper';
    if (roll < 0.34) return 'dasher'; if (roll < 0.48) return 'speeder';
    if (roll < 0.60) return 'bomber'; if (roll < 0.76) return 'spitter';
  } else if (r >= 16) {
    if (roll < 0.12) return 'leaper'; if (roll < 0.24) return 'dasher';
    if (roll < 0.36) return 'speeder'; if (roll < 0.48) return 'bomber';
    if (roll < 0.66) return 'spitter';
  } else if (r >= 14) {
    if (roll < 0.14) return 'dasher'; if (roll < 0.28) return 'bomber';
    if (roll < 0.48) return 'spitter';
  } else if (r >= 10) {
    if (roll < 0.14) return 'dasher'; if (roll < 0.34) return 'spitter';
  } else if (r >= 7) { if (roll < 0.20) return 'spitter'; }
  return 'normal';
}
// tiny particle bursts
function burst(pos, color, size) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size || 0.4, 10, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.set(pos.x, 1.1, pos.z);
  scene.add(m);
  bursts.push({ mesh: m, t: 0 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.t += dt;
    b.mesh.scale.multiplyScalar(1 + dt * 6);
    b.mesh.material.opacity = Math.max(0, 0.9 - b.t * 3);
    if (b.t > 0.3) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bursts.splice(i, 1); }
  }
}

function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.life -= dt; d.bob += dt * 3;
    d.mesh.rotation.y += dt * 3;
    d.mesh.position.y = 0.4 + Math.sin(d.bob) * 0.12;
    if (d.life <= 0) { scene.remove(d.mesh); drops.splice(i, 1); }
  }
}

function gameOver() {
  if (G.lives > 0) {
    // extra life: reborn at full HP, brief shield, nearby horde cleared
    G.lives--;
    player.hp = player.maxHp; player.hurtCd = 3;
    player.group.position.set(0, 0, 12);
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zp = zombies[i].group.position;
      const dx = zp.x, dz = zp.z - 12;
      if (dx * dx + dz * dz < 64) {
        burst(zp.clone(), 0xffdd66, 0.8);
        scene.remove(zombies[i].group);
        zombies.splice(i, 1);
      }
    }
    for (const s of spits) scene.remove(s.mesh);
    spits = [];
    showBanner('💖 REBORN!', 2500);
    showMessage('Extra life used — 3s shield!', 3000);
    sfx.unlock();
    updateHUD();
    return;
  }
  G.state = 'gameover';
  sfx.over();
  hudEl.style.display = 'none';
  crosshair.style.display = 'none';
  try { document.getElementById('esc-menu').style.display = 'none'; } catch (e) {}
  try { const qh = document.getElementById('quick-hint'); if (qh) qh.style.display = 'none'; } catch (e) {}
  document.getElementById('final-stats').innerHTML =
    `Map: <b>${MAPS[G.mapKey].label}</b><br>Survived to <b style="color:#f66">ROUND ${G.round}</b><br>` +
    `Zombies killed: <b>${G.kills}</b><br>Final score: <b style="color:#ffdd66">${G.score}</b>`;
  gameoverEl.style.display = 'flex';
}

function updateCamera(dt) {
  let target, look;
  if (G.state === 'showroom') {
    const t = performance.now() * 0.00012;
    camera.position.set(Math.sin(t) * 30, 20, Math.cos(t) * 30);
    camera.lookAt(0, 1, -2);
    return;
  }
  if (G.state === 'menu') {
    const t = performance.now() * 0.0002;
    target = new THREE.Vector3(Math.sin(t) * 20, 18, Math.cos(t) * 20);
    camera.position.lerp(target, dt * 1.5);
    camera.lookAt(0, 0, 0);
    return;
  }
  if (!player) return;
  let focus = (player.alive || player.ghost) ? player : null;
  if (!focus) {
    const mates = alivePlayers();
    focus = mates.length ? mates[0] : null;
  }
  if (!focus) return;
  const p = focus.group.position;
  try { fillLight.position.set(p.x, 7, p.z + 2); } catch (e) {}
  const desired = new THREE.Vector3(p.x, 0, p.z).add(new THREE.Vector3(0, 21, 13));
  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 2);
    desired.x += (Math.random() - 0.5) * G.shake;
    desired.z += (Math.random() - 0.5) * G.shake;
  }
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  look = new THREE.Vector3(p.x, 0, p.z - 2);
  camera.lookAt(look);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.paused) { renderer.render(scene, camera); return; }
  updateAim();
  if (G.state === 'playing' || G.state === 'intermission') {
    if (simHost()) {
      for (const p of players) {
        if (!p) continue;
        const inp = (p === player)
          ? { keys, ax: 0, az: 0, fire: !!(keys['Space'] || G.mouseFireHeld), wsel: -1 }
          : { keys: (p.net && p.net.keys) || {}, ax: (p.net && p.net.ax) || 0, az: (p.net && p.net.az !== undefined) ? p.net.az : -1, fire: !!(p.net && p.net.fire), wsel: (p.net && p.net.wsel !== undefined) ? p.net.wsel : -1 };
        updatePlayerOne(p, inp, dt);
      }
      updateZombies(dt);
      updateBullets(dt);
      updateMines(dt);
      updateSpits(dt);
      updateDrops(dt);
      updateBursts(dt);
      updateCorpses(dt);
      try {
        updateTorches();
        if (Math.random() < dt * 14) spawnEmber();
        updateEmbers(dt);
      } catch (e) {}
    } else {
      updateGuestVisuals(dt);
      updateBursts(dt);
      try {
        updateTorches();
        if (Math.random() < dt * 14) spawnEmber();
        updateEmbers(dt);
      } catch (e) {}
    }
    netTick(dt);
    // gate idle pulse
    if (gateMesh) gateMesh.material.opacity = 0.85 + Math.sin(performance.now() * 0.005) * 0.1;
    try { if (gateShimmer) gateShimmer.material.opacity = 0.38 + Math.sin(performance.now() * 0.007) * 0.16; } catch (e) {}
  } else if (G.state === 'menu') {
    // idle zombie-free backdrop animation
    if (gateGlow) gateGlow.intensity = 2 + Math.sin(performance.now() * 0.003) * 0.8;
    try {
      updateTorches();
      if (Math.random() < dt * 10) spawnEmber();
      updateEmbers(dt);
    } catch (e) {}
  } else if (G.state === 'showroom') {
    // the cast idles: gentle bob, torches + embers alive, nothing hunts
    try {
      const t = performance.now() * 0.002;
      for (const z of zombies) if (z && z.group) z.group.position.y = Math.abs(Math.sin(t + z.wob)) * 0.1;
      for (const p of players) if (p && p.group) p.group.position.y = Math.abs(Math.sin(t + p.slot * 1.7)) * 0.08;
      updateTorches();
      if (Math.random() < dt * 10) spawnEmber();
      updateEmbers(dt);
    } catch (e) {}
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ============ INTROSPECTION + SCREENSHOT HOOK (?shot=name) ============
// window.__game exposes live state for automation; ?shot=<name> stages a
// deterministic demo scene (menu untouched when absent). Inert in real play.
window.__game = {
  net: NET,
  get G() { return G; },
  get players() { return players; },
  get zombies() { return zombies; },
  get player() { return player; },
  fn: {
    startGame: window.startGame, startRound, openPause, toggleShop, showRoom: window.showRoom,
    killPlayer, hurtPlayer, fireWeapon, nearestPlayer, switchWeapon,
    syncUnlocks, updateWeaponHUD, renderShop, spawnCoins, spawnZombie, spawnBoss,
  },
};
function shotSetup() {
  let name = null;
  try { name = new URLSearchParams(location.search).get('shot'); } catch (e) {}
  if (!name) return;
  const run = () => {
    try {
      if (name === 'multi') {
        window.setMode('multi');
      } else if (name === 'lobby' || name === 'coop-host') {
        window.setMode('multi');
        window.netCreate();
      } else if (name === 'play') {
        window.startGame('graveyard');
        G.money = 800; G.kills = 60; G.score = 7050;
        syncUnlocks();
        WEAPONS[1].unlocked = true; WEAPONS[1].ammo = WEAPONS[1].maxAmmo;
        WEAPONS[2].unlocked = true; WEAPONS[2].ammo = WEAPONS[2].maxAmmo;
        setPlayerWeapon(player, 1);
        updateWeaponHUD();
        startRound(6);
        player.maxHp = 99999; player.hp = 99999; updateHUD(); // staged godmode
        for (let k = 0; k < 5; k++) {
          spawnCoins(new THREE.Vector3((Math.random() - 0.5) * 20, 0, 5 + Math.random() * 10), 20);
        }
      } else if (name === 'shop') {
        window.startGame('city');
        G.money = 3500; G.kills = 260;
        syncUnlocks();
        [1, 2, 5].forEach((i) => { WEAPONS[i].unlocked = true; WEAPONS[i].ammo = WEAPONS[i].maxAmmo; });
        WEAPONS[1].up = 4; refreshWeapon(WEAPONS[1]);
        WEAPONS[5].up = 2; refreshWeapon(WEAPONS[5]);
        updateWeaponHUD();
        startRound(4);
        toggleShop();
      } else if (name === 'boss') {
        window.startGame('city');
        G.money = 2000; G.kills = 400; G.score = 30100;
        syncUnlocks();
        WEAPONS[5].unlocked = true; WEAPONS[5].ammo = WEAPONS[5].maxAmmo;
        setPlayerWeapon(player, 5);
        updateWeaponHUD();
        startRound(10);
        player.maxHp = 99999; player.hp = 99999; updateHUD(); // staged godmode
      } else if (name === 'over') {
        window.startGame('graveyard');
        G.round = 8; G.kills = 150; G.score = 9000;
        updateHUD();
        hurtPlayer(99999, null, player);
      } else if (name === 'pause') {
        window.startGame('graveyard');
        G.money = 500; G.kills = 40;
        syncUnlocks();
        startRound(3);
        player.maxHp = 99999; player.hp = 99999; updateHUD(); // staged godmode
      } else if (name === 'showroom') {
        window.showRoom();
      }
      // staged combat: auto-aim + fire so shots catch live action
      if (name === 'play' || name === 'boss' || name === 'coop-host' || name === 'pause') {
        if (window.__combatTimer) clearInterval(window.__combatTimer);
        window.__combatTimer = setInterval(() => {
          try {
            if (G.state !== 'playing' || !player || !player.alive) return;
            const tgt = nearestPlayer(player.group.position);
            if (!tgt) return;
            const d = tgt.group.position.clone().sub(player.group.position); d.y = 0;
            if (d.lengthSq() < 0.04) return;
            d.normalize();
            player.aim.copy(d);
            player.group.rotation.y = Math.atan2(d.x, d.z);
            fireWeapon(player);
          } catch (e) {}
        }, 300);
      }
    } catch (e) {}
  };
  setTimeout(() => requestAnimationFrame(run), 60);
}

// boot: menu backdrop
try {
  buildMap('graveyard');
} catch (err) {
  var ls = document.getElementById('load-status');
  if (ls) { ls.style.display = 'block'; ls.textContent = '⚠ Could not start 3D graphics (WebGL unavailable?): ' + err.message; }
  return;
}
updateWeaponHUD();
animate();
window.__gameBooted = true;
try {
  const bt = document.getElementById('build-tag');
  if (bt) bt.textContent = 'build ' + BUILD + ' — all players must match';
} catch (e) {}
try { shotSetup(); } catch (e) {}
// if the user clicked a map before the engine finished loading, start it now
if (window.__wantedMap) { var m = window.__wantedMap; window.__wantedMap = null; window.startGame(m); }
})();
