import { Bonjour } from 'bonjour-service';

export function startMdns(port: number): () => void {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: 'MindBase',
    type: 'mindbase',
    port,
    txt: { version: '0.1' },
  });
  return () => { service.stop?.(() => bonjour.destroy()); };
}
