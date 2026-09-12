export async function handler() {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iceServers: [],
          debug: {
            sid_existe: !!sid,
            sid_largo: sid ? sid.length : 0,
            token_existe: !!token,
            token_largo: token ? token.length : 0,
          },
        }),
      };
    }
    const auth = Buffer.from(sid + ":" + token).toString("base64");
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Tokens.json", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    });
    const data = await res.json();
    const iceServers = (data.ice_servers || [])
      .map((s) => ({ urls: s.urls || s.url, username: s.username, credential: s.credential }))
      .filter((s) => s.urls);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iceServers, debug: { twilio_status: res.status, cuantos: iceServers.length } }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ iceServers: [], error: String(e) }),
    };
  }
}
