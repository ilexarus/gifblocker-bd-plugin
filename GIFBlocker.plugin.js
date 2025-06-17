//META{"name":"GIFBlocker","author":"GPT","version":"2.6.1","description":"Блокирует GIF/картинки/ссылки по URL-паттернам, настраиваемая степень размытия, контекст-меню и ручная проверка обновлений.","updateUrl":"https://raw.githubusercontent.com/ilexarus/gifblocker-bd-plugin/refs/heads/main/GIFBlocker.plugin.js"}*//

module.exports = class GIFBlocker {
  constructor() {
    this.updateUrl     = "https://raw.githubusercontent.com/ilexarus/gifblocker-bd-plugin/refs/heads/main/GIFBlocker.plugin.js";
    this.observer      = null;
    this.hidden        = new Set();
    this.domListener   = null;

    this.storageKeyPatterns    = "patterns";
    this.storageKeyDefaultBlur = "defaultBlurAmount";
    this.storageKeyOverlayText = "overlayText";
    this.storageKeyToggleText  = "toggleText";

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

  // --- Запуск/остановка ---
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

  // --- Спойлеринг ---
  processExisting() {
    document.querySelectorAll("img, video, a[href]").forEach(el => this.checkAndSpoiler(el));
  }
  onMutations(ms) {
    ms.forEach(m => m.addedNodes.forEach(n => this.walkNode(n)));
  }
  walkNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (["IMG","VIDEO"].includes(node.tagName) || (node.tagName==="A" && node.href))
      this.checkAndSpoiler(node);
    if (node.querySelectorAll)
      node.querySelectorAll("img, video, a[href]").forEach(el => this.checkAndSpoiler(el));
  }
  checkAndSpoiler(el) {
    if (!this.patterns.length) return;
    let url = "";
    if (el.tagName==="IMG")      url = el.src||"";
    else if (el.tagName==="VIDEO") url = el.src||el.querySelector("source")?.src||"";
    else if (el.tagName==="A")   url = el.href;
    if (!url||el.dataset.gifBlockerSpoilered) return;
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
    const o = {
      filter:       el.style.filter   ||"",
      transition:   el.style.transition||"",
      cursor:       el.style.cursor   ||"",
      visibility:   el.style.visibility||"",
      display:      el.style.display  ||"",
      pointerEvents:el.style.pointerEvents||""
    };
    el.dataset.gifBlockerOrigStyle = JSON.stringify(o);

    let target = el;
    const anc = el.closest("a[href]");
    if (anc && el.tagName!=="A") target = anc;

    const wrap = document.createElement("div");
    wrap.dataset.gifBlockerSpoilered = "true";
    wrap.style.position    = "relative";
    wrap.style.overflow    = "hidden";
    const cd = window.getComputedStyle(target).display;
    wrap.style.display     = (cd==="inline"||cd==="inline-block")?"inline-block":cd||"block";
    wrap.style.cursor      = "pointer";

    target.parentNode.replaceChild(wrap, target);
    wrap.appendChild(target);

    const blurVal = (pat.blur||this.defaultBlur).trim();
    el.style.transition    = "filter 0.24s cubic-bezier(.4,0,.2,1)";
    el.style.filter        = `blur(${blurVal})`;
    el.style.pointerEvents = "none";

    const ov = document.createElement("div");
    Object.assign(ov.style,{
      position:"absolute",top:0,left:0,
      width:"100%",height:"100%",
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(18,18,21,0.64)",
      backdropFilter:"blur(2px)",borderRadius:"6px",
      color:"var(--text-normal)",textShadow:"0 0 6px #000d",
      fontSize:"14px",padding:"4px",boxSizing:"border-box",
      zIndex:"9999",pointerEvents:"auto",userSelect:"none",
      opacity:"0",transition:"opacity 0.18s ease"
    });
    ov.innerText = this.overlayText;
    wrap.addEventListener("mouseenter", ()=> ov.style.opacity="1");
    wrap.addEventListener("mouseleave", ()=> ov.style.opacity="0");
    const clickH = e=>{
      e.preventDefault();e.stopPropagation();
      const rev = el.dataset.gifBlockerRevealed==="true";
      if (!rev) {
        el.style.filter="";el.dataset.gifBlockerRevealed="true";ov.innerText=this.toggleText;
      } else {
        el.style.filter=`blur(${blurVal})`;el.dataset.gifBlockerRevealed="false";ov.innerText=this.overlayText;
      }
    };
    wrap.addEventListener("click",clickH);
    ov.addEventListener("click",clickH);

    this.hidden.add({el,wrapper:wrap,overlay:ov,listeners:{clickH}});
    wrap.appendChild(ov);
  }
  restoreElement(item) {
    const {el,wrapper,overlay,listeners} = item;
    wrapper.removeEventListener("click",listeners.clickH);
    overlay.removeEventListener("click",listeners.clickH);
    overlay.remove();
    try {
      const o = JSON.parse(el.dataset.gifBlockerOrigStyle);
      Object.assign(el.style,{
        filter:        o.filter,
        transition:    o.transition,
        cursor:        o.cursor,
        visibility:    o.visibility,
        display:       o.display,
        pointerEvents: o.pointerEvents
      });
    }catch{el.style="";}
    delete el.dataset.gifBlockerOrigStyle;
    delete el.dataset.gifBlockerSpoilered;
    delete el.dataset.gifBlockerRevealed;
    if (wrapper.parentNode) wrapper.parentNode.replaceChild(wrapper.firstChild,wrapper);
  }

  // --- Контекст-меню блок/разблок (без изменений) ---
  onContextMenu(e){ /* ...ваша логика здесь... */ }

  // --- Ручная проверка обновлений ---
  async checkForUpdates() {
    try {
      const res = await fetch(this.updateUrl,{cache:"no-store"});
      if (!res.ok) throw new Error(res.status);
      const txt = await res.text();
      const m = txt.match(/\/\/META\{([^}]+)\}\*\//);
      if (!m) { BdApi.showToast("Обновление: META не найдена", {type:"error"}); return; }
      const remote = JSON.parse(m[1]);
      const local  = BdApi.Plugins.get("GIFBlocker").version;
      if (remote.version !== local) {
        BdApi.showToast(`Доступна версия ${remote.version} (у вас ${local})`,{type:"info"});
      } else {
        BdApi.showToast("У вас последняя версия", {type:"success"});
      }
    } catch(err) {
      BdApi.showToast("Ошибка проверки: "+err.message,{type:"error"});
    }
  }

  // --- Настройки (слайдер + кнопка обновлений) ---
  getSettingsPanel() {
    const panel = document.createElement("div");
    panel.style.padding = "12px"; panel.style.color = "var(--text-normal)";

    const h = document.createElement("h3");
    h.innerText = "GIFBlocker Settings"; h.style.marginBottom = "8px";
    panel.appendChild(h);

    // Слайдер
    const lbl = document.createElement("div");
    lbl.innerText = "Размытие по умолчанию:"; lbl.style.margin = "8px 0 4px";
    panel.appendChild(lbl);

    const row = document.createElement("div");
    row.style.display="flex"; row.style.alignItems="center"; row.style.gap="8px";
    panel.appendChild(row);

    const slider = document.createElement("input");
    slider.type="range"; slider.min="0"; slider.max="50";
    slider.value = parseInt(this.defaultBlur,10)||8;
    slider.style.flex="1"; row.appendChild(slider);

    const val = document.createElement("span");
    val.innerText = `${slider.value}px`; row.appendChild(val);
    slider.addEventListener("input",()=> val.innerText=`${slider.value}px`);

    // Кнопка сохранить blur
    const btnBlur = document.createElement("button");
    btnBlur.innerText="Сохранить"; btnBlur.style.margin="12px 0";
    btnBlur.addEventListener("click",()=>{
      const b = slider.value+"px";
      this.saveDefaultBlur(b);
      this.defaultBlur = b;
      BdApi.showToast(`Blur сохранён: ${b}`,{type:"info"});
    });
    panel.appendChild(btnBlur);

    // Кнопка проверки обновлений
    const btnUpd = document.createElement("button");
    btnUpd.innerText="Проверить обновления"; 
    btnUpd.addEventListener("click",()=>this.checkForUpdates());
    panel.appendChild(btnUpd);

    return panel;
  }

  load() {}
  unload() {}
};
