const params = new URLSearchParams(location.search);
const rawSrc = params.get('src') || '';
const rawDownload = params.get('download') || rawSrc;
const backUrl = params.get('back') || '/admin.html';
const title = params.get('title') || 'PDF Quintal do Zé';

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

const src = sameOriginPath(rawSrc);
const downloadSrc = sameOriginPath(rawDownload || rawSrc);
const frame = document.getElementById('pdfFrame');
const fallback = document.getElementById('pdfFallback');
const fallbackOpen = document.getElementById('pdfFallbackOpen');
const downloadButton = document.getElementById('pdfDownloadButton');
const titleElement = document.getElementById('pdfViewerTitle');

if (titleElement) titleElement.textContent = title;
document.getElementById('pdfBackButton')?.addEventListener('click', returnToSystem);

if (!src || !downloadSrc) {
  if (frame) frame.classList.add('hidden');
  if (fallback) fallback.classList.remove('hidden');
  if (fallbackOpen) fallbackOpen.hidden = true;
  if (downloadButton) downloadButton.hidden = true;
} else {
  if (frame) frame.src = src;
  if (downloadButton) downloadButton.href = downloadSrc;
  if (fallbackOpen) fallbackOpen.href = src;
}
