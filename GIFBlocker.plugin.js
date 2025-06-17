/**
 * @name GIFBlocker
 * @version 2.6.0
 * @description Блокирует GIF/картинки/ссылки по URL-паттернам, настраиваемая степень размытия, своё контекст-меню с блокировкой/разблокировкой.
 * @author GPT
 */

module.exports = class GIFBlocker {
  constructor() {
    this.observer    = null;
    this.hidden      = new Set();
    this.domListener = null;

    this.storageKeyPatterns      = "patterns";
    this.storageKeyDefaultBlur   = "defaultBlurAmount";
    this.storageKeyOverlayText   = "overlayText";
    this.storageKeyToggleText    = "toggleText";

    this.defaultPatterns    = [];
    this.defaultBlurAmount  = "8px";
    this.defaultOverlayText = "Нажмите, чтобы показать";
    this.defaultToggleText  = "Скрыть";
  }

  // --- Загрузка/сохранение настроек ---
  loadPatterns() {
    const saved = BdApi.getData("GIFBlocker", this.storageKeyPatterns);
    if (Array.isArray(saved)) {
      const arr = saved.map(item => {
        if (typeof item === "string") return { pattern: item, blur: this.defaultBlurAmount };
        if (item && typeof item.pattern === "string")
          return { pattern: item.pattern, blur: (item.blur || this.defaultBlurAmount).trim() };
        return null;
      }).filter(x => x && x.pattern);
      if (arr.length !== saved.length)
        BdApi.setData("GIFBlocker", this.storageKeyPatterns, arr);
      return arr;
    }
    return this.defaultPatterns.slice();
  }
  savePatterns(arr) {
    BdApi.setData("GIFBlocker", this.storageKeyPatterns, arr);
  }

  loadDefaultBlur() {
    const b = BdApi.getData("GIFBlocker", this.storageKeyDefaultBlur);
    return (typeof b === "string" && b) ? b : this.defaultBlurAmount;
  }
  saveDefaultBlur(val) {
    BdApi.setData("GIFBlocker", this.storageKeyDefaultBlur, val);
  }

  loadOverlayText() {
    const t = BdApi.getData("GIFBlocker", this.storageKeyOverlayText);
    return (typeof t === "string" && t) ? t : this.defaultOverlayText;
  }
  saveOverlayText(str) {
    BdApi.setData("GIFBlocker", this.storageKeyOverlayText, str);
  }
  loadToggleText() {
    const t = BdApi.getData("GIFBlocker", this.storageKeyToggleText);
    return (typeof t === "string" && t) ? t : this.defaultToggleText;
  }
  saveToggleText(str) {
    BdApi.setData("GIFBlocker", this.storageKeyToggleText, str);
  }

  // --- Запуск/остановка плагина ---
  start() {
    this.patterns    = this.loadPatterns();
    this.defaultBlur = this.loadDefaultBlur();
    this.overlayText = this.loadOverlayText();
    this.toggleText  = this.loadToggleText();

    this.observer = new MutationObserver(this.onMutations.bind(this));
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.processExisting();

    this.domListener = this.onContextMenu.bind(this);
    document.body.addEventListener("contextmenu", this.domListener, true);
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    for (const it of this.hidden) {
      try { this.restoreElement(it); } catch {}
    }
    this.hidden.clear();
    if (this.domListener) {
      document.body.removeEventListener("contextmenu", this.domListener, true);
      this.domListener = null;
    }
    this.removeMenu();
  }

  // --- Обработка элементов ---
  processExisting() {
    document.querySelectorAll("img, video, a[href]").forEach(el => this.checkAndSpoiler(el));
  }
  onMutations(muts) {
    for (const m of muts) {
      if (m.addedNodes) m.addedNodes.forEach(n => this.walkNode(n));
    }
  }
  walkNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (["IMG","VIDEO"].includes(node.tagName) || (node.tagName === "A" && node.href))
      this.checkAndSpoiler(node);
    if (node.querySelectorAll)
      node.querySelectorAll("img, video, a[href]").forEach(el => this.checkAndSpoiler(el));
  }

  checkAndSpoiler(el) {
    if (!this.patterns.length) return;
    let url = "";
    if (el.tagName === "IMG") url = el.src || "";
    else if (el.tagName === "VIDEO") url = el.src || el.querySelector("source")?.src || "";
    else if (el.tagName === "A") url = el.href;
    if (!url || el.dataset.gifBlockerSpoilered) return;

    for (const pat of this.patterns) {
      if (url.includes(pat.pattern)) {
        this.applySpoiler(el, pat);
        break;
      }
    }
  }

  applySpoiler(el, pat) {
    el.dataset.gifBlockerSpoilered = "true";
    el.dataset.gifBlockerRevealed  = "false";
    const orig = {
      filter:       el.style.filter   || "",
      transition:   el.style.transition|| "",
      cursor:       el.style.cursor   || "",
      visibility:   el.style.visibility|| "",
      display:      el.style.display  || "",
      pointerEvents:el.style.pointerEvents|| ""
    };
    el.dataset.gifBlockerOrigStyle = JSON.stringify(orig);

    let target = el;
    const anc = el.closest("a[href]");
    if (anc && el.tagName !== "A") target = anc;

    const wrap = document.createElement("div");
    wrap.dataset.gifBlockerSpoilered = "true";
    wrap.style.position    = "relative";
    wrap.style.overflow    = "hidden";
    const cd = window.getComputedStyle(target).display;
    wrap.style.display     = (cd === "inline" || cd === "inline-block") ? "inline-block" : cd || "block";
    wrap.style.cursor      = "pointer";

    target.parentNode.replaceChild(wrap, target);
    wrap.appendChild(target);

    const blurVal = (pat.blur || this.defaultBlur).trim();
    el.style.transition    = "filter 0.24s cubic-bezier(.4,0,.2,1)";
    el.style.filter        = `blur(${blurVal})`;
    el.style.pointerEvents = "none";

    const ov = document.createElement("div");
    Object.assign(ov.style, {
      position:       "absolute", top:0, left:0,
      width:          "100%",    height:"100%",
      display:        "flex",    alignItems:"center", justifyContent:"center",
      background:     "rgba(18,18,21,0.64)",
      backdropFilter: "blur(2px)", borderRadius:"6px",
      color:          "var(--text-normal)", textShadow:"0 0 6px #000d",
      fontSize:       "14px",     padding:"4px", boxSizing:"border-box",
      zIndex:         "9999",     pointerEvents:"auto", userSelect:"none",
      opacity:        "0",        transition:"opacity 0.18s ease"
    });
    ov.innerText = this.overlayText;

    wrap.addEventListener("mouseenter", ()=> ov.style.opacity = "1");
    wrap.addEventListener("mouseleave", ()=> ov.style.opacity = "0");

    const clickH = e => {
      e.preventDefault(); e.stopPropagation();
      const rev = el.dataset.gifBlockerRevealed === "true";
      if (!rev) {
        el.style.filter = "";
        el.dataset.gifBlockerRevealed = "true";
        ov.innerText = this.toggleText;
      } else {
        el.style.filter = `blur(${blurVal})`;
        el.dataset.gifBlockerRevealed = "false";
        ov.innerText = this.overlayText;
      }
    };
    wrap.addEventListener("click", clickH);
    ov.addEventListener("click", clickH);

    this.hidden.add({ el, wrapper: wrap, overlay: ov, listeners: { clickH } });
    wrap.appendChild(ov);
  }

  restoreElement(item) {
    const { el, wrapper, overlay, listeners } = item;
    wrapper.removeEventListener("click", listeners.clickH);
    overlay.removeEventListener("click", listeners.clickH);
    overlay.remove();

    try {
      const o = JSON.parse(el.dataset.gifBlockerOrigStyle);
      Object.assign(el.style, {
        filter:        o.filter,
        transition:    o.transition,
        cursor:        o.cursor,
        visibility:    o.visibility,
        display:       o.display,
        pointerEvents: o.pointerEvents
      });
    } catch {
      el.style = "";
    }

    delete el.dataset.gifBlockerOrigStyle;
    delete el.dataset.gifBlockerSpoilered;
    delete el.dataset.gifBlockerRevealed;
    if (wrapper.parentNode) {
      wrapper.parentNode.replaceChild(wrapper.firstChild, wrapper);
    }
  }

  onContextMenu(e) {
    let elCtx, url;
    const blocked = e.target.closest('[data-gif-blocker-spoilered="true"]');
    if (blocked) {
      elCtx = ["IMG","VIDEO","A"].includes(blocked.tagName) ? blocked : blocked.querySelector('[data-gif-blocker-spoilered]');
      if (elCtx) {
        if (elCtx.tagName === "IMG")      url = elCtx.src;
        else if (elCtx.tagName === "VIDEO") url = elCtx.src || elCtx.querySelector("source")?.src;
        else if (elCtx.tagName === "A")    url = elCtx.href;
      }
    }
    if (!elCtx) {
      const media = e.target.closest("img,video");
      const link  = e.target.closest("a[href]");
      if (media) {
        elCtx = media;
        url   = media.src || media.querySelector("source")?.src;
      } else if (link) {
        elCtx = link;
        url   = link.href;
      }
    }
    if (!elCtx || !url) return;

    e.preventDefault(); e.stopPropagation();
    this.removeMenu();

    const isSpoilered = elCtx.dataset.gifBlockerSpoilered === "true";

    const menu = document.createElement("div");
    menu.id = "GIFBlockerMenu";
    Object.assign(menu.style, {
      position:    "fixed",
      top:         `${e.clientY}px`,
      left:        `${e.clientX}px`,
      background:  "var(--background-floating)",
      borderRadius:"6px",
      boxShadow:   "0 4px 12px rgba(0,0,0,0.3)",
      zIndex:      99999,
      minWidth:    "160px",
      padding:     "4px 0"
    });

    const item = document.createElement("div");
    item.innerText = isSpoilered
      ? "Разблокировать GIF/Image"
      : "Заблокировать GIF/Image";
    Object.assign(item.style, {
      padding:  "6px 12px",
      cursor:   "pointer",
      fontSize: "14px",
      color:    "var(--text-normal)"
    });
    item.addEventListener("mouseenter", ()=> item.style.background="var(--background-modifier-hover)");
    item.addEventListener("mouseleave", ()=> item.style.background="");
    item.addEventListener("click", () => {
      if (!isSpoilered) {
        this.patterns.push({ pattern: url, blur: this.defaultBlur });
        this.savePatterns(this.patterns);
        BdApi.showToast("GIFBlocker: паттерн добавлен и применён", { type:"info" });
        this.processExisting();
      } else {
        this.patterns = this.patterns.filter(p => p.pattern !== url);
        this.savePatterns(this.patterns);
        BdApi.showToast("GIFBlocker: паттерн удалён, перезапуск...", { type:"info" });
        this.stop();
        this.start();
      }
      this.removeMenu();
    });

    menu.appendChild(item);
    document.body.appendChild(menu);

    const cleanup = ev => {
      if (!menu.contains(ev.target)) {
        this.removeMenu();
        document.removeEventListener("mousedown", cleanup, true);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", cleanup, true), 0);
  }

  removeMenu() {
    document.getElementById("GIFBlockerMenu")?.remove();
  }

  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "12px";
    panel.style.color   = "var(--text-normal)";

    const title = document.createElement("h3");
    title.innerText = "GIFBlocker Settings";
    title.style.margin = "0 0 8px 0";
    panel.appendChild(title);

    const label = document.createElement("div");
    label.innerText = "Степень размытия по умолчанию (напр., 8px):";
    label.style.margin = "8px 0 4px 0";
    panel.appendChild(label);

    const input = document.createElement("input");
    input.type        = "text";
    input.value       = this.defaultBlur;
    input.style.width = "100%";
    input.style.padding = "4px 8px";
    input.style.border = "1px solid var(--background-modifier-accent)";
    input.style.borderRadius = "4px";
    input.style.background   = "var(--background-secondary)";
    input.style.color        = "var(--text-normal)";
    panel.appendChild(input);

    const btnSave = document.createElement("button");
    btnSave.innerText = "Сохранить";
    btnSave.style.marginTop = "8px";
    btnSave.style.padding   = "6px 12px";
    btnSave.style.border    = "none";
    btnSave.style.borderRadius = "4px";
    btnSave.style.cursor    = "pointer";
    btnSave.addEventListener("click", () => {
      const v = input.value.trim() || this.defaultBlurAmount;
      this.saveDefaultBlur(v);
      this.defaultBlur = v;
      BdApi.showToast("GIFBlocker: blur сохранён", { type: "info" });
    });
    panel.appendChild(btnSave);

    return panel;
  }

  load() {}
  unload() {}
};
