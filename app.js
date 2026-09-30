/* Fluo — app
   Modelo dinâmico (sem "gerar mês"): qualquer mês é calculado a partir de
   recorrentes (início/fim), parcelas (data + nº) e avulsos (data). */
(() => {
const MES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const brl = v => (v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = v => (v < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(v)).toLocaleString("pt-BR");
const money = (v, cls = "") => `<span class="money num ${cls}">${brl(v)}</span>`;
const mk = (y, m) => y + "-" + String(m).padStart(2, "0");
const addM = (k, n) => { let [y, m] = k.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return mk(y, m); };
const diffM = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const label = k => { const [y, m] = k.split("-"); return MES[+m - 1] + " " + y; };
const short = k => { const [y, m] = k.split("-"); return MES[+m - 1].slice(0, 3) + "/" + y.slice(2); };
const today = () => { const d = new Date(); return mk(d.getFullYear(), d.getMonth() + 1) + "-" + String(d.getDate()).padStart(2, "0"); };
const NOW = today().slice(0, 7);
const PAL = ["#0e8f7e","#e0533d","#5663e8","#c98a12","#b04fa6","#1b9ad1","#7a8a3a","#8a6fd1","#d85a5a","#2e2a26","#1d4fa8","#7a2fb0"];

/* ---------- estado inicial ---------- */
function baseState() {
  return {
    v: 1,
    prefs: { theme: "auto", priv: false },
    cats: [
      { id: "salario", n: "Salário", e: "salario", cor: "#0e8f7e", tipo: "entrada" },
      { id: "extra", n: "Renda extra", e: "extra", cor: "#3cc9b3", tipo: "entrada" },
      { id: "invest", n: "Investimento", e: "invest", cor: "#5663e8", tipo: "invest" },
      { id: "moradia", n: "Moradia", e: "moradia", cor: "#8a6fd1", tipo: "saida" },
      { id: "contas", n: "Contas", e: "contas", cor: "#6b7389", tipo: "saida" },
      { id: "transporte", n: "Transporte", e: "transporte", cor: "#1b9ad1", tipo: "saida" },
      { id: "alimentacao", n: "Alimentação", e: "alimentacao", cor: "#e0533d", tipo: "saida" },
      { id: "assinaturas", n: "Assinaturas", e: "assinaturas", cor: "#b04fa6", tipo: "saida" },
      { id: "saude", n: "Saúde", e: "saude", cor: "#7a8a3a", tipo: "saida" },
      { id: "lazer", n: "Lazer", e: "lazer", cor: "#c98a12", tipo: "saida" },
      { id: "compras", n: "Compras", e: "compras", cor: "#d85a5a", tipo: "saida" },
      { id: "outros", n: "Outros", e: "outros", cor: "#8b93ab", tipo: "saida" }],
    contas: [
      { id: "debito", n: "Débito / Pix", cor: "#8a6fd1", tipo: "debito" },
      { id: "boleto", n: "Boleto", cor: "#d85a5a", tipo: "boleto" }],
    pessoas: [], recorrentes: [], parcelas: [], avulsos: [], dividas: [], pagos: {}, metas: [],
  };
}
let S = null, cur = NOW, page = "mes", sub = "mes", filtro = "tudo", busca = "", animate = true, charts = [];
const cat = id => S.cats.find(c => c.id === id) || { n: "Sem categoria", e: "outros", cor: "#8b93ab" };
const conta = id => S.contas.find(c => c.id === id) || { n: "Sem conta", cor: "#8b93ab", tipo: "debito" };
const ic = (key, size) => (window.Icons && Icons.render(key, size)) || esc(key || "•");
const pessoa = id => S.pessoas.find(p => p.id === id) || { n: "?", cor: "#8b93ab" };
const pessoaConta = pid => S.contas.find(c => c.pessoa === pid);
const autoDebt = p => { const pc = pessoaConta(p.id); if (!pc) return 0; const v = calc(cur).porConta[pc.id] || 0; return S.pagos[cur]?.["card:" + pc.id] ? 0 : v; };

/* ---------- cálculo ---------- */
function monthItems(k) {
  const out = [];
  S.recorrentes.forEach(r => { if (diffM(r.inicio, k) >= 0 && (!r.fim || diffM(k, r.fim) >= 0)) out.push({ ...r, src: "rec", dia: r.dia || 1 }); });
  S.parcelas.forEach(p => { const i = diffM(p.data.slice(0, 7), k); if (i >= 0 && i < p.n && (!p.fim || diffM(k, p.fim) >= 0)) out.push({ ...p, tipo: "saida", src: "parc", idx: i + 1, dia: +p.data.slice(8) }); });
  S.avulsos.forEach(a => { if (a.data.slice(0, 7) === k) out.push({ ...a, src: "avulso", dia: +a.data.slice(8) }); });
  return out.sort((a, b) => b.dia - a.dia);
}
const isPaid = (k, it) => {
  if (it.tipo !== "saida") return true;
  const c = conta(it.conta);
  if (c.tipo === "credito") return !!S.pagos[k]?.["card:" + c.id];
  if (it.src === "rec") return !!S.pagos[k]?.[it.id];
  return true;
};
function calc(k) {
  const it = monthItems(k), sum = f => it.filter(f).reduce((t, x) => t + x.v, 0);
  const ent = sum(x => x.tipo === "entrada"), inv = sum(x => x.tipo === "invest"), sai = sum(x => x.tipo === "saida");
  const fixo = sum(x => x.tipo === "saida" && x.src === "rec"), parc = sum(x => x.src === "parc"), vari = sum(x => x.tipo === "saida" && x.src === "avulso");
  const porCat = {}, porConta = {};
  it.filter(x => x.tipo === "saida").forEach(x => { porCat[x.cat] = (porCat[x.cat] || 0) + x.v; porConta[x.conta] = (porConta[x.conta] || 0) + x.v; });
  const aPagar = it.filter(x => x.tipo === "saida" && !isPaid(k, x)).reduce((t, x) => t + x.v, 0);
  return { it, ent, inv, sai, fixo, parc, vari, saldo: ent - sai - inv, porCat, porConta, aPagar };
}
const restante = d => d.v - (d.pagtos || []).reduce((t, p) => t + p.v, 0);

/* ---------- persistência ---------- */
function commit(msg, undo) { Store.save(S); render(); if (msg) toast(msg, undo); }

/* ---------- ícones ---------- */
const I = {
  mes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  lanc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  cartoes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>',
  pessoas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c1.8.7 3 2.6 3.5 5.5"/></svg>',
  futuro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20l6-7 4 4 8-10"/><path d="M15 7h6v6"/></svg>',
  ajustes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"/><g class="lid"><circle cx="12" cy="12" r="3.2"/></g><path class="slash" d="M3 3l18 18"/></svg>',
};
const PAGES = [["mes", "Mês"], ["lanc", "Lançamentos"], ["cartoes", "Cartões"], ["pessoas", "Pessoas"], ["futuro", "Futuro"], ["ajustes", "Ajustes"]];
const SHORT = { lanc: "Extrato" };

/* ---------- utilidades de UI ---------- */
let toastT;
function toast(t, undo) {
  const el = $("#toast");
  el.innerHTML = esc(t) + (undo ? ' <button id="undoBtn">Desfazer</button>' : "");
  el.hidden = false; el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
  if (undo) $("#undoBtn").onclick = () => { undo(); el.hidden = true; Store.save(S); render(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, undo ? 10000 : 2200);
}
const snapshot = () => JSON.parse(JSON.stringify(S));
const restoreFrom = snap => () => { S = snap; };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function countUp() {
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("[data-count]").forEach(el => {
    const to = +el.dataset.count, t0 = performance.now(), dur = 900;
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = brl(to * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function applyTheme() {
  const r = document.documentElement, t = S?.prefs?.theme || "auto";
  if (t === "auto") delete r.dataset.theme; else r.dataset.theme = t;
  document.body.classList.toggle("priv", !!S?.prefs?.priv);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = css("--side");
}
function openSheet(html, bind) {
  Controls.close();
  const sh = $("#sheet"); sh.innerHTML = html; sh.hidden = false;
  Controls.enhance(sh);
  const first = sh.querySelector("[autofocus]") || sh.querySelector("input:not(.cx-hidden),.cselect,button");
  if (first && matchMedia("(pointer:fine)").matches) first.focus();
  bind?.(sh);
}
const closeSheet = () => { Controls.close(); $("#sheet").hidden = true; };
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
function segBind(el, attr, fn) { el.onclick = e => { const b = e.target.closest("button"); if (!b || !el.contains(b)) return; el.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); fn(b.dataset[attr]); }; }
const empty = (icon, t, btn) => `<div class="empty"><div class="blob">${ic(icon, 24)}</div><div>${t}</div>${btn || ""}</div>`;
function confirmBox(title, text, okLabel, onOk) {
  openSheet(`<div class="panel"><h2>${esc(title)}</h2><p class="hint">${text}</p><div class="tools" style="justify-content:flex-end"><button class="btn" id="cNo">Cancelar</button><button class="btn pri" id="cOk" style="background:var(--out);border-color:var(--out)">${esc(okLabel)}</button></div></div>`,
    () => { $("#cNo").onclick = closeSheet; $("#cOk").onclick = () => { closeSheet(); onOk(); }; });
}

/* ---------- shell ---------- */
function navs() {
  const h = PAGES.map(([id, t]) => `<button class="navbtn" data-p="${id}" aria-current="${page === id}">${I[id]}<span>${t}</span></button>`).join("");
  $("#sidenav").innerHTML = h;
  $("#bottomnav").innerHTML = PAGES.map(([id, t]) => `<button class="navbtn" data-p="${id}" aria-current="${page === id}" aria-label="${t}">${I[id]}<span>${SHORT[id] || t}</span></button>`).join("");
  $("#who").textContent = Store.user?.email || "";
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-p]");
  if (b) { page = b.dataset.p; animate = true; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
});

function render() {
  if (!S) return;
  const keepY = window.scrollY;
  charts.forEach(c => c.destroy()); charts = [];
  applyTheme(); navs();
  const d = diffM(NOW, cur), monthly = ["mes", "lanc", "cartoes"].includes(page);
  $("#mnav").hidden = !monthly;
  $("#today").hidden = cur === NOW;
  const ml = $("#mlabel"); if (ml.textContent !== label(cur)) { ml.textContent = label(cur); ml.classList.remove("swap"); ml.offsetWidth; ml.classList.add("swap"); }
  $("#ttl").textContent = Object.fromEntries(PAGES)[page];
  $("#ttlSub").innerHTML = !monthly ? "" : d === 0 ? '<span class="chip now">mês atual</span>' : d > 0 ? '<span class="chip future">projeção</span> estimativa com o que já está lançado' : '<span class="chip">mês passado</span>';
  const v = $("#view"); v.className = animate ? "view-enter" : "";
  ({ mes: pgMes, lanc: pgLanc, cartoes: pgCartoes, pessoas: pgPessoas, futuro: pgFuturo, ajustes: pgAjustes })[page]();
  if (animate) { v.querySelectorAll(".anim").forEach(g => [...g.children].forEach((c, i) => c.style.setProperty("--i", i))); countUp(); }
  else { v.querySelectorAll(".anim").forEach(g => g.classList.remove("anim")); window.scrollTo(0, keepY); }
  Controls.enhance(v);
  animate = false;
}
$("#prev").onclick = () => { cur = addM(cur, -1); animate = true; render(); };
$("#next").onclick = () => { cur = addM(cur, 1); animate = true; render(); };
$("#today").onclick = () => { cur = NOW; animate = true; render(); };
$("#eyeBtn").onclick = () => { S.prefs.priv = !S.prefs.priv; Store.save(S); applyTheme(); render(); };
/* deslizar para trocar de mês no celular */
(() => { let x0 = null, y0 = 0; const m = $("main");
  m.addEventListener("touchstart", e => { if (e.target.closest(".chart,.months,input,.cards")) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  m.addEventListener("touchend", e => { if (x0 === null || !["mes", "lanc", "cartoes"].includes(page)) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { cur = addM(cur, dx < 0 ? 1 : -1); animate = true; render(); } }, { passive: true });
})();

/* ---------- páginas ---------- */
function flow(c) {
  const base = Math.max(c.ent, c.sai + c.inv, 1), livre = Math.max(0, c.ent - c.sai - c.inv);
  const seg = [["Fixos", c.fixo, "var(--out)"], ["Parcelas", c.parc, "color-mix(in srgb,var(--out) 55%,var(--panel))"], ["Variáveis", c.vari, "var(--warn)"], ["Investido", c.inv, "var(--inv)"]];
  return `<section class="flow">
   <div class="big"><div class="lbl">Saldo do mês</div><div class="v ${c.saldo < 0 ? "neg" : ""}"><span class="money num" data-count="${c.saldo}">${brl(c.saldo)}</span></div>
     <div class="hint">${c.aPagar > 0 ? "ainda falta pagar " + money(c.aPagar) : c.it.length ? "tudo pago ✓" : "nada lançado ainda"}</div></div>
   <div><div class="stack" role="img" aria-label="Divisão da renda">${seg.map(([t, v, col]) => `<span style="width:${v / base * 100}%;background:${col}" title="${t}"></span>`).join("")}<span style="width:${livre / base * 100}%;background:var(--accent-2)" title="Livre"></span></div>
    <div class="legend">${seg.map(([t, v, col]) => `<span><i style="background:${col}"></i>${t}<b class="money">${brl0(v)}</b></span>`).join("")}<span><i style="background:var(--accent-2)"></i>Livre<b class="money">${brl0(livre)}</b></span></div>
    <div class="kpis"><div class="kpi"><div class="l">Entrou</div><div class="v money num" style="color:var(--in)" data-count="${c.ent}">${brl(c.ent)}</div></div>
     <div class="kpi"><div class="l">Saiu</div><div class="v money num" style="color:var(--out)" data-count="${c.sai}">${brl(c.sai)}</div></div>
     <div class="kpi"><div class="l">Guardado</div><div class="v money num" style="color:var(--inv)" data-count="${c.inv}">${brl(c.inv)}</div></div></div></div></section>`;
}
function rowHTML(x) {
  const c = conta(x.conta), k = cat(x.cat), paid = isPaid(cur, x);
  const canCheck = x.tipo === "saida" && x.src === "rec" && c.tipo !== "credito";
  const tag = x.src === "rec" ? `<span class="tag rec">todo mês</span>` : x.src === "parc" ? `<span class="tag ${x.idx === x.n ? "last" : "parc"}">${x.idx}/${x.n}${x.idx === x.n ? " · última" : ""}</span>` : "";
  const sign = x.tipo === "entrada" ? "+ " : x.tipo === "invest" ? "→ " : "− ";
  return `<div class="row ${canCheck && paid ? "done" : ""}" data-edit="${x.src}:${x.id}" role="button" tabindex="0" aria-label="Editar ${esc(x.d)}">
   <div class="ic" style="background:color-mix(in srgb,${k.cor} 16%,transparent);color:${k.cor}">${ic(k.e)}</div>
   <div><div class="t">${esc(x.d)}</div><div class="m"><span class="dot" style="background:${c.cor}"></span>${esc(c.n)} · dia ${x.dia} ${tag}</div></div>
   <div class="val ${x.tipo === "entrada" ? "in" : x.tipo === "invest" ? "inv" : "out"}"><span class="money">${sign}${brl(x.v).replace("−", "")}</span></div>
   <button class="check ${canCheck ? "" : "na"}" data-pay="${x.id}" aria-pressed="${paid}" aria-label="${paid ? "Pago" : "Marcar como pago"}" title="${paid ? "Pago" : "Marcar como pago"}">✓</button></div>`;
}
function bindRows(root) {
  root.querySelectorAll("[data-pay]").forEach(b => b.onclick = e => { e.stopPropagation(); (S.pagos[cur] ??= {}); S.pagos[cur][b.dataset.pay] = !S.pagos[cur][b.dataset.pay]; commit(S.pagos[cur][b.dataset.pay] ? "Marcado como pago" : "Desmarcado"); });
  root.querySelectorAll("[data-edit]").forEach(r => { const go = () => { const [src, id] = r.dataset.edit.split(":"); editItem(src, id); }; r.onclick = go; r.onkeydown = e => { if (e.key === "Enter") go(); }; });
}
function notes(c) {
  const n = [];
  if (c.saldo < 0) n.push(["bad", `Mês no vermelho: faltam ${money(-c.saldo)} para fechar.`]);
  S.cats.filter(k => k.lim).forEach(k => { const v = c.porCat[k.id] || 0; if (v > k.lim) n.push(["bad", `${esc(k.n)} passou do limite: ${money(v)} de ${money(k.lim)}.`]); else if (v >= k.lim * .8) n.push(["", `${esc(k.n)} já usou ${Math.round(v / k.lim * 100)}% do limite.`]); });
  const ult = c.it.filter(x => x.src === "parc" && x.idx === x.n);
  if (ult.length) n.push(["good", `Última parcela de ${ult.map(x => esc(x.d)).join(", ")}: sobra ${money(ult.reduce((t, x) => t + x.v, 0))} a mais no mês que vem.`]);
  S.contas.filter(k => k.tipo === "credito" && c.porConta[k.id] && !S.pagos[cur]?.["card:" + k.id] && diffM(cur, NOW) >= 0).forEach(k => n.push(["", `Fatura ${esc(k.n)} de ${money(c.porConta[k.id])} vence dia ${k.venc || "?"}.`]));
  const me = S.dividas.filter(d => d.dir === "me_deve" && restante(d) > 0).reduce((t, d) => t + restante(d), 0);
  if (me > 0) n.push(["good", `Te devem ${money(me)} no total. <button class="linkbtn" data-p="pessoas">Ver pessoas</button>`]);
  return n.map(([k, t]) => `<div class="note ${k}"><div>${t}</div></div>`).join("") || `<div class="note good"><div>Nada pendente neste mês.</div></div>`;
}
function pgMes() {
  const c = calc(cur);
  $("#view").innerHTML = `<div class="anim">${flow(c)}</div><section class="grid anim">
   <div class="box c7"><h2>Movimentação <small>${c.it.length} ${c.it.length === 1 ? "item" : "itens"}</small></h2>
     <div class="list">${c.it.slice(0, 8).map(rowHTML).join("") || empty("receipt", "Nenhum lançamento neste mês.", `<button class="btn acc" data-new>Fazer o primeiro lançamento</button>`)}</div>
     ${c.it.length > 8 ? `<button class="btn" data-p="lanc" style="margin-top:10px">Ver todos os ${c.it.length}</button>` : ""}</div>
   <div class="box c5"><h2>Atenção</h2>${notes(c)}</div>
   <div class="box c6"><h2>Gastos por categoria</h2>${c.sai ? '<div class="chart"><canvas id="chCat"></canvas></div>' : empty("chart", "Sem gastos neste mês.")}</div>
   <div class="box c6"><h2>Meses anteriores e próximos</h2><div class="chart"><canvas id="chEv"></canvas></div></div></section>`;
  bindRows($("#view"));
  if (c.sai) catChart("chCat", c.porCat);
  evoChart("chEv", -5, 3);
}
function pgLanc() {
  const tabs = `<div class="filters" style="margin:18px 0 14px">${[["mes", "Deste mês"], ["rec", "Recorrentes"], ["parc", "Parcelamentos"]].map(([k, t]) => `<button class="pillbtn" data-sub="${k}" aria-pressed="${sub === k}">${t}</button>`).join("")}</div>`;
  let body = "";
  if (sub === "mes") {
    const c = calc(cur);
    let it = c.it.filter(x => filtro === "tudo" || (filtro === "entrada" && x.tipo !== "saida") || (filtro === "saida" && x.tipo === "saida") || (filtro === "aberto" && x.tipo === "saida" && !isPaid(cur, x)));
    if (busca) it = it.filter(x => (x.d + " " + cat(x.cat).n + " " + conta(x.conta).n).toLowerCase().includes(busca.toLowerCase()));
    const byDay = {}; it.forEach(x => (byDay[x.dia] ??= []).push(x));
    body = `<section class="box"><div class="filters">${[["tudo", "Tudo"], ["saida", "Saídas"], ["entrada", "Entradas"], ["aberto", "A pagar"]].map(([k, t]) => `<button class="pillbtn" data-f="${k}" aria-pressed="${filtro === k}">${t}</button>`).join("")}
     <input class="search" id="busca" type="search" placeholder="Buscar por nome, categoria ou cartão" value="${esc(busca)}" aria-label="Buscar"></div>
     <div class="list">${Object.keys(byDay).sort((a, b) => b - a).map(d => `<div class="day">Dia ${d}</div>` + byDay[d].map(rowHTML).join("")).join("") || empty("search", busca || filtro !== "tudo" ? "Nada encontrado com esse filtro." : "Nenhum lançamento neste mês.")}</div>
     <p class="hint" style="margin-top:10px">Toque em um lançamento para editar ou excluir.</p></section>`;
  } else if (sub === "rec") {
    const grp = [["entrada", "Entradas fixas"], ["saida", "Contas e assinaturas"], ["invest", "Aportes"]];
    body = `<section class="grid auto anim" style="margin-top:0">${grp.map(([t, h]) => { const l = S.recorrentes.filter(r => r.tipo === t); const ativos = l.filter(r => !r.fim || diffM(NOW, r.fim) >= 0);
      return `<div class="box c4"><h2>${h}<small class="money">${brl(ativos.reduce((s, r) => s + r.v, 0))}/mês</small></h2><div class="list">${l.map(r => `<div class="row" data-edit="rec:${r.id}" role="button" tabindex="0"><div class="ic" style="background:color-mix(in srgb,${cat(r.cat).cor} 16%,transparent);color:${cat(r.cat).cor}">${ic(cat(r.cat).e)}</div><div><div class="t">${esc(r.d)}</div><div class="m"><span class="dot" style="background:${conta(r.conta).cor}"></span>${esc(conta(r.conta).n)} · dia ${r.dia} · ${r.fim ? "até " + short(r.fim) : "desde " + short(r.inicio)}</div></div><div class="val"><span class="money">${brl(r.v)}</span></div><span></span></div>`).join("") || empty("repeat", "Nada aqui ainda.")}</div></div>`; }).join("")}</section>
      <p class="hint" style="margin-top:12px">Para criar, toque no botão <b>+</b> e escolha “Todo mês”. Toque num item para editar ou parar de repetir.</p>`;
  } else {
    body = `<section class="box"><h2>Compras parceladas</h2><p class="hint">Cada compra aparece sozinha nos meses certos. Para criar, toque no botão <b>+</b> e escolha “Parcelado”.</p><div class="list">${S.parcelas.map(p => { const i = diffM(p.data.slice(0, 7), NOW) + 1, fim = short(addM(p.data.slice(0, 7), p.n - 1)), st = i < 1 ? "começa " + short(p.data.slice(0, 7)) : i > p.n ? "quitada" : `${i}/${p.n} agora · última em ${fim}`;
      return `<div class="row" data-edit="parc:${p.id}" role="button" tabindex="0"><div class="ic" style="background:color-mix(in srgb,${cat(p.cat).cor} 16%,transparent);color:${cat(p.cat).cor}">${ic(cat(p.cat).e)}</div><div><div class="t">${esc(p.d)}</div><div class="m"><span class="dot" style="background:${conta(p.conta).cor}"></span>${esc(conta(p.conta).n)} · ${p.n}× de <span class="money">${brl(p.v)}</span> · <span class="tag ${i > p.n ? "" : "parc"}">${st}</span></div></div><div class="val"><span class="money">${brl(p.v * p.n)}</span></div><span></span></div>`; }).join("") || empty("card", "Nenhuma compra parcelada.")}</div></section>`;
  }
  $("#view").innerHTML = `<div class="anim">${sub === "mes" ? flow(calc(cur)) : ""}</div>` + tabs + body;
  bindRows($("#view"));
  document.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { sub = b.dataset.sub; animate = true; render(); });
  document.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filtro = b.dataset.f; render(); });
  const bs = $("#busca"); if (bs) bs.oninput = () => { busca = bs.value; const p = bs.selectionStart; render(); const n = $("#busca"); n.focus(); n.setSelectionRange(p, p); };
}
function pgCartoes() {
  const c = calc(cur), cards = S.contas.filter(a => !a.pessoa), cr = cards.filter(a => a.tipo === "credito");
  const fut = []; for (let i = 0; i < 6; i++) { const k = addM(cur, i), x = calc(k); fut.push([k, cr.map(a => x.porConta[a.id] || 0)]); }
  $("#view").innerHTML = `<section class="cards anim">${cards.map(a => { const v = c.porConta[a.id] || 0, paid = a.tipo === "credito" && S.pagos[cur]?.["card:" + a.id];
    return `<div class="card ${paid ? "paid" : ""}" style="background:${a.cor}" data-open-card="${a.id}" role="button" tabindex="0" title="Ver lançamentos deste cartão">
     ${a.tipo === "credito" && v ? `<button class="pay" data-card="${a.id}">${paid ? "✓ fatura paga" : "marcar fatura paga"}</button>` : ""}
     <span class="n">${esc(a.n)}</span><span class="d">${a.tipo === "credito" ? "fatura" + (a.venc ? " · vence dia " + a.venc : "") : a.tipo === "boleto" ? "boletos do mês" : "saídas na conta"}</span>
     <span class="v money num" data-count="${v}">${brl(v)}</span>
     ${a.limite ? `<div class="lim"><i style="width:${Math.min(100, v / a.limite * 100)}%"></i></div><span class="d">${Math.round(v / a.limite * 100)}% do limite de <span class="money">${brl0(a.limite)}</span></span>` : ""}</div>`; }).join("")}
    <button class="card" data-p="ajustes" style="background:var(--soft);color:var(--muted);border:2px dashed var(--line);box-shadow:none;align-items:center;justify-content:center;font-weight:700">+ Adicionar cartão</button></section>
   <section class="grid anim"><div class="box c12"><h2>Faturas dos próximos meses</h2><p class="hint">Só o que já está comprometido: parcelas e assinaturas no crédito</p>${cr.length ? '<div class="chart"><canvas id="chFat"></canvas></div>' : empty("card", "Cadastre um cartão de crédito em Ajustes.")}</div></section>`;
  document.querySelectorAll("[data-open-card]").forEach(c => c.onclick = e => { if (e.target.closest("[data-card]")) return; busca = conta(c.dataset.openCard).n; filtro = "tudo"; sub = "mes"; page = "lanc"; animate = true; render(); });
  document.querySelectorAll("[data-card]").forEach(b => b.onclick = e => { e.stopPropagation(); (S.pagos[cur] ??= {}); const k = "card:" + b.dataset.card; S.pagos[cur][k] = !S.pagos[cur][k]; commit(S.pagos[cur][k] ? "Fatura marcada como paga" : "Fatura em aberto"); });
  if (cr.length) charts.push(new Chart($("#chFat"), { type: "bar", data: { labels: fut.map(f => short(f[0])), datasets: cr.map((a, i) => ({ label: a.n, data: fut.map(f => f[1][i]), backgroundColor: a.cor, borderRadius: 5 })) }, options: opts({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => S.prefs.priv ? "" : brl0(v) } } } }) }));
}
function pgPessoas() {
  const saldo = p => S.dividas.filter(d => d.pessoa === p.id).reduce((t, d) => t + (d.dir === "me_deve" ? 1 : -1) * restante(d), 0) - autoDebt(p);
  const me = S.dividas.filter(d => d.dir === "me_deve").reduce((t, d) => t + Math.max(0, restante(d)), 0), eu = S.dividas.filter(d => d.dir === "devo").reduce((t, d) => t + Math.max(0, restante(d)), 0) + S.pessoas.reduce((t, p) => t + autoDebt(p), 0);
  $("#view").innerHTML = `<section class="flow anim" style="grid-template-columns:1fr 1fr"><div class="big"><div class="lbl">Te devem</div><div class="v" style="color:var(--in)"><span class="money num" data-count="${me}">${brl(me)}</span></div></div>
    <div class="big"><div class="lbl">Você deve</div><div class="v" style="color:var(--out)"><span class="money num" data-count="${eu}">${brl(eu)}</span></div></div></section>
   <div class="tools" style="margin:16px 0"><button class="btn acc" id="newDebt">+ Registrar dívida</button><button class="btn" id="newPerson">+ Nova pessoa</button></div>
   <section class="people anim">${S.pessoas.map(p => { const s = saldo(p), n = S.dividas.filter(d => d.pessoa === p.id && restante(d) > 0).length + (autoDebt(p) ? 1 : 0);
     return `<button class="person" data-person="${p.id}"><div class="head"><div class="avatar" style="background:${p.cor}">${esc(p.n[0] || "?").toUpperCase()}</div><div><b>${esc(p.n)}</b><div class="hint" style="margin:0">${n ? n + " em aberto" : "tudo quitado"}</div></div></div>
     <div class="bal ${s > 0 ? "pos" : s < 0 ? "neg" : ""}"><span class="money num">${s === 0 ? "R$ 0,00" : brl(Math.abs(s))}</span></div><div class="hint" style="margin:0">${s > 0 ? "te deve" : s < 0 ? "você deve" : "sem pendências"}</div></button>`; }).join("") || empty("handshake", "Cadastre amigos para anotar quem te deve e a quem você deve.")}</section>`;
  $("#newPerson").onclick = () => editPerson();
  $("#newDebt").onclick = () => editDebt();
  document.querySelectorAll("[data-person]").forEach(b => b.onclick = () => personSheet(b.dataset.person));
}
function personSheet(pid) {
  const p = pessoa(pid), ds = S.dividas.filter(d => d.pessoa === pid).sort((a, b) => (restante(b) > 0) - (restante(a) > 0) || b.data.localeCompare(a.data));
  const pc = pessoaConta(pid), pv = pc ? calc(cur).porConta[pc.id] || 0 : 0, paid = pc && S.pagos[cur]?.["card:" + pc.id];
  openSheet(`<div class="panel"><div class="head" style="display:flex;gap:10px;align-items:center"><div class="avatar" style="background:${p.cor}">${esc(p.n[0]).toUpperCase()}</div><h2 style="flex:1">${esc(p.n)}</h2><button class="btn sm" id="pEdit">Editar</button></div>
   ${pc && pv ? `<div class="row" style="cursor:default;grid-template-columns:1fr auto;background:var(--soft);border-radius:12px;margin-bottom:10px"><div><div class="t">Gasto no cartão de ${esc(p.n)} em ${short(cur)}</div><div class="m">${paid ? "já pago" : "ainda deve"}</div></div>
   <div style="display:grid;justify-items:end;gap:4px"><span class="money num" style="color:${paid ? "var(--muted)" : "var(--out)"}">${paid ? "quitado ✓" : brl(pv)}</span>
   <button class="btn sm" data-pay-card="${pc.id}">${paid ? "reabrir" : "marcar como pago"}</button></div></div>` : ""}
   <div class="list">${ds.map(d => { const r = restante(d); return `<div class="row" style="cursor:default;grid-template-columns:1fr auto"><div><div class="t">${esc(d.d)}</div><div class="m">${d.dir === "me_deve" ? "te deve" : "você deve"} · ${d.data.split("-").reverse().join("/")}${d.pagtos.length ? ` · ${d.dir === "me_deve" ? "já recebeu" : "já pagou"} <span class="money">${brl(d.v - r)}</span> de <span class="money">${brl(d.v)}</span>` : ""}</div></div>
     <div style="display:grid;justify-items:end;gap:4px"><span class="money num" style="color:${r <= 0 ? "var(--muted)" : d.dir === "me_deve" ? "var(--in)" : "var(--out)"}">${r <= 0 ? "quitado ✓" : brl(r)}</span>
     <span class="tools">${r > 0 ? `<button class="btn sm" data-pay-debt="${d.id}">Recebi/Paguei</button>` : ""}<button class="btn sm danger" data-del-debt="${d.id}" aria-label="Excluir">×</button></span></div></div>`; }).join("") || empty("extra", "Nada anotado com essa pessoa.")}</div>
   <div class="tools" style="justify-content:space-between"><button class="btn" id="pClose">Fechar</button><button class="btn acc" id="pAdd">+ Nova dívida</button></div></div>`, () => {
    $("#pClose").onclick = closeSheet; $("#pAdd").onclick = () => editDebt(pid); $("#pEdit").onclick = () => editPerson(pid);
    document.querySelectorAll("[data-del-debt]").forEach(b => b.onclick = () => { const snap = snapshot(); S.dividas = S.dividas.filter(d => d.id !== b.dataset.delDebt); commit("Dívida excluída", restoreFrom(snap)); personSheet(pid); });
    document.querySelectorAll("[data-pay-debt]").forEach(b => b.onclick = () => payDebt(b.dataset.payDebt));
    document.querySelectorAll("[data-pay-card]").forEach(b => b.onclick = () => { (S.pagos[cur] ??= {}); const k = "card:" + b.dataset.payCard; S.pagos[cur][k] = !S.pagos[cur][k]; commit(S.pagos[cur][k] ? "Marcado como pago" : "Reaberto"); personSheet(pid); });
  });
}
function payDebt(id) {
  const d = S.dividas.find(x => x.id === id), r = restante(d);
  openSheet(`<form id="pf"><h2>${d.dir === "me_deve" ? "Quanto você recebeu?" : "Quanto você pagou?"}</h2><p class="hint">${esc(d.d)} · falta ${brl(r)}</p>
   <input class="amount num" id="pv" type="number" step="0.01" min="0.01" max="${r}" value="${r.toFixed(2)}" required aria-label="Valor">
   <label class="fld">Data<input id="pdt" type="date" value="${today()}" required></label>
   <div class="tools" style="justify-content:flex-end"><button type="button" class="btn" id="px">Cancelar</button><button class="btn acc">Confirmar</button></div></form>`, () => {
    $("#px").onclick = () => personSheet(d.pessoa);
    $("#pf").onsubmit = e => { e.preventDefault(); d.pagtos.push({ v: Math.min(r, +$("#pv").value), data: $("#pdt").value }); commit(restante(d) <= 0 ? "Quitado! 🎉" : "Pagamento registrado"); personSheet(d.pessoa); };
  });
}
function editPerson(pid, thenDebt) {
  const p = pid ? pessoa(pid) : { n: "", cor: PAL[S.pessoas.length % PAL.length] };
  const pc0 = pid && pessoaConta(pid);
  openSheet(`<form id="npf"><h2>${pid ? "Editar pessoa" : "Nova pessoa"}</h2>
   <label class="fld">Nome<input id="pn" value="${esc(p.n)}" required placeholder="Ex: Lucas" autofocus></label>
   <label class="fld">Cor<input id="pc" type="color" value="${p.cor}" class="swatch" style="width:60px;height:40px"></label>
   <label class="pref"><input type="checkbox" id="pIsConta" ${pc0 ? "checked" : ""}> Uso o cartão/dinheiro dela pra pagar coisas (aparece como forma de pagamento; o que eu gasto vira dívida aqui)</label>
   <div class="tools" style="justify-content:space-between">${pid ? '<button type="button" class="btn danger" id="pdel">Excluir pessoa</button>' : "<span></span>"}<span class="tools"><button type="button" class="btn" id="px">Cancelar</button><button class="btn acc">Salvar</button></span></div></form>`, () => {
    $("#px").onclick = closeSheet;
    if (pid) $("#pdel").onclick = () => confirmBox("Excluir " + p.n + "?", "As dívidas anotadas com essa pessoa também serão apagadas.", "Excluir", () => { const snap = snapshot(); S.pessoas = S.pessoas.filter(x => x.id !== pid); S.dividas = S.dividas.filter(d => d.pessoa !== pid); S.contas = S.contas.filter(c => c.pessoa !== pid); commit("Pessoa excluída", restoreFrom(snap)); });
    $("#npf").onsubmit = e => { e.preventDefault(); const n = $("#pn").value.trim(), cor = $("#pc").value, asConta = $("#pIsConta").checked;
      if (pid) {
        p.n = n; p.cor = cor;
        const pc = pessoaConta(pid);
        if (asConta && !pc) { const ex = S.contas.find(c => !c.pessoa && c.n.trim().toLowerCase() === n.toLowerCase()); if (ex) { ex.pessoa = pid; ex.cor = cor; } else S.contas.push({ id: uid(), n, cor, tipo: "credito", pessoa: pid }); }
        else if (!asConta && pc) S.contas = S.contas.filter(c => c.id !== pc.id);
        else if (pc) { pc.n = n; pc.cor = cor; }
        commit("Salvo"); personSheet(pid);
      } else {
        const np = { id: uid(), n, cor }; S.pessoas.push(np);
        if (asConta) { const ex = S.contas.find(c => !c.pessoa && c.n.trim().toLowerCase() === n.toLowerCase()); if (ex) { ex.pessoa = np.id; ex.cor = cor; } else S.contas.push({ id: uid(), n, cor, tipo: "credito", pessoa: np.id }); }
        commit("Pessoa adicionada"); thenDebt ? editDebt(np.id) : closeSheet();
      } };
  });
}
function editDebt(pid) {
  let dir = "me_deve";
  openSheet(`<form id="df"><h2>Registrar dívida</h2>
   <div class="seg" id="dSeg" style="grid-template-columns:1fr 1fr"><button type="button" data-d="me_deve" aria-pressed="true">Me deve</button><button type="button" data-d="devo" aria-pressed="false">Eu devo</button></div>
   <input class="amount num" id="dv" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="R$ 0,00" required aria-label="Valor" autofocus>
   <label class="fld">Quem<select id="dp">${S.pessoas.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.n)}</option>`).join("")}<option value="__new" ${S.pessoas.length ? "" : "selected"}>+ Nova pessoa…</option></select></label>
   <label class="fld" id="dnWrap" ${S.pessoas.length ? "hidden" : ""}>Nome da nova pessoa<input id="dn" placeholder="Ex: Pedro"></label>
   <label class="fld">Referente a<input id="dd" required placeholder="Ex: metade do mercado"></label>
   <label class="fld">Data<input id="ddt" type="date" value="${today()}" required></label>
   <div class="tools" style="justify-content:flex-end"><button type="button" class="btn" id="dx">Cancelar</button><button class="btn acc">Salvar</button></div></form>`, () => {
    segBind($("#dSeg"), "d", v => dir = v); $("#dx").onclick = closeSheet;
    $("#dp").onchange = () => { $("#dnWrap").hidden = $("#dp").value !== "__new"; if (!$("#dnWrap").hidden) $("#dn").focus(); };
    $("#df").onsubmit = e => { e.preventDefault(); let p = $("#dp").value;
      if (!(+$("#dv").value > 0)) { $("#dv").focus(); return toast("Digite o valor da dívida"); }
      if (!$("#dd").value.trim()) { $("#dd").focus(); return toast("Diga a que se refere a dívida"); }
      if (p === "__new") { const n = $("#dn").value.trim(); if (!n) { $("#dn").focus(); return toast("Digite o nome da pessoa"); } p = uid(); S.pessoas.push({ id: p, n, cor: PAL[S.pessoas.length % PAL.length] }); } S.dividas.push({ id: uid(), pessoa: p, dir, d: $("#dd").value.trim(), v: +$("#dv").value, data: $("#ddt").value, pagtos: [] }); commit("Dívida anotada"); personSheet(p); };
  });
}
function pgFuturo() {
  const ms = []; for (let i = 0; i < 12; i++) { const k = addM(NOW, i); ms.push([k, calc(k)]); }
  const fontes = S.contas.filter(a => a.tipo !== "debito");
  const totalMes = c => fontes.reduce((t, a) => t + (c.porConta[a.id] || 0), 0);
  $("#view").innerHTML = `<section class="box anim"><h2>Próximos 12 meses</h2><p class="hint">Faturas, boletos e pessoas já lançados. Toque num mês pra ver o detalhe.</p>
   <div class="months anim">${ms.map(([k, c]) => `<button class="mo" data-go="${k}"><b>${short(k)}</b><div class="mini">a pagar</div><span class="money num">${brl0(totalMes(c))}</span></button>`).join("")}</div></section>
   <section class="grid anim"><div class="box c12"><h2>Quando vou pagar o quê</h2><p class="hint">Cartões, boletos e pessoas — cada barra é uma fatura futura.</p><div class="chart" style="height:320px"><canvas id="chProj"></canvas></div></div>
   <div class="box c5"><h2>Metas <button class="btn sm" id="newGoal">+ Nova meta</button></h2>${S.metas.map(g => { const p = Math.min(100, g.atual / g.alvo * 100), falta = g.alvo - g.atual;
     return `<div class="goal"><div class="top2"><span>${esc(g.d)}</span><span class="num">${Math.round(p)}%</span></div><div class="bar"><i style="width:${p}%"></i></div>
     <div style="font-size:13px;color:var(--muted)"><span class="money">${brl0(g.atual)} de ${brl0(g.alvo)}</span> · ${falta <= 0 ? "meta batida 🎉" : `faltam <span class="money">${brl0(falta)}</span>`}</div>
     <div class="tools"><button class="btn sm" data-dep="${g.id}">Guardar dinheiro</button><button class="btn sm" data-gedit="${g.id}">Editar</button></div></div>`; }).join("") || empty("target", "Crie uma meta: reserva, viagem, carro…")}</div></section>`;
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { cur = b.dataset.go; page = "mes"; animate = true; render(); });
  document.querySelectorAll("[data-dep]").forEach(b => b.onclick = () => depositGoal(b.dataset.dep));
  document.querySelectorAll("[data-gedit]").forEach(b => b.onclick = () => editGoal(b.dataset.gedit));
  $("#newGoal").onclick = () => editGoal();
  charts.push(new Chart($("#chProj"), { type: "bar", data: { labels: ms.map(m => short(m[0])), datasets: fontes.map(a => ({ label: a.n, data: ms.map(([, c]) => c.porConta[a.id] || 0), backgroundColor: a.cor, borderRadius: 5 })) },
    options: opts({ scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: v => S.prefs.priv ? "" : brl0(v) } } } }) }));
}
function depositGoal(id) {
  const g = S.metas.find(x => x.id === id);
  openSheet(`<form id="gf"><h2>Guardar em “${esc(g.d)}”</h2><input class="amount num" id="gv" type="number" step="0.01" inputmode="decimal" placeholder="R$ 0,00" required autofocus aria-label="Valor">
   <p class="hint">Use valor negativo para retirar.</p><div class="tools" style="justify-content:flex-end"><button type="button" class="btn" id="gx">Cancelar</button><button class="btn acc">Guardar</button></div></form>`, () => {
    $("#gx").onclick = closeSheet; $("#gf").onsubmit = e => { e.preventDefault(); g.atual = Math.max(0, g.atual + +$("#gv").value); closeSheet(); animate = true; commit(g.atual >= g.alvo ? "Meta batida! 🎉" : "Guardado"); };
  });
}
function editGoal(id) {
  const g = id ? S.metas.find(x => x.id === id) : { d: "", alvo: "", atual: 0 };
  openSheet(`<form id="gf"><h2>${id ? "Editar meta" : "Nova meta"}</h2><label class="fld">Nome<input id="gn" value="${esc(g.d)}" required placeholder="Ex: Reserva de emergência" autofocus></label>
   <div class="two"><label class="fld">Quanto quer juntar<input id="ga" type="number" step="0.01" value="${g.alvo}" required></label><label class="fld">Já tem<input id="gt" type="number" step="0.01" value="${g.atual}"></label></div>
   <div class="tools" style="justify-content:space-between">${id ? '<button type="button" class="btn danger" id="gdel">Excluir</button>' : "<span></span>"}<span class="tools"><button type="button" class="btn" id="gx">Cancelar</button><button class="btn acc">Salvar</button></span></div></form>`, () => {
    $("#gx").onclick = closeSheet;
    if (id) $("#gdel").onclick = () => { const snap = snapshot(); S.metas = S.metas.filter(x => x.id !== id); closeSheet(); commit("Meta excluída", restoreFrom(snap)); };
    $("#gf").onsubmit = e => { e.preventDefault(); Object.assign(g, { d: $("#gn").value.trim(), alvo: +$("#ga").value, atual: +$("#gt").value || 0 }); if (!id) S.metas.push({ id: uid(), ...g }); closeSheet(); animate = true; commit("Meta salva"); };
  });
}

/* ---------- ajustes ---------- */
function pgAjustes() {
  const tipos = { saida: "Gasto", entrada: "Entrada", invest: "Investimento" }, ctipos = { credito: "Crédito", debito: "Conta / débito", boleto: "Boleto" };
  $("#view").innerHTML = `<section class="grid anim" style="margin-top:0">
   <div class="box c6"><h2>Categorias <button class="btn sm" id="addCat">+ Categoria</button></h2><p class="hint">Toque na cor ou no ícone para trocar. Tudo salva sozinho.</p>
    <div class="set-list">${S.cats.map(c => `<div class="set-item" style="grid-template-columns:auto auto 1fr auto">
      <input class="swatch" type="color" value="${c.cor}" data-cat="${c.id}" data-k="cor" aria-label="Cor de ${esc(c.n)}">
      <input class="inline emoji" value="${esc(c.e)}" data-cat="${c.id}" data-k="e" aria-label="Ícone" maxlength="20">
      <div style="display:grid;gap:2px;min-width:0"><input class="inline" value="${esc(c.n)}" data-cat="${c.id}" data-k="n" aria-label="Nome" style="font-weight:700">
       <div class="set-fields"><label><span class="mini">Tipo</span><select class="inline" data-cat="${c.id}" data-k="tipo" style="width:auto;font-size:13px">${Object.entries(tipos).map(([k, t]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
       ${c.tipo === "saida" ? `<label><span class="mini">Limite por mês (R$)</span><input class="inline" type="number" placeholder="sem limite" value="${c.lim || ""}" data-cat="${c.id}" data-k="lim" style="width:120px;font-size:13px"></label>` : ""}</div></div>
      <button class="btn sm danger" data-delcat="${c.id}" aria-label="Excluir ${esc(c.n)}">×</button></div>`).join("")}</div></div>
   <div class="box c6"><h2>Cartões e contas <button class="btn sm" id="addConta">+ Cartão/conta</button></h2><p class="hint">Crédito tem vencimento e limite; a fatura é marcada inteira como paga. Cartões de pessoas (você deve pra elas) se editam em Pessoas.</p>
    <div class="set-list">${S.contas.filter(c => !c.pessoa).map(c => `<div class="set-item" style="grid-template-columns:auto 1fr auto">
      <input class="swatch" type="color" value="${c.cor}" data-conta="${c.id}" data-k="cor" aria-label="Cor de ${esc(c.n)}">
      <div style="display:grid;gap:2px;min-width:0"><input class="inline" value="${esc(c.n)}" data-conta="${c.id}" data-k="n" aria-label="Nome" style="font-weight:700">
       <div class="set-fields"><label><span class="mini">Tipo</span><select class="inline" data-conta="${c.id}" data-k="tipo" style="width:auto;font-size:13px">${Object.entries(ctipos).map(([k, t]) => `<option value="${k}" ${c.tipo === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
       ${c.tipo === "credito" ? `<label><span class="mini">Vence dia</span><input class="inline" type="number" min="1" max="31" placeholder="—" value="${c.venc || ""}" data-conta="${c.id}" data-k="venc" style="width:70px;font-size:13px"></label><label><span class="mini">Limite (R$)</span><input class="inline" type="number" placeholder="—" value="${c.limite || ""}" data-conta="${c.id}" data-k="limite" style="width:100px;font-size:13px"></label>` : ""}</div></div>
      <button class="btn sm danger" data-delconta="${c.id}" aria-label="Excluir ${esc(c.n)}">×</button></div>`).join("")}</div></div>
   <div class="box c6"><h2>Aparência e privacidade</h2>
    <div class="fld" style="margin-top:10px">Tema<div class="seg" id="themeSeg">${[["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]].map(([k, t]) => `<button data-t="${k}" aria-pressed="${S.prefs.theme === k}">${t}</button>`).join("")}</div></div>
    <label class="pref"><input type="checkbox" id="privDef" ${S.prefs.priv ? "checked" : ""}> Esconder valores (o mesmo que o botão do olho 👁 no topo)</label></div>
   <div class="box c6"><h2>Conta</h2><p class="hint">Conectado como <b>${esc(Store.user?.email)}</b>. Seus dados são criptografados antes de sair do aparelho: nem o administrador consegue ler.</p>
    <div class="fld" style="margin-top:10px">Ao abrir o Fluo neste aparelho
     <label class="pref"><input type="radio" name="openMode" value="direto"> Entrar direto, sem pedir nada</label>
     <label class="pref" id="bioRow" style="display:none"><input type="radio" name="openMode" value="bio"> Pedir biometria (Face ID / digital)</label>
     <label class="pref"><input type="radio" name="openMode" value="senha"> Pedir a senha</label></div>
    <div class="tools" style="margin-top:10px"><button class="btn" id="chPw">Trocar senha</button><button class="btn" id="expBtn">Baixar backup</button><label class="btn" style="cursor:pointer">Restaurar backup<input type="file" id="impFile" accept="application/json" hidden></label><button class="btn" id="outBtn">Sair</button></div>
    <div class="tools" style="margin-top:10px"><button class="btn danger" id="wipe">Apagar todos os dados</button></div></div>
   <div class="box c12"><h2>Instalar no celular ou PC</h2><p class="hint" style="margin-bottom:0"><b>iPhone:</b> abra no Safari → botão Compartilhar → “Adicionar à Tela de Início”. <b>Android:</b> Chrome → menu ⋮ → “Instalar app”. <b>PC:</b> Chrome/Edge → ícone de instalar na barra de endereço.</p></div></section>`;
  const v = $("#view");
  v.querySelectorAll("[data-cat]").forEach(i => i.onchange = () => { const c = S.cats.find(x => x.id === i.dataset.cat); const k = i.dataset.k; c[k] = k === "lim" ? (+i.value || undefined) : i.value; if (k === "n" && !c.n.trim()) c.n = "Sem nome"; commit(k === "tipo" ? "" : "Salvo"); });
  v.querySelectorAll("[data-conta]").forEach(i => i.onchange = () => { const c = S.contas.find(x => x.id === i.dataset.conta); const k = i.dataset.k; c[k] = ["venc", "limite"].includes(k) ? (+i.value || undefined) : i.value; commit(k === "tipo" ? "" : "Salvo"); });
  v.querySelectorAll("[data-delcat]").forEach(b => b.onclick = () => { const id = b.dataset.delcat, used = [...S.recorrentes, ...S.parcelas, ...S.avulsos].filter(x => x.cat === id).length;
    confirmBox("Excluir categoria?", used ? `${used} lançamento(s) usam esta categoria e vão ficar “Sem categoria”.` : "Nenhum lançamento usa esta categoria.", "Excluir", () => { const snap = snapshot(); S.cats = S.cats.filter(c => c.id !== id); commit("Categoria excluída", restoreFrom(snap)); }); });
  v.querySelectorAll("[data-delconta]").forEach(b => b.onclick = () => { const id = b.dataset.delconta, used = [...S.recorrentes, ...S.parcelas, ...S.avulsos].filter(x => x.conta === id).length;
    confirmBox("Excluir cartão/conta?", used ? `${used} lançamento(s) usam este cartão e vão ficar “Sem conta”.` : "Nenhum lançamento usa este cartão.", "Excluir", () => { const snap = snapshot(); S.contas = S.contas.filter(c => c.id !== id); commit("Excluído", restoreFrom(snap)); }); });
  const focusNew = sel => { const ins = document.querySelectorAll(sel), el = ins[ins.length - 1]; if (!el) return; el.closest(".set-item").scrollIntoView({ behavior: "smooth", block: "center" }); el.closest(".set-item").animate([{ background: "var(--accent-2)" }, { background: "var(--soft)" }], 1600); setTimeout(() => el.select(), 350); };
  $("#addCat").onclick = () => { S.cats.push({ id: uid(), n: "Nova categoria", e: "tag", cor: PAL[S.cats.length % PAL.length], tipo: "saida" }); commit("Categoria criada — digite o nome"); focusNew('[data-k="n"][data-cat]'); };
  $("#addConta").onclick = () => { S.contas.push({ id: uid(), n: "Novo cartão", cor: PAL[S.contas.length % PAL.length], tipo: "credito" }); commit("Cartão criado — digite o nome"); focusNew('[data-k="n"][data-conta]'); };
  segBind($("#themeSeg"), "t", t => { S.prefs.theme = t; commit(); });
  $("#privDef").onchange = e => { S.prefs.priv = e.target.checked; commit(); };
  // uma escolha só: direto (chave lembrada) · biometria (chave não lembrada + atalho biométrico) · senha
  const em = Store.user.email, radios = [...v.querySelectorAll('[name="openMode"]')];
  const curMode = () => Store.remembered ? "direto" : Store.bioEnabled(em) ? "bio" : "senha";
  const markMode = () => radios.forEach(r => r.checked = r.value === curMode());
  markMode();
  Store.bioSupported().then(ok => { if (ok && $("#bioRow")) $("#bioRow").style.display = ""; });
  radios.forEach(r => r.onchange = async () => {
    if (r.value === "bio") {
      try { await Store.bioEnroll(em); Store.setRemember(false); toast("Vai pedir biometria ao abrir"); }
      catch (e) { toast(/PRF/.test(e.message) ? "Este navegador ainda não suporta biometria aqui." : "Não foi possível ativar a biometria."); }
    } else { Store.bioForget(em); Store.setRemember(r.value === "direto"); toast(r.value === "direto" ? "Vai entrar direto ao abrir" : "Vai pedir a senha ao abrir"); }
    markMode();
  });
  $("#expBtn").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "fluo-backup-" + today() + ".json"; a.click(); toast("Backup baixado"); };
  $("#impFile").onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); if (!d.cats || !d.contas) throw 0; const snap = snapshot(); S = d; commit("Backup restaurado", restoreFrom(snap)); } catch (err) { toast("Arquivo inválido: escolha um backup do Fluo (.json)"); } };
  $("#outBtn").onclick = async () => { await Store.signOut(); S = null; showAuth(); };
  $("#wipe").onclick = () => confirmBox("Apagar tudo?", "Todos os lançamentos, cartões, pessoas e metas serão apagados. Baixe um backup antes se quiser guardar.", "Apagar tudo", () => { S = baseState(); commit("Dados apagados"); });
  if ($("#chPw")) $("#chPw").onclick = () => openSheet(`<form id="cpf"><h2>Trocar senha</h2><label class="fld">Nova senha<input id="np1" type="password" minlength="8" required autocomplete="new-password" autofocus></label><label class="fld">Repita<input id="np2" type="password" minlength="8" required autocomplete="new-password"></label><div class="err" id="cpe"></div><div class="tools" style="justify-content:flex-end"><button type="button" class="btn" id="cpx">Cancelar</button><button class="btn acc">Trocar</button></div></form>`, () => {
    $("#cpx").onclick = closeSheet; $("#cpf").onsubmit = async e => { e.preventDefault(); if ($("#np1").value !== $("#np2").value) { $("#cpe").textContent = "As senhas não são iguais."; return; } try { await Store.changePassword($("#np1").value); closeSheet(); toast("Senha trocada"); } catch (err) { $("#cpe").textContent = err.message; } }; });
}

