import { useState } from 'react';
import { downloadPicture } from './shareImage';

/** Saving or copying a wrap-up picture, with a line saying how it went. */
export function useSharePicture(make: () => Promise<Blob | null>, fileName: string) {
  const [sharing, setSharing] = useState('');
  const save = async () => {
    setSharing('Making your picture…');
    const blob = await make();
    if (!blob) return setSharing("Couldn't make the picture.");
    downloadPicture(blob, fileName);
    setSharing('Saved to your downloads.');
  };
  const copy = async () => {
    setSharing('Making your picture…');
    const blob = await make();
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
      setSharing('Copied. Paste it into a message or post.');
    } catch {
      setSharing("Your browser wouldn't copy the picture. Use Save picture instead.");
    }
  };
  return { sharing, save, copy };
}
