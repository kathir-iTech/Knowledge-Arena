import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseTokenWithRole(request, 'executive');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const body = await request.json();
    const { pdfDataUri } = body;

    if (!pdfDataUri) {
      return NextResponse.json({ error: 'No pdfDataUri provided', logs });
    }

    log(`[DEBUG] Data URI length: ${pdfDataUri.length}`);
    log(`[DEBUG] Data URI prefix: ${pdfDataUri.substring(0, 50)}...`);

    const parts = pdfDataUri.split(',');
    const base64Data = parts[parts.length - 1];
    log(`[DEBUG] Base64 length: ${base64Data.length}`);

    if (!base64Data) {
      return NextResponse.json({ error: 'Empty base64 data', logs });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
      log(`[DEBUG] Buffer created: length=${buffer.length}, isBuffer=${Buffer.isBuffer(buffer)}`);
    } catch (e: any) {
      log(`[DEBUG] Buffer.from ERROR: ${e.name}: ${e.message}`);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    log(`[DEBUG] PDF header: ${buffer.slice(0, 8).toString('hex')} = ${buffer.slice(0, 5).toString()}`);

    // Try pdfreader extraction (pure Node.js, no browser dependency)
    try {
      const { PdfReader } = require('pdfreader');

      const textsByPage: Map<number, string[]> = new Map();
      let maxPage = 0;

      await new Promise<void>((resolve, reject) => {
        new PdfReader().parseBuffer(buffer, (err: any, item?: any) => {
          if (err) { reject(err); return; }
          if (!item) { resolve(); return; }
          if (item.page) {
            maxPage = Math.max(maxPage, item.page);
            return;
          }
          if (item.text) {
            const pageNum = maxPage || 1;
            if (!textsByPage.has(pageNum)) textsByPage.set(pageNum, []);
            textsByPage.get(pageNum)!.push(item.text);
          }
        });
      });

      const totalPages = Math.max(maxPage, 1);
      const text = Array.from({ length: totalPages }, (_, i) => {
        const pageTexts = textsByPage.get(i + 1);
        return pageTexts ? pageTexts.join(' ') : '';
      }).join('\n').trim();

      const pagesWithNoText = Array.from(textsByPage.keys()).filter(p => {
        const t = textsByPage.get(p)?.join(' ').trim() ?? '';
        return t.length === 0;
      }).length;

      log(`[DEBUG] pdfreader pages: ${totalPages}`);
      log(`[DEBUG] Extraction complete: textLength=${text.length}, pagesWithNoText=${pagesWithNoText}/${totalPages}`);

      return NextResponse.json({
        success: true,
        pages: totalPages,
        textLength: text.length,
        totalItems: 0,
        pagesWithNoText,
        isImageOnly: pagesWithNoText >= totalPages && totalPages > 0,
        first300: text.substring(0, 300),
        logs,
      });
    } catch (extractErr: any) {
      log(`[DEBUG] EXTRACTION ERROR: ${extractErr.name}: ${extractErr.message}`);
      log(`[DEBUG] Stack: ${extractErr.stack}`);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  } catch (err: any) {
    log(`[DEBUG] REQUEST ERROR: ${err.name}: ${err.message}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