/* ---------- lançar / editar ---------- */
function itemForm(opts) {
  const { title, it = {}, tipo: t0 = "saida", rep: r0 = "uma", editing } = opts;
  let tipo = it.tipo || t0, rep = r0, modoParc = "parcela", catTouched = !!it.cat;
  const lastCat = t => { const l = [...S.avulsos, ...S.recorrentes, ...S.parcelas.map(p => ({ ...p, tipo: "saida" }))].filter(x => (x.tipo || "saida") === t && S.cats.some(c => c.id === x.cat)).pop(); return l?.cat; };
  const sel = t => it.cat && S.cats.find(c => c.id === it.cat)?.tipo === t ? it.cat : lastCat(t);
  const catOpts = t => { const s = sel(t); return S.cats.filter(c => c.tipo === t).map(c => `<option value="${c.id}" ${c.id === s ? "selected" : ""}>${esc(c.n)}</option>`).join("") || `<option value="">(crie uma categoria em Ajustes)</option>`; };
  const guess = d => { const t = d.toLowerCase(); const hit = S.cats.filter(c => c.tipo === tipo).find(c => t.includes(c.n.toLowerCase().slice(0, 5)));
    if (hit) return hit.id; const kw = { alimentacao: /mercad|lanche|pizza|ifood|restaur|padaria|caf[eé]|a[cç]ougue|almo[cç]o|jantar/, transporte: /uber|gasolina|combust|[oô]nibus|estacion|ped[aá]gio|99/, saude: /farm[aá]cia|m[eé]dic|rem[eé]dio|consulta|dentista/, lazer: /cinema|show|bar|festa|viagem|jogo/, assinaturas: /netflix|spotify|prime|disney|youtube|assinatura/, moradia: /aluguel|condom[ií]nio|luz|[aá]gua|g[aá]s|internet/, compras: /roupa|t[eê]nis|celular|loja|shopee|amazon|shein/ };
    for (const [id, re] of Object.entries(kw)) if (re.test(t) && S.cats.some(c => c.id === id && c.tipo === tipo)) return id; return null; };
  const defConta = it.conta || (S.contas.find(c => c.tipo === "debito") || S.contas[0] || {}).id;
  const dataDef = it.data || (it.inicio ? it.inicio + "-" + String(it.dia || 1).padStart(2, "0") : cur === NOW ? today() : cur + "-01");
  openSheet(`<form id="lf" novalidate><h2>${title}</h2>
   <div class="seg" id="tSeg">${[["saida", "Saída"], ["entrada", "Entrada"], ["invest", "Investir"]].map(([k, t]) => `<button type="button" data-t="${k}" aria-pressed="${tipo === k}">${t}</button>`).join("")}</div>
   <input class="amount num" id="lv" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor" value="${it.v != null ? (+it.v).toFixed(2) : ""}" autofocus>
   <label class="fld">Descrição<input id="ld" placeholder="Ex: Mercado" value="${esc(it.d || "")}"></label>
   <div class="two"><label class="fld">Categoria<select id="lc">${catOpts(tipo)}</select></label>
    <label class="fld">${tipo === "entrada" ? "Recebido em" : "Pago com"}<select id="lk">${S.contas.map(a => `<option value="${a.id}" ${a.id === defConta ? "selected" : ""}>${esc(a.n)}</option>`).join("")}</select></label></div>
   <label class="fld"><span id="dtLbl">${rep === "mes" ? "Começa em" : rep === "parc" ? "Data da compra" : "Data"}</span><input id="ldt" type="date" value="${dataDef}"></label>
   ${editing ? "" : `<div class="fld">Repete?<div class="repeat" id="rSeg"><button type="button" data-r="uma" aria-pressed="${rep === "uma"}">Só uma vez</button><button type="button" data-r="mes" aria-pressed="${rep === "mes"}">Todo mês</button><button type="button" data-r="parc" aria-pressed="${rep === "parc"}">Parcelado</button></div></div>`}
   <div class="fld" id="lnWrap" ${rep === "parc" ? "" : "hidden"}>
     <div class="seg" id="pSeg" style="grid-template-columns:1fr 1fr"><button type="button" data-m="parcela" aria-pressed="true">Digitei o valor da parcela</button><button type="button" data-m="total" aria-pressed="false">Digitei o valor total</button></div>
     <label class="fld">Em quantas parcelas?<input id="ln" type="number" min="2" max="72" value="${it.n || 3}"></label>
     <div class="preview" id="pPrev"></div></div>
   ${!editing && S.pessoas.length ? `<details id="splitBox"><summary class="fld" style="cursor:pointer;display:list-item">Alguém vai te pagar uma parte?</summary><div class="two" style="margin-top:8px"><label class="fld">Quem<select id="sp"><option value="">ninguém</option>${S.pessoas.map(p => `<option value="${p.id}">${esc(p.n)}</option>`).join("")}</select></label><label class="fld">Quanto<input id="sv" type="number" step="0.01" placeholder="metade?"></label></div></details>` : ""}
   ${opts.extra || ""}
   <div class="err" id="lerr"></div>
   <div class="tools" style="justify-content:space-between">${editing ? '<button type="button" class="btn danger" id="ldel">Excluir</button>' : "<span></span>"}<span class="tools"><button type="button" class="btn" id="lx">Cancelar</button><button class="btn acc" id="lsave">Salvar</button></span></div></form>`, sh => {
    const prev = () => { const v = +$("#lv").value || 0, n = Math.max(2, +$("#ln").value || 2), dt = $("#ldt").value || today(); const pv = modoParc === "total" ? v / n : v;
      $("#pPrev").textContent = v ? `${n}× de ${brl(pv)} = ${brl(pv * n)} · última parcela em ${label(addM(dt.slice(0, 7), n - 1)).toLowerCase()}` : ""; };
    segBind($("#pSeg"), "m", v => { modoParc = v; prev(); });
    ["#lv", "#ln", "#ldt"].forEach(s => $(s).addEventListener("input", prev)); prev();
    $("#lc").onchange = () => catTouched = true;
    $("#ld").addEventListener("input", () => { if (catTouched) return; const g = guess($("#ld").value); if (g) $("#lc").value = g; });
    segBind($("#tSeg"), "t", v => { tipo = v; $("#lc").innerHTML = catOpts(v); catTouched = false; const p = sh.querySelector('[data-r="parc"]'); if (p) p.hidden = v !== "saida"; if (v !== "saida" && rep === "parc") sh.querySelector('[data-r="uma"]').click(); $("#lk").closest("label").firstChild.textContent = v === "entrada" ? "Recebido em" : "Pago com"; });
    if ($("#rSeg")) segBind($("#rSeg"), "r", v => { rep = v; $("#lnWrap").hidden = v !== "parc"; $("#dtLbl").textContent = v === "mes" ? "Começa em" : v === "parc" ? "Data da compra" : "Data"; prev(); });
    $("#lx").onclick = closeSheet;
    if ($("#sv")) $("#sv").onfocus = () => { if (!$("#sv").value && $("#lv").value) $("#sv").value = (+$("#lv").value / 2).toFixed(2); };
    $("#lf").onsubmit = e => {
      e.preventDefault();
      const v = +$("#lv").value, d = $("#ld").value.trim(), dt = $("#ldt").value;
      const bad = !(v > 0) ? ["#lv", "Digite um valor maior que zero."] : !d ? ["#ld", "Dê um nome para o lançamento."] : !dt ? ["#ldt", "Escolha a data."] : null;
      if (bad) { $("#lerr").textContent = bad[1]; const f = $(bad[0]); f.focus(); f.classList.remove("shake"); f.offsetWidth; f.classList.add("shake"); return; }
      const n = Math.max(2, +$("#ln").value || 2);
      opts.onSave({ tipo, rep, v: rep === "parc" && modoParc === "total" ? Math.round(v / n * 100) / 100 : v, d, dt, cat: $("#lc").value, conta: $("#lk").value, n, split: $("#sp")?.value ? { p: $("#sp").value, v: +$("#sv").value || v / 2 } : null });
    };
    opts.bind?.(sh);
  });
}
function newItem(pre = {}) {
  itemForm({ title: "Novo lançamento", ...pre, onSave: f => {
    const b = { id: uid(), d: f.d, v: f.v, cat: f.cat, conta: f.conta };
    if (f.rep === "mes") S.recorrentes.push({ ...b, tipo: f.tipo, dia: +f.dt.slice(8), inicio: f.dt.slice(0, 7) });
    else if (f.rep === "parc") S.parcelas.push({ ...b, n: f.n, data: f.dt });
    else S.avulsos.push({ ...b, tipo: f.tipo, data: f.dt });
    if (f.split) S.dividas.push({ id: uid(), pessoa: f.split.p, dir: "me_deve", d: f.d, v: f.split.v, data: f.dt, pagtos: [] });
    closeSheet(); cur = f.rep === "mes" && diffM(f.dt.slice(0, 7), cur) >= 0 ? cur : f.dt.slice(0, 7); animate = true;
    commit(f.rep === "mes" ? "Adicionado a todos os meses" : f.rep === "parc" ? `Parcelado em ${f.n}×` : "Lançado: " + brl(f.v));
  } });
}
function editItem(src, id) {
  const list = src === "rec" ? "recorrentes" : src === "parc" ? "parcelas" : "avulsos";
  const it = S[list].find(x => x.id === id); if (!it) return;
  const fromHere = src === "rec" && diffM(it.inicio, cur) > 0;
  itemForm({ title: src === "rec" ? "Editar recorrente" : src === "parc" ? "Editar parcelamento" : "Editar lançamento", it: { ...it, tipo: it.tipo || "saida" }, rep: src === "rec" ? "mes" : src === "parc" ? "parc" : "uma", editing: true,
    extra: src === "rec" ? `<div class="note" style="margin:0"><div style="width:100%">
      <div>Repete todo mês desde ${short(it.inicio)}${it.fim ? " até " + short(it.fim) : ""}.</div>
      ${fromHere ? `<div style="margin-top:10px">Você está vendo ${short(cur)}. Ao salvar, aplicar a mudança:
      <label style="display:flex;gap:8px;margin-top:8px;font-weight:600"><input type="radio" name="fromHere" id="fromHereYes" checked> Só a partir de ${short(cur)} (meses anteriores continuam como estavam)</label>
      <label style="display:flex;gap:8px;margin-top:6px;font-weight:600"><input type="radio" name="fromHere" id="fromHereNo"> Em todos os meses, desde ${short(it.inicio)}</label></div>` : ""}
      <div class="tools" style="margin-top:10px"><button type="button" class="btn sm" id="endHere">Parar de repetir (deixa de aparecer a partir de ${short(fromHere ? cur : addM(cur, 1))})</button></div></div></div>` :
      src === "parc" ? (() => { const i = diffM(it.data.slice(0, 7), cur) + 1, ativa = !it.fim || diffM(cur, it.fim) <= 0;
        return `<div class="note" style="margin:0"><div>${it.n}× de ${brl(it.v)}, comprado em ${short(it.data.slice(0, 7))}${it.fim ? ` · quitado antecipadamente em ${short(it.fim)} (parcela ${i > it.n ? it.n : i}/${it.n})` : i >= 1 && i <= it.n ? ` · parcela ${i}/${it.n} atual` : ""}.
        ${ativa && i <= it.n ? `<div class="tools" style="margin-top:8px"><button type="button" class="btn sm" id="quitarParc">Quitar antecipadamente (parou de pagar em ${short(cur)})</button></div>` : ""}</div></div>`; })() : "",
    bind: () => {
      $("#ldel").onclick = () => { const snap = snapshot(); S[list] = S[list].filter(x => x.id !== id); closeSheet(); commit("Excluído", restoreFrom(snap)); };
      if ($("#endHere")) $("#endHere").onclick = () => { const snap = snapshot(); it.fim = fromHere ? addM(cur, -1) : cur; closeSheet(); commit("Não repete mais depois de " + short(it.fim), restoreFrom(snap)); };
      if ($("#quitarParc")) $("#quitarParc").onclick = () => { const snap = snapshot(); it.fim = cur; closeSheet(); commit("Quitado — some das faturas a partir de " + short(cur), restoreFrom(snap)); };
    },
    onSave: f => {
      const snap = snapshot(), upd = { d: f.d, v: f.v, cat: f.cat, conta: f.conta };
      if (src === "rec") {
        if ($("#fromHereYes")?.checked) { S.recorrentes.push({ ...it, ...upd, id: uid(), tipo: f.tipo, dia: +f.dt.slice(8), inicio: cur, fim: it.fim }); it.fim = addM(cur, -1); }
        else Object.assign(it, upd, { tipo: f.tipo, dia: +f.dt.slice(8), inicio: f.dt.slice(0, 7) });
      } else if (src === "parc") Object.assign(it, upd, { n: f.n, data: f.dt });
      else Object.assign(it, upd, { tipo: f.tipo, data: f.dt });
      closeSheet(); commit("Alterações salvas", restoreFrom(snap));
    } });
}
$("#fab").onclick = () => newItem();
document.addEventListener("click", e => { if (e.target.closest("[data-new]")) newItem(); });

