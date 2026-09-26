/* Fluo — controles próprios no lugar dos nativos (select e calendário).
   O <select>/<input type=date> original continua no DOM (escondido) guardando o valor,
   então o resto do app lê .value normalmente; mudanças disparam "input" e "change". */
(() => {
  const MES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const DOW = ["D","S","T","Q","Q","S","S"];
  let open = null; // { pop, anchor, close }

  const fire = el => { el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const parse = s => { const [y, m, d] = (s || "").split("-").map(Number); return y ? new Date(y, m - 1, d) : null; };
  const fmt = s => { const d = parse(s); return d ? d.getDate() + " de " + MES[d.getMonth()] + " de " + d.getFullYear() : "Escolher data"; };

  function closeAll() { if (open) { const o = open; open = null; o.pop.classList.add("out"); o.anchor.setAttribute("aria-expanded", "false"); setTimeout(() => o.pop.remove(), 140); } }
  function place(pop, anchor) {
    pop.style.maxHeight = ""; pop.style.minWidth = anchor.getBoundingClientRect().width + "px";
    const r = anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pw = pop.offsetWidth;
    const below = vh - r.bottom - 14, above = r.top - 14, up = pop.offsetHeight > below && above > below;
    pop.style.maxHeight = Math.max(120, up ? above : below) + "px";           // limita antes de medir a altura final
    const ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(r.left, vw - pw - 8)) + "px";
    const top = up ? r.top - ph - 6 : r.bottom + 6;                          // não cobre o campo…
    pop.style.top = Math.max(8, Math.min(top, vh - ph - 8)) + "px";         // …e nunca sai da tela
    pop.style.transformOrigin = up ? "bottom" : "top";
  }
  function popover(anchor, cls, build) {
    closeAll();
    const pop = document.createElement("div"); pop.className = "cpop " + cls; pop.setAttribute("role", "dialog");
    document.body.appendChild(pop); build(pop); place(pop, anchor);
    anchor.setAttribute("aria-expanded", "true");
    open = { pop, anchor, t: Date.now() };
    return pop;
  }
  addEventListener("pointerdown", e => { if (open && !open.pop.contains(e.target) && !open.anchor.contains(e.target)) closeAll(); }, true);
  addEventListener("keydown", e => { if (e.key === "Escape" && open) { e.stopPropagation(); const a = open.anchor; closeAll(); a.focus(); } }, true);
  addEventListener("resize", closeAll);
  // rolar a página fecha (como nos menus nativos), mas não a rolagem causada pela própria abertura
  document.addEventListener("scroll", e => { if (open && !open.pop.contains(e.target) && Date.now() - open.t > 500) closeAll(); }, true);

  /* ---------- select ---------- */
  function enhanceSelect(sel) {
    if (sel.dataset.cx) return; sel.dataset.cx = "1";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "cselect" + (sel.classList.contains("inline") ? " cs-inline" : "");
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    const lbl = sel.getAttribute("aria-label") || sel.closest("label")?.firstChild?.textContent?.trim(); if (lbl) btn.setAttribute("aria-label", lbl);
    if (sel.id) btn.id = sel.id + "_btn";
    btn.style.cssText = sel.style.cssText;
    sel.after(btn); sel.classList.add("cx-hidden"); sel.tabIndex = -1;
    const sync = () => { const o = sel.selectedOptions[0]; btn.innerHTML = `<span class="cs-val">${o ? o.textContent : "—"}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`; };
    sync(); sel.addEventListener("change", sync);
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value"); // valor definido por código também atualiza o botão
    Object.defineProperty(sel, "value", { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
    const choose = (o) => { if (sel.value !== o.value) { sel.value = o.value; fire(sel); } closeAll(); btn.focus(); };
    const openList = () => {
      if (open?.anchor === btn) return closeAll();
      const pop = popover(btn, "clist", p => {
        p.setAttribute("role", "listbox");
        [...sel.options].forEach((o, i) => {
          const it = document.createElement("button"); it.type = "button"; it.className = "copt"; it.setAttribute("role", "option");
          it.setAttribute("aria-selected", o.selected); it.innerHTML = `<span>${o.textContent}</span><i aria-hidden="true">✓</i>`;
          it.style.setProperty("--d", Math.min(i, 12) * 18 + "ms");
          it.onclick = () => choose(o); p.appendChild(it);
        });
      });
      const cur = pop.querySelector('[aria-selected="true"]') || pop.firstChild;
      cur?.focus({ preventScroll: true });
      if (cur) pop.scrollTop = cur.offsetTop - pop.clientHeight / 2 + cur.offsetHeight / 2;
      pop.onkeydown = e => {
        const items = [...pop.children], i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
        else if (e.key === "Tab") closeAll();
        else if (e.key.length === 1) { const k = e.key.toLowerCase(); items.find((x, j) => j > i && x.textContent.replace(/^\W+/, "").toLowerCase().startsWith(k))?.focus() || items.find(x => x.textContent.replace(/^\W+/, "").toLowerCase().startsWith(k))?.focus(); }
      };
    };
    btn.onclick = openList;
    btn.onkeydown = e => { if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(e.key)) { e.preventDefault(); openList(); } };
  }

  /* ---------- calendário ---------- */
  function enhanceDate(inp) {
    if (inp.dataset.cx) return; inp.dataset.cx = "1";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "cselect cdate"; btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    if (inp.id) btn.id = inp.id + "_btn";
    inp.after(btn); inp.classList.add("cx-hidden"); inp.tabIndex = -1;
    const sync = () => { btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="cal-ic"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span class="cs-val">${fmt(inp.value)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`; };
    sync(); inp.addEventListener("change", sync); inp.addEventListener("input", sync);
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(inp, "value", { get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
    const openCal = () => {
      if (open?.anchor === btn) return closeAll();
      let view = parse(inp.value) || new Date(); view = new Date(view.getFullYear(), view.getMonth(), 1);
      const pop = popover(btn, "ccal", () => {});
      const draw = (dir) => {
        const sel = inp.value, today = iso(new Date());
        const first = new Date(view.getFullYear(), view.getMonth(), 1), start = new Date(first); start.setDate(1 - first.getDay());
        let cells = ""; for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const v = iso(d);
          cells += `<button type="button" class="cday${d.getMonth() !== view.getMonth() ? " other" : ""}${v === today ? " today" : ""}${v === sel ? " sel" : ""}" data-v="${v}" aria-label="${fmt(v)}">${d.getDate()}</button>`; }
        pop.innerHTML = `<div class="cal-head"><button type="button" class="cal-nav" data-n="-1" aria-label="Mês anterior">‹</button>
          <b>${MES[view.getMonth()]} <span>${view.getFullYear()}</span></b><button type="button" class="cal-nav" data-n="1" aria-label="Próximo mês">›</button></div>
          <div class="cal-grid ${dir ? (dir > 0 ? "slide-l" : "slide-r") : ""}">${DOW.map(x => `<span class="dow">${x}</span>`).join("")}${cells}</div>
          <div class="cal-foot"><button type="button" class="cal-today">Hoje</button><button type="button" class="cal-close">Fechar</button></div>`;
        pop.querySelectorAll(".cal-nav").forEach(b => b.onclick = () => { view.setMonth(view.getMonth() + +b.dataset.n); draw(+b.dataset.n); });
        pop.querySelectorAll(".cday").forEach(b => b.onclick = () => { inp.value = b.dataset.v; fire(inp); closeAll(); btn.focus(); });
        pop.querySelector(".cal-today").onclick = () => { inp.value = today; fire(inp); closeAll(); btn.focus(); };
        pop.querySelector(".cal-close").onclick = () => { closeAll(); btn.focus(); };
        place(pop, btn);
      };
      draw(0);
      (pop.querySelector(".cday.sel") || pop.querySelector(".cday.today"))?.focus({ preventScroll: true });
      pop.onkeydown = e => {
        const a = document.activeElement; if (!a?.classList.contains("cday")) return;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
        e.preventDefault(); const d = parse(a.dataset.v); d.setDate(d.getDate() + step); const v = iso(d);
        if (d.getMonth() !== view.getMonth()) { view = new Date(d.getFullYear(), d.getMonth(), 1); draw(step > 0 ? 1 : -1); }
        pop.querySelector(`.cday[data-v="${v}"]`)?.focus();
      };
    };
    btn.onclick = openCal;
  }

  /* ---------- cor (paleta própria no lugar do seletor do sistema) ---------- */
  const COLORS = ["#0e8f7e","#3cc9b3","#1b9ad1","#1d4fa8","#5663e8","#8a6fd1","#7a2fb0","#b04fa6","#e0533d","#d85a5a","#f08a24","#c98a12","#7a8a3a","#2e7d4f","#6b7389","#2e2a26"];
  function enhanceColor(inp) {
    if (inp.dataset.cx) return; inp.dataset.cx = "1";
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "cswatch " + inp.className.replace("swatch", "");
    btn.setAttribute("aria-label", inp.getAttribute("aria-label") || "Cor"); btn.setAttribute("aria-haspopup", "dialog"); btn.setAttribute("aria-expanded", "false");
    btn.style.cssText = inp.style.cssText; btn.style.background = inp.value;
    inp.after(btn); inp.classList.add("cx-hidden"); inp.tabIndex = -1;
    btn.onclick = () => {
      if (open?.anchor === btn) return closeAll();
      const pop = popover(btn, "ccolor", p => {
        p.innerHTML = COLORS.map((c, i) => `<button type="button" class="ccol${c.toLowerCase() === inp.value.toLowerCase() ? " sel" : ""}" data-c="${c}" style="background:${c};--d:${i * 12}ms" aria-label="Cor ${c}"></button>`).join("");
        p.querySelectorAll(".ccol").forEach(b => b.onclick = () => { inp.value = b.dataset.c; btn.style.background = b.dataset.c; fire(inp); closeAll(); btn.focus(); });
      });
      (pop.querySelector(".sel") || pop.firstChild).focus({ preventScroll: true });
    };
  }

  /* ---------- ver/ocultar senha ---------- */
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.2"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3.2"/><path d="M3 3l18 18" stroke-linecap="round"/></svg>';
  function enhancePassword(inp) {
    if (inp.dataset.cx) return; inp.dataset.cx = "1";
    const wrap = document.createElement("div"); wrap.className = "pwwrap";
    inp.replaceWith(wrap); wrap.appendChild(inp);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "pwtoggle"; btn.innerHTML = EYE; btn.setAttribute("aria-label", "Mostrar senha");
    wrap.appendChild(btn);
    btn.onclick = () => {
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      inp.focus({ preventScroll: true });
    };
  }

  window.Controls = {
    enhance(root = document) {
      root.querySelectorAll("select").forEach(enhanceSelect);
      root.querySelectorAll('input[type="date"]').forEach(enhanceDate);
      root.querySelectorAll('input[type="color"]').forEach(enhanceColor);
      root.querySelectorAll('input[type="password"]').forEach(enhancePassword);
    },
    close: closeAll,
  };
})();
