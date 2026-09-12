// netlify/functions/token-voz.mjs
// Le da el "permiso" (token) al navegador para poder llamar por Twilio.
import twilio from "twilio";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

export default async (req) => {
  try {
    let identidad = "asesor";
    try {
      const url = new URL(req.url);
      identidad = url.searchParams.get("identidad") || "asesor";
    } catch {}

    const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const API_KEY_SID = process.env.TWILIO_API_KEY_SID;
    const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
    const TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;

    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET || !TWIML_APP_SID) {
      return new Response(JSON.stringify({ error: "Faltan llaves de Twilio en el servidor." }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const grant = new VoiceGrant({
      outgoingApplicationSid: TWIML_APP_SID,
      incomingAllow: true,
    });

    const token = new AccessToken(ACCOUNT_SID, API_KEY_SID, API_KEY_SECRET, {
      identity: identidad,
      ttl: 3600,
    });
    token.addGrant(grant);

    return new Response(JSON.stringify({ token: token.toJwt(), identidad }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "No se pudo generar el token: " + (e?.message || "") }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
};
