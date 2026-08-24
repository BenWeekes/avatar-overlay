// Avatar Overlay demo server.
// Serves the static client and, for the two ConvoAI-based providers (Anam,
// LemonSlice), mints Agora tokens and starts/stops a ConvoAI agent whose avatar
// video is streamed into an Agora channel. The browser joins that channel,
// subscribes to the avatar video, and chroma-keys it transparent. Trulience
// needs no server support — it's a self-contained iframe.
import express from "express";
import dotenv from "dotenv";
import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;

dotenv.config();
const E = process.env;
const app = express();
app.use(express.json());
app.use(express.static("public"));

// Fixed channel roles (agent audio, viewer, avatar video)
const UID_AGENT = 100, UID_VIEWER = 101, UID_AVATAR = 102;
const TOKEN_TTL = 3600;

const rnd = () => "ao" + Math.random().toString(36).slice(2, 10);
function token(channel, uid) {
  return RtcTokenBuilder.buildTokenWithUid(
    E.AGORA_APP_ID, E.AGORA_APP_CERTIFICATE, channel, uid,
    RtcRole.PUBLISHER, TOKEN_TTL, TOKEN_TTL,
  );
}

// Build the ConvoAI avatar block for each provider.
function avatarConfig(provider, avatarToken) {
  if (provider === "anam") {
    return { vendor: "anam", enable: true, params: {
      api_key: E.ANAM_API_KEY, agora_uid: String(UID_AVATAR), agora_token: avatarToken,
      avatar_id: E.ANAM_AVATAR_ID, sample_rate: 24000, video_encoding: "AV1" } };
  }
  if (provider === "lemon") {
    return { vendor: "generic", enable: true, params: {
      api_key: E.LEMONSLICE_API_KEY, agora_uid: String(UID_AVATAR), agora_token: avatarToken,
      avatar_id: E.LEMONSLICE_AVATAR_ID, api_base_url: E.LEMONSLICE_API_BASE_URL,
      quality: "high", version: "v1", video_encoding: "H264",
      background_color: E.AVATAR_KEY_COLOR, aspect_ratio: "1x1" } };
  }
  throw new Error("unknown provider: " + provider);
}

function agentPayload(provider, channel) {
  return {
    name: `agent-${channel}`,
    properties: {
      channel,
      token: token(channel, UID_AGENT),
      agent_rtc_uid: String(UID_AGENT),
      remote_rtc_uids: [String(UID_VIEWER)],
      advanced_features: { enable_rtm: false },
      llm: {
        url: E.LLM_URL, api_key: E.LLM_API_KEY, style: "openai",
        params: { model: E.LLM_MODEL },
        system_messages: [{ role: "system", content:
          "You are a friendly demo avatar. Greet the viewer in one short sentence, then wait quietly." }],
        greeting_message: E.AGENT_GREETING || "Hello!",
        max_history: 8,
      },
      asr: { vendor: E.ASR_VENDOR || "ares", params: { language: E.ASR_LANGUAGE || "en-US" } },
      tts: { vendor: E.TTS_VENDOR, params: {
        api_key: E.TTS_API_KEY, voice_id: E.TTS_VOICE_ID, base_url: E.TTS_BASE_URL } },
      avatar: avatarConfig(provider, token(channel, UID_AVATAR)),
      turn_detection: { config: { end_of_speech: { mode: "vad" } } },
      parameters: { transcript: { enable: false } },
    },
  };
}

async function convoai(path, method, body) {
  const url = `${E.AGORA_CONVOAI_ENDPOINT}/${E.AGORA_APP_ID}${path}`;
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: E.AGORA_CONVOAI_AUTH },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, text };
}

// Non-secret client config (video id, Trulience embed, key colour).
app.get("/api/config", (_req, res) => {
  const t = E.TRULIENCE_AVATAR_ID;
  const ep = E.TRULIENCE_AGENT_ENDPOINT
    ? `&agora_agent_endpoint=${encodeURIComponent(E.TRULIENCE_AGENT_ENDPOINT)}` : "";
  res.json({
    ytVideoId: E.YT_VIDEO_ID,
    keyColor: "#" + (E.AVATAR_KEY_COLOR || "6B9E82").replace(/^#/, ""),
    trulienceSrc: `https://www.trulience.com/avatar/${t}`
      + `?connect=true&micOff=true&speakerOff=true`
      + `&hideChatInput=true&hideChatHistory=true&hideLetsChatBtn=true`
      + `&dialPageBackground=transparent&disableDragging=true&disablePanels=true${ep}`,
  });
});

// Start a ConvoAI avatar; returns everything the viewer needs to join + key.
app.post("/api/start/:provider", async (req, res) => {
  const provider = req.params.provider;
  if (!["anam", "lemon"].includes(provider)) return res.status(400).json({ error: "bad provider" });
  const channel = rnd();
  try {
    const { status, text } = await convoai("/join", "POST", agentPayload(provider, channel));
    if (status >= 300) return res.status(502).json({ error: "convoai_start_failed", status, detail: text.slice(0, 400) });
    let agentId = null;
    try { const j = JSON.parse(text); agentId = j.agent_id || j.agentId; } catch {}
    console.log(`[start ${provider}] channel=${channel} agent=${agentId} status=${status}`);
    res.json({
      appId: E.AGORA_APP_ID, channel, uid: UID_VIEWER,
      token: token(channel, UID_VIEWER),
      avatarUid: UID_AVATAR, agentId,
      keyColor: "#" + (E.AVATAR_KEY_COLOR || "6B9E82").replace(/^#/, ""),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/stop/:provider", async (req, res) => {
  const { agentId } = req.body || {};
  if (!agentId) return res.status(400).json({ error: "agentId required" });
  const { status } = await convoai(`/agents/${agentId}/leave`, "POST");
  console.log(`[stop] agent=${agentId} status=${status}`);
  res.json({ ok: status < 300, status });
});

app.listen(E.PORT || 8090, () => console.log(`avatar-overlay on :${E.PORT || 8090}`));
