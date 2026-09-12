import { createClient } from "@supabase/supabase-js";
// =====================================================================
//  CONEXIÓN A SUPABASE  (la base de datos de JurisConecta)
//  👉 Para revender la app a otra empresa: cambia SOLO estas 2 líneas
//     por las llaves de esa empresa, y listo. Todo lo demás queda igual.
//
//  ⚠️ USA LA LLAVE "anon" (empieza con eyJ…), NO la "publishable" (sb_…).
//     El chat usa Supabase Realtime, y Realtime IGNORA las llaves sb_… →
//     con la publishable el chat NO conecta. La anon también es segura
//     para el navegador (la protección real la dan las políticas RLS).
// =====================================================================
const SUPABASE_URL = "https://xzvtgjtumvwftulqxiao.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dnRnanR1bXZ3ZnR1bHF4aWFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDU0NzUsImV4cCI6MjA5NzAyMTQ3NX0.W1CwPHCop68e0z_lCiX85EaIUoaJPG3huy2OjlZlSy4";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
