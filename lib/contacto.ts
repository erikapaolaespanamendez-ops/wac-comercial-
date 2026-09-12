// =====================================================================
//  Enlaces de contacto  —  llamar, WhatsApp y correo (por Gmail).
//  Funcionan en celular y compu (abren la app correspondiente).
// =====================================================================

function soloDigitos(tel: string): string {
  return (tel || "").replace(/\D/g, "");
}

// Número en dígitos (para mostrar/marcar)
export function numeroLimpio(tel: string): string {
  return soloDigitos(tel);
}

// Link para LLAMAR (abre el marcador en el celular)
export function linkLlamar(tel: string): string {
  return `tel:${soloDigitos(tel)}`;
}

// Link de WHATSAPP (agrega 52 de México si trae 10 dígitos)
export function linkWhatsApp(tel: string, mensaje?: string): string {
  let num = soloDigitos(tel);
  if (num.length === 10) num = "52" + num;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${num}${texto}`;
}

// Link de CORREO por GMAIL (abre Gmail con el mensaje pre-llenado)
export function linkCorreoGmail(email: string, asunto?: string, cuerpo?: string): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", to: email });
  if (asunto) params.set("su", asunto);
  if (cuerpo) params.set("body", cuerpo);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
