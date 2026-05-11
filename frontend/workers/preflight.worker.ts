import { PDFDocument, PDFName } from 'pdf-lib';

self.onmessage = async (e) => {
    const { type, buffer, fileMeta, mode } = e.data;
    console.log('[Worker] received command:', type);

    if (type === 'analyze') {
        self.postMessage({
            type: 'analysisResult',
            result: { ok: true, issues: [], stats: { pages: 1 } }
        });
        return;
    }

    if (type === 'fixBleed') {
        try {
            const BLEED_MM = 3;
            const BLEED_PTS = BLEED_MM * 2.8346;

            const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

            for (const page of pdfDoc.getPages()) {
                const mb = page.getMediaBox();
                const newWidth  = mb.width  + BLEED_PTS * 2;
                const newHeight = mb.height + BLEED_PTS * 2;

                const fullBox = pdfDoc.context.obj([0, 0, newWidth, newHeight]);
                page.node.set(PDFName.of('MediaBox'), fullBox);
                page.node.set(PDFName.of('BleedBox'), fullBox);
                page.node.set(PDFName.of('CropBox'),  fullBox);

                const trimBox = pdfDoc.context.obj([
                    BLEED_PTS, BLEED_PTS,
                    mb.width  + BLEED_PTS,
                    mb.height + BLEED_PTS
                ]);
                page.node.set(PDFName.of('TrimBox'), trimBox);
            }

            const output = await pdfDoc.save();
            self.postMessage(
                { type: 'transformResult', buffer: output.buffer, fileMeta, operation: 'fixBleed' },
                [output.buffer]
            );
        } catch (err: any) {
            self.postMessage({ type: 'transformError', operation: 'fixBleed', message: err.message });
        }
        return;
    }
};

export {};
