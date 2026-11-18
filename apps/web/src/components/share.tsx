import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Download, QrCode, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useToast } from '../fx/fx';
import { track } from '../lib/activity';
import { useTr } from '../lib/tr';
import { Button } from './ui/button';
import { TelegramButton, WhatsAppButton } from './social';

export function ShareBar({ url, title, text }: { url: string; title: string; text?: string }) {
  const tr = useTr();
  const toast = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!qrOpen) return;
    void QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: '#1c1915', light: '#fffaf3' }, errorCorrectionLevel: 'M' }).then(setQr);
  }, [qrOpen, url]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast(tr('اللينك اتنسخ', 'Link copied'));
      track.share();
    } catch {
      toast(tr('مقدرتش أنسخ — انسخه يدوي', 'Could not copy — copy it manually'), 'error');
    }
  }
  async function native() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title, url });
      track.share();
    } catch {
      /* cancelled */
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <WhatsAppButton text={text ?? title} url={url} />
      <TelegramButton text={text ?? title} url={url} />
      <Button variant="outline" size="sm" onClick={() => void native()}><Share2 className="h-4 w-4" />{tr('شارك', 'Share')}</Button>
      <Button variant="outline" size="sm" onClick={() => void copy()}><Copy className="h-4 w-4" />{tr('انسخ اللينك', 'Copy link')}</Button>
      <Button variant="outline" size="sm" onClick={() => { setQrOpen(true); track.share(); }}><QrCode className="h-4 w-4" />QR</Button>
      <Dialog.Root open={qrOpen} onOpenChange={setQrOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="page-enter fixed inset-x-4 top-[12vh] z-[81] mx-auto max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl" aria-describedby={undefined}>
            <Dialog.Title className="text-lg font-bold">{tr('امسح الكود بالموبايل', 'Scan with your phone')}</Dialog.Title>
            {qr ? <img src={qr} alt={tr('كود QR للينك', 'QR code for the link')} className="mx-auto mt-4 w-64 rounded-2xl" /> : <div className="skeleton mx-auto mt-4 h-64 w-64 rounded-2xl" />}
            <p className="mt-3 break-all text-xs text-muted" dir="ltr">{url}</p>
            <div className="mt-4 flex justify-center gap-2">
              {qr ? (
                <a href={qr} download="safqa-qr.png"><Button size="sm"><Download className="h-4 w-4" />{tr('نزّل الصورة', 'Download PNG')}</Button></a>
              ) : null}
              <Dialog.Close asChild><Button size="sm" variant="ghost">{tr('قفل', 'Close')}</Button></Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function appUrl(path: string) {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '');
  return import.meta.env.VITE_DEMO_MODE === 'static' ? `${base}/#${path}` : `${base}${path}`;
}