/* ---------- gráficos ---------- */
function opts(o) {
  Chart.defaults.font.family = "DM Sans, system-ui, sans-serif"; Chart.defaults.color = css("--muted"); Chart.defaults.borderColor = css("--line");
  const priv = S.prefs.priv;
  return Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 900, easing: "easeOutQuart" }, layout: { padding: { right: 8, top: 6 } },
    plugins: { legend: { position: "bottom", labels: { boxWidth: 9, boxHeight: 9, useBorderRadius: true, borderRadius: 3 } },
      tooltip: { enabled: !priv, callbacks: { label: x => " " + (x.dataset.label || x.label) + ": " + brl(x.raw) } } } }, o);
}
function catChart(id, obj) {
  const d = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  charts.push(new Chart($("#" + id), { type: "doughnut", data: { labels: d.map(x => cat(x[0]).n), datasets: [{ data: d.map(x => x[1]), backgroundColor: d.map(x => cat(x[0]).cor), borderColor: css("--panel"), borderWidth: 3, hoverOffset: 10 }] },
    options: opts({ cutout: "64%", animation: { animateRotate: true, duration: 1000 }, plugins: { legend: { position: innerWidth < 500 ? "bottom" : "right", labels: { boxWidth: 9, boxHeight: 9 } }, tooltip: { enabled: !S.prefs.priv, callbacks: { label: x => " " + x.label + ": " + brl(x.raw) } } } }) }));
}
function evoChart(id, from, to) {
  const ks = []; for (let i = from; i <= to; i++) ks.push(addM(cur, i));
  const cs = ks.map(calc), fut = ks.map(k => diffM(NOW, k) > 0), fade = (c, i) => fut[i] ? c + "66" : c;
  const cin = css("--in"), cout = css("--out");
  charts.push(new Chart($("#" + id), { type: "bar", data: { labels: ks.map(short), datasets: [
    { label: "Entradas", data: cs.map(c => c.ent), backgroundColor: cs.map((_, i) => fade(cin, i)), borderRadius: 5 },
    { label: "Saídas", data: cs.map(c => c.sai + c.inv), backgroundColor: cs.map((_, i) => fade(cout, i)), borderRadius: 5 },
    { label: "Saldo", type: "line", data: cs.map(c => c.saldo), borderColor: css("--ink"), pointBackgroundColor: css("--ink"), tension: .3, pointRadius: 3 }] },
    options: opts({ scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => S.prefs.priv ? "" : brl0(v) } } } }) }));
}

