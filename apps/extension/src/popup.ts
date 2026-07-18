const MINDBASE_URL = 'http://localhost:4321';

const root = document.getElementById('root')!;

async function init() {
  // @ts-ignore — chrome types not installed
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const title = tab?.title ?? 'Untitled';
  const url = tab?.url ?? '';

  root.innerHTML = `
    <div class="title">${escapeHtml(title)}</div>
    <div class="url">${escapeHtml(url)}</div>
    <button id="save">Save to MindBase</button>
    <div id="status"></div>
  `;

  const btn = document.getElementById('save') as HTMLButtonElement;
  const status = document.getElementById('status')!;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.className = 'status busy';
    status.textContent = 'Extracting content...';

    try {
      // Inject content script to extract article
      // @ts-ignore — chrome types not installed
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab!.id! },
        func: extractArticle,
      });

      const extracted = results[0]?.result as { title: string; content: string } | null;
      if (!extracted?.content) {
        status.className = 'status error';
        status.textContent = 'Could not extract article content';
        btn.disabled = false;
        return;
      }

      status.textContent = 'Saving to MindBase...';

      // Ingest
      const ingestRes = await fetch(`${MINDBASE_URL}/api/ingest/text`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: extracted.content,
          title: extracted.title || title,
          source_url: url,
        }),
      });
      const ingestData = await ingestRes.json() as { ok: boolean; rawId?: string; error?: string };
      if (!ingestData.ok) throw new Error(ingestData.error ?? 'ingest failed');

      status.textContent = 'Compiling...';

      // Compile
      const compileRes = await fetch(`${MINDBASE_URL}/api/compile/${ingestData.rawId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const compileData = await compileRes.json() as { ok: boolean; error?: string };
      if (!compileData.ok) throw new Error(compileData.error ?? 'compile failed');

      status.className = 'status success';
      status.textContent = 'Saved and compiled!';
    } catch (e) {
      status.className = 'status error';
      status.textContent = `Error: ${(e as Error).message}`;
      btn.disabled = false;
    }
  });
}

function extractArticle(): { title: string; content: string } | null {
  try {
    const clone = document.cloneNode(true) as Document;
    const article = clone.querySelector('article') ?? clone.querySelector('main') ?? clone.body;
    if (!article) return null;

    for (const tag of ['script', 'style', 'nav', 'header', 'footer', 'aside']) {
      article.querySelectorAll(tag).forEach((el) => el.remove());
    }

    const title = clone.querySelector('title')?.textContent ?? '';
    const content = article.textContent?.trim() ?? '';
    return { title, content };
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
