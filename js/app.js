/**
 * Maki Math · 考研数学资料搜索引擎
 * 纯粹、极速、无冗余的考研数学资料精准索引引擎
 */

(function () {
  'use strict';

  // Global App State
  const state = {
    viewPerspective: 'all', // 'all' | 'lecture' | 'exercise'
    examFilter: 'all',      // 'all' | 'math1' | 'math2' | 'math3'
    tagFilter: 'all',       // 'all' | 'top_diff' | 'key' | 'zero' | 'math1_only'
    searchQuery: '',
    data: window.MAKI_MATH_DATA || null,
    expandedLectures: new Set()
  };

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const themeToggle = document.getElementById('theme-toggle');
  const viewChips = document.querySelectorAll('.chip-view');
  const examChips = document.querySelectorAll('.chip-exam');
  const tagChips = document.querySelectorAll('.chip-tag');
  const hotTags = document.querySelectorAll('.hot-tag');
  const contentArea = document.getElementById('content-area');
  const searchResultsArea = document.getElementById('search-results');
  const statusBanner = document.getElementById('status-banner');
  const recentSection = document.getElementById('recent-section');
  const recentFlow = document.getElementById('recent-flow');
  const recentClearBtn = document.getElementById('recent-clear');

  // Math Terms Pinyin Initials Map
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

  // 1. Recent History Management (纯浏览器本地缓存，非打卡)
  const RECENT_KEY = 'maki_math_recent_history';

  function getRecentHistory() {
    try {
      const data = localStorage.getItem(RECENT_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function addRecentHistory(item) {
    let history = getRecentHistory();
    // Deduplicate by URL or unique identifier
    history = history.filter(h => h.url !== item.url && h.title !== item.title);
    history.unshift(item);
    if (history.length > 8) history = history.slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(history));
    } catch (e) {}
    renderRecentSection();
  }

  function clearRecentHistory() {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch (e) {}
    renderRecentSection();
  }

  function renderRecentSection() {
    if (!recentSection || !recentFlow) return;
    const history = getRecentHistory();
    if (history.length === 0) {
      recentSection.style.display = 'none';
      return;
    }

    recentSection.style.display = 'block';
    recentFlow.innerHTML = history.map(h => `
      <a class="recent-chip" href="${h.url}" title="${h.title}">
        <span>${h.type === 'lecture' ? '📖' : '📝'}</span>
        <span>${h.title}</span>
        <span style="color:var(--text-muted);font-size:10px;">P${h.page}</span>
      </a>
    `).join('');
  }

  // 2. In-App Browser Warning (微信/QQ)
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
          <div><strong>当前在微信/QQ内访问</strong>：微信对大文件在线解析有限制，建议点击右上角 <strong>【···】</strong> 选择 <strong>【在浏览器打开】</strong>（体验更顺畅）。</div>
        `;
      }
    }
  }

  // 3. Theme Management
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

  // 4. Tokenizer for Search Queries
  function tokenizeQuery(rawInput) {
    let q = rawInput.trim().toLowerCase();

    // Pinyin acronym conversion
    for (const [abbr, kw] of Object.entries(PINYIN_KEYWORDS)) {
      if (q.includes(abbr)) {
        q = q.replace(new RegExp(abbr, 'g'), kw);
      }
    }

    // 2-digit year conversion: 15数一 -> 2015 数一
    q = q.replace(/\b([012]\d)(?=\s*数[一二三])/g, '20$1');

    // Split compound input: 2015数一9 -> 2015 数一 (9)
    q = q.replace(/(\d{4}|\d{2})\s*(数[一二三])\s*\(?(\d+)\)?/g, '$1 $2 ($3) ');
    q = q.replace(/(\d+)(数[一二三])/g, '$1 $2 ');
    q = q.replace(/(数[一二三])(\d+)/g, '$1 ($2) ');

    // Clean noise
    q = q.replace(/[・·\s\(\)（）]+/g, ' ');

    return q.split(/\s+/).filter(Boolean);
  }

  function extractExamQNumber(examStr) {
    const m = examStr.match(/\((\d+)\)/);
    return m ? parseInt(m[1], 10) : 999;
  }

  // 5. Event Binding
  function bindEvents() {
    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
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

    // Hot Search Tags Click
    hotTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const query = tag.dataset.query;
        if (searchInput) {
          searchInput.value = query;
          state.searchQuery = query;
          searchClear.style.display = 'flex';
          handleSearchOrFilter();
        }
      });
    });

    // Theme Toggle
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    // Perspective Filter (全部 / 仅大串讲 / 仅真题精解)
    viewChips.forEach(chip => {
      chip.addEventListener('click', () => {
        viewChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.viewPerspective = chip.dataset.view;
        handleSearchOrFilter();
      });
    });

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

    // Priority Tag Filter Chips
    tagChips.forEach(chip => {
      chip.addEventListener('click', () => {
        tagChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.tagFilter = chip.dataset.tag;
        handleSearchOrFilter();
      });
    });

    // Recent Clear Button
    if (recentClearBtn) {
      recentClearBtn.addEventListener('click', clearRecentHistory);
    }

    // Delegate recent history clicks
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a[href*="viewer.html"]');
      if (target) {
        const url = target.getAttribute('href');
        const title = target.getAttribute('title') || target.innerText.trim();
        const pageMatch = url.match(/[?&]page=(\d+)/);
        const bookMatch = url.match(/[?&]book=(\w+)/);
        const page = pageMatch ? pageMatch[1] : 1;
        const book = bookMatch ? bookMatch[1] : 'lecture';
        addRecentHistory({
          type: book,
          title: title.slice(0, 30),
          page,
          url
        });
      }
    });
  }

  function updateStatusBanner() {
    if (!statusBanner) return;

    if (state.examFilter === 'math2') {
      statusBanner.style.display = 'flex';
      statusBanner.className = 'status-banner banner-math2';
      statusBanner.innerHTML = `
        <span>💡</span>
        <div><strong>【数学二专属模式】</strong>：已标记并折叠数二不考的 20 讲（如级数、曲面积分、概率等）。</div>
      `;
    } else if (state.examFilter === 'math1') {
      statusBanner.style.display = 'flex';
      statusBanner.className = 'status-banner';
      statusBanner.style.background = 'var(--accent-purple-light)';
      statusBanner.style.color = 'var(--accent-purple)';
      statusBanner.style.border = '1px solid rgba(139, 92, 246, 0.3)';
      statusBanner.innerHTML = `
        <span>📌</span>
        <div><strong>【数学一全科模式】</strong>：重点涵盖概率统计、曲线曲面积分、无穷级数与二次型。</div>
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

  // 6. Three-Column Categorized Search Results (核心亮点)
  function renderSearchResults() {
    const rawQuery = state.searchQuery.trim();
    if (!rawQuery) {
      handleSearchOrFilter();
      return;
    }

    const tokens = tokenizeQuery(rawQuery);
    const lectures = state.data.lectures;
    const questions = state.data.questions;

    const lectureMap = {};
    lectures.forEach(l => { lectureMap[l.id] = l; });

    // Category 1: 📖 《大串讲》核心知识与专题
    const matchedLectures = lectures.filter(l => {
      const blob = (l.code + ' ' + l.title + ' ' + l.raw_title + ' ' + (l.summary || '')).toLowerCase();
      const cleanBlob = blob.replace(/[・·\s\(\)（）第讲]+/g, '');
      return tokens.every(t => {
        const cleanT = t.replace(/[・·\s\(\)（）第讲]+/g, '');
        return blob.includes(t) || cleanBlob.includes(cleanT);
      });
    });

    // Category 2: 📌 关联考点与细分小节
    const matchedSubtopics = [];
    lectures.forEach(l => {
      l.subtopics.forEach(sub => {
        const blob = (sub.code + ' ' + sub.title + ' ' + (sub.diff_reason || '') + ' ' + l.code + ' ' + l.title).toLowerCase();
        const cleanBlob = blob.replace(/[・·\s\(\)（）]+/g, '');
        const isMatch = tokens.every(t => {
          const cleanT = t.replace(/[・·\s\(\)（）]+/g, '');
          return blob.includes(t) || cleanBlob.includes(cleanT);
        });
        if (isMatch) {
          matchedSubtopics.push({ sub, lecture: l });
        }
      });
    });

    // Category 3: 📝 《真题分类精解》考题
    const scoredQuestions = [];
    questions.forEach(q => {
      const lec = lectureMap[q.lecture_id] || {};
      const rawBlob = `${q.code} 题${q.code} ${q.title} ${q.exam} ${lec.code || ''} ${lec.title || ''} 第${lec.id || ''}讲`.toLowerCase();
      const cleanBlob = rawBlob.replace(/[・·\s\(\)（）第题]+/g, '');

      let allMatched = true;
      let score = 0;

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const cleanT = t.replace(/[・·\s\(\)（）第题]+/g, '');
        if (rawBlob.includes(t) || cleanBlob.includes(cleanT)) {
          score += 10;
          if (cleanT && (q.exam.includes(`(${cleanT})`) || q.exam.includes(`・${cleanT}・`))) {
            score += 150; // Exact question number bonus
          }
          if (cleanT && q.code === cleanT) {
            score += 120; // Exact code bonus
          }
          if (q.title && q.title.toLowerCase().includes(t)) {
            score += 40;
          }
        } else {
          allMatched = false;
          break;
        }
      }

      if (allMatched) {
        scoredQuestions.push({
          q,
          lecture: lec,
          score,
          examQNum: extractExamQNumber(q.exam)
        });
      }
    });

    // Sort questions by score descending, then exam question number ascending
    scoredQuestions.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.examQNum - b.examQNum;
    });

    const matchedQuestions = scoredQuestions.map(item => item.q);

    // Build Search Results HTML
    let html = `
      <div class="search-stats-bar">
        已检索出 <strong>${matchedLectures.length}</strong> 个串讲专题 · 
        <strong>${matchedQuestions.length}</strong> 道分类真题 · 
        <strong>${matchedSubtopics.length}</strong> 个细分考点
      </div>
    `;

    if (matchedLectures.length === 0 && matchedSubtopics.length === 0 && matchedQuestions.length === 0) {
      html += `
        <div class="empty-state">
          <div class="empty-icon">🍃</div>
          <div>未找到与 “${state.searchQuery}” 匹配的资料</div>
          <div style="font-size:12px;margin-top:6px;color:var(--text-muted);">
            可尝试搜索：<code>泰勒</code>、<code>二重积分</code>、<code>2015数一9</code>、<code>3.1</code>、<code>L10</code>
          </div>
        </div>
      `;
      searchResultsArea.innerHTML = html;
      return;
    }

    // Perspective Filter
    const showLectures = state.viewPerspective === 'all' || state.viewPerspective === 'lecture';
    const showQuestions = state.viewPerspective === 'all' || state.viewPerspective === 'exercise';

    // 1. Block: 📖 大串讲方法论
    if (showLectures && matchedLectures.length > 0) {
      html += `
        <div class="search-category-block">
          <div class="search-cat-title cat-lecture">
            <span>📖</span>
            <span>《大串讲》知识点与专题方法 (${matchedLectures.length})</span>
          </div>
          <div class="lectures-list">
            ${matchedLectures.map(l => renderLectureCard(l)).join('')}
          </div>
        </div>
      `;
    }

    // 2. Block: 📝 真题分类精解
    if (showQuestions && matchedQuestions.length > 0) {
      html += `
        <div class="search-category-block">
          <div class="search-cat-title cat-exercise">
            <span>📝</span>
            <span>《真题分类精解》真题对应题解 (${matchedQuestions.length})</span>
          </div>
          <div class="lecture-card" style="padding:10px 14px;">
      `;

      matchedQuestions.slice(0, 40).forEach(q => {
        const lec = lectureMap[q.lecture_id] || {};
        const qJumpUrl = `viewer.html?book=exercise&page=${q.doc2_page}&ref_book=lecture&ref_page=${q.doc1_page}&title=${encodeURIComponent('题' + q.code + ' ' + q.title)}`;
        const lecJumpUrl = `viewer.html?book=lecture&page=${q.doc1_page}&ref_book=exercise&ref_page=${q.doc2_page}&title=${encodeURIComponent((lec.code || '') + ' ' + (lec.title || ''))}`;
        
        html += `
          <div style="padding:10px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="flex:1;">
              <div class="breadcrumb-trail">
                <span>${lec.part_title ? lec.part_title.split(' ')[0] : '考点'}</span>
                <span>/</span>
                <span>${lec.code || ''} ${lec.title || ''}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin:2px 0;">
                <span style="font-weight:700;color:var(--primary);font-size:12px;">题${q.code}</span>
                <span style="font-size:12px;font-weight:600;color:var(--text-primary);">${q.exam}</span>
                <span class="q-stars">${q.stars || ''}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">${q.title}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
              <a class="btn-jump btn-exercise" style="padding:4px 8px;font-size:11px;" href="${qJumpUrl}" title="${q.exam} ${q.title}">
                📝 题目 P${q.doc2_page}
              </a>
              <a class="btn-jump btn-lecture" style="padding:4px 8px;font-size:11px;" href="${lecJumpUrl}" title="大串讲方法论 ${lec.code}">
                📖 讲义 P${q.doc1_page}
              </a>
            </div>
          </div>
        `;
      });

      if (matchedQuestions.length > 40) {
        html += `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">已展示前 40 道真题，可输入具体年份或题号精准定位</div>`;
      }
      html += `</div></div>`;
    }

    // 3. Block: 📌 关联考点与延伸专题
    if (matchedSubtopics.length > 0) {
      html += `
        <div class="search-category-block">
          <div class="search-cat-title cat-subtopic">
            <span>📌</span>
            <span>关联考点与细分小节 (${matchedSubtopics.length})</span>
          </div>
          <div class="lecture-card" style="padding:10px 14px;">
      `;

      matchedSubtopics.slice(0, 20).forEach(item => {
        const { sub, lecture } = item;
        const subLectureUrl = `viewer.html?book=lecture&page=${sub.doc1_page}&ref_book=exercise&ref_page=${sub.doc2_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;
        const subExerciseUrl = `viewer.html?book=exercise&page=${sub.doc2_page}&ref_book=lecture&ref_page=${sub.doc1_page}&title=${encodeURIComponent(sub.code + ' ' + sub.title)}`;
        
        html += `
          <div style="padding:8px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div class="breadcrumb-trail">
                <span>${lecture.code} ${lecture.title}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-weight:700;color:var(--primary);font-size:12px;">${sub.code}</span>
                <span style="font-weight:600;font-size:13px;">${sub.title}</span>
                ${sub.is_top_diff ? `<span class="badge badge-diff">难度 ${sub.diff_score}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <a class="link-mini link-mini-green" href="${subLectureUrl}" title="讲义 ${sub.title}">讲义P${sub.doc1_page}</a>
              <a class="link-mini link-mini-blue" href="${subExerciseUrl}" title="真题 ${sub.title}">真题P${sub.doc2_page}</a>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    searchResultsArea.innerHTML = html;
    bindCardDynamicEvents(searchResultsArea);
  }

  // 7. Regular Browsing Mode (3-Level Clean Directory Hierarchy)
  function renderContent() {
    const parts = state.data.parts;
    const lectures = state.data.lectures;

    let html = '';

    parts.forEach(part => {
      const partLectures = lectures.filter(l => l.part_id === part.id);
      const filteredLectures = partLectures.filter(l => matchFilters(l));

      if (filteredLectures.length === 0) return;

      html += `
        <div class="part-group">
          <div class="part-header">
            <div class="part-title">
              <span>📂</span>
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
          <div>当前筛选条件下无对应资料</div>
        </div>
      `;
    }

    contentArea.innerHTML = html;
    bindCardDynamicEvents(contentArea);
  }

  function matchFilters(lec) {
    if (state.tagFilter === 'top_diff' && !lec.has_top_diff) return false;
    if (state.tagFilter === 'key' && lec.tag !== '重点讲') return false;
    if (state.tagFilter === 'zero' && !lec.has_zero_exam) return false;
    if (state.tagFilter === 'math1_only' && lec.tag !== '仅数一') return false;

    if (state.examFilter === 'math2' && lec.is_math2_skip) {
      if (state.tagFilter !== 'all') return false;
    }

    return true;
  }

  // Render Lecture Card
  function renderLectureCard(lec) {
    const isMath2Skip = state.examFilter === 'math2' && lec.is_math2_skip;
    const isExpanded = state.expandedLectures.has(lec.id);
    const hasTopDiff = lec.has_top_diff;

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

    const qCount = lec.questions.length;
    const lectureJumpUrl = `viewer.html?book=lecture&page=${lec.doc1_page}&ref_book=exercise&ref_page=${lec.doc2_page || 1}&title=${encodeURIComponent(lec.code + ' ' + lec.title)}`;
    const exerciseJumpUrl = `viewer.html?book=exercise&page=${lec.doc2_page || 1}&ref_book=lecture&ref_page=${lec.doc1_page}&title=${encodeURIComponent(lec.code + ' ' + lec.title)}`;

    return `
      <div class="lecture-card ${isMath2Skip ? 'math2-skip' : ''} ${hasTopDiff ? 'has-top-diff' : ''}" id="lec-${lec.id}">
        <div class="lecture-header" data-id="${lec.id}">
          <div class="breadcrumb-trail">
            <span>${lec.part_title ? lec.part_title.split(' ')[0] : '考点'}</span>
            <span>/</span>
            <span>${lec.code}</span>
          </div>

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
            <a class="btn-jump btn-lecture" href="${lectureJumpUrl}" title="${lec.code} ${lec.title}">
              <span>📖</span>
              <span>讲义 P${lec.doc1_page}</span>
            </a>
            <a class="btn-jump btn-exercise" href="${exerciseJumpUrl}" title="${lec.code} ${lec.title} 真题">
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

  function renderSubtopics(lec) {
    if (!lec.subtopics || lec.subtopics.length === 0) {
      return `<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">该讲为总结综述讲，无细分考点编号</div>`;
    }

    return lec.subtopics.map(sub => {
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
              <a class="link-mini link-mini-green" href="${subLectureUrl}" title="大串讲 ${sub.title}">讲义P${sub.doc1_page}</a>
              <a class="link-mini link-mini-blue" href="${subExerciseUrl}" title="真题 ${sub.title}">真题P${sub.doc2_page}</a>
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

  // Initialize
  function init() {
    if (!state.data) {
      console.error('Data not loaded');
      return;
    }

    initTheme();
    bindEvents();
    checkInAppBrowser();
    renderRecentSection();
    renderContent();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
