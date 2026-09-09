const form = document.querySelector('#search-form');
const queryInput = document.querySelector('#query');
const searchButton = document.querySelector('#search-button');
const status = document.querySelector('#status');
const results = document.querySelector('#results');

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    queryInput.value = button.dataset.example || '';
    queryInput.focus();
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '日期未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function showStatus(html, kind = 'info') {
  status.className = `status ${kind}`;
  status.innerHTML = html;
}

function setLoading(loading) {
  searchButton.disabled = loading;
  searchButton.textContent = loading ? '正在查找…' : '查找小票';
}

function renderResults(payload) {
  const { documents = [], documentsCount = 0, expanded = {}, demo, papraBaseUrl, organizationId } = payload;
  const terms = (expanded.displayTerms || []).map(escapeHtml).join(' · ');

  showStatus(`
    <div><strong>我帮你转换成：</strong>${terms || escapeHtml(expanded.searchQuery || '')}</div>
    <div class="technical-query">Papra 查询：${escapeHtml(expanded.searchQuery || '')}</div>
    <div class="result-count">找到 ${documentsCount} 条结果${demo ? ' · 当前是演示模式' : ''}</div>
  `, documents.length ? 'success' : 'info');

  if (!documents.length) {
    results.innerHTML = `
      <article class="empty-card">
        <h2>暂时没找到</h2>
        <p>可以试试只写品牌、商店或商品名，例如“Dyson 吸尘器”“MediaMarkt 2025”。</p>
      </article>
    `;
    return;
  }

  results.innerHTML = documents.map((doc) => {
    const papraUrl = !demo && papraBaseUrl
      ? `${papraBaseUrl}/organizations/${encodeURIComponent(organizationId)}/documents/${encodeURIComponent(doc.id)}`
      : '';
    const tags = (doc.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag.name)}</span>`).join('');
    const openOriginal = `/api/documents/${encodeURIComponent(doc.id)}/file`;

    return `
      <article class="receipt-card">
        <div class="receipt-topline">
          <div>
            <h2>${escapeHtml(doc.name || '未命名小票')}</h2>
            <div class="meta">${formatDate(doc.documentDate || doc.createdAt)} · ${escapeHtml(doc.mimeType || '')}</div>
          </div>
          <div class="file-icon">${String(doc.mimeType || '').includes('pdf') ? 'PDF' : 'IMG'}</div>
        </div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        ${doc.notes ? `<p class="notes">${escapeHtml(doc.notes)}</p>` : ''}
        ${doc.contentSnippet ? `<p class="snippet">${escapeHtml(doc.contentSnippet)}</p>` : ''}
        <div class="actions">
          <a class="primary-link" href="${openOriginal}" target="_blank" rel="noopener">查看原始小票</a>
          ${papraUrl ? `<a href="${papraUrl}" target="_blank" rel="noopener">在 Papra 中打开</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const q = queryInput.value.trim();
  if (!q) {
    queryInput.focus();
    return;
  }

  setLoading(true);
  results.innerHTML = '';
  showStatus('正在理解你的描述并搜索 Papra…', 'info');

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    renderResults(payload);
  } catch (error) {
    showStatus(`<strong>搜索失败：</strong>${escapeHtml(error.message || error)}`, 'error');
  } finally {
    setLoading(false);
  }
});
