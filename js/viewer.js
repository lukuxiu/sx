/**
 * Mobile-First PDF Reader with Dual Rendering Engines & Cross-Reference Shuttle Capsule
 */

(function () {
  'use strict';

  // Configure PDF.js worker with absolute URL
  if (window.pdfjsLib) {
    try {
      const workerUrl = new URL('lib/pdfjs/pdf.worker.min.js', window.location.href).href;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch (e) {
      console.warn('Worker configuration exception:', e);
    }
  }

  // Parse URL Parameters
  const params = new URLSearchParams(window.location.search);
  let currentBook = params.get('book') || 'lecture'; // 'lecture' | 'exercise'
  let currentPage = parseInt(params.get('page')) || 1;
  let refBook = params.get('ref_book') || (currentBook === 'lecture' ? 'exercise' : 'lecture');
  let refPage = parseInt(params.get('ref_page')) || 1;
  let docTitle = params.get('title') || '';

  // Mode: 'canvas' or 'native'
  let viewMode = localStorage.getItem('maki_view_mode') || 'canvas';

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
  let loadTimeoutTimer = null;

  // DOM Elements
  const canvas = document.getElementById('pdf-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const nativeFrame = document.getElementById('native-frame');
  const docTitleEl = document.getElementById('doc-title');
  const pageInfoEl = document.getElementById('page-info');
  const pageInput = document.getElementById('page-input');
  const totalPagesEl = document.getElementById('total-pages');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  const progressBar = document.getElementById('progress-bar');
  const loadingHint = document.getElementById('loading-hint');
  const btnSlowFallback = document.getElementById('btn-slow-fallback');
  const btnModeToggle = document.getElementById('btn-mode-toggle');

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
    updateModeDisplay();
    if (viewMode === 'native') {
      renderNativeMode();
    } else {
      await loadDocument(currentBook, currentPage);
    }
  }

  // Load PDF Document in Canvas mode
  async function loadDocument(bookKey, targetPage) {
    showLoading(true, '正在连接云端原书...');
    startSlowTimer();

    try {
      if (!pdfDocs[bookKey]) {
        const loadingTask = pdfjsLib.getDocument({
          url: pdfPaths[bookKey],
          cMapPacked: true
        });

        // Track download progress in real-time
        loadingTask.onProgress = function (progress) {
          if (progress.total > 0) {
            const percent = Math.min(100, Math.round((progress.loaded / progress.total) * 100));
            const loadedMb = (progress.loaded / 1024 / 1024).toFixed(1);
            const totalMb = (progress.total / 1024 / 1024).toFixed(1);
            if (loadingText) loadingText.textContent = `下载进度: ${percent}% (${loadedMb}MB / ${totalMb}MB)`;
            if (progressBar) progressBar.style.width = percent + '%';
          } else if (progress.loaded > 0) {
            const loadedMb = (progress.loaded / 1024 / 1024).toFixed(1);
            if (loadingText) loadingText.textContent = `已下载: ${loadedMb}MB...`;
          }
        };

        pdfDocs[bookKey] = await loadingTask.promise;
      }

      currentPdfDoc = pdfDocs[bookKey];
      totalPages = currentPdfDoc.numPages;

      totalPagesEl.textContent = `/ ${totalPages}`;
      updateHeader();
      updateShuttleCapsule();

      currentPage = Math.max(1, Math.min(targetPage, totalPages));
      clearSlowTimer();
      await renderPage(currentPage);
    } catch (err) {
      console.error('PDF load error:', err);
      clearSlowTimer();
      showLoading(true, '云端加载超时或网络受限');
      if (btnSlowFallback) {
        btnSlowFallback.style.display = 'inline-block';
        btnSlowFallback.textContent = '🚀 点击切换为手机原生模式秒开此页';
      }
      if (loadingHint) {
        loadingHint.textContent = 'GitHub 节点在国内移动端偶有卡顿，原生模式可直接秒开';
      }
    } finally {
      if (currentPdfDoc) {
        showLoading(false);
      }
    }
  }

  // Render Page on Canvas
  async function renderPage(pageNum) {
    if (isRendering) {
      pageRenderingQueue = pageNum;
      return;
    }
    isRendering = true;

    try {
      const page = await currentPdfDoc.getPage(pageNum);
      const viewportContainer = document.getElementById('canvas-viewport');
      const containerWidth = Math.max(300, viewportContainer.clientWidth - 16);

      const unscaledViewport = page.getViewport({ scale: 1.0 });
      let autoScale = (containerWidth / unscaledViewport.width) * currentScale;

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

      if (btnNativeOpen) {
        btnNativeOpen.href = `${pdfPaths[currentBook]}#page=${pageNum}`;
      }
    } catch (e) {
      console.error('Render error:', e);
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

  // Native Mode Rendering
  function renderNativeMode() {
    showLoading(false);
    canvas.style.display = 'none';
    nativeFrame.style.display = 'block';

    const targetUrl = `${pdfPaths[currentBook]}#page=${currentPage}`;
    nativeFrame.src = targetUrl;

    totalPages = currentBook === 'lecture' ? 1105 : 1524;
    totalPagesEl.textContent = `/ ${totalPages}`;
    pageInput.value = currentPage;
    pageInfoEl.textContent = `第 ${currentPage} 页 (原生模式)`;

    updateHeader();
    updateShuttleCapsule();

    if (btnNativeOpen) {
      btnNativeOpen.href = targetUrl;
    }
  }

  // Switch between Canvas and Native Mode
  function toggleViewMode() {
    if (viewMode === 'canvas') {
      viewMode = 'native';
      localStorage.setItem('maki_view_mode', 'native');
      updateModeDisplay();
      renderNativeMode();
    } else {
      viewMode = 'canvas';
      localStorage.setItem('maki_view_mode', 'canvas');
      updateModeDisplay();
      nativeFrame.style.display = 'none';
      canvas.style.display = 'block';
      loadDocument(currentBook, currentPage);
    }
  }

  function updateModeDisplay() {
    if (btnModeToggle) {
      btnModeToggle.textContent = viewMode === 'native' ? '🎨 切高清Canvas' : '📱 极速原生';
    }
  }

  // Timer to offer fallback if network is slow
  function startSlowTimer() {
    clearSlowTimer();
    loadTimeoutTimer = setTimeout(() => {
      if (btnSlowFallback) {
        btnSlowFallback.style.display = 'inline-block';
        btnSlowFallback.href = `${pdfPaths[currentBook]}#page=${currentPage}`;
      }
      if (loadingHint) {
        loadingHint.textContent = '检测到云端下载较慢，可点击上方按钮直接用手机系统原生引擎秒开';
      }
    }, 4500);
  }

  function clearSlowTimer() {
    if (loadTimeoutTimer) {
      clearTimeout(loadTimeoutTimer);
      loadTimeoutTimer = null;
    }
  }

  function showLoading(show, text) {
    if (loadingOverlay) {
      loadingOverlay.style.display = show ? 'flex' : 'none';
      if (text && loadingText) loadingText.textContent = text;
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
    const newBook = refBook;
    const newPage = refPage;

    refBook = currentBook;
    refPage = currentPage;

    currentBook = newBook;
    currentPage = newPage;

    const newUrl = `viewer.html?book=${currentBook}&page=${currentPage}&ref_book=${refBook}&ref_page=${refPage}&title=${encodeURIComponent(docTitle)}`;
    window.history.replaceState({}, '', newUrl);

    if (viewMode === 'native') {
      renderNativeMode();
    } else {
      currentScale = 1.0;
      await loadDocument(currentBook, currentPage);
    }
  }

  function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > totalPages) return;
    currentPage = pageNum;
    if (viewMode === 'native') {
      renderNativeMode();
    } else {
      renderPage(currentPage);
    }
  }

  // Event bindings
  function bindEvents() {
    if (shuttleCapsule) {
      shuttleCapsule.addEventListener('click', switchShuttle);
    }

    if (btnModeToggle) {
      btnModeToggle.addEventListener('click', toggleViewMode);
    }

    if (btnSlowFallback) {
      btnSlowFallback.addEventListener('click', (e) => {
        e.preventDefault();
        toggleViewMode();
      });
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

    // Zoom buttons (Canvas mode)
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        if (viewMode === 'native') return;
        currentScale = Math.min(3.0, currentScale + 0.25);
        renderPage(currentPage);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        if (viewMode === 'native') return;
        currentScale = Math.max(0.6, currentScale - 0.25);
        renderPage(currentPage);
      });
    }

    if (btnZoomFit) {
      btnZoomFit.addEventListener('click', () => {
        if (viewMode === 'native') return;
        currentScale = 1.0;
        renderPage(currentPage);
      });
    }

    // Window resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (viewMode === 'canvas') {
          renderPage(currentPage);
        }
      }, 200);
    });

    // Touch Swipe Left/Right Gesture on canvas
    if (canvas) {
      let touchStartX = 0;
      let touchEndX = 0;
      canvas.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      canvas.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diffX = touchEndX - touchStartX;
        if (Math.abs(diffX) > 60) {
          if (diffX < 0) goToPage(currentPage + 1);
          else goToPage(currentPage - 1);
        }
      }, { passive: true });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
