import { createWorker } from 'tesseract.js';

export async function extractText(imagePath: string): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(imagePath);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}
