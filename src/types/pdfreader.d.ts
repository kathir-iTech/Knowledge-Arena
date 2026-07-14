declare module 'pdfreader' {
  interface PdfReaderOptions {
    debug?: boolean;
    password?: string;
    signal?: AbortSignal;
  }

  interface PdfReaderItem {
    file?: { path: string } | { buffer: Buffer };
    page?: number;
    width?: number;
    height?: number;
    text?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    R?: Array<{ T: string }>;
    clr?: number;
    sw?: number;
  }

  type ItemHandler = (err: Error | null, item?: PdfReaderItem) => void;

  class PdfReader {
    constructor(options?: PdfReaderOptions);
    parseFileItems(pdfFilePath: string, itemHandler: ItemHandler): void;
    parseBuffer(pdfBuffer: Buffer, itemHandler: ItemHandler): void;
  }

  export { PdfReader, PdfReaderOptions, PdfReaderItem, ItemHandler };
}
