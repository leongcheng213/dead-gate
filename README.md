# DEAD GATE — Zombie Hunting 🧟

Browser co-op zombie shooter (Three.js, no build step). Solo hunt or online
rooms up to **4 hunters** — the room host simulates the world in-browser, the
Python server just serves the files and relays messages (stdlib only).

## Play locally

```powershell
cd "game assets"
python server.py 8901
```

Open `http://localhost:8901/` → **1 PLAYER** pick a map, or **MULTIPLAYER**
→ **CREATE** / **JOIN** with the 4-letter room code.

LAN party shortcut (prints your IP, opens the firewall, starts the server):

```powershell
powershell -ExecutionPolicy Bypass -File share-server.ps1
```

## Deploy to Render (free)

The repo ships with `render.yaml` (Python web service, `python server.py $PORT`).
Once pushed to GitHub:

1. https://dashboard.render.com → **New +** → **Web Service** → pick this repo.
2. Render fills everything from `render.yaml` — just press **Create Web Service**.
3. Open the `https://dead-gate-xxxx.onrender.com` URL it gives you.

Anyone on the internet can then co-op: all players open the same URL →
**MULTIPLAYER** → one **CREATE**s, the rest **JOIN** with the code. No LAN,
no firewall, no PowerShell needed. (Free tier sleeps after idle — first load
takes ~30s to wake.)

## Controls

**WASD** move • **Mouse** aim • **SPACE**/click shoot • **1–=**/wheel/click-boxes
weapons • **R** buy ammo • **Q** upgrade weapon • **E** First Aid • **T** revive
mate (co-op) • **\`** shop • **ESC** pause / menu.

## Co-op rules (short)

- Zombies scale with team size (+35% HP each extra hunter, more spawns).
- Teammate bullets can't hurt you — 💣🚀 explosions can.
- Shop and ESC menu never pause the hunt; wallets and HP carry between rounds.
- Death = 👻 ghost + red-arrow body. A mate buys 💉 **Revive Kit**, walks to
  the body, presses **T**. No self-rebirth.

## Files

| File | What |
| ---- | ---- |
| `index.html` / `main.js` | Game client (menu, HUD, shop, netcode) |
| `three.min.js` | Three.js r149, local copy |
| `models/ammo-icon.js` | Ammo icon SVG |
| `server.py` | Static server + WebSocket room relay (port arg or `$PORT`) |
| `share-server.ps1` | One-command LAN host helper |
| `build-bundle.ps1` | Rebuilds `dead-gate-runchat.html` |
| `dead-gate-runchat.html` | Whole game inlined in one file |
| `render.yaml` | Render Blueprint |
