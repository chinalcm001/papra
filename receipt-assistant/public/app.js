const form = document.querySelector('#chat-form');
const input = document.querySelector('#query');
const sendButton = document.querySelector('#send-button');
const voiceButton = document.querySelector('#voice-button');
const voiceHint = document.querySelector('#voice-hint');
const conversation = document.querySelector('#conversation');

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function money(cents, currency = 'EUR') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(Number(cents || 0) / 100);
}
function formatDate(value) {
  if (!value) return '日期未知';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('zh-CN').format(d);
}
function scrollBottom() {
  window.requestAnimationFrame(() => conversation.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
}
function addMessage(role, html) {
  const article = document.createElement('article');
  article.className = `message ${role}`;
  article.innerHTML = role === 'assistant'
    ? `<div class="avatar">P</div><div class="bubble">${html}</div>`
    : `<div class="bubble">${html}</div>`;
  conversation.append(article);
  scrollBottom();
  return article;
}
function setLoading(value) {
  sendButton.disabled = value;
  voiceButton.disabled = value;
  sendButton.textContent = value ? '处理中…' : '发送';
}

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', () => {
    input.value = button.dataset.example || '';
    input.focus();
  });
}

function receiptCards(payload) {
  const docs = payload.documents || [];
  if (!docs.length) return '<div class="empty">没有找到相关票据。可以减少条件，只说品牌、商店或商品名。</div>';
  return `<div class="cards">${docs.map((doc) => {
    const original = `/api/documents/${encodeURIComponent(doc.id)}/file`;
    const papra = !payload.demo && payload.papraBaseUrl
      ? `${payload.papraBaseUrl}/organizations/${encodeURIComponent(payload.organizationId)}/documents/${encodeURIComponent(doc.id)}`
      : '';
    const dateValue = (doc.documentDate || doc.createdAt || '').slice(0, 10);
    return `<div class="card">
      <strong>${escapeHtml(doc.name)}</strong>
      <div class="meta">${escapeHtml(formatDate(dateValue))}</div>
      ${doc.contentSnippet ? `<p>${escapeHtml(doc.contentSnippet)}</p>` : ''}
      <div class="links"><a href="${original}" target="_blank">查看原始小票</a>${papra ? `<a href="${papra}" target="_blank">Papra</a>` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

function transactionRows(rows = []) {
  if (!rows.length) return '<div class="empty">还没有符合条件的账目。</div>';
  return `<div class="tx-list">${rows.map((tx) => `<div class="tx-row">
    <div><strong>${escapeHtml(tx.merchant || tx.category)}</strong><span>${escapeHtml(tx.category)} · ${escapeHtml(tx.transactionDate)}</span></div>
    <b class="${tx.kind}">${tx.kind === 'income' ? '+' : '-'}${escapeHtml(money(tx.amountCents, tx.currency))}</b>
  </div>`).join('')}</div>`;
}

function summaryHtml(payload) {
  const s = payload.summary;
  const categories = s.categories || [];
  return `<div class="summary-grid">
    <div><span>支出</span><strong>${money(s.expenseCents)}</strong></div>
    <div><span>收入</span><strong>${money(s.incomeCents)}</strong></div>
    <div><span>结余</span><strong>${money(s.balanceCents)}</strong></div>
  </div>${categories.length ? `<div class="breakdown"><h3>支出分类</h3>${categories.map((x) => `<div><span>${escapeHtml(x.category)} · ${x.count}笔</span><strong>${money(x.amountCents)}</strong></div>`).join('')}</div>` : ''}`;
}

async function saveTransaction(tx, card) {
  const response = await fetch('/api/ledger/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(tx),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  card.querySelector('.confirm-actions').innerHTML = '<span class="saved">✓ 已保存</span>';
  card.querySelectorAll('button,input,select').forEach((el) => { el.disabled = true; });
}

function confirmTransactionHtml(tx) {
  return `<div class="confirm-card">
    <div class="confirm-grid">
      <label>类型<select data-field="kind"><option value="expense" ${tx.kind === 'expense' ? 'selected' : ''}>支出</option><option value="income" ${tx.kind === 'income' ? 'selected' : ''}>收入</option></select></label>
      <label>金额<input data-field="amount" type="number" step="0.01" value="${(tx.amountCents / 100).toFixed(2)}"></label>
      <label>日期<input data-field="transactionDate" type="date" value="${escapeHtml(tx.transactionDate)}"></label>
      <label>分类<input data-field="category" value="${escapeHtml(tx.category)}"></label>
      <label>商店<input data-field="merchant" value="${escapeHtml(tx.merchant)}"></label>
      <label class="wide">备注<input data-field="note" value="${escapeHtml(tx.note)}"></label>
    </div>
    <div class="confirm-actions"><button class="save primary" type="button">确认记账</button><button class="cancel secondary" type="button">取消</button></div>
  </div>`;
}

async function submitMessage(message, source = 'text') {
  addMessage('user', escapeHtml(message));
  setLoading(true);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, source }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    if (payload.type === 'confirm_transaction') {
      const article = addMessage('assistant', `${escapeHtml(payload.message)}${confirmTransactionHtml(payload.transaction)}`);
      article.querySelector('.cancel').addEventListener('click', () => article.remove());
      article.querySelector('.save').addEventListener('click', async () => {
        try {
          const card = article.querySelector('.confirm-card');
          const amount = Math.round(Number(card.querySelector('[data-field="amount"]').value) * 100);
          const tx = {
            ...payload.transaction,
            amountCents: amount,
            kind: card.querySelector('[data-field="kind"]').value,
            transactionDate: card.querySelector('[data-field="transactionDate"]').value,
            category: card.querySelector('[data-field="category"]').value,
            merchant: card.querySelector('[data-field="merchant"]').value,
            note: card.querySelector('[data-field="note"]').value,
          };
          await saveTransaction(tx, card);
        } catch (error) {
          addMessage('assistant', `保存失败：${escapeHtml(error.message)}`);
        }
      });
    } else if (payload.type === 'summary') {
      addMessage('assistant', `<p>${escapeHtml(payload.message)}</p>${summaryHtml(payload)}`);
    } else if (payload.type === 'transactions') {
      addMessage('assistant', `<p>${escapeHtml(payload.message)}</p>${transactionRows(payload.transactions)}`);
    } else if (payload.type === 'receipts') {
      addMessage('assistant', `<p>${escapeHtml(payload.message)}</p>${receiptCards(payload)}`);
    } else {
      addMessage('assistant', escapeHtml(payload.message || '完成'));
    }
  } catch (error) {
    addMessage('assistant', `<span class="error">处理失败：${escapeHtml(error.message || error)}</span>`);
  } finally {
    setLoading(false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  await submitMessage(message, 'text');
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) {
  voiceButton.disabled = true;
  voiceHint.textContent = '当前浏览器不支持直接语音转文字；文字记账不受影响。Chrome/Edge 通常支持。';
} else {
  const recognition = new Recognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => {
    voiceButton.textContent = '● 正在听';
    voiceButton.classList.add('recording');
    voiceHint.textContent = '说完后会先转成文字，再让你确认记账。';
  };
  recognition.onend = () => {
    voiceButton.textContent = '🎙 语音';
    voiceButton.classList.remove('recording');
  };
  recognition.onerror = (event) => { voiceHint.textContent = `语音识别失败：${event.error}`; };
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript?.trim();
    if (text) {
      input.value = text;
      submitMessage(text, 'voice');
      input.value = '';
    }
  };
  voiceButton.addEventListener('click', () => recognition.start());
}
