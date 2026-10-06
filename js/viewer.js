/**
 * Mobile-First PDF Reader with Instant Cross-Reference Shuttle Capsule
 */

(function () {
  'use strict';

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
  }

  // Parse URL Parameters
  const params = new URLSearchParams(window.location.search);
  let currentBook = params.get('book') || 'lecture'; // 'lecture' | 'exercise'
  let currentPage = parseInt(params.get('page')) || 1;
  let refBook = params.get('ref_book') || (currentBook === 'lecture' ? 'exercise' : 'lecture');
  let refPage = parseInt(params.get('ref_page')) || 1;
  let docTitle = params.get('title') || '';

  // PDF Docs cache
  const pdfDocs = {
    lecture: null,
    exercise: null
  };

  const pdfPaths = {
    lecture: 'pdf/lecture.pdf',
    exercise: 'pdf/exercise.pdf'
  };

  const bookNames = {
    lecture: '一站式大串讲 (讲义)',
    exercise: '真题分类精解 (真题)'
  };

  // State
  let currentPdfDoc = null;
  let totalPages = 1;
  let currentScale = 1.0;
  let isRendering = false;
  let pageRenderingQueue = null;

  // DOM Elements
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas.getContext('2d');
  const docTitleEl = document.getElementById('doc-title');
  const pageInfoEl = document.getElementById('page-info');
  const pageInput = document.getElementById('page-input');
  const totalPagesEl = document.getElementById('total-pages');
  const loadingOverlay = document.getElementById('loading-overlay');
  const shuttleCapsule = document.getElementById('shuttle-capsule');
  const capsuleText = document.getElementById('capsule-text');
  const capsuleIcon = document.getElementById('capsule-icon');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const edgePrev = document.getElementById('edge-prev');
  const edgeNext = document.getElementById('edge-next');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const btnNativeOpen = document.getElementById('btn-native-open');

  // Initialize
  async function init() {
    bindEvents();
    await loadDocument(currentBook, currentPage);
  }

  // Load PDF Document
  async function loadDocument(bookKey, targetPage) {
    showLoading(true);
    try {
      if (!pdfDocs[bookKey]) {
        const loadingTask = pdfjsLib.getDocument(pdfPaths[bookKey]);
        pdfDocs[bookKey] = await loadingTask.promise;
      }
      currentPdfDoc = pdfDocs[bookKey];
      totalPages = currentPdfDoc.numPages;

      totalPagesEl.textContent = `/ ${totalPages}`;
      updateHeader();
      updateShuttleCapsule();

      currentPage = Math.max(1, Math.min(targetPage, totalPages));
      await renderPage(currentPage);
    } catch (err) {
      console.error('Failed to load PDF:', err);
      alert('加载 PDF 失败，请检查文件是否存在');
    } finally {
      showLoading(false);
    }
  }

  // Render a specific page
  async function renderPage(pageNum) {
    if (isRendering) {
      pageRenderingQueue = pageNum;
      return;
    }
    isRendering = true;
    showLoading(true);

    try {
      const page = await currentPdfDoc.getPage(pageNum);
      
      // Calculate responsive mobile viewport
      const viewportContainer = document.getElementById('canvas-viewport');
      const containerWidth = Math.max(320, viewportContainer.clientWidth - 16);
      
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let autoScale = (containerWidth / unscaledViewport.width) * currentScale;

      // Handle HiDPI screens (Retina)
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: autoScale });

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      const renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: viewport
      };

      await page.render(renderContext).promise;

      pageInput.value = pageNum;
      pageInfoEl.textContent = `第 ${pageNum} / ${totalPages} 页`;

      // Update Native link
      if (btnNativeOpen) {
        btnNativeOpen.href = `${pdfPaths[currentBook]}#page=${pageNum}`;
      }
    } catch (e) {
      console.error('Page render error:', e);
    } finally {
      isRendering = false;
      showLoading(false);

      if (pageRenderingQueue !== null) {
        const next = pageRenderingQueue;
        pageRenderingQueue = null;
        renderPage(next);
      }
    }
  }

  function showLoading(show) {
    if (loadingOverlay) {
      loadingOverlay.style.display = show ? 'flex' : 'none';
    }
  }

  function updateHeader() {
    const bookLabel = bookNames[currentBook];
    docTitleEl.textContent = docTitle ? `${docTitle} · ${bookLabel}` : bookLabel;
  }

  // Update Floating Shuttle Capsule
  function updateShuttleCapsule() {
    if (!shuttleCapsule) return;

    if (currentBook === 'lecture') {
      shuttleCapsule.className = 'shuttle-capsule shuttle-to-exercise';
      capsuleIcon.textContent = '📝';
      capsuleText.textContent = `穿梭至对应真题 P${refPage}`;
    } else {
      shuttleCapsule.className = 'shuttle-capsule shuttle-to-lecture';
      capsuleIcon.textContent = '📖';
      capsuleText.textContent = `穿梭至对应讲义 P${refPage}`;
    }
  }

  // Shuttle Switch Action
  async function switchShuttle() {
    // Swap current and ref
    const newBook = refBook;
    const newPage = refPage;

    refBook = currentBook;
    refPage = currentPage;

    currentBook = newBook;
    currentPage = newPage;

    // Update query params in browser URL without full reload
    const newUrl = `viewer.html?book=${currentBook}&page=${currentPage}&ref_book=${refBook}&ref_page=${refPage}&title=${encodeURIComponent(docTitle)}`;
    window.history.replaceState({}, '', newUrl);

    currentScale = 1.0; // Reset scale on book switch
    await loadDocument(currentBook, currentPage);
  }

  // Change page
  function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > totalPages) return;
    currentPage = pageNum;
    renderPage(currentPage);
  }

  // Event bindings
  function bindEvents() {
    // Shuttle Capsule Tap
    if (shuttleCapsule) {
      shuttleCapsule.addEventListener('click', switchShuttle);
    }

    // Prev / Next Page
    const prevAction = () => goToPage(currentPage - 1);
    const nextAction = () => goToPage(currentPage + 1);

    if (btnPrev) btnPrev.addEventListener('click', prevAction);
    if (btnNext) btnNext.addEventListener('click', nextAction);
    if (edgePrev) edgePrev.addEventListener('click', prevAction);
    if (edgeNext) edgeNext.addEventListener('click', nextAction);

    // Page input
    if (pageInput) {
      pageInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val)) goToPage(val);
      });
      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) goToPage(val);
        }
      });
    }

    // Zoom buttons
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        currentScale = Math.min(3.0, currentScale + 0.25);
        renderPage(currentPage);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        currentScale = Math.max(0.6, currentScale - 0.25);
        renderPage(currentPage);
      });
    }

    if (btnZoomFit) {
      btnZoomFit.addEventListener('click', () => {
        currentScale = 1.0;
        renderPage(currentPage);
      });
    }

    // Window resize (device orientation change)
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderPage(currentPage);
      }, 200);
    });

    // Touch Swipe Left/Right Gesture on canvas
    let touchStartX = 0;
    let touchEndX = 0;
    canvas.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const diffX = touchEndX - touchStartX;
      if (Math.abs(diffX) > 60) {
        if (diffX < 0) {
          // Swipe left -> Next Page
          goToPage(currentPage + 1);
        } else {
          // Swipe right -> Prev Page
          goToPage(currentPage - 1);
        }
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
