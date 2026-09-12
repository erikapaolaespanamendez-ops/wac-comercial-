import { useState } from "react";

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😇","🙂","😉","😍","😘","😜","🤪","😎","🤩","🥳","😏",
  "😢","😭","😤","😠","😡","🥺","😴","🤤","🤔","🤗","🙄","😬","😱","😅","😶","🫠",
  "👍","👎","👌","🙏","👏","🙌","💪","🤝","👋","✌️","🤞","👀","🫡","🫶","💯","🔥",
  "❤️","🧡","💛","💚","💙","💜","🖤","💔","💖","✨","⭐","🎉","🎊","✅","❌","⚠️",
  "📌","📎","📄","📁","📅","⏰","💬","📞","📲","💰","🏠","🏢","🚗","⚖️","📊","🤖",
];

export default function EmojiPicker({ onPick, abierto, onClose }: { onPick: (e: string) => void; abierto?: boolean; onClose?: () => void }) {
  const [internoAbierto, setInternoAbierto] = useState(false);
  const controlado = abierto !== undefined;
  const open = controlado ? abierto : internoAbierto;
  const cerrar = () => { if (controlado) onClose?.(); else setInternoAbierto(false); };

  return (
    <div className="relative shrink-0">
      {!controlado && (
        <button type="button" onClick={() => setInternoAbierto((v) => !v)} title="Emojis" aria-label="Emojis" className="rounded-xl border border-slate-300 px-3 py-2 text-lg hover:bg-slate-50">😀</button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={cerrar} />
          <div className="absolute bottom-12 left-0 z-50 w-64 max-w-[80vw] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => { onPick(e); cerrar(); }} className="rounded-lg p-1 text-xl hover:bg-slate-100">{e}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
