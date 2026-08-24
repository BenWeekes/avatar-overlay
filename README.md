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
│   <iframe>      │    <iframe>      │       <iframe>           │  ← same embed shape
│   Agora video   │    Agora video   │   client render,         │
│   + chroma key   │    + chroma key   │   voice via Agora        │  ← differs inside
└───────────────────────────────────────────────────────────────┘
```

## How it works

- **Anam / LemonSlice** — the server starts an Agora **ConvoAI** agent whose avatar
  video is published into a channel on a solid **green** background. The browser
  joins the channel, subscribes to the avatar video + audio, and a WebGL shader
  keys the green out (`public/chroma.js`). Both use the **same green** so one key
  colour works for both. The agent greets on join, then a `silence_config` prompt
  makes it speak a fresh line every few seconds so it keeps talking.
- **Trulience** — the avatar renders **client-side** inside its iframe; its
  **voice comes from an Agora ConvoAI agent** it dials via `agora_agent_endpoint` (a
  lambda that provisions the agent). `connect=true` auto-loads it and chat UI is
  hidden. With no `agora_agent_endpoint` it just idles silently.

The provider keys live in **`.env`** (gitignored). `.env.example` lists every
variable name.

## Embedding each provider

The host page embeds all three the **same way** — one `<iframe>` per third
(`index.html` → `COLUMNS`). What differs is only what runs *inside* each iframe,
because the providers expose different things: **Trulience** renders the avatar
client-side in its iframe and gets its **voice from an Agora agent** (dialled via
`agora_agent_endpoint`); **Anam/LemonSlice** give you a raw Agora avatar video that you
render and chroma-key yourself. Both wrappers live in `public/providers/`.

### Trulience — client-side iframe, voice via Agora (no server needed)

Trulience renders the avatar in its own iframe; add `agora_agent_endpoint` so it dials an
Agora ConvoAI agent for voice:

```html
<iframe
  src="https://www.trulience.com/avatar/AVATAR_ID?connect=true&micOff=true&hideChatInput=true&hideChatHistory=true&hideLetsChatBtn=true&dialPageBackground=transparent&disableDragging=true&disablePanels=true&agora_agent_endpoint=<AGENT_LAMBDA_URL>"
  allow="autoplay; encrypted-media; fullscreen"
  allowtransparency="true"
  style="width:100%;height:100%;border:0;background:transparent"></iframe>
```

- `connect=true` auto-loads the avatar and **skips the dial/join screen**.
- `agora_agent_endpoint` = a URL that provisions the Agora agent → gives the avatar its voice.
- `micOff` = don't capture the viewer's mic. Drop `agora_agent_endpoint` (and add
  `speakerOff`) to have it idle silently instead.

### Anam & LemonSlice — Agora ConvoAI avatar + chroma key

These don't have a drop-in iframe. You run a ConvoAI **agent** whose avatar is
published into an Agora channel on a green background, then key the green out in
the browser. Two steps:

**1) Server starts the agent** (`POST …/conversational-ai-agent/v2/projects/{appid}/join`,
`Authorization: Basic <customerId:secret>`). The avatar block is the provider-specific bit:

```jsonc
// Anam
"avatar": { "vendor": "anam", "enable": true, "params": {
  "api_key": ANAM_API_KEY, "avatar_id": ANAM_AVATAR_ID,
  "agora_uid": "102", "agora_token": <token for uid 102>,
  "sample_rate": 24000, "video_encoding": "AV1" } }

// LemonSlice (generic vendor)
"avatar": { "vendor": "generic", "enable": true, "params": {
  "api_key": LEMONSLICE_API_KEY, "avatar_id": <public image URL>,
  "api_base_url": "https://lemonslice.com/api/liveai/agora",
  "agora_uid": "102", "agora_token": <token for uid 102>,
  "background_color": "6B9E82",   // the green we key out
  "quality": "high", "version": "v1", "video_encoding": "H264", "aspect_ratio": "1x1" } }
```

The rest of the `properties` block (channel, token, `agent_rtc_uid`, `llm`, `tts`,
`asr`, `greeting_message`, `silence_config`) is the same for both — see
`server.js` `agentPayload()`.

**2) Browser joins the channel and keys the green** — subscribe to the avatar
video (uid 102), feed it through the shader, draw to a transparent canvas:

```js
client.on("user-published", async (user, mediaType) => {
  if (mediaType === "video" && String(user.uid) === "102") {
    await client.subscribe(user, "video");
    srcVideo.srcObject = new MediaStream([user.videoTrack.getMediaStreamTrack()]);
    renderer.start(srcVideo);          // ChromaKeyRenderer -> transparent <canvas>
  }
  if (mediaType === "audio") { await client.subscribe(user, "audio"); user.audioTrack.play(); }
});
```

Full working version: `public/providers/agora.html` + `public/chroma.js`.

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

Each avatar iframe **auto-samples** the background green from the frame corners on
load, so it usually keys correctly with no work. To fine-tune, open a provider
iframe with **`?tune=1`**:

```
…/providers/agora.html?provider=anam&tune=1
…/providers/agora.html?provider=lemon&tune=1
```

A panel appears with a colour picker, a **🎨 Pick green from avatar** eyedropper
(native picker on Chrome/Edge), and `similarity` / `smoothness` / `spill` sliders.
Dial it in over the live avatar, then bake the values into the `ChromaKeyRenderer`
defaults in `public/chroma.js`.

- **similarity** ↑ removes more green (too high eats hair/skin)
- **smoothness** = edge softness · **spill** = de-green colour bleeding onto edges

Current demo defaults: `similarity 0.08 · smoothness 0.075 · spill 0.08` on `#6B9E82`.
A muted green sits close to some fabric tones (a little clothing can go
transparent); a **more saturated** background green keys far cleaner.

## Files

```
server.js                     Express: static + /api/config + /api/start|stop/:provider
public/index.html             Full-screen video + three avatar iframes
public/providers/agora.html   Anam & LemonSlice (join Agora + chroma key) via ?provider=
public/providers/trulience.html   Trulience iframe wrapper
public/chroma.js              WebGL chroma-key renderer
.env.example                  All variable names (no values)
```

## Keeping them talking & limiting cost

- **Greeting + keep-talking:** `llm.greeting_message` fires on join; `silence_config`
  (`{ timeout_ms, action:"think", content }` in `properties.parameters`) makes the
  LLM generate and speak a new line after `SILENCE_TIMEOUT_MS` (default 8s) of
  silence. Tune with `SILENCE_TIMEOUT_MS` / `SILENCE_PROMPT`.
- **Cost caps:** ConvoAI agents bill while running, so the server force-stops every
  agent after `MAX_SESSION_MS` (default **2 min**) even if the tab stays open, the
  page stops its agent on unload (`/api/stop`), and `idle_timeout` (30s) stops it if
  the viewer leaves.
- WebRTC needs HTTPS in production (localhost is exempt for dev).
