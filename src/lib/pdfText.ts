import { estraiPagine } from './ddtParser.ts';
import type { PdfItem } from './ddtParser.ts';

/** Apre un PDF nel browser e restituisce il testo con le coordinate (pagina per pagina) */
export async function leggiPdf(dati: ArrayBuffer): Promise<PdfItem[][]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dati) }).promise;
  return estraiPagine(doc);
}
