// Pixel de rastreo de apertura de correos.
// Cuando el cliente abre el correo, su programa descarga esta imagen 1x1
// (invisible). Aquí registramos esa apertura en la tabla correos_rastreo:
// sumamos +1 a "aperturas" y guardamos la fecha de la PRIMERA apertura.
// Siempre devolvemos un GIF transparente de 1x1, abra quien abra.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xzvtgjtumvwftulqxiao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

// GIF transparente 1x1 (base64).
const GIF_1X1 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const handler = async (event) => {
  const id = (event.queryStringParameters || {}).id;
  try {
    if (id && SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      const { data } = await supabase
        .from("correos_rastreo")
        .select("aperturas, abierto_at")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        await supabase
          .from("correos_rastreo")
          .update({
            aperturas: (data.aperturas || 0) + 1,
            abierto_at: data.abierto_at || new Date().toISOString(),
          })
          .eq("id", id);
      }
    }
  } catch {
    // Nunca rompemos: pase lo que pase, devolvemos la imagen.
  }
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
    body: GIF_1X1,
    isBase64Encoded: true,
  };
};
