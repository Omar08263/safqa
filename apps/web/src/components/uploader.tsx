import { FileText, Film, ImagePlus, Loader2, Music, Paperclip, Play, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '../fx/fx';
import { type Attachment, deleteUpload, humanSize, LIMITS, saveUpload, UploadError, useUploadUrl } from '../lib/uploads';
import { useTr } from '../lib/tr';

/** Drop zone + picker. Stores files in IndexedDB and returns attachment refs. */
export function Uploader({ value, onChange, compact = false, accept = 'image/*,video/*,audio/*,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx,.csv' }: { value: Attachment[]; onChange: (next: Attachment[]) => void; compact?: boolean; accept?: string }) {
  const tr = useTr();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);

  async function add(files: FileList | File[]) {
    const list = Array.from(files).slice(0, LIMITS.perPost - value.length);
    if (files.length > list.length) toast(tr(`الحد ${LIMITS.perPost} ملفات في المرة`, `Max ${LIMITS.perPost} files`), 'error');
    const added: Attachment[] = [];
    setBusy((b) => b + list.length);
    for (const f of list) {
      try {
        added.push(await saveUpload(f));
      } catch (e) {
        toast(e instanceof UploadError ? e.message : tr('فشل رفع الملف', 'Upload failed'), 'error');
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (added.length) onChange([...value, ...added]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
        onPaste={(e) => { if (e.clipboardData.files.length) void add(e.clipboardData.files); }}
        className={`flex items-center gap-2 rounded-2xl border border-dashed transition ${over ? 'border-primary bg-primary/10' : 'border-border'} ${compact ? 'p-1.5' : 'p-3'}`}
      >
        <button type="button" onClick={() => input.current?.click()} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold hover:bg-primary/20">
          <ImagePlus className="h-4 w-4" />{tr('صور / فيديو / ملفات', 'Photos / video / files')}
        </button>
        {!compact ? <span className="text-[11px] text-muted">{tr(`اسحب وافلت أو الصق · صور حتى ${humanSize(LIMITS.image)} · فيديو حتى ${humanSize(LIMITS.video)} · بتتحفظ على جهازك بس`, `Drag, drop or paste · images ≤ ${humanSize(LIMITS.image)} · video ≤ ${humanSize(LIMITS.video)} · stored on this device only`)}</span> : null}
        {busy > 0 ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
        <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
      </div>
      {value.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((a) => (
            <div key={a.id} className="relative">
              <AttachmentThumb a={a} size={72} />
              <button type="button" aria-label={tr('شيل', 'Remove')} onClick={() => { void deleteUpload(a.id); onChange(value.filter((x) => x.id !== a.id)); }} className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-destructive text-white shadow"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AttachmentThumb({ a, size = 96, onOpen }: { a: Attachment; size?: number; onOpen?: () => void }) {
  const { url, missing } = useUploadUrl(a.kind === 'image' || a.kind === 'video' ? a.id : undefined, 'thumb');
  const Icon = a.kind === 'video' ? Film : a.kind === 'audio' ? Music : a.kind === 'image' ? ImagePlus : FileText;
  return (
    <button type="button" onClick={onOpen} title={`${a.name} · ${humanSize(a.size)}`} className="group relative grid place-items-center overflow-hidden rounded-xl border border-border bg-accent" style={{ width: size, height: size }}>
      {url && !missing ? <img src={url} alt={a.name} className="h-full w-full object-cover transition group-hover:scale-105" /> : <Icon className="h-6 w-6 text-muted" />}
      {a.kind === 'video' ? <span className="absolute inset-0 grid place-items-center bg-black/25"><Play className="h-6 w-6 fill-white text-white" /></span> : null}
      {a.kind === 'file' || a.kind === 'audio' ? <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-[11px] text-white">{a.name}</span> : null}
    </button>
  );
}

/** Gallery of attachments with an inline viewer: image lightbox, video and audio players, file download. */
export function Attachments({ items, size = 96 }: { items: Attachment[]; size?: number }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  if (!items?.length) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((a) => <AttachmentThumb key={a.id} a={a} size={size} onOpen={() => setOpen(a)} />)}
      </div>
      {open ? <Viewer a={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Viewer({ a, onClose }: { a: Attachment; onClose: () => void }) {
  const tr = useTr();
  const { url, missing } = useUploadUrl(a.id);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4 backdrop-blur" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()} onKeyDown={() => undefined}>
        {missing ? <p className="text-white">{tr('الملف ده مش موجود على الجهاز ده (المرفقات بتتحفظ محليًا).', 'This file is not on this device (attachments are stored locally).')}</p> : null}
        {url && a.kind === 'image' ? <img src={url} alt={a.name} className="max-h-[85vh] rounded-2xl object-contain" /> : null}
        {url && a.kind === 'video' ? <video src={url} controls autoPlay playsInline className="max-h-[85vh] rounded-2xl bg-black" /> : null}
        {url && a.kind === 'audio' ? <audio src={url} controls autoPlay className="w-96 max-w-full" /> : null}
        {url && a.kind === 'file' ? (
          <a href={url} download={a.name} className="flex items-center gap-2 rounded-2xl bg-card p-5 font-semibold"><Paperclip className="h-5 w-5" />{a.name} · {humanSize(a.size)} — {tr('تحميل', 'Download')}</a>
        ) : null}
        <button type="button" onClick={onClose} className="mx-auto mt-3 block rounded-full bg-white/15 px-4 py-1.5 text-sm text-white">{tr('قفل', 'Close')} (Esc)</button>
      </div>
    </div>
  );
}
