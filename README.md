# Avatar Overlay Demo

Overlay AI avatars from **three providers** — Anam, LemonSlice, and Trulience —
over a full-screen background video, each in its own third of the window. Shows
developers how to drop a talking avatar onto any web page.

All three are embedded the **same way** (a local iframe per third). Two of them
(Anam, LemonSlice) stream their avatar into an Agora channel which the page joins
and **chroma-keys** transparent; Trulience is a self-contained iframe. The UI
labels them **Provider 1 / 2 / 3** (no branding); this README names them so you
know what to configure.

```
┌──────────────── full-screen background video ────────────────┐
│   Provider 1    │    Provider 2    │       Provider 3         │
│   Anam          │    LemonSlice    │       Trulience          │
│  (Agora+chroma) │   (Agora+chroma) │       (iframe)           │
└───────────────────────────────────────────────────────────────┘
```

## How it works

- **Anam / LemonSlice** — the server starts an Agora **ConvoAI** agent whose avatar
  video is published into a channel on a solid **green** background. The browser
  joins the channel, subscribes to the avatar video, and a WebGL shader keys the
  green out (`public/chroma.js`). Both use the **same green** so one key colour
  works for both. The agent greets once, then idles. No mic is used.
- **Trulience** — a self-contained iframe (`connect=true` so it auto-loads and
  idles, `micOff`/`speakerOff`, chat UI hidden). No server support needed.

The provider keys live in **`.env`** (gitignored). `.env.example` lists every
variable name.

## Setup

```bash
cp .env.example .env      # then fill in the values below
npm install
npm start                 # serves on http://localhost:8090
```

### Agora (shared by Anam + LemonSlice)
| var | what |
|-----|------|
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | your Agora project |
| `AGORA_CONVOAI_AUTH` | `Basic <base64(customerId:customerSecret)>` — a Console **RESTful** key pair |
| `LLM_*`, `TTS_*`, `ASR_*` | the agent brain (an avatar needs a running agent even just to greet) |
| `AVATAR_KEY_COLOR` | the shared chroma green, hex w/o `#` (default `6B9E82`) |

### Provider 1 — Anam
| var | what |
|-----|------|
| `ANAM_API_KEY` | Anam API key |
| `ANAM_AVATAR_ID` | an Anam avatar that renders on a green background |

Anam's green must match `AVATAR_KEY_COLOR`.

### Provider 2 — LemonSlice
| var | what |
|-----|------|
| `LEMONSLICE_API_KEY` | LemonSlice API key (`sk_lemon_…`) |
| `LEMONSLICE_API_BASE_URL` | e.g. `https://lemonslice.com/api/liveai/agora` |
| `LEMONSLICE_AVATAR_ID` | a **public image URL** — LemonSlice builds the avatar from this photo |

The server passes `background_color = AVATAR_KEY_COLOR` to LemonSlice so it renders
on the same green as Anam. Host your source photo somewhere public and put its URL
in `LEMONSLICE_AVATAR_ID` (face images are gitignored here on purpose).

### Provider 3 — Trulience
| var | what |
|-----|------|
| `TRULIENCE_AVATAR_ID` | your Trulience avatar id |
| `TRULIENCE_AGENT_ENDPOINT` | *(optional)* an Agora agent endpoint if you want it to greet instead of just idle |

### Background video
`YT_VIDEO_ID` — any YouTube id (autoplays muted, loops, no controls).

## Tuning the chroma key

If the green isn't fully removed (or the subject's edges look chewed), adjust
`similarity` / `smoothness` / `spill` in `public/chroma.js` (the `ChromaKeyRenderer`
defaults), or `AVATAR_KEY_COLOR` to match your avatars' actual green.

## Files

```
server.js                     Express: static + /api/config + /api/start|stop/:provider
public/index.html             Full-screen video + three avatar iframes
public/providers/agora.html   Anam & LemonSlice (join Agora + chroma key) via ?provider=
public/providers/trulience.html   Trulience iframe wrapper
public/chroma.js              WebGL chroma-key renderer
.env.example                  All variable names (no values)
```

## Notes

- ConvoAI agents cost money while running; the page stops its agents on unload
  (`/api/stop`), and they also idle-timeout server-side.
- WebRTC needs HTTPS in production (localhost is exempt for dev).
