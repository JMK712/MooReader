(() => {
  const SOURCE_HOST = "wx-hz.book.qq.com";
  const isSource = location.hostname === SOURCE_HOST && location.pathname.startsWith("/pages/read/read");
  const isDirectSource = location.hostname === "jinghecx.com" && location.pathname === "/responsive/read";
  const isTop = window === window.top;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  if (isSource || isDirectSource) initSource();
  if (isTop) initReader();

  function initSource() {
    let lastKey = "";
    let timer;
    let chapterHeading = null;
    let noteTexts = new Set();

    function safeUrl(value) {
      if (!value) return null;
      try {
        const url = new URL(value, location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
      } catch {
        return null;
      }
    }

    function skipNode(element) {
      if (element === chapterHeading) return true;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "BUTTON", "TARO-BUTTON-CORE", "INPUT", "SVG", "NAV", "FOOTER"].includes(element.tagName)) return true;
      const name = String(element.className || "");
      if (/read__h5_title_top|read__page_bottom|read__btn_next|read__toolbar|read__menu/i.test(name)) return true;
      if (!noteTexts.size) return false;
      const content = normalizeText(element.textContent);
      return Boolean(content && noteTexts.has(content) && !element.querySelector("img"));
    }

    function serialize(node) {
      if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const element = node;
      if (skipNode(element)) return "";
      const tag = element.tagName;
      if (tag === "BR") return "<br>";
      if (tag === "IMG" || tag === "TARO-IMAGE-CORE") {
        const image = tag === "IMG" ? element : element.querySelector("img");
        const src = safeUrl(image?.currentSrc || image?.getAttribute("src") || element.getAttribute("src"));
        if (src && /(?:^|\/)note\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(src)) {
          const note = image?.getAttribute("alt") || image?.getAttribute("title") || "注释内容暂不可用";
          return `<button type="button" class="note-marker" data-note="${escapeHtml(note)}" aria-label="查看注释" aria-expanded="false" title="查看注释">注</button>`;
        }
        return src ? `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(image?.getAttribute("alt") || "")}"></figure>` : "";
      }
      const children = Array.from(element.childNodes).map(serialize).join("");
      if (!children.trim()) return "";
      if (["P", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "SUP", "SUB", "CODE", "PRE"].includes(tag)) {
        const outputTag = tag.toLowerCase();
        return `<${outputTag}>${children}</${outputTag}>`;
      }
      if (tag === "A") {
        const href = safeUrl(element.getAttribute("href"));
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>` : children;
      }
      if (tag === "SPAN" || tag === "TARO-TEXT-CORE") return `<span>${children}</span>`;
      const blockChild = Array.from(element.children).some((child) => ["DIV", "P", "SECTION", "ARTICLE", "TARO-VIEW-CORE", "TARO-RICH-TEXT-CORE", "UL", "OL", "H1", "H2", "H3"].includes(child.tagName));
      if (!blockChild) return `<p>${children}</p>`;
      return children;
    }

    function capture() {
      const root = isDirectSource
        ? document.querySelector(".box > .content")
        : document.querySelector("#normalBookBox") || document.querySelector('[class*="read__content_inner"]');
      if (!root) return;
      let title;
      let html;
      if (isDirectSource) {
        const blocks = Array.from(root.children);
        const heading = blocks.find((element) => /^第.{1,30}[章节回]/.test(normalizeText(element.textContent)) && normalizeText(element.textContent).length < 80);
        title = normalizeText(heading?.textContent) || "当前章节";
        html = blocks.filter((element) => element !== heading)
          .flatMap((element) => (element.textContent || element.innerText || "").split(/\r?\n+/))
          .map((line) => line.trim()).filter(Boolean)
          .map((line) => `<p>${escapeHtml(line)}</p>`).join("");
        if (html.replace(/<[^>]+>/g, "").trim().length < 80) return;
      } else {
        const titleInHeader = document.querySelector('[class*="read__title___"]')?.innerText?.trim();
        const bodyHeading = root.querySelector("h1, h2");
        const titleInBody = bodyHeading?.innerText?.trim();
        title = titleInBody || titleInHeader || "当前章节";
        chapterHeading = titleInBody ? bodyHeading : null;
        noteTexts = new Set(Array.from(root.querySelectorAll("img"))
          .filter((image) => /(?:^|\/)note\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(image.currentSrc || image.getAttribute("src") || ""))
          .map((image) => normalizeText(image.getAttribute("alt"))).filter(Boolean));
        const text = (root.innerText || "").trim();
        if (text.length < 80) return;
        html = serialize(root);
        if (html.replace(/<[^>]+>/g, "").trim().length < 80) {
          html = text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
        }
      }
      const key = `${title}|${html.length}|${html.slice(0,120)}|${html.slice(-80)}`;
      if (key === lastKey) return;
      lastKey = key;
      const next = [...document.querySelectorAll("taro-button-core, button")].some((button) => /下一章/.test(button.innerText || ""));
      chrome.runtime.sendMessage({ type: "JH_CHAPTER", payload: { title, html, key, next } }).catch(() => {});
    }

    function scheduleCapture() {
      clearTimeout(timer);
      timer = setTimeout(capture, 350);
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "JH_CAPTURE_NOW") {
        lastKey = "";
        scheduleCapture();
      }
      if (message?.type === "JH_CLICK_NEXT") {
        const button = [...document.querySelectorAll("taro-button-core, button")].find((item) => /下一章/.test(item.innerText || ""));
        button?.click();
        scheduleCapture();
      }
    });

    new MutationObserver(scheduleCapture).observe(document.body, { childList: true, subtree: true, characterData: true });
    scheduleCapture();
  }

  function initReader() {
    const palettes = {
      paper: { background: "#f7f6f2", textColor: "#292b2d", accentColor: "#51718a" },
      white: { background: "#ffffff", textColor: "#24272a", accentColor: "#416b8a" },
      dark: { background: "#1e2023", textColor: "#e3e5e7", accentColor: "#9bbbd3" }
    };
    const defaults = { theme: "paper", fontSize: 21, lineHeight: 1.9, width: 780, paragraphGap: 1.15, fontFamily: "sans", ...palettes.paper };
    let preferences = { ...defaults };
    let host = null;
    let shadow = null;
    let currentKey = "";
    let previousOverflow = "";
    let previousBodyOverflow = "";
    let waitingTimer;
    let saveTimer;
    let openNoteButton = null;

    chrome.storage.local.get("jhReaderPreferences").then(({ jhReaderPreferences }) => {
      if (jhReaderPreferences && typeof jhReaderPreferences === "object") {
        preferences = { ...defaults, ...jhReaderPreferences };
        if (palettes[preferences.theme] && !jhReaderPreferences.background) Object.assign(preferences, palettes[preferences.theme]);
        applyPreferences();
      }
    }).catch(() => {});

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "JH_TOGGLE") host ? closeReader() : openReader();
      if (message?.type === "JH_CHAPTER" && message.payload) showChapter(message.payload);
    });

    function openReader() {
      if (host) return;
      previousOverflow = document.documentElement.style.overflow;
      previousBodyOverflow = document.body.style.overflow;
      host = document.createElement("div");
      host.id = "jinghe-reader-host";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:block;";
      shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <link rel="stylesheet" href="${chrome.runtime.getURL("reader.css")}">
        <div class="reader theme-paper">
          <div class="progress-track"><div class="progress-fill"></div></div>
          <header class="toolbar">
            <div class="brand" aria-label="静读模式">静读<span class="brand-dot">·</span></div>
            <div class="toolbar-title" aria-live="polite">阅读模式</div>
            <div class="toolbar-actions">
              <button type="button" data-action="font-down" title="缩小字号" aria-label="缩小字号">A−</button>
              <button type="button" data-action="font-up" title="放大字号" aria-label="放大字号">A+</button>
              <button type="button" data-action="settings" title="阅读设置" aria-label="阅读设置" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"/><path d="m19.4 13.4.1-2.8-2-.6-.7-1.6 1-1.8-2-2-1.8 1-1.6-.7-.6-2h-2.8l-.6 2-1.6.7-1.8-1-2 2 1 1.8-.7 1.6-2 .6v2.8l2 .6.7 1.6-1 1.8 2 2 1.8-1 1.6.7.6 2h2.8l.6-2 1.6-.7 1.8 1 2-2-1-1.8.7-1.6 2-.6Z"/></svg></button>
              <span class="divider"></span>
              <button type="button" data-action="close" title="退出阅读模式" aria-label="退出阅读模式"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg></button>
            </div>
          </header>
          <div class="settings" hidden>
            <div class="settings-heading"><strong>阅读设置</strong><button type="button" data-action="reset">恢复默认</button></div>
            <div class="settings-label">配色方案</div>
            <div class="choice-row theme-row">
              <button type="button" data-setting="theme" data-value="paper">暖白</button>
              <button type="button" data-setting="theme" data-value="white">纯白</button>
              <button type="button" data-setting="theme" data-value="dark">深色</button>
            </div>
            <div class="color-row">
              <label>背景 <input type="color" data-color="background" aria-label="背景颜色"></label>
              <label>文字 <input type="color" data-color="textColor" aria-label="文字颜色"></label>
              <label>强调 <input type="color" data-color="accentColor" aria-label="强调颜色"></label>
            </div>
            <label class="range-row"><span>字号 <output data-output="fontSize"></output></span><input type="range" data-range="fontSize" min="14" max="38" step="1"></label>
            <label class="range-row"><span>行距 <output data-output="lineHeight"></output></span><input type="range" data-range="lineHeight" min="1.25" max="2.6" step="0.05"></label>
            <label class="range-row"><span>正文宽度 <output data-output="width"></output></span><input type="range" data-range="width" min="480" max="1400" step="20"></label>
            <label class="range-row"><span>段落间距 <output data-output="paragraphGap"></output></span><input type="range" data-range="paragraphGap" min="0.2" max="2.4" step="0.05"></label>
            <div class="settings-label">字体</div>
            <div class="choice-row">
              <button type="button" data-setting="fontFamily" data-value="sans">无衬线</button>
              <button type="button" data-setting="fontFamily" data-value="serif">宋体 / 衬线</button>
            </div>
          </div>
          <div class="scroll-area" tabindex="0">
            <main class="page">
              <article class="article" aria-live="polite"><div class="empty">正在读取章节…</div></article>
              <footer class="article-footer"><button type="button" class="next" data-action="next" hidden>下一章 <span aria-hidden="true">→</span></button></footer>
            </main>
          </div>
        </div>`;
      document.documentElement.appendChild(host);
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      shadow.addEventListener("click", onClick);
      shadow.addEventListener("input", onInput);
      shadow.querySelector(".scroll-area").addEventListener("scroll", () => { updateProgress(); closeNote(); }, { passive: true });
      document.addEventListener("keydown", onKeyDown, true);
      applyPreferences();
      chrome.runtime.sendMessage({ type: "JH_GET_CHAPTER" }).then((result) => {
        if (host && result?.payload) showChapter(result.payload);
      }).catch(() => {});
      waitingTimer = setTimeout(() => {
        if (host && !currentKey) shadow.querySelector(".article").innerHTML = '<div class="empty">暂未识别到章节正文。请确认原页面已加载，并处于可阅读状态。</div>';
      }, 3500);
      shadow.querySelector('[data-action="close"]').focus();
    }

    function closeReader() {
      if (!host) return;
      clearTimeout(waitingTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        chrome.storage.local.set({ jhReaderPreferences: preferences }).catch(() => {});
      }
      closeNote();
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
      host = null;
      shadow = null;
      currentKey = "";
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
    }

    function showChapter(payload) {
      if (!host || !shadow || !payload?.html || payload.key === currentKey) return;
      clearTimeout(waitingTimer);
      closeNote();
      currentKey = payload.key;
      shadow.querySelector(".toolbar-title").textContent = payload.title || "当前章节";
      shadow.querySelector(".article").innerHTML = `<h1>${escapeHtml(payload.title || "当前章节")}</h1>${payload.html}`;
      shadow.querySelector(".next").hidden = !payload.next;
      shadow.querySelector(".scroll-area").scrollTop = 0;
      updateProgress();
    }

    function updateProgress() {
      if (!shadow) return;
      const scroller = shadow.querySelector(".scroll-area");
      const total = scroller.scrollHeight - scroller.clientHeight;
      const progress = total > 0 ? Math.min(100, Math.max(0, scroller.scrollTop / total * 100)) : 0;
      shadow.querySelector(".progress-fill").style.width = `${progress}%`;
    }

    function applyPreferences() {
      if (!host || !shadow) return;
      const reader = shadow.querySelector(".reader");
      const palette = palettes[preferences.theme] || {
        background: validColor(preferences.background, defaults.background),
        textColor: validColor(preferences.textColor, defaults.textColor),
        accentColor: validColor(preferences.accentColor, defaults.accentColor)
      };
      reader.className = "reader";
      reader.style.setProperty("--bg", palette.background);
      reader.style.setProperty("--surface", palette.background);
      reader.style.setProperty("--fg", palette.textColor);
      reader.style.setProperty("--accent", palette.accentColor);
      reader.style.setProperty("--muted", `color-mix(in srgb, ${palette.textColor} 64%, ${palette.background})`);
      reader.style.setProperty("--edge", `color-mix(in srgb, ${palette.textColor} 14%, ${palette.background})`);
      reader.style.setProperty("--reader-font-size", `${clamp(preferences.fontSize, 14, 38, 21)}px`);
      reader.style.setProperty("--reader-line-height", String(clamp(preferences.lineHeight, 1.25, 2.6, 1.9)));
      reader.style.setProperty("--reader-width", `${clamp(preferences.width, 480, 1400, 780)}px`);
      reader.style.setProperty("--reader-paragraph-gap", `${clamp(preferences.paragraphGap, 0.2, 2.4, 1.15)}em`);
      reader.style.setProperty("--reader-font-family", preferences.fontFamily === "serif" ? '"Songti SC", "SimSun", "Noto Serif CJK SC", Georgia, serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif');
      shadow.querySelectorAll("[data-setting]").forEach((button) => {
        button.setAttribute("aria-pressed", String(String(preferences[button.dataset.setting]) === button.dataset.value));
      });
      shadow.querySelectorAll("[data-range]").forEach((input) => {
        const setting = input.dataset.range;
        input.value = String(preferences[setting]);
        const units = setting === "fontSize" || setting === "width" ? " px" : setting === "paragraphGap" ? " em" : "";
        shadow.querySelector(`[data-output="${setting}"]`).textContent = `${preferences[setting]}${units}`;
      });
      shadow.querySelectorAll("[data-color]").forEach((input) => { input.value = palette[input.dataset.color]; });
    }

    function clamp(value, min, max, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
    }

    function validColor(value, fallback) {
      return /^#[\da-fA-F]{6}$/.test(String(value)) ? value : fallback;
    }

    function savePreferences() {
      applyPreferences();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => chrome.storage.local.set({ jhReaderPreferences: preferences }).catch(() => {}), 160);
    }

    function onClick(event) {
      const button = event.target.closest("button");
      if (!shadow?.contains(event.target)) return;
      if (button?.classList.contains("note-marker")) return toggleNote(button);
      if (button?.dataset.action === "close-note") return closeNote();
      if (openNoteButton && !event.target.closest(".note-popover")) closeNote();
      if (!button) return;
      const action = button.dataset.action;
      if (action === "close") return closeReader();
      if (action === "font-down") preferences.fontSize = Math.max(14, Number(preferences.fontSize) - 1);
      if (action === "font-up") preferences.fontSize = Math.min(38, Number(preferences.fontSize) + 1);
      if (action === "font-down" || action === "font-up") return savePreferences();
      if (action === "settings") {
        const panel = shadow.querySelector(".settings");
        panel.hidden = !panel.hidden;
        button.setAttribute("aria-expanded", String(!panel.hidden));
        return;
      }
      if (action === "next") {
        chrome.runtime.sendMessage({ type: "JH_NEXT_CHAPTER" }).catch(() => {});
        return;
      }
      if (action === "reset") {
        preferences = { ...defaults };
        savePreferences();
        return;
      }
      if (button.dataset.setting) {
        const setting = button.dataset.setting;
        preferences[setting] = button.dataset.value;
        if (setting === "theme" && palettes[preferences.theme]) Object.assign(preferences, palettes[preferences.theme]);
        savePreferences();
      }
    }

    function onInput(event) {
      const input = event.target;
      if (input.dataset.range) {
        preferences[input.dataset.range] = Number(input.value);
        savePreferences();
      }
      if (input.dataset.color) {
        if (preferences.theme !== "custom") {
          Object.assign(preferences, palettes[preferences.theme] || palettes.paper);
          preferences.theme = "custom";
        }
        preferences[input.dataset.color] = input.value;
        savePreferences();
      }
    }

    function toggleNote(button) {
      if (openNoteButton === button) return closeNote();
      closeNote();
      shadow.querySelector(".settings").hidden = true;
      shadow.querySelector('[data-action="settings"]').setAttribute("aria-expanded", "false");
      const panel = document.createElement("div");
      panel.className = "note-popover";
      panel.setAttribute("role", "note");
      const content = document.createElement("div");
      content.className = "note-text";
      content.textContent = button.dataset.note || "注释内容暂不可用";
      const close = document.createElement("button");
      close.type = "button";
      close.className = "note-close";
      close.dataset.action = "close-note";
      close.setAttribute("aria-label", "关闭注释");
      close.textContent = "×";
      panel.append(content, close);
      shadow.querySelector(".reader").appendChild(panel);
      const marker = button.getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      const left = Math.max(12, Math.min(marker.left, window.innerWidth - box.width - 12));
      const top = marker.bottom + box.height + 12 <= window.innerHeight ? marker.bottom + 8 : Math.max(12, marker.top - box.height - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      button.setAttribute("aria-expanded", "true");
      openNoteButton = button;
    }

    function closeNote() {
      if (!shadow) return;
      shadow.querySelector(".note-popover")?.remove();
      openNoteButton?.setAttribute("aria-expanded", "false");
      openNoteButton = null;
    }

    function onKeyDown(event) {
      if (!host) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        if (openNoteButton) closeNote();
        else closeReader();
      }
    }
  }
})();