/* ---------- login ---------- */
/* ---------- login / pedido de conta / recuperação ----------
   in: entrar · req: pedir acesso (vai para o e-mail do admin) · up: criar conta (só e-mail aprovado, via link ?criar=)
   forgot: pede código por e-mail · code: código + nova senha + código de recuperação (destrava a criptografia) */
function showAuth(msg, startMode, preEmail) {
  $("#appShell").hidden = true; $("#fab").hidden = true; $("#bottomnav").hidden = true; $("#authShell").hidden = false;
  let mode = startMode || "in", email0 = preEmail || Store.user?.email || "";
  const back = '<button type="button" class="linkbtn" data-m="in">← Voltar para entrar</button>';
  const emailFld = (ro) => `<label class="fld">E-mail<input id="aEmail" type="email" required autocomplete="email" value="${esc(email0)}" ${ro ? "readonly" : ""}></label>`;
  let autoBio = false;
  // com biometria ativa neste aparelho, "manter sessão" anularia a biometria: não oferece
  const rememberFld = email0 && Store.bioEnabled(email0) ? "" : `<label class="pref" style="margin-top:2px"><input type="checkbox" id="aRemember" checked> Manter minha sessão neste aparelho</label>`;
  const draw = () => {
    const cloud = Store.cloudReady, E = `<div class="err" id="aErr">${esc(msg || "")}</div>`;
    const V = {
      bio: `<h2>Olá de novo</h2><p class="hint">Desbloqueie o Fluo de <b>${esc(email0)}</b>.</p>
        <button type="button" class="btn acc" id="aBioGo" style="padding:16px;display:flex;gap:10px;justify-content:center;align-items:center;font-size:16px">Desbloquear</button>
        <div class="err" id="aErr">${esc(msg || "")}</div>
        <button type="button" class="linkbtn" data-m="in" style="text-align:center">Usar senha</button>`,
      req: `<h2>Pedir acesso</h2><p class="hint">O Fluo é fechado para amigos. Seu pedido vai para o administrador; quando ele aprovar, você recebe um e-mail para criar a senha.</p>
        <label class="fld">Seu nome<input id="aName" required maxlength="80" autocomplete="name"></label>${emailFld()}
        <label class="fld">Mensagem (opcional)<input id="aNote" maxlength="300" placeholder="Ex: sou o Lucas, amigo do trabalho"></label>
        ${E}<button class="btn acc" style="padding:12px">Enviar pedido</button>${back}`,
      sent: `<div class="empty" style="padding:6px"><div class="blob">📬</div></div><h2>Pedido enviado!</h2>
        <p class="hint">Assim que for aprovado, chega um e-mail em <b>${esc(email0)}</b> com o link para criar sua senha. Confira também o spam.</p>${back}`,
      up: `<h2>Criar sua conta</h2><p class="hint">Seu acesso foi aprovado. Crie uma senha com pelo menos 8 caracteres.</p>
        ${emailFld()}<label class="fld">Senha<input id="aPw" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="fld">Repita a senha<input id="aPw2" type="password" required minlength="8" autocomplete="new-password"></label>
        ${rememberFld}${E}<button class="btn acc" style="padding:12px">Criar conta</button>${back}`,
      forgot: `<h2>Esqueci a senha</h2><p class="hint">Vamos mandar um código de 6 dígitos para o seu e-mail.</p>${emailFld()}
        ${E}<button class="btn acc" style="padding:12px">Enviar código</button>${back}`,
      code: `<h2>Nova senha</h2><p class="hint">Digite o código que chegou em <b>${esc(email0)}</b>. Para abrir seus dados criptografados, também precisamos do <b>código de recuperação</b> que você guardou ao criar a conta.</p>
        <label class="fld">Código do e-mail<input id="aOtp" required inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" style="letter-spacing:6px;font-family:var(--mono)"></label>
        <label class="fld">Nova senha<input id="aPw" type="password" required minlength="8" autocomplete="new-password"></label>
        <label class="fld">Código de recuperação<input id="aCode" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off"></label>
        ${E}<button class="btn acc" style="padding:12px">Trocar senha e entrar</button><button type="button" class="linkbtn" data-m="forgot">Reenviar código</button>`,
      rec: `<h2>Destravar seus dados</h2><p class="hint">Sua senha mudou. Digite o <b>código de recuperação</b> que você guardou ao criar a conta.</p>
        <label class="fld">Código de recuperação<input id="aCode" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off"></label>
        <label class="fld">Sua senha<input id="aPw" type="password" required minlength="8" autocomplete="current-password"></label>
        ${E}<button class="btn acc" style="padding:12px">Destravar</button>`,
      in: `<h2>Entrar</h2>${cloud ? `${emailFld()}
        <label class="fld">Senha<input id="aPw" type="password" required minlength="8" autocomplete="current-password"></label>
        ${rememberFld}${E}<button class="btn acc" style="padding:12px">Entrar</button>
        <button type="button" class="linkbtn" data-m="forgot" style="color:var(--muted)">Esqueci a senha</button>
        <div style="display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px"><hr style="flex:1;border:0;border-top:1px solid var(--line)">ainda não tem conta?<hr style="flex:1;border:0;border-top:1px solid var(--line)"></div>
        <button type="button" class="btn" data-m="req" style="padding:12px">Pedir acesso</button>
        <button type="button" class="linkbtn" data-m="up" style="color:var(--muted);text-align:center">Já fui aprovado · criar minha senha</button>`
        : `<p class="hint">O login online ainda não foi configurado neste endereço.</p>`}
        <p class="hint" style="font-size:12px">🔒 Seus dados são criptografados no seu aparelho antes de irem para a nuvem. Ninguém além de você consegue lê-los.</p>`,
    };
    $("#authForm").innerHTML = V[mode]; Controls.enhance($("#authForm"));
    document.querySelectorAll("#authForm [data-m]").forEach(b => b.onclick = () => { email0 = $("#aEmail")?.value || email0; mode = b.dataset.m; msg = ""; draw(); });
    if (mode === "bio") $("#aBioGo").onclick = async () => {
      const b = $("#aBioGo"), old = b.innerHTML; b.innerHTML = '<span class="spin"></span> Verificando…'; b.disabled = true;
      try { S = (await Store.bioUnlock(email0)).state; enterApp(); }
      catch (ex) { msg = /NotAllowed|denied/i.test(ex?.message || "") || ex?.name === "NotAllowedError" ? "" : "Não foi possível desbloquear. Use sua senha."; draw(); }
      finally { if (b.isConnected) { b.innerHTML = old; b.disabled = false; } }
    };
    if (mode === "bio" && !autoBio) { autoBio = true; $("#aBioGo").click(); } // já abre a biometria; o botão fica para tentar de novo
    const f = $("#authForm").querySelector("input:not([readonly])"); if (f && matchMedia("(pointer:fine)").matches) f.focus();
  };
  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const err = t => { $("#aErr").textContent = t; const f = $("#authForm"); f.classList.remove("shake"); f.offsetWidth; f.classList.add("shake"); };
    const btn = $("#authForm").querySelector(".btn.acc"); if (!btn) return;
    const bad = [...$("#authForm").querySelectorAll("input[required]")].find(i => !i.checkValidity());
    if (bad) { bad.focus(); return err(bad.type === "email" ? "Digite um e-mail válido." : bad.minLength > 0 && bad.value ? `Use pelo menos ${bad.minLength} caracteres.` : "Preencha este campo."); }
    const old = btn.innerHTML; btn.innerHTML = '<span class="spin"></span> Aguarde…'; btn.disabled = true;
    try {
      const email = ($("#aEmail")?.value || email0).trim().toLowerCase(), pw = $("#aPw")?.value;
      if (email) email0 = email;
      if ($("#aRemember")) Store.setRemember($("#aRemember").checked);
      if (mode === "req") {
        const r = await Store.messenger({ action: "request", email, name: $("#aName").value.trim(), note: $("#aNote").value.trim() });
        if (r.status === "already") { mode = "up"; msg = "Seu e-mail já foi aprovado! Crie sua senha."; return draw(); }
        if (r.status === "full") return err("Muitos pedidos na fila agora. Tente de novo em alguns dias.");
        if (r.status === "invalid") return err("Digite um e-mail válido.");
        if (r.status === "wait") return err("Pedido já enviado há pouco. Aguarde alguns minutos.");
        if (r.status !== "created" && r.status !== "pending") throw new Error(r.message || "falha");
        mode = "sent"; return draw();
      }
      if (mode === "forgot") { const r = await Store.messenger({ action: "forgot", email }); if (r.status === "wait") return err("Código enviado há pouco. Aguarde um minuto."); mode = "code"; msg = ""; draw(); return toast("Se existir conta com esse e-mail, o código chegou."); }
      if (mode === "code") {
        const r = await Store.finishReset(email, $("#aOtp").value.trim(), pw);
        if (r.status !== "ok") return err({ wrong: "Código incorreto.", expired: "Código vencido. Peça outro.", locked: "Muitas tentativas. Peça um novo código.", weak: "Use pelo menos 8 caracteres." }[r.status] || "Não foi possível trocar a senha.");
        const s = await Store.signIn(email, pw);
        const st = s.needRecovery ? (await Store.recover($("#aCode").value, pw)).state : s.state;
        S = st; enterApp(); return toast("Senha trocada");
      }
      if (mode === "rec") { const r = await Store.recover($("#aCode").value, pw); S = r.state; enterApp(); toast("Acesso recuperado"); return; }
      if (mode === "up") {
        if (pw !== $("#aPw2").value) return err("As senhas não são iguais.");
        const r = await Store.signUp(email, pw, baseState());
        if (r.confirmEmail) { mode = "in"; msg = "Conta criada! Confirme pelo e-mail e depois entre."; return draw(); }
        S = r.state; return showRecovery(r.recoveryCode);
      }
      const r = await Store.signIn(email, pw);
      if (r.noVault) { const c = await Store.createVault(pw, baseState()); S = c.state; return showRecovery(c.recoveryCode); }
      if (r.needRecovery) { mode = "rec"; return draw(); }
      S = r.state; enterApp();
    } catch (ex) {
      const m = ex?.message || "";
      err(/NOT_APPROVED|Database error saving/i.test(m) ? "Esse e-mail ainda não foi aprovado. Use “Pedir acesso”." : /Invalid login/i.test(m) ? "E-mail ou senha incorretos." : /registered|already/i.test(m) ? "Esse e-mail já tem conta. Tente entrar." : /fetch|network|Failed/i.test(m) ? "Sem conexão. Verifique a internet." : /decrypt|operation/i.test(m) ? "Código de recuperação incorreto." : "Algo deu errado. Tente de novo.");
    } finally { if (btn.isConnected) { btn.innerHTML = old; btn.disabled = false; } }
  };
  draw();
}
function showRecovery(code) {
  $("#authForm").innerHTML = `<h2>Guarde este código</h2><p class="hint">Se esquecer a senha, é a <b>única forma</b> de recuperar seus dados — nem nós conseguimos, porque tudo é criptografado. Anote ou tire print e guarde em lugar seguro.</p>
   <div class="reccode">${code}</div><button type="button" class="btn" id="copyRec">Copiar código</button>
   <label class="note" style="cursor:pointer;align-items:center"><input type="checkbox" id="saved"> Guardei o código em lugar seguro</label>
   <button type="button" class="btn acc" id="goIn" style="padding:12px" disabled>Começar a usar</button>`;
  $("#copyRec").onclick = () => navigator.clipboard?.writeText(code).then(() => toast("Código copiado"), () => {});
  $("#saved").onchange = e => $("#goIn").disabled = !e.target.checked;
  $("#goIn").onclick = () => { enterApp(); setTimeout(tour, 600); };
}
function enterApp() {
  $("#authShell").hidden = true; $("#appShell").hidden = false; $("#fab").hidden = false; $("#bottomnav").hidden = false;
  page = "mes"; cur = NOW; animate = true; render();
}
Store.onStatus(s => {
  const el = $("#sync"); el.className = "sync " + (s === "busy" ? "busy" : s === "err" || s === "conflict" ? "err" : "");
  $("#syncTxt").textContent = s === "busy" ? "salvando…" : s === "err" ? "sem conexão — tentaremos de novo" : s === "conflict" ? "alterado em outro aparelho" : "salvo na nuvem";
  if (s === "err") setTimeout(() => Store.flush(), 8000);
  if (s === "conflict") toast("Seus dados mudaram em outro aparelho. Recarregando…"), Store.reload().then(st => { S = st; render(); });
});

