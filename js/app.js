/**
 * Maki Math Review Mobile Hub - Core Application Logic
 */

(function () {
  'use strict';

  // State
  const state = {
    examFilter: 'all', // 'all' | 'math1' | 'math2' | 'math3'
    tagFilter: 'all',  // 'all' | 'top_diff' | 'key' | 'zero' | 'math1_only'
    searchQuery: '',
    data: window.MAKI_MATH_DATA || null,
    expandedLectures: new Set()
  };

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const themeToggle = document.getElementById('theme-toggle');
  const examChips = document.querySelectorAll('.chip-exam');
  const tagChips = document.querySelectorAll('.chip-tag');
  const contentArea = document.getElementById('content-area');
  const searchResultsArea = document.getElementById('search-results');
  const statusBanner = document.getElementById('status-banner');

  // Simple Chinese Pinyin Initials Map for Core Math Terms
  const PINYIN_KEYWORDS = {
    'hn': '海涅', 'haine': '海涅',
    'tl': '泰勒', 'tailuo': '泰勒',
    'lbd': '洛必达', 'luobida': '洛必达',
    'zdz': '最值', 'jz': '极值', 'wxs': '无穷小',
    'djwxs': '等价无穷小', 'dy': '导数', 'wf': '微分',
    'zzdl': '中值定理', 'le': '罗尔', 'lagr': '拉格朗日',
    'kx': '柯西', 'bdjf': '不定积分', 'djf': '定积分',
    'erjf': '二重积分', 'sanjf': '三重积分',
    'qxjf': '曲线积分', 'qmjf': '曲面积分',
    'gs': '高斯公式', 'stks': '斯托克斯',
    'wfx': '微分方程', 'ej': '二阶', 'js': '级数',
    'mjs': '幂级数', 'hls': '行列式', 'jz': '矩阵',
    'xl': '向量', 'xxz': '线性方程组', 'tz': '特征值',
    'xs': '相似对角化', 'sst': '实对称', 'ecx': '二次型',
    'zd': '正定', 'gl': '概率', 'sz': '数字特征',
    'cs': '参数估计', 'zdlr': '最大似然'
  };

  // Check In-App Browser (e.g. WeChat, QQ)
  function checkInAppBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    const isWeChat = ua.includes('micromessenger');
    const isQQ = ua.includes('qq/') && !ua.includes('mqqbrowser');
    
    if (isWeChat || isQQ) {
      if (statusBanner) {
        statusBanner.style.display = 'flex';
        statusBanner.className = 'status-banner banner-math2';
        statusBanner.style.background = '#fef3c7';
        statusBanner.style.color = '#92400e';
        statusBanner.style.border = '1px solid #f59e0b';
        statusBanner.innerHTML = `
          <span>⚠️</span>
          <div><strong>当前在微信/QQ内访问</strong>：微信对大文件在线解析有限制，建议点击右上角 <strong>【···】</strong> 选择 <strong>【在浏览器打开】</strong>（推荐使用 Safari、Chrome 或手机自带系统浏览器）。</div>
        `;
      }
    }
  }

  // Initialize
  function init() {
    if (!state.data) {
      console.error('Data not loaded');
      return;
    }

    initTheme();
    bindEvents();
    checkInAppBrowser();
    renderContent();
  }

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem('maki_theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.body.classList.add('dark-theme');
      updateThemeIcon(true);
    } else {
      document.body.classList.remove('dark-theme');
      updateThemeIcon(false);
    }
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('maki_theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
  }

  function updateThemeIcon(isDark) {
    if (themeToggle) {
      themeToggle.textContent = isDark ? '☀️' : '🌙';
    }
  }

  // Event Listeners
  function bindEvents() {
    // Search
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        if (state.searchQuery) {
          searchClear.style.display = 'flex';
        } else {
          searchClear.style.display = 'none';
        }
        handleSearchOrFilter();
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.style.display = 'none';
        handleSearchOrFilter();
        searchInput.focus();
      });
    }

    // Theme Toggle
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    // Exam Filter Chips
    examChips.forEach(chip => {
      chip.addEventListener('click', () => {
        examChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.examFilter = chip.dataset.exam;
        updateStatusBanner();
        handleSearchOrFilter();
      });
    });

    // Tag Filter Chips
    tagChips.forEach(chip => {
      chip.addEventListener('click', () => {
        tagChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.tagFilter = chip.dataset.tag;
        handleSearchOrFilter();
      });
    });
  }

  function updateStatusBanner() {
    if (!statusBanner) return;

    if (state.examFilter === 'math2') {
      statusBanner.style.display = 'flex';
      statusBanner.className = 'status-banner banner-math2';
      statusBanner.innerHTML = `
        <span>💡</span>
        <div><strong>已开启【数二专属模式】</strong>：已自动标注并跳过数二不考的 20 讲（如级数、曲面积分、概率统计等），专注于高频必拿分重点！</div>
      `;
    } else if (state.examFilter === 'math1') {
      statusBanner.style.display = 'flex';
      statusBanner.className = 'status-banner';
      statusBanner.style.background = 'var(--accent-purple-light)';
      statusBanner.style.color = 'var(--accent-purple)';
      statusBanner.style.border = '1px solid rgba(139, 92, 246, 0.3)';
      statusBanner.innerHTML = `
        <span>📌</span>
        <div><strong>【数一全科模式】</strong>：重心在后半本（概率统计、曲线曲面积分、无穷级数与二次型）。</div>
      `;
    } else {
      statusBanner.style.display = 'none';
    }
  }

  function handleSearchOrFilter() {
    if (state.searchQuery) {
      contentArea.style.display = 'none';
      searchResultsArea.style.display = 'block';
      renderSearchResults();
    } else {
      contentArea.style.display = 'block';
      searchResultsArea.style.display = 'none';
      renderContent();
    }
  }

  // Render Full Content (Browsing mode)
  function renderContent() {
    const parts = state.data.parts;
    const lectures = state.data.lectures;
    const math2Skip = state.data.summary.math2_skip_lectures;

    let html = '';

    parts.forEach(part => {
      // Find lectures belonging to this part
      const partLectures = lectures.filter(l => l.part_id === part.id);
      
      // Filter by tag if needed
      const filteredLectures = partLectures.filter(l => matchFilters(l));

      if (filteredLectures.length === 0) return;

      html += `
        <div class="part-group">
          <div class="part-header">
            <div class="part-title">
              <span>📚</span>
              <span>${part.title}</span>
            </div>
            <div class="part-badge">${filteredLectures.length} 讲</div>
          </div>
          <div class="part-lectures-list">
            ${filteredLectures.map(l => renderLectureCard(l)).join('')}
          </div>
        </div>
      `;
    });

    if (!html) {
      html = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div>当前筛选条件下无对应讲义</div>
        </div>
      `;
    }

    contentArea.innerHTML = html;
    bindCardDynamicEvents(contentArea);
  }

  // Check if lecture matches current filters
  function matchFilters(lec) {
    // 1. Tag filter
    if (state.tagFilter === 'top_diff' && !lec.has_top_diff) return false;
    if (state.tagFilter === 'key' && lec.tag !== '重点讲') return false;
    if (state.tagFilter === 'zero' && !lec.has_zero_exam) return false;
    if (state.tagFilter === 'math1_only' && lec.tag !== '仅数一') return false;

    // 2. Exam filter
    if (state.examFilter === 'math2' && lec.is_math2_skip) {
      // If user wants math2 and tag filter is top_diff/key, skip it completely
      if (state.tagFilter !== 'all') return false;
    }

    return true;
  }

  // Render single lecture card
  function renderLectureCard(lec) {
    const isMath2Skip = state.examFilter === 'math2' && lec.is_math2_skip;
    const isExpanded = state.expandedLectures.has(lec.id);
    const hasTopDiff = lec.has_top_diff;

    // Badge styling
    let tagBadgeHtml = '';
    if (lec.tag === '重点讲') {
      tagBadgeHtml = `<span class="badge badge-red">🔥 重点讲</span>`;
    } else if (lec.tag === '压缩讲') {
      tagBadgeHtml = `<span class="badge badge-gray">💤 压缩讲</span>`;
    } else if (lec.tag === '仅数一') {
      tagBadgeHtml = `<span class="badge badge-purple">⚡ 仅数一</span>`;
    }

    if (hasTopDiff) {
      tagBadgeHtml += `<span class="badge badge-diff">⭐ 难度榜TOP</span>`;
    }

    if (isMath2Skip) {
      tagBadgeHtml += `<span class="badge badge-orange">数二跳过</span>`;
    }

    // Subtopics and questions count
    const qCount = lec.questions.length;
    const subCount = lec.subtopics.length;

    // Link URLs
    const lectureJumpUrl = `viewer.html?book=lecture&page=${lec.doc1_page}&ref_book=exercise&ref_page=${lec.doc2_page || 1}&title=${encodeURIComponent(lec.code + ' ' + lec.title)}`;
    const exerciseJumpUrl = `viewer.html?book=exercise&page=${lec.doc2_page || 1}&ref_book=lecture&ref_page=${lec.doc1_page}&title=${encodeURIComponent(lec.code + ' ' + lec.title)}`;

    return `
      <div class="lecture-card ${isMath2Skip ? 'math2-skip' : ''} ${hasTopDiff ? 'has-top-diff' : ''}" id="lec-${lec.id}">
        <div class="lecture-header" data-id="${lec.id}">
          <div class="card-top-row">
            <div class="code-title-group">
              <span class="lec-code">${lec.code}</span>
              <span class="lec-title">${lec.title}</span>
            </div>
            <div class="badges-group">
              ${tagBadgeHtml}
            </div>
          </div>

          <div class="card-actions-row">
            <a class="btn-jump btn-lecture" href="${lectureJumpUrl}">
              <span>📖</span>
              <span>讲义 P${lec.doc1_page}</span>
            </a>
            <a class="btn-jump btn-exercise" href="${exerciseJumpUrl}">
              <span>📝</span>
              <span>真题 P${lec.doc2_page || '-'} (${qCount}题)</span>
            </a>
            <button class="btn-expand-toggle" data-id="${lec.id}" title="展开考点与真题">
              ${isExpanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        ${lec.summary ? `<div class="lec-summary-box">${lec.summary}</div>` : ''}

        <div class="card-details ${isExpanded ? 'open' : ''}" id="details-${lec.id}">
          ${renderSubtopics(lec)}
        </div>
      </div>
    `;
  }

  // Render Subtopics & Questions for a lecture
  function renderSubtopics(lec) {
    if (!lec.subtopics || lec.subtopics.length === 0) {
      return `<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">该讲为总结综述讲，无细分考点编号</div>`;
    }

    return lec.subtopics.map(sub => {
      // Find questions belonging to this subtopic
      const subQuestions = lec.questions.filter(q => q.code.startsWith(sub.code));
      
      const subLectureUrl = `viewer.html?book=lecture&page=${sub.doc1_page}&ref_book=exercise&ref_page=${sub.doc2_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;
      const subExerciseUrl = `viewer.html?book=exercise&page=${sub.doc2_page}&ref_book=lecture&ref_page=${sub.doc1_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;

      let diffBadge = '';
      if (sub.is_top_diff) {
        diffBadge = `<span class="badge badge-diff">难度 ${sub.diff_score}</span>`;
      }
      if (sub.is_zero_exam) {
        diffBadge += `<span class="badge badge-gray">零命题</span>`;
      }

      return `
        <div class="subtopic-item">
          <div class="subtopic-header">
            <div class="subtopic-title-box">
              <span class="subtopic-code">${sub.code}</span>
              <span class="subtopic-title">${sub.title}</span>
              ${diffBadge}
            </div>
            <div class="subtopic-jump-links">
              <a class="link-mini link-mini-green" href="${subLectureUrl}">讲义P${sub.doc1_page}</a>
              <a class="link-mini link-mini-blue" href="${subExerciseUrl}">真题P${sub.doc2_page}</a>
            </div>
          </div>
          ${sub.diff_reason ? `<div style="font-size:11px;color:#dc2626;margin-bottom:4px;">💡 ${sub.diff_reason}</div>` : ''}
          
          <div class="questions-flow">
            ${subQuestions.map(q => {
              const qJumpUrl = `viewer.html?book=exercise&page=${q.doc2_page}&ref_book=lecture&ref_page=${q.doc1_page}&title=${encodeURIComponent('题' + q.code + ' ' + q.title)}`;
              return `
                <a class="q-chip" href="${qJumpUrl}" title="${q.exam} ${q.title}">
                  <span>题${q.code}</span>
                  <span class="q-stars">${q.stars || ''}</span>
                  <span>P${q.doc2_page}</span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Search Results
  function renderSearchResults() {
    const rawQuery = state.searchQuery.trim().toLowerCase();
    
    // Resolve pinyin expansion if any
    let query = rawQuery;
    for (const [abbr, kw] of Object.entries(PINYIN_KEYWORDS)) {
      if (rawQuery.includes(abbr)) {
        query = query.replace(abbr, kw);
      }
    }

    const lectures = state.data.lectures;
    const questions = state.data.questions;

    // 1. Matching Lectures
    const matchedLectures = lectures.filter(l => {
      const matchText = (l.code + ' ' + l.title + ' ' + l.raw_title + ' ' + (l.summary || '')).toLowerCase();
      return matchText.includes(query) || matchText.includes(rawQuery);
    });

    // 2. Matching Subtopics
    const matchedSubtopics = [];
    lectures.forEach(l => {
      l.subtopics.forEach(sub => {
        const matchText = (sub.code + ' ' + sub.title + ' ' + (sub.diff_reason || '')).toLowerCase();
        if (matchText.includes(query) || matchText.includes(rawQuery)) {
          matchedSubtopics.push({ sub, lecture: l });
        }
      });
    });

    // 3. Matching Questions
    const matchedQuestions = questions.filter(q => {
      const matchText = (q.code + ' ' + q.title + ' ' + q.exam).toLowerCase();
      return matchText.includes(query) || matchText.includes(rawQuery);
    });

    let html = `
      <div class="search-stats-bar">
        找到 <strong>${matchedLectures.length}</strong> 讲 · 
        <strong>${matchedSubtopics.length}</strong> 个考点 · 
        <strong>${matchedQuestions.length}</strong> 道真题
      </div>
    `;

    if (matchedLectures.length === 0 && matchedSubtopics.length === 0 && matchedQuestions.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">🍃</div>
          <div>未找到与 “${state.searchQuery}” 匹配的内容</div>
          <div style="font-size:12px;margin-top:6px;color:var(--text-muted);">可尝试搜索：海涅、泰勒、3.1、L10、2022数一 等</div>
        </div>
      `;
      searchResultsArea.innerHTML = html;
      return;
    }

    // Render Matched Lectures
    if (matchedLectures.length > 0) {
      html += `<div style="font-weight:700;font-size:13px;margin:12px 0 8px 0;color:var(--primary);">🎯 匹配的专题讲义 (${matchedLectures.length})</div>`;
      html += matchedLectures.map(l => renderLectureCard(l)).join('');
    }

    // Render Matched Subtopics if not already covered
    if (matchedSubtopics.length > 0) {
      html += `<div style="font-weight:700;font-size:13px;margin:16px 0 8px 0;color:var(--accent-green);">📌 匹配的细分考点 (${matchedSubtopics.length})</div>`;
      html += `<div class="lecture-card" style="padding:10px 14px;">`;
      matchedSubtopics.slice(0, 20).forEach(item => {
        const { sub, lecture } = item;
        const subLectureUrl = `viewer.html?book=lecture&page=${sub.doc1_page}&ref_book=exercise&ref_page=${sub.doc2_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;
        const subExerciseUrl = `viewer.html?book=exercise&page=${sub.doc2_page}&ref_book=lecture&ref_page=${sub.doc1_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;
        html += `
          <div style="padding:8px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-weight:700;color:var(--primary);font-size:12px;">${sub.code}</span>
              <span style="font-weight:600;font-size:13px;margin-left:4px;">${sub.title}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${lecture.code})</span>
            </div>
            <div style="display:flex;gap:6px;">
              <a class="link-mini link-mini-green" href="${subLectureUrl}">讲义P${sub.doc1_page}</a>
              <a class="link-mini link-mini-blue" href="${subExerciseUrl}">真题P${sub.doc2_page}</a>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    // Render Matched Questions
    if (matchedQuestions.length > 0) {
      html += `<div style="font-weight:700;font-size:13px;margin:16px 0 8px 0;color:var(--accent-orange);">📝 匹配的具体真题 (${matchedQuestions.length})</div>`;
      html += `<div class="lecture-card" style="padding:10px 14px;">`;
      matchedQuestions.slice(0, 30).forEach(q => {
        const qJumpUrl = `viewer.html?book=exercise&page=${q.doc2_page}&ref_book=lecture&ref_page=${q.doc1_page}&title=${encodeURIComponent('题' + q.code + ' ' + q.title)}`;
        html += `
          <div style="padding:8px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-weight:700;color:var(--primary);font-size:12px;">题${q.code}</span>
              <span style="font-size:12px;margin-left:4px;">${q.exam}</span>
              <span style="font-weight:600;font-size:12px;margin-left:4px;">${q.title}</span>
              <span class="q-stars">${q.stars}</span>
            </div>
            <a class="btn-jump btn-exercise" style="padding:4px 10px;font-size:11px;flex:none;" href="${qJumpUrl}">
              打开真题P${q.doc2_page}
            </a>
          </div>
        `;
      });
      if (matchedQuestions.length > 30) {
        html += `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">已展示前 30 道，请输入更详细关键词精确匹配</div>`;
      }
      html += `</div>`;
    }

    searchResultsArea.innerHTML = html;
    bindCardDynamicEvents(searchResultsArea);
  }

  // Bind dynamic card expand toggle
  function bindCardDynamicEvents(container) {
    const expandToggles = container.querySelectorAll('.btn-expand-toggle');
    expandToggles.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const details = document.getElementById(`details-${id}`);
        if (!details) return;

        if (state.expandedLectures.has(id)) {
          state.expandedLectures.delete(id);
          details.classList.remove('open');
          btn.textContent = '▼';
        } else {
          state.expandedLectures.add(id);
          details.classList.add('open');
          btn.textContent = '▲';
        }
      });
    });
  }

  // Run on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
