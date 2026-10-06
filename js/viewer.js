/**
 * Universal Mobile PDF Reader - Cross-Browser Compatible Edition
 * Compatible with WeChat, QQ, Quark, UC, Safari, Chrome, Edge
 */

(function () {
  'use strict';

  // Configure PDF.js worker
  if (window.pdfjsLib) {
    try {
      const workerUrl = new URL('lib/pdfjs/pdf.worker.min.js', window.location.href).href;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch (e) {
      console.warn('Worker URL resolution failed, using fallback:', e);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.js';
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
  let slowWarningTimer = null;

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

  // Check In-App Browser (e.g. WeChat, QQ)
  function checkInAppBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    const isWeChat = ua.includes('micromessenger');
    const isQQ = ua.includes('qq/') && !ua.includes('mqqbrowser');
    const isQuark = ua.includes('quark');
    
    if (isWeChat || isQQ) {
      if (loadingHint) {
        loadingHint.innerHTML = '⚠️ 提示：在微信/QQ内打开大文件受限，如遇白屏，请点击右上角 <strong>【···】</strong> 选择 <strong>【在浏览器打开】</strong>';
        loadingHint.style.color = '#fbbf24';
      }
    }
  }

  // Initialize
  async function init() {
    bindEvents();
    checkInAppBrowser();
    updateModeDisplay();

    if (viewMode === 'native') {
      renderNativeMode();
    } else {
      await loadDocument(currentBook, currentPage);
    }
  }

  // Load PDF Document in Canvas mode
  async function loadDocument(bookKey, targetPage) {
    showLoading(true, '正在加载原书...');
    startSlowTimer();

    try {
      if (!window.pdfjsLib) {
        throw new Error('PDF.js 未正确加载，当前浏览器可能拦截了脚本');
      }

      if (!pdfDocs[bookKey]) {
        const loadingTask = pdfjsLib.getDocument({
          url: pdfPaths[bookKey],
          cMapPacked: true
        });

        // Track real-time download progress
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
      recordVisit();
      await renderPage(currentPage);
    } catch (err) {
      console.error('PDF load error:', err);
      clearSlowTimer();
      showLoading(true, '在线渲染受限或网络缓慢');
      if (btnSlowFallback) {
        btnSlowFallback.style.display = 'inline-block';
        btnSlowFallback.textContent = '🚀 点击切换为手机原生模式秒开此页';
      }
      if (loadingHint) {
        loadingHint.innerHTML = '部分手机浏览器（微信/夸克）拦截在线渲染，推荐点击上方按钮或用 <strong>Chrome/Safari/Edge</strong> 打开';
        loadingHint.style.color = '#f87171';
      }
    } finally {
      if (currentPdfDoc) {
        showLoading(false);
      }
    }
  }

  // Render Page on Canvas with Universal HiDPI scale
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

      // Universal Retina scaling without context matrix transforms
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: autoScale * outputScale });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = Math.floor(viewport.width / outputScale) + "px";
      canvas.style.height = Math.floor(viewport.height / outputScale) + "px";

      const renderContext = {
        canvasContext: ctx,
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

  // Record recent visit in browser local storage
  function recordVisit() {
    try {
      const key = 'maki_math_recent_history';
      let history = JSON.parse(localStorage.getItem(key) || '[]');
      const title = docTitle || bookNames[currentBook];
      const currentUrl = window.location.href;
      history = history.filter(h => h.title !== title && h.url !== currentUrl);
      history.unshift({
        type: currentBook,
        title: title.slice(0, 30),
        page: currentPage,
        url: currentUrl
      });
      if (history.length > 8) history = history.slice(0, 8);
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {}
  }

  // Native Mode Rendering (Pure System Iframe)
  function renderNativeMode() {
    showLoading(false);
    if (canvas) canvas.style.display = 'none';
    if (nativeFrame) {
      nativeFrame.style.display = 'block';
      const targetUrl = `${pdfPaths[currentBook]}#page=${currentPage}`;
      nativeFrame.src = targetUrl;
    }
    recordVisit();

    totalPages = currentBook === 'lecture' ? 1105 : 1524;
    totalPagesEl.textContent = `/ ${totalPages}`;
    pageInput.value = currentPage;
    pageInfoEl.textContent = `第 ${currentPage} 页 (原生模式)`;

    updateHeader();
    updateShuttleCapsule();

    if (btnNativeOpen) {
      btnNativeOpen.href = `${pdfPaths[currentBook]}#page=${currentPage}`;
    }
  }

  // Toggle view mode
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
      if (nativeFrame) nativeFrame.style.display = 'none';
      if (canvas) canvas.style.display = 'block';
      loadDocument(currentBook, currentPage);
    }
  }

  function updateModeDisplay() {
    if (btnModeToggle) {
      btnModeToggle.textContent = viewMode === 'native' ? '🎨 切高清Canvas' : '📱 极速原生';
    }
  }

  function startSlowTimer() {
    clearSlowTimer();
    slowWarningTimer = setTimeout(() => {
      if (btnSlowFallback) {
        btnSlowFallback.style.display = 'inline-block';
        btnSlowFallback.textContent = `🚀 加载较慢？点击用手机原生极速打开此页 (P${currentPage})`;
      }
      if (loadingHint) {
        loadingHint.textContent = '提示：若当前网络加载较慢，建议点击上方按钮使用手机系统原生引擎秒开';
      }
    }, 3500);
  }

  function clearSlowTimer() {
    if (slowWarningTimer) {
      clearTimeout(slowWarningTimer);
      slowWarningTimer = null;
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

  // Shuttle Switch
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

    const prevAction = () => goToPage(currentPage - 1);
    const nextAction = () => goToPage(currentPage + 1);

    if (btnPrev) btnPrev.addEventListener('click', prevAction);
    if (btnNext) btnNext.addEventListener('click', nextAction);
    if (edgePrev) edgePrev.addEventListener('click', prevAction);
    if (edgeNext) edgeNext.addEventListener('click', nextAction);

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

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (viewMode === 'canvas') {
          renderPage(currentPage);
        }
      }, 200);
    });

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