/* ---------- mini tour ---------- */
function tour() {
  try { localStorage.setItem("cv.tour", "1"); } catch (e) {}
  const steps = [["wave", "Bem-vindo ao Fluo", "Aqui você vê quanto sobra no mês. As setas no topo trocam de mês — até meses futuros, que mostram a projeção."],
    ["plus", "Lançar é no botão verde", "Gasto, entrada ou investimento. Escolha “Todo mês” para contas fixas ou “Parcelado” para compras no cartão: o app espalha pelos meses sozinho."],
    ["eye", "O olho esconde os valores", "Útil para abrir o app em público. Toque de novo para mostrar."],
    ["settings", "Tudo é configurável", "Em Ajustes você cria categorias, cartões, limites e escolhe o tema."]];
  let i = 0;
  const show = () => { const [e, t, d] = steps[i]; openSheet(`<div class="panel" style="text-align:center;justify-items:center"><div class="empty" style="padding:6px"><div class="blob">${ic(e, 24)}</div></div><h2>${t}</h2><p class="hint">${d}</p>
    <div style="display:flex;gap:6px;justify-content:center">${steps.map((_, j) => `<span class="dot" style="background:${j === i ? "var(--accent)" : "var(--line)"}"></span>`).join("")}</div>
    <div class="tools" style="justify-content:center"><button class="btn" id="tSkip">Pular</button><button class="btn acc" id="tNext">${i < steps.length - 1 ? "Próximo" : "Começar"}</button></div></div>`, () => {
      $("#tSkip").onclick = closeSheet; $("#tNext").onclick = () => { i++; i < steps.length ? show() : closeSheet(); }; }); };
  show();
}

/* ---------- boot ---------- */
(async () => {
  try {
    const criar = new URLSearchParams(location.search).get("criar");
    if (criar) { history.replaceState(null, "", location.pathname); return showAuth("", "up", criar); }
    const r = await Store.resume();
    if (r?.state) { S = r.state; enterApp(); return; }
    if (r?.needPassword && r.bioAvail) return showAuth("", "bio", r.email);
    showAuth(r?.needPassword ? "Digite sua senha para destravar seus dados." : "", r?.needPassword ? "in" : undefined, r?.email);
  } catch (e) { showAuth("Não foi possível conectar. Verifique a internet."); }
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
})();
