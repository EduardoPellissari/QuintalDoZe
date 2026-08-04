const params = new URLSearchParams(location.search);
const rawSrc = params.get('src') || '';
const rawDownload = params.get('download') || rawSrc;
const backUrl = params.get('back') || '/admin.html';
const title = params.get('title') || 'PDF Quintal do Zé';

const frame = document.getElementById('pdfFrame');
const fallback = document.getElementById('pdfFallback');
const fallbackOpen = document.getElementById('pdfFallbackOpen');
const downloadButton = document.getElementById('pdfDownloadButton');
const titleElement = document.getElementById('pdfViewerTitle');
const quotePreview = document.getElementById('quotePreview');
let currentQuote = null;
let currentDownloadSrc = '';

function sameOriginPath(value) {
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

function returnToSystem() {
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    window.close();
    return;
  }

  location.href = sameOriginPath(backUrl) || '/';
}

function escapePdfText(value) {
  if (typeof htmlAttr === 'function') return htmlAttr(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPdfMoney(value) {
  if (typeof money === 'function') return money(value);
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatPdfDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
}

function quoteStatusText(status) {
  const labels = {
    rascunho: 'Rascunho',
    aguardando: 'Aguardando cliente',
    aprovado: 'Aprovado',
    recusado: 'Recusado',
    cancelado: 'Cancelado',
  };
  return labels[status] || status || 'Rascunho';
}

function quoteIdFromPdfPath(pathValue) {
  const path = sameOriginPath(pathValue);
  const match = path.match(/^\/api\/quotes\/([^/?#]+)\/pdf(?:[?#].*)?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function quoteDisplayNumber(quote) {
  return String(quote?.id || '').slice(-6).padStart(4, '0');
}

function pdfFileSlug(value) {
  return String(value || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42)
    .toLowerCase() || 'cliente';
}

function suggestedPdfFileName(quote = currentQuote) {
  if (!quote) return 'orcamento-quintal-do-ze.pdf';
  return `orcamento-quintal-do-ze-${quote.id}-${pdfFileSlug(quote.clientName)}.pdf`;
}

function fileNameFromDisposition(disposition) {
  const utfMatch = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/"/g, ''));
    } catch {
      return utfMatch[1].replace(/"/g, '');
    }
  }

  const quotedMatch = String(disposition || '').match(/filename="([^"]+)"/i);
  if (quotedMatch) return quotedMatch[1];

  const plainMatch = String(disposition || '').match(/filename=([^;]+)/i);
  return plainMatch ? plainMatch[1].trim() : '';
}

function pdfFitPath(pathValue) {
  const hash = '#toolbar=0&navpanes=0&view=FitH&zoom=page-width';
  return pathValue.includes('#') ? pathValue : `${pathValue}${hash}`;
}

function showFallback({ hideOpen = false } = {}) {
  if (frame) frame.classList.add('hidden');
  if (quotePreview) quotePreview.classList.add('hidden');
  if (fallback) fallback.classList.remove('hidden');
  if (fallbackOpen) fallbackOpen.hidden = hideOpen;
}

function showNativePdf(pathValue) {
  if (!frame) return showFallback();
  if (quotePreview) quotePreview.classList.add('hidden');
  if (fallback) fallback.classList.add('hidden');
  frame.classList.remove('hidden');
  frame.src = pdfFitPath(pathValue);
}

function quoteInfoItems(quote) {
  return [
    ['Cliente', quote.clientName || '-'],
    ['Contato', quote.phone || '-'],
    ['Evento', quote.eventType || '-'],
    ['Status', quoteStatusText(quote.status)],
    ['Data', formatPdfDate(quote.eventDate)],
    ['Horario', quote.eventTime || '-'],
    ['Pessoas', quote.guests ? String(quote.guests) : '-'],
    ['Local', quote.location || '-'],
    ['Validade', formatPdfDate(quote.validUntil)],
    ['Emitido em', formatPdfDate(quote.createdAt)],
  ];
}

function quoteItemsHtml(quote) {
  const items = Array.isArray(quote.items) ? quote.items : [];

  if (!items.length) {
    return '<div class="pdf-preview-empty">Nenhum item cadastrado neste orçamento.</div>';
  }

  return items.map((item) => {
    const qty = Number(item.qty || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const total = qty * unitPrice;

    return `
      <article class="pdf-preview-item">
        <div>
          <b>${escapePdfText(item.description || 'Item do orçamento')}</b>
          <span>${qty || 0}x ${formatPdfMoney(unitPrice)} por unidade</span>
        </div>
        <strong>${formatPdfMoney(total)}</strong>
      </article>
    `;
  }).join('');
}

function quotePreviewHtml(quote) {
  const items = Array.isArray(quote.items) ? quote.items : [];
  const notes = String(quote.notes || '').trim();
  const commercialNotes = String(quote.commercialNotes || '').trim()
    || 'Valores sujeitos à disponibilidade. Entrega, montagem e itens extras serão considerados conforme combinado na proposta.';

  return `
    <article class="pdf-quote-preview-card">
      <header class="pdf-preview-hero">
        <img src="/assets/logo.jpg" alt="Logo Quintal do Zé">
        <div class="pdf-preview-hero-copy">
          <span>Proposta comercial</span>
          <h1>Orçamento Quintal do Zé</h1>
          <p>Café da tarde, happy hour, coffee break e eventos personalizados.</p>
        </div>
        <div class="pdf-preview-number">
          <span>Orçamento</span>
          <b>#${escapePdfText(quoteDisplayNumber(quote))}</b>
        </div>
      </header>

      <section class="pdf-preview-info-grid">
        ${quoteInfoItems(quote).map(([label, value]) => `
          <div class="pdf-preview-info-card">
            <span>${escapePdfText(label)}</span>
            <b>${escapePdfText(value)}</b>
          </div>
        `).join('')}
      </section>

      ${notes ? `
        <section class="pdf-preview-note">
          <span>Observações do evento</span>
          <p>${escapePdfText(notes)}</p>
        </section>
      ` : ''}

      <section class="pdf-preview-items-section">
        <div class="pdf-preview-section-head">
          <div>
            <span>Itens da proposta</span>
            <h2>Itens do orçamento</h2>
          </div>
          <b>${items.length} item(ns)</b>
        </div>

        <div class="pdf-preview-items-list">
          ${quoteItemsHtml(quote)}
        </div>

        <div class="pdf-preview-total">
          <span>Total do orçamento</span>
          <b>${formatPdfMoney(quote.total)}</b>
        </div>
      </section>

      <section class="pdf-preview-note commercial">
        <span>Condições e próximos passos</span>
        <p>${escapePdfText(commercialNotes)} Próximo passo: responda a mensagem para confirmar ou solicitar ajustes.</p>
      </section>

      <footer class="pdf-preview-footer">
        <span>Quintal do Zé</span>
        <span>Documento gerado pelo sistema de pedidos.</span>
      </footer>
    </article>
  `;
}

async function loadQuotePreview(pathValue) {
  const quoteId = quoteIdFromPdfPath(pathValue);
  if (!quoteId || !quotePreview || typeof API === 'undefined') return false;

  const quotes = await API.get('/api/quotes');
  const quote = quotes.find((item) => String(item.id) === String(quoteId));
  if (!quote) return false;

  currentQuote = quote;
  if (downloadButton) downloadButton.setAttribute('download', suggestedPdfFileName(quote));
  quotePreview.innerHTML = quotePreviewHtml(quote);
  quotePreview.classList.remove('hidden');
  if (frame) frame.classList.add('hidden');
  if (fallback) fallback.classList.add('hidden');
  return true;
}

function triggerFileDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function canSharePdfFile(file) {
  try {
    return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

async function downloadPdfFile(event) {
  event?.preventDefault();
  const pathValue = currentDownloadSrc || sameOriginPath(rawDownload || rawSrc);
  if (!pathValue || !downloadButton) return;

  const originalLabel = downloadButton.textContent;
  downloadButton.textContent = 'Preparando PDF...';
  downloadButton.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(pathValue, { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível preparar o PDF.');

    const blob = await response.blob();
    const fileName = fileNameFromDisposition(response.headers.get('Content-Disposition')) || suggestedPdfFileName();

    if (window.File) {
      const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });
      if (canSharePdfFile(file)) {
        try {
          await navigator.share({
            title: title || 'PDF Quintal do Zé',
            text: 'Segue o PDF do Quintal do Zé.',
            files: [file],
          });
          return;
        } catch (shareError) {
          if (shareError?.name === 'AbortError') return;
        }
      }
    }

    triggerFileDownload(blob, fileName);
  } catch (error) {
    alert(error.message || 'Não foi possível baixar o PDF. Tente abrir o PDF e salvar pelo navegador.');
    if (pathValue) window.open(pathValue, '_blank');
  } finally {
    downloadButton.textContent = originalLabel;
    downloadButton.removeAttribute('aria-busy');
  }
}

async function initPdfViewer() {
  const src = sameOriginPath(rawSrc);
  const downloadSrc = sameOriginPath(rawDownload || rawSrc);
  currentDownloadSrc = downloadSrc;

  if (titleElement) titleElement.textContent = title;
  document.getElementById('pdfBackButton')?.addEventListener('click', returnToSystem);

  if (!src || !downloadSrc) {
    if (downloadButton) downloadButton.hidden = true;
    showFallback({ hideOpen: true });
    return;
  }

  if (downloadButton) downloadButton.href = downloadSrc;
  if (downloadButton) {
    downloadButton.setAttribute('download', suggestedPdfFileName());
    downloadButton.addEventListener('click', downloadPdfFile);
  }
  if (fallbackOpen) fallbackOpen.href = src;

  try {
    const renderedQuote = await loadQuotePreview(src);
    if (!renderedQuote) showNativePdf(src);
  } catch {
    showNativePdf(src);
  }
}

initPdfViewer();
