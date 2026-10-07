/* Fluo — livro-caixa (interface nova). Mesmo modelo de dados e mesma criptografia do app atual (../store.js). */
(() => {
const MES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let PRIV = false; // "ocultar valores": todo texto de dinheiro nasce mascarado
const nbr = v => PRIV ? "••••••" : Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = v => PRIV ? "R$ ••••••" : (v < 0 ? "−" : "") + "R$ " + nbr(v);
const brl0 = v => PRIV ? "R$ •••" : (v < 0 ? "−" : "") + "R$ " + Math.abs(Math.round(v)).toLocaleString("pt-BR");
const M = (v, f = brl) => `<span class="money num">${f(v)}</span>`;
const pad = n => String(n).padStart(2, "0");
const mk = (y, m) => y + "-" + pad(m);
const addM = (k, n) => { let [y, m] = k.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return mk(y, m); };
const diffM = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const label = k => { const [y, m] = k.split("-"); return MES[+m - 1] + " " + y; };
const short = k => { const [y, m] = k.split("-"); return MES[+m - 1].slice(0, 3).toLowerCase() + "/" + y.slice(2); };
const today = () => { const d = new Date(); return mk(d.getFullYear(), d.getMonth() + 1) + "-" + pad(d.getDate()); };
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const fdate = s => { const [y, m, d] = s.split("-"); return +d + " de " + MES[+m - 1].toLowerCase() + (y !== today().slice(0, 4) ? " de " + y : ""); };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = s => { s = String(s ?? "").trim(); if (!s) return 0; if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
const fnum = v => String(Math.round(v * 100) / 100).replace(".", ",");
const NOW = today().slice(0, 7);
const PAL = ["#2d6a4d","#c4573b","#4b5fa8","#c98a12","#a8497e","#2f86a8","#7a8a3a","#8a6a9e","#7a3fb0","#5b6b57","#1f6f8b","#b5604a"];

let tlStart = null, lastPage = null, futSel = null, bioOk = false;
let S = null, cur = NOW, page = "inicio", plano = "parc", filtro = "tudo", agrupar = "dia", busca = "", FS = null;
const cat = id => S.cats.find(c => c.id === id) || { id, n: "Sem categoria", cor: "#8b8f85", tipo: "saida" };
const conta = id => S.contas.find(c => c.id === id) || { id, n: "Sem conta", cor: "#8b8f85", tipo: "debito" };
const pessoa = id => S.pessoas.find(p => p.id === id) || { n: "?", cor: "#8b8f85" };
const evento = id => (S.eventos || []).find(e => e.id === id);
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

/* ---------- cartão de crédito: fechamento, vencimento e melhor dia de compra ---------- */
const dstr = (ym, d) => { const [y, m] = ym.split("-").map(Number), last = new Date(y, m, 0).getDate(); return ym + "-" + pad(Math.min(d, last)); };
const fd = s => s.slice(8) + "/" + s.slice(5, 7);
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const startM = p => p.fat || p.data.slice(0, 7);
const fechaDeVenc = V => ((V - 7 + 29) % 30) + 1, vencDeFecha = F => ((F + 6) % 30) + 1; // o outro dia é estimado: fecha 7 dias antes de vencer
const cardVenc = a => a.venc || (a.fecha ? vencDeFecha(a.fecha) : 10);
const cardFecha = a => a.fecha || fechaDeVenc(cardVenc(a));
/* compra feita a partir do dia de fechamento entra na PRÓXIMA fatura; o melhor dia de compra é o próprio dia de fechamento */
function cardCycle(a, date) {
  const fecha = cardFecha(a), venc = cardVenc(a), ym = date.slice(0, 7), d = +date.slice(8);
  const closeM = d >= fecha ? addM(ym, 1) : ym, closeDate = dstr(closeM, fecha);
  const dueM = venc > fecha ? closeM : addM(closeM, 1), dueDate = dstr(dueM, venc);
  const antes = d < fecha, bestDate = dstr(ym, fecha), bestDue = dstr(venc > fecha ? addM(ym, 1) : addM(ym, 2), venc);
  return { fecha, venc, estimado: !a.fecha || !a.venc, fatM: dueM, closeDate, dueDate, dias: daysBetween(date, dueDate), antes, bestDate, bestDue, ganho: daysBetween(dueDate, bestDue) };
}
const creditCycle = (contaId, tipo, date) => { const a = conta(contaId); return tipo === "saida" && a.tipo === "credito" && date ? cardCycle(a, date) : null; };
const startFor = f => creditCycle(f.conta, f.tipo, f.data)?.fatM || f.data.slice(0, 7);
function cardNote(f) {
  const c = creditCycle(f.conta, f.tipo, f.data); if (!c) return "";
  const n = Math.max(2, +f.n || 2);
  let h = `<b>Fatura de ${short(c.fatM)}</b> · vence ${fd(c.dueDate)}`;
  h += c.antes ? `<br>Melhor dia de compra: <b>${fd(c.bestDate)}</b> (+${c.ganho} dias para pagar)` : `<br>Melhor período: fecha só em ${fd(c.closeDate)}`;
  if (f.rep === "parc") h += `<br>${short(c.fatM)} até ${short(addM(c.fatM, n - 1))}`;
  if (c.estimado) h += `<br><span class="mute">fechamento estimado (dia ${c.fecha})</span>`;
  return `<div class="preview">${h}</div>`;
}
/* avisos: melhor dia de compra e vencimento de fatura */
function notices() {
  const out = [], t = today(), tm = t.slice(0, 7), hoje = +t.slice(8);
  S.contas.filter(a => a.tipo === "credito" && !a.pessoa).forEach(a => {
    const fecha = cardFecha(a), next = dstr(hoje <= fecha ? tm : addM(tm, 1), fecha), n = daysBetween(t, next), due = cardCycle(a, next).dueDate;
    if (n === 0) out.push({ id: "best:" + a.id, tone: "best", title: `Hoje é o melhor dia de compra no ${a.n}`, body: `Compras de hoje vencem só em ${fd(due)}` });
    else if (n <= 3) out.push({ id: "best:" + a.id, tone: "best", title: `Melhor dia no ${a.n}: ${n === 1 ? "amanhã" : "em " + n + " dias"} (${fd(next)})`, body: `Comprando nesse dia, vence só em ${fd(due)}` });
    [tm, addM(tm, 1)].forEach(m => { const v = calc(m).porConta[a.id]; if (!v || S.pagos[m]?.["card:" + a.id]) return; const dd = dstr(m, cardVenc(a)), k = daysBetween(t, dd);
      if (k < 0) out.push({ id: "due:" + a.id + m, tone: "late", title: `Fatura ${a.n} atrasada (${fd(dd)})`, body: brl(v) });
      else if (k <= 3) out.push({ id: "due:" + a.id + m, tone: "due", title: `Fatura ${a.n} vence ${k === 0 ? "hoje" : k === 1 ? "amanhã" : "em " + k + " dias"} (${fd(dd)})`, body: brl(v) }); });
  });
  return out;
}
function avisosHtml() {
  const l = notices(), can = "Notification" in window, on = can && Notification.permission === "granted" && ls.get("fluo.avisos") === "1";
  if (!l.length) return "";
  return `<div class="h"><h2>Avisos</h2>${on || !can ? "" : `<button class="aside" data-a="avisosOn">ativar no aparelho</button>`}</div>${l.map(n => `<div class="aviso ${n.tone}"><i></i><div><div class="t">${esc(n.title)}</div><div class="s">${esc(n.body)}</div></div></div>`).join("") || ``}`;
}
function pushNotices() {
  if (!("Notification" in window) || Notification.permission !== "granted" || ls.get("fluo.avisos") !== "1") return;
  const t = today(); notices().forEach(n => { const k = "fluo.n." + t + "." + n.id; if (ls.get(k)) return; ls.set(k, "1"); try { new Notification(n.title, { body: n.body, tag: n.id }); } catch (e) {} });
}

/* ---------- cálculo (igual ao app atual) ---------- */
function monthItems(k) {
  const out = [];
  S.recorrentes.forEach(r => { if (diffM(r.inicio, k) >= 0 && (!r.fim || diffM(k, r.fim) >= 0)) out.push({ ...r, src: "rec", dia: r.dia || 1 }); });
  S.parcelas.forEach(p => { const i = diffM(startM(p), k); if (i >= 0 && i < p.n && (!p.fim || diffM(k, p.fim) >= 0)) out.push({ ...p, tipo: "saida", src: "parc", idx: i + 1, dia: +p.data.slice(8) }); });
  S.avulsos.forEach(a => { if ((a.fat || a.data.slice(0, 7)) === k) out.push({ ...a, src: "avulso", dia: +a.data.slice(8) }); });
  return out.sort((a, b) => b.dia - a.dia);
}
const isPaid = (k, it) => {
  if (it.tipo !== "saida") return true;
  const c = conta(it.conta);
  if (c.tipo === "credito") return !!S.pagos[k]?.["card:" + c.id];
  if (it.src === "rec") return !!S.pagos[k]?.[it.id];
  return true;
};
const memo = {};
function calc(k) {
  const it = monthItems(k), sum = f => it.filter(f).reduce((t, x) => t + x.v, 0);
  const ent = sum(x => x.tipo === "entrada"), inv = sum(x => x.tipo === "invest"), sai = sum(x => x.tipo === "saida");
  const fixo = sum(x => x.tipo === "saida" && x.src === "rec"), parc = sum(x => x.src === "parc"), vari = sum(x => x.tipo === "saida" && x.src === "avulso");
  const porCat = {}, porConta = {};
  it.filter(x => x.tipo === "saida").forEach(x => { porCat[x.cat] = (porCat[x.cat] || 0) + x.v; porConta[x.conta] = (porConta[x.conta] || 0) + x.v; });
  return { it, ent, inv, sai, fixo, parc, vari, saldo: ent - sai - inv, porCat, porConta };
}
function contasDoMes(k) {
  const c = calc(k), out = [];
  S.contas.filter(a => a.tipo === "credito" || a.pessoa).forEach(a => { const v = c.porConta[a.id]; if (v) out.push({ key: "card:" + a.id, fat: a.id, n: a.pessoa ? pessoa(a.pessoa).n : "Fatura " + a.n, sub: a.pessoa ? "o que você usou do cartão dela" : "cartão de crédito", dia: cardVenc(a), v }); });
  c.it.filter(x => x.tipo === "saida" && x.src === "rec" && conta(x.conta).tipo !== "credito" && !conta(x.conta).pessoa).forEach(x => out.push({ key: x.id, n: x.d, sub: cat(x.cat).n + " · " + conta(x.conta).n, dia: x.dia, v: x.v }));
  out.forEach(o => o.paid = !!S.pagos[k]?.[o.key]);
  return out.sort((a, b) => a.paid - b.paid || a.dia - b.dia);
}
const restante = d => d.v - (d.pagtos || []).reduce((t, p) => t + p.v, 0);
const autoDebt = p => { const pc = S.contas.find(c => c.pessoa === p.id); if (!pc) return 0; const v = calc(cur).porConta[pc.id] || 0; return S.pagos[cur]?.["card:" + pc.id] ? 0 : v; };

/* ---------- persistência, desfazer, aviso ---------- */
const snap = () => JSON.parse(JSON.stringify(S));
function commit(msg, undoSnap) { Store.save(S); render(false); if (msg) toast(msg, undoSnap); }
let toastT;
function toast(t, undoSnap) {
  const el = $("#toast"); el.innerHTML = esc(t) + (undoSnap ? " <button data-a='undo'>Desfazer</button>" : ""); el.hidden = false;
  el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
  A.undo = () => { S = undoSnap; el.hidden = true; Store.save(S); render(false); };
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, undoSnap ? 9000 : 2400);
}

/* ---------- janela lateral / inferior ---------- */
function openSheet(html, modal) {
  const sh = $("#sheet"); sh.classList.add("modal");
  sh.innerHTML = `<div class="scrim" data-x></div><div class="panel" role="dialog" aria-modal="true"><button class="x" data-x aria-label="Fechar">✕</button>${html}</div>`;
  sh.hidden = false; sh.classList.remove("out");
  const f = sh.querySelector("[autofocus]"); if (f) f.focus();
}
function closeSheet() {
  const sh = $("#sheet"); if (sh.hidden) return; FS = null;
  sh.classList.add("out"); setTimeout(() => { sh.hidden = true; sh.classList.remove("out"); sh.innerHTML = ""; }, 240);
}
/* formulário genérico: FS guarda o estado, #fb é redesenhado a cada escolha */
function form(title, st, body, { pre = "", sub = "" } = {}) {
  FS = st; FS.draw = () => { const b = $("#fb"); if (b) b.innerHTML = body(FS); };
  openSheet(`<h3>${title}</h3>${sub ? `<p class="lede">${sub}</p>` : ""}${pre}<div id="fb">${body(FS)}</div>`);
}
const chips = (f, opts, val) => `<div class="chips">${opts.map(o => `<button type="button" class="chip" data-a="set" data-f="${f}" data-val="${esc(o.v)}" aria-pressed="${String(val) === String(o.v)}">${o.c ? `<i style="--c:${o.c}"></i>` : ""}${esc(o.l)}</button>`).join("")}</div>`;
const seg = (f, opts, val) => `<div class="seg">${opts.map(o => `<button type="button" data-a="set" data-f="${f}" data-val="${esc(o.v)}" aria-pressed="${String(val) === String(o.v)}">${esc(o.l)}</button>`).join("")}</div>`;
const fld = (l, inner) => `<div class="fld"><span class="lb">${l}</span>${inner}</div>`;
/* seletor de cor próprio (nunca o nativo): paleta + "Outra cor" com área saturação/brilho, faixa de matiz e código */
const hsvToHex = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6, c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); }; return "#" + f(5) + f(3) + f(1); };
const hexToHsv = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""), n = parseInt(m ? m[1] : "6b7389", 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx]; };
const readableOn = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff"; const n = parseInt(m[1], 16), lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }; return .2126 * lin(n >> 16) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255) > .45 ? "#16171a" : "#fff"; };
const cpHtml = val => { const { h, s, v } = FS.cp; return `<div class="cp"><div class="cp-sv" style="--hue:${h}"><i style="left:${s * 100}%;top:${(1 - v) * 100}%"></i></div><div class="cp-h"><i style="left:${h / 360 * 100}%"></i></div><div class="cp-row"><span class="cp-sw" style="background:${esc(val)}"></span><input class="in cp-hex" value="${esc(val)}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Código da cor"></div></div>`; };
const colorChips = (f, val) => {
  const open = FS?.cp?.f === f, custom = !PAL.includes(val);
  const base = chips(f, PAL.map(c => ({ v: c, l: "", c })), val).replace(/class="chip"/g, 'class="chip" style="padding:6px 10px"');
  const btn = `<button type="button" class="chip" data-a="cpToggle" data-f="${f}" aria-pressed="${custom || open}">${custom ? `<i style="--c:${esc(val)}"></i>` : ""}Outra cor</button>`;
  return base.replace(/<\/div>$/, btn + "</div>") + (open ? cpHtml(val) : "");
};

/* ---------- Início ---------- */
function pgInicio() {
  const c = calc(cur), l = contasDoMes(cur), hoje = new Date().getDate();
  const falta = l.filter(x => !x.paid).reduce((t, x) => t + x.v, 0), nFalta = l.filter(x => !x.paid).length;
  const prox = l.find(x => !x.paid);
  const base = Math.max(c.ent, c.sai + c.inv, 1);
  const seg_ = [["Fixos", c.fixo, "#44524a"], ["Parcelas", c.parc, "#8f7aa8"], ["Variáveis", c.vari, "#d4755a"], ["Investido", c.inv, "#6b86d1"], ["Sobra", Math.max(c.saldo, 0), "var(--hi)"]].filter(x => x[1] > 0);
  const frase = c.ent === 0 && c.sai === 0 ? "Nada lançado neste mês ainda. Toque em <b>Lançar</b> para começar."
    : c.saldo >= 0 ? `Depois de pagar tudo e investir, <span class="hl">sobram ${brl(c.saldo)}</span>${prox ? `. A próxima conta é <b>${esc(prox.n)}</b>, dia ${prox.dia}.` : ". Todas as contas já estão pagas."}`
    : `O mês fecha <b class="neg">${brl(c.saldo)}</b> no vermelho. Vale olhar os fixos e as parcelas abaixo.`;
  /* linha do tempo: 12 meses */
  if (!tlStart) tlStart = addM(cur, -2); else if (diffM(tlStart, cur) < 0) tlStart = cur; else if (diffM(tlStart, cur) > 11) tlStart = addM(cur, -11);
  const ks = Array.from({ length: 12 }, (_, i) => addM(tlStart, i)), cs = ks.map(calc), mx = Math.max(...cs.map(x => Math.max(x.ent, x.sai + x.inv)), 1);
  const tl = ks.map((k, i) => `<button data-a="go" data-k="${k}" aria-current="${k === cur}"><div class="col"><i style="height:${Math.max(3, (cs[i].sai + cs[i].inv) / mx * 100)}%"></i><u style="bottom:${cs[i].ent / mx * 100}%"></u></div><b class="num money">${brl0(cs[i].saldo)}</b><small>${short(k)}</small></button>`).join("");
  /* categorias e formas de pagamento */
  const topCat = Object.entries(c.porCat).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const bars = (arr, colorOf, nameOf, total) => arr.map(([id, v], i) => `<div class="ln"><span>${esc(nameOf(id))}</span><span class="v">${M(v)}</span><div class="track"><i style="width:${v / total * 100}%;background:${colorOf(id)};animation-delay:${i * 50}ms"></i></div></div>`).join("");
  const porConta = Object.entries(c.porConta).sort((a, b) => b[1] - a[1]);
  /* horizonte: quando as parcelas diminuem */
  let hor = "";
  for (let i = 1; i <= 14; i++) { const a = calc(addM(cur, i - 1)).parc, b = calc(addM(cur, i)).parc; if (b < a - 0.5) { hor = `Em <b>${label(addM(cur, i))}</b> suas parcelas caem de ${M(a)} para ${M(b)} — <span class="hl">${brl(a - b)} a menos por mês</span>.`; break; } }
  const rows = l.filter(x => !x.paid).slice(0, 5).map(payRow).join("");
  return `<section class="hero"><div><div class="kick">Saldo de ${label(cur)}</div><div class="big money num"><small>R$</small>${!PRIV && c.saldo < 0 ? "−" : ""}${nbr(c.saldo)}</div><p class="sent">${frase}</p></div>
    <div class="facts"><div class="fact"><span>Entrou</span><b class="pos">${M(c.ent)}</b></div><div class="fact"><span>Saiu</span><b>${M(c.sai)}</b></div><div class="fact"><span>Investiu</span><b>${M(c.inv)}</b></div><div class="fact"><span>Falta pagar</span><b>${M(falta)}</b></div></div></section>
   ${avisosHtml()}<div class="river">${seg_.map(([n, v, col], i) => `<i title="${n}" style="width:${v / base * 100}%;background:${col};animation-delay:${i * 70}ms"></i>`).join("")}</div>
   <div class="legend">${seg_.map(([n, v, col]) => `<span style="--c:${col}">${n} <b class="money">${brl0(v)}</b></span>`).join("")}</div>
   <div class="h"><h2>Linha do tempo</h2></div><div class="tl">${tl}</div>
   <div class="cols"><div><div class="h"><h2>Próximos vencimentos</h2><button class="aside" data-a="nav" data-p="pagar">ver todos →</button></div>${rows || `<p class="empty">Nada pendente.</p>`}</div>
    <div><div class="h"><h2>Para onde foi</h2></div><div class="bars">${bars(topCat, id => cat(id).cor, id => cat(id).n, c.sai) || `<p class="empty">Sem saídas.</p>`}</div></div></div>
   <div class="cols"><div><div class="h"><h2>Por forma de pagamento</h2></div><div class="bars">${bars(porConta, id => conta(id).cor, id => conta(id).n, c.sai) || `<p class="empty">Sem saídas.</p>`}</div></div>
    <div><div class="h"><h2>No horizonte</h2></div><p class="sent">${hor || "—"}</p></div></div>`;
}
function payRow(x) {
  const hoje = new Date().getDate(), late = !x.paid && (diffM(cur, NOW) < 0 || cur === NOW && x.dia < hoje);
  return `<div class="ln pay ${x.paid ? "paid" : ""}"><button class="ck" data-a="pay" data-k="${esc(x.key)}" aria-pressed="${x.paid}" aria-label="${x.paid ? "Pago, reabrir" : "Marcar como pago"}">✓</button><span class="d">dia ${x.dia}</span>
    <div ${x.fat ? `data-a="conta" data-id="${x.fat}" style="cursor:pointer"` : ""} style="min-width:0"><div class="t">${esc(x.n)}${late ? '<span class="tag late">atrasada</span>' : ""}</div><div class="s">${esc(x.sub)}</div></div><span class="v">${M(x.v)}</span></div>`;
}

/* ---------- Pagar ---------- */
function pgPagar() {
  const l = contasDoMes(cur), tot = l.reduce((t, x) => t + x.v, 0), pago = l.filter(x => x.paid).reduce((t, x) => t + x.v, 0), hoje = new Date().getDate();
  const g = { late: [], soon: [], later: [], done: [] };
  l.forEach(x => { if (x.paid) g.done.push(x); else if (diffM(cur, NOW) < 0 || cur === NOW && x.dia < hoje) g.late.push(x); else if (cur === NOW && x.dia <= hoje + 7) g.soon.push(x); else g.later.push(x); });
  const sec = (t, arr, ex = "") => arr.length ? `<div class="h"><h2>${t}</h2><span class="aside">${ex || M(arr.reduce((s, x) => s + x.v, 0))}</span></div>${arr.map(payRow).join("")}` : "";
  return `<section class="hero"><div><div class="kick">Falta pagar em ${label(cur)}</div><div class="big money num"><small>R$</small>${nbr(tot - pago)}</div>
    <p class="sent">${l.length ? `${l.filter(x => x.paid).length} de ${l.length} contas pagas.` : "Nenhuma conta a pagar neste mês."}</p></div>
    <div><div class="river" style="margin:0"><i style="width:${tot ? pago / tot * 100 : 0}%;background:var(--pos)"></i><i style="flex:1;background:var(--paper2);animation:none"></i></div><div class="legend" style="margin-top:10px"><span style="--c:var(--pos)">pago <b class="money">${brl0(pago)}</b></span><span style="--c:var(--paper2)">de <b class="money">${brl0(tot)}</b></span></div></div></section>
   ${sec("Atrasadas", g.late)}${sec("Esta semana", g.soon)}${sec(cur === NOW ? "Depois" : "A pagar", g.later)}${sec("Pagas", g.done)}`;
}

/* ---------- Extrato ---------- */
function pgExtrato() {
  const c = calc(cur);
  let it = c.it.filter(x => filtro === "tudo" || filtro === "entrada" && x.tipo !== "saida" || filtro === "saida" && x.tipo === "saida" || filtro === "aberto" && x.tipo === "saida" && !isPaid(cur, x));
  if (busca) it = it.filter(x => norm(x.d + " " + cat(x.cat).n + " " + conta(x.conta).n).includes(norm(busca)));
  const gk = agrupar === "conta" ? x => x.conta : agrupar === "cat" ? x => x.cat : x => x.dia;
  const gl = agrupar === "conta" ? k => conta(k).n : agrupar === "cat" ? k => cat(k).n : k => "Dia " + k;
  const grp = {}; it.forEach(x => (grp[gk(x)] ??= []).push(x));
  const keys = Object.keys(grp).sort(agrupar === "dia" ? (a, b) => b - a : (a, b) => grp[b].reduce((t, x) => t + x.v, 0) - grp[a].reduce((t, x) => t + x.v, 0));
  const line = x => `<button class="ln" data-a="edit" data-src="${x.src}" data-id="${x.id}"><span class="d">${agrupar === "dia" ? "" : "dia " + x.dia}</span><span style="min-width:0"><span class="t" style="display:block">${esc(x.d)}${x.ev && evento(x.ev) ? `<span class="tag ev">${esc(evento(x.ev).n)}</span>` : ""}${x.tipo === "saida" && !isPaid(cur, x) ? "" : ""}</span><span class="s" style="display:block">${esc(cat(x.cat).n)} · ${esc(conta(x.conta).n)}${x.src === "parc" ? ` · ${x.idx}/${x.n}` : x.src === "rec" ? " · todo mês" : ""}</span></span><span class="v ${x.tipo === "entrada" ? "pos" : ""}">${x.tipo === "entrada" ? "+" : ""}${M(x.v)}</span></button>`;
  const totEnt = it.filter(x => x.tipo === "entrada").reduce((t, x) => t + x.v, 0), totSai = it.filter(x => x.tipo === "saida").reduce((t, x) => t + x.v, 0);
  return `<div class="tools"><input class="search" id="busca" type="search" placeholder="Buscar nome, categoria ou cartão" value="${esc(busca)}" aria-label="Buscar">
     <div class="seg">${[["tudo", "Tudo"], ["saida", "Saídas"], ["entrada", "Entradas"], ["aberto", "A pagar"]].map(([k, t]) => `<button data-a="filtro" data-v="${k}" aria-pressed="${filtro === k}">${t}</button>`).join("")}</div>
     <div class="seg">${[["dia", "Dia"], ["conta", "Pagamento"], ["cat", "Categoria"]].map(([k, t]) => `<button data-a="agrupar" data-v="${k}" aria-pressed="${agrupar === k}">${t}</button>`).join("")}</div></div>
   ${keys.map(k => `<div class="h"><h2>${esc(gl(k))}</h2><span class="aside">${M(grp[k].reduce((t, x) => t + (x.tipo === "entrada" ? x.v : -x.v), 0))}</span></div>${grp[k].map(line).join("")}`).join("") || `<p class="empty">Nada neste mês.</p>`}
   <div class="sub-total"><span>${it.length} lançamentos</span><span class="num">entrou ${M(totEnt)} · saiu ${M(totSai)}</span></div>`;
}

/* ---------- Carteira: cartões, contas e pessoas ---------- */
function pgCarteira() {
  const c = calc(cur), cards = S.contas.filter(a => a.tipo === "credito" && !a.pessoa), others = S.contas.filter(a => a.tipo !== "credito" && !a.pessoa);
  const card = a => { const v = c.porConta[a.id] || 0, paid = !!S.pagos[cur]?.["card:" + a.id]; return `<button class="card ${paid && v ? "paid" : ""}" style="--c:${a.cor};color:${readableOn(a.cor)}" data-a="conta" data-id="${a.id}"><div><div class="k">${paid && v ? "fatura paga" : "vence dia " + (a.venc || (a.fecha ? vencDeFecha(a.fecha) : "?"))}</div><div class="n">${esc(a.n)}</div></div><div><div class="v money num">${brl(v)}</div>${a.limite ? `<div class="lim"><i style="width:${Math.min(100, v / a.limite * 100)}%"></i></div><div class="k" style="margin-top:6px">${Math.round(v / a.limite * 100)}% do limite</div>` : ""}</div></button>`; };
  const pr = p => { const du = autoDebt(p) + S.dividas.filter(d => d.pessoa === p.id && d.dir === "devo").reduce((t, d) => t + Math.max(0, restante(d)), 0), re = S.dividas.filter(d => d.pessoa === p.id && d.dir === "me_deve").reduce((t, d) => t + Math.max(0, restante(d)), 0), net = re - du;
    return `<button class="ln person" data-a="pessoa" data-id="${p.id}"><span class="av" style="--c:${p.cor};color:${readableOn(p.cor)}">${esc(p.n[0] || "?")}</span><span><span class="t" style="display:block">${esc(p.n)}</span><span class="s" style="display:block">${net === 0 ? "sem pendências" : net > 0 ? "te deve" : "você deve"}</span></span><span class="v ${net > 0 ? "pos" : net < 0 ? "neg" : ""}">${net === 0 ? "—" : M(Math.abs(net))}</span></button>`; };
  return `<div class="h"><h2>Cartões de crédito</h2><button class="aside" data-a="novaConta">+ novo cartão</button></div>
   ${cards.length ? `<div class="wallet">${cards.map(card).join("")}</div>` : `<p class="empty">Nenhum.</p>`}
   <div class="h"><h2>Débito, boletos e outros</h2></div>${others.map(a => `<button class="ln" data-a="editConta" data-id="${a.id}" style="grid-template-columns:minmax(0,1fr) auto"><span class="t">${esc(a.n)}</span><span class="v">${M(c.porConta[a.id] || 0)}</span></button>`).join("")}
   <div class="h"><h2>Pessoas</h2><span class="aside"><button data-a="novaDivida">+ dívida</button> · <button data-a="novaPessoa">+ pessoa</button></span></div>
   ${S.pessoas.map(pr).join("") || `<p class="empty">Ninguém ainda.</p>`}`;
}
function cicloHtml(a) {
  const t = today(), c = cardCycle(a, t), next = dstr(+t.slice(8) <= c.fecha ? t.slice(0, 7) : addM(t.slice(0, 7), 1), c.fecha), n = daysBetween(t, next);
  return `<div class="preview">Fecha dia ${c.fecha}${c.estimado ? " (estimado)" : ""} · vence dia ${c.venc}<br>Melhor dia de compra: <b>${n === 0 ? "hoje" : fd(next) + " (em " + n + " dias)"}</b></div>`;
}
function contaSheet(id) {
  const a = conta(id), c = calc(cur), its = c.it.filter(x => x.conta === id && x.tipo === "saida"), tot = c.porConta[id] || 0, paid = !!S.pagos[cur]?.["card:" + id];
  openSheet(`<div class="kick">${a.tipo === "credito" ? "Fatura de " + label(cur) : label(cur)}</div><h3>${esc(a.pessoa ? pessoa(a.pessoa).n : a.n)}</h3><div class="big money num" style="font-size:52px;margin:14px 0">${brl(tot)}</div>
    ${a.tipo === "credito" && !a.pessoa ? cicloHtml(a) : ""}${a.limite ? `<p class="note">Limite ${brl0(a.limite)} · ${Math.round(tot / a.limite * 100)}% usado</p>` : ""}
    ${a.tipo === "credito" && tot ? `<div class="acts"><button class="${paid ? "secondary" : "primary"}" data-a="pay" data-k="card:${id}" data-keep="1">${paid ? "Fatura paga · reabrir" : "Marcar fatura como paga"}</button></div>` : ""}
    <div class="h"><h2>${its.length} lançamentos</h2></div>${its.map(x => `<button class="ln" data-a="edit" data-src="${x.src}" data-id="${x.id}"><span class="d">dia ${x.dia}</span><span class="t" style="min-width:0">${esc(x.d)}${x.src === "parc" ? ` <span class="mute">${x.idx}/${x.n}</span>` : ""}</span><span class="v">${M(x.v)}</span></button>`).join("") || `<p class="empty">Nada neste mês.</p>`}
    <div class="acts"><button class="secondary" data-a="editConta" data-id="${id}">Editar</button></div>`, true);
}

/* ---------- pessoas e dívidas ---------- */
function pessoaSheet(id) {
  const p = pessoa(id), pc = S.contas.find(c => c.pessoa === id), au = autoDebt(p), pago = !!S.pagos[cur]?.["card:" + pc?.id], dv = S.dividas.filter(d => d.pessoa === id);
  openSheet(`<h3>${esc(p.n)}</h3>
   ${pc ? `<div class="h"><h2>Cartão dela em ${label(cur)}</h2><span class="aside">${M(calc(cur).porConta[pc.id] || 0)}</span></div><button class="${pago ? "secondary" : "primary"}" data-a="pay" data-k="card:${pc.id}" data-keep="1">${pago ? "Pago · reabrir" : "Marcar como pago"}</button>` : ""}
   <div class="h"><h2>Dívidas</h2></div>
   ${dv.map(d => { const r = restante(d); return `<div class="ln" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="t">${esc(d.d)}</div><div class="s">${d.dir === "me_deve" ? "te deve" : "você deve"} · de ${brl(d.v)}${r <= 0 ? " · quitada" : ""}</div></div><span class="v ${d.dir === "me_deve" ? "pos" : "neg"}">${M(Math.max(r, 0))}</span>
     ${r > 0 ? `<div style="grid-column:1/-1;display:flex;gap:8px;align-items:center"><input class="in" id="pg${d.id}" placeholder="valor pago" inputmode="decimal" style="font-size:15px;max-width:140px"><button class="chip" data-a="pagarDivida" data-id="${d.id}" data-part="1">Registrar</button><button class="chip" data-a="pagarDivida" data-id="${d.id}">Quitar tudo</button></div>` : ""}
     <button class="danger" data-a="delDivida" data-id="${d.id}" style="grid-column:1/-1;text-align:left;font-size:13px">Apagar dívida</button></div>`; }).join("") || `<p class="empty">Nenhuma.</p>`}
   <div class="acts"><button class="primary" data-a="novaDivida" data-p="${id}">Nova dívida</button><button class="secondary" data-a="editPessoa" data-id="${id}">Editar</button></div>`);
}
function pessoaForm(id) {
  const p = id ? pessoa(id) : null, pc = id ? S.contas.find(c => c.pessoa === id) : null;
  form(p ? "Editar pessoa" : "Nova pessoa", { n: p?.n || "", cor: p?.cor || PAL[S.pessoas.length % PAL.length], cartao: !!pc }, f => `
    ${fld("Nome", `<input class="in" data-f="n" value="${esc(f.n)}" autofocus>`)}${fld("Cor", colorChips("cor", f.cor))}
    ${fld("Uso o cartão ou dinheiro dela?", seg("cartao", [{ v: "true", l: "Sim, ele vira uma fatura" }, { v: "false", l: "Não" }], f.cartao))}
    <div class="acts"><button class="primary" data-a="save">Salvar</button>${p ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>`);
  FS.save = () => {
    const f = FS; if (!f.n.trim()) return;
    const s0 = snap(); let pid = id;
    if (p) { Object.assign(p, { n: f.n.trim(), cor: f.cor }); } else { pid = uid(); S.pessoas.push({ id: pid, n: f.n.trim(), cor: f.cor }); }
    let acc = S.contas.find(c => c.pessoa === pid) || (!p ? S.contas.find(c => !c.pessoa && norm(c.n) === norm(f.n)) : null);
    if (f.cartao && !acc) S.contas.push({ id: uid(), n: f.n.trim(), cor: f.cor, tipo: "credito", venc: 10, pessoa: pid });
    else if (f.cartao && acc) Object.assign(acc, { pessoa: pid, n: f.n.trim() });
    else if (!f.cartao && acc) delete acc.pessoa;
    closeSheet(); commit(p ? "Pessoa atualizada" : "Pessoa criada", s0);
  };
  FS.del = () => { const s0 = snap(); S.pessoas = S.pessoas.filter(x => x.id !== id); S.dividas = S.dividas.filter(d => d.pessoa !== id); S.contas.forEach(c => { if (c.pessoa === id) delete c.pessoa; }); closeSheet(); commit("Pessoa excluída", s0); };
}
function dividaForm(pid) {
  if (!S.pessoas.length) return pessoaForm();
  form("Nova dívida", { pessoa: pid || S.pessoas[0].id, dir: "me_deve", d: "", v: "" }, f => `
    ${fld("Quem", chips("pessoa", S.pessoas.map(p => ({ v: p.id, l: p.n, c: p.cor })), f.pessoa))}${fld("Direção", seg("dir", [{ v: "me_deve", l: "Me deve" }, { v: "devo", l: "Eu devo" }], f.dir))}
    ${fld("Do que se trata", `<input class="in" data-f="d" value="${esc(f.d)}" placeholder="ex.: presente, almoço" autofocus>`)}${fld("Valor", `<input class="in" data-f="v" value="${esc(f.v)}" inputmode="decimal" placeholder="0,00">`)}
    <div class="acts"><button class="primary" data-a="save">Registrar</button></div>`);
  FS.save = () => { const f = FS, v = num(f.v); if (!v) return; const s0 = snap(); S.dividas.push({ id: uid(), pessoa: f.pessoa, dir: f.dir, d: f.d.trim() || "Dívida", v, data: today(), pagtos: [] }); closeSheet(); commit("Dívida registrada", s0); };
}

/* ---------- Compromissos ---------- */
function pgPlano() {
  const tabs = `<div class="tools"><div class="seg">${[["parc", "Parcelas"], ["rec", "Recorrentes"], ["ev", "Eventos"]].map(([k, t]) => `<button data-a="plano" data-v="${k}" aria-pressed="${plano === k}">${t}</button>`).join("")}</div></div>`;
  if (plano === "parc") {
    const ps = S.parcelas.map(p => { const i = diffM(startM(p), cur) + 1, end = addM(startM(p), p.n - 1), last = p.fim && diffM(p.fim, end) > 0 ? p.fim : end; return { p, i, end: last, done: diffM(cur, last) < 0, fut: i < 1, left: Math.max(0, diffM(cur, last)) }; }).sort((a, b) => a.done - b.done || a.end.localeCompare(b.end));
    const ring = (i, n) => { const f = Math.max(0, Math.min(1, i / n)), r = 17, C = 2 * Math.PI * r; return `<svg class="ring" viewBox="0 0 42 42"><circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--ink)" stroke-width="4" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 21 21)" stroke-linecap="round"/><text x="21" y="25" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${Math.max(0, Math.min(p_n(i, n), n))}</text></svg>`; };
    const p_n = (i) => i;
    const act = ps.filter(x => !x.done);
    const line = x => `<button class="ln parc" data-a="edit" data-src="parc" data-id="${x.p.id}" style="${x.done ? "opacity:.55" : ""}">${ring(Math.min(x.i, x.p.n), x.p.n)}<span style="min-width:0"><span class="t" style="display:block">${esc(x.p.d)}${x.done ? '<span class="tag">quitada</span>' : x.fut ? '<span class="tag">começa em ' + short(x.p.data.slice(0, 7)) + "</span>" : ""}</span><span class="s" style="display:block">${esc(conta(x.p.conta).n)} · ${x.done ? "terminou" : "termina"} em ${short(x.end)}${!x.done && x.left ? ` · faltam ${x.left}` : ""}</span></span><span class="v">${M(x.p.v)}<span class="s" style="display:block;font:400 12px var(--sans)">${x.p.n}x</span></span></button>`;
    return tabs + `<p class="lede">${act.length} parcelas ativas somam <b class="money">${brl(act.filter(x => !x.fut).reduce((t, x) => t + x.p.v, 0))}</b> em ${label(cur)}.</p><div class="h"><h2>Em andamento</h2></div>${act.map(line).join("") || `<p class="empty">Nenhuma.</p>`}${ps.some(x => x.done) ? `<div class="h"><h2>Encerradas</h2></div>${ps.filter(x => x.done).map(line).join("")}` : ""}`;
  }
  if (plano === "rec") {
    const rs = S.recorrentes.map(r => ({ r, on: diffM(r.inicio, cur) >= 0 && (!r.fim || diffM(cur, r.fim) >= 0), end: r.fim && diffM(cur, r.fim) < 0 })).sort((a, b) => b.on - a.on || a.r.tipo.localeCompare(b.r.tipo) || b.r.v - a.r.v);
    return tabs + `` + ["entrada", "invest", "saida"].map(t => { const l = rs.filter(x => x.r.tipo === t); return l.length ? `<div class="h"><h2>${{ entrada: "Entradas", invest: "Investimentos", saida: "Saídas fixas" }[t]}</h2><span class="aside">${M(l.filter(x => x.on).reduce((s, x) => s + x.r.v, 0))}</span></div>${l.map(x => `<button class="ln" data-a="edit" data-src="rec" data-id="${x.r.id}" style="${x.on ? "" : "opacity:.5"}"><span class="d">dia ${x.r.dia || 1}</span><span style="min-width:0"><span class="t" style="display:block">${esc(x.r.d)}${!x.on ? `<span class="tag">${x.end ? "encerrado" : "começa " + short(x.r.inicio)}</span>` : ""}</span><span class="s" style="display:block">${esc(cat(x.r.cat).n)} · ${esc(conta(x.r.conta).n)} · desde ${short(x.r.inicio)}</span></span><span class="v">${M(x.r.v)}</span></button>`).join("")}` : ""; }).join("");
  }
  const evs = (S.eventos || []).map(e => ({ e, s: evStats(e.id) }));
  return tabs + `<div class="h"><h2>Eventos</h2><button class="aside" data-a="novoEvento">+ novo evento</button></div>
   ${evs.map(({ e, s }) => `<button class="ln" data-a="evento" data-id="${e.id}" style="grid-template-columns:minmax(0,1fr) auto"><span><span class="t" style="display:block">${esc(e.n)}</span><span class="s" style="display:block">${s.n} lançamentos${e.orc ? ` · orçamento ${brl0(e.orc)}` : ""}</span></span><span class="v">${M(s.gasto)}</span>${e.orc ? `<div class="bars" style="grid-column:1/-1"><div class="track" style="height:6px;background:var(--paper2);border-radius:3px;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, s.gasto / e.orc * 100)}%;background:${s.gasto > e.orc ? "var(--neg)" : "var(--pos)"}"></i></div></div>` : ""}</button>`).join("") || `<p class="empty">Nenhum.</p>`}`;
}
function evStats(id) {
  let gasto = 0, ent = 0, n = 0; const meses = {};
  const add = (tipo, v, k) => { n++; if (tipo === "entrada") ent += v; else { gasto += v; meses[k] = (meses[k] || 0) + v; } };
  S.avulsos.filter(a => a.ev === id).forEach(a => add(a.tipo, a.v, a.fat || a.data.slice(0, 7)));
  S.parcelas.filter(p => p.ev === id).forEach(p => { for (let i = 0; i < p.n; i++) { const k = addM(startM(p), i); if (!p.fim || diffM(k, p.fim) >= 0) add("saida", p.v, k); } n -= 0; });
  S.recorrentes.filter(r => r.ev === id).forEach(r => { const end = r.fim || NOW; for (let k = r.inicio; diffM(k, end) >= 0; k = addM(k, 1)) add(r.tipo, r.v, k); });
  return { gasto, ent, n, meses };
}
function eventoSheet(id) {
  const e = evento(id), s = evStats(id), its = [...S.avulsos.filter(a => a.ev === id).map(a => ({ ...a, src: "avulso" })), ...S.parcelas.filter(p => p.ev === id).map(p => ({ ...p, src: "parc", tipo: "saida" })), ...S.recorrentes.filter(r => r.ev === id).map(r => ({ ...r, src: "rec" }))];
  openSheet(`<div class="kick">Evento</div><h3>${esc(e.n)}</h3><div class="big money num" style="font-size:52px;margin:14px 0">${brl(s.gasto - s.ent)}</div><p class="note">custo líquido · gasto ${brl(s.gasto)}${s.ent ? ` − entradas ${brl(s.ent)}` : ""}${e.orc ? ` · orçamento ${brl0(e.orc)} (${s.gasto > e.orc ? "estourou " + brl0(s.gasto - e.orc) : "sobram " + brl0(e.orc - s.gasto)})` : ""}</p>
   <div class="h"><h2>Mês a mês</h2></div>${Object.entries(s.meses).sort().map(([k, v]) => `<div class="ln" style="grid-template-columns:1fr auto"><span>${label(k)}</span><span class="v">${M(v)}</span></div>`).join("") || `<p class="empty">Sem gastos.</p>`}
   <div class="h"><h2>Lançamentos</h2></div>${its.map(x => `<button class="ln" data-a="edit" data-src="${x.src}" data-id="${x.id}" style="grid-template-columns:minmax(0,1fr) auto"><span class="t">${esc(x.d)}${x.src === "parc" ? ` <span class="mute">${x.n}x</span>` : ""}${x.src === "rec" ? ' <span class="mute">todo mês</span>' : ""}</span><span class="v">${M(x.v)}</span></button>`).join("")}
   <div class="acts"><button class="secondary" data-a="editEvento" data-id="${id}">Editar evento</button></div>`);
}
function eventoForm(id) {
  const e = id ? evento(id) : null;
  form(e ? "Editar evento" : "Novo evento", { n: e?.n || "", orc: e?.orc ? fnum(e.orc) : "", cor: e?.cor || PAL[3] }, f => `${fld("Nome", `<input class="in" data-f="n" value="${esc(f.n)}" placeholder="ex.: Mudança, Viagem" autofocus>`)}${fld("Orçamento (opcional)", `<input class="in" data-f="orc" value="${esc(f.orc)}" inputmode="decimal" placeholder="0,00">`)}
    <div class="acts"><button class="primary" data-a="save">Salvar</button>${e ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>`);
  FS.save = () => { if (!FS.n.trim()) return; const s0 = snap(); (S.eventos ??= []); const o = { n: FS.n.trim(), orc: num(FS.orc) || undefined, cor: FS.cor }; if (e) Object.assign(e, o); else S.eventos.push({ id: uid(), ...o }); closeSheet(); commit("Evento salvo", s0); };
  FS.del = () => { const s0 = snap(); S.eventos = S.eventos.filter(x => x.id !== id); [...S.avulsos, ...S.parcelas, ...S.recorrentes].forEach(x => { if (x.ev === id) delete x.ev; }); closeSheet(); commit("Evento excluído", s0); };
}

/* ---------- Futuro ---------- */
function pgFuturo() {
  const ks = Array.from({ length: 12 }, (_, i) => addM(cur, i)), cs = ks.map(calc);
  const acc = S.contas.filter(a => a.tipo !== "debito"), tot = cs.map(c => acc.reduce((t, a) => t + (c.porConta[a.id] || 0), 0)), mx = Math.max(...tot, 1);
  if (!futSel || !ks.includes(futSel)) futSel = cur;
  const sel = futSel, si = ks.indexOf(sel);
  const fk = v => PRIV ? "•••" : v >= 1000 ? (v / 1000).toFixed(1).replace(".", ",") + "k" : String(Math.round(v));
  const cols = ks.map((k, i) => `<button class="fc" data-a="futSel" data-k="${k}" aria-pressed="${k === sel}" aria-label="${label(k)}" style="--h:${tot[i] / mx}"><span class="fc-t money">${fk(tot[i])}</span><span class="fc-b">${acc.map((a, j) => { const v = cs[i].porConta[a.id] || 0; return v ? `<i title="${esc(a.n)}" style="--c:${a.cor};flex:${v} 1 0;animation-delay:${i * 18 + j * 25}ms"></i>` : ""; }).join("")}</span></button>`).join("");
  const dueRows = k => { const c = calc(k), r = []; S.contas.filter(a => a.tipo === "credito").forEach(a => { const v = c.porConta[a.id]; if (v) r.push({ dia: a.venc || 1, n: a.pessoa ? pessoa(a.pessoa).n : "Fatura " + a.n, sub: a.pessoa ? "pessoa" : "cartão", v }); }); c.it.filter(x => x.tipo === "saida" && conta(x.conta).tipo === "boleto").forEach(x => r.push({ dia: x.dia, n: x.d, sub: "boleto", v: x.v })); return r.sort((p, q) => p.dia - q.dia); };
  const det = dueRows(sel);
  const chart = `<div class="fch"><div class="fch-y"><span style="bottom:0">0</span><span style="bottom:calc(var(--H)*.5)" class="money">${fk(mx / 2)}</span><span style="bottom:var(--H)" class="money">${fk(mx)}</span></div>
    <div class="fch-p"><i class="gl" style="bottom:calc(var(--H)*.5)"></i><i class="gl" style="bottom:var(--H)"></i><i class="gl z" style="bottom:0"></i>${cols}</div>
    <div class="fch-x">${ks.map(k => `<span class="${k === sel ? "on" : ""}">${short(k).slice(0, 3)}</span>`).join("")}</div></div>`;
  const detail = `<div class="h"><h2>${label(sel)}</h2><span class="aside">${M(tot[si])}</span></div>${det.map(x => `<div class="ln"><span class="d">dia ${x.dia}</span><span style="min-width:0"><span class="t" style="display:block">${esc(x.n)}</span><span class="s" style="display:block">${x.sub}</span></span><span class="v">${M(x.v)}</span></div>`).join("") || `<p class="empty">Nada a pagar.</p>`}`;
  const gp = S.parcelas.map(p => { const st = startM(p), en = p.fim && diffM(p.fim, addM(st, p.n - 1)) > 0 ? p.fim : addM(st, p.n - 1); return { p, st, en }; }).filter(x => diffM(cur, x.en) >= 0 && diffM(x.st, addM(cur, 11)) >= 0).sort((a, b) => a.en.localeCompare(b.en));
  const gantt = `<div class="gantt"><span></span>${ks.map(k => `<span class="gh">${short(k).slice(0, 3)}</span>`).join("")}${gp.map(x => `<span class="gn">${esc(x.p.d)}</span>${ks.map(k => { const on = diffM(x.st, k) >= 0 && diffM(k, x.en) >= 0; return `<span class="gc ${on ? "on" : ""} ${on && k === x.st ? "first" : ""} ${on && k === x.en ? "last" : ""}" style="--c:${conta(x.p.conta).cor}"></span>`; }).join("")}`).join("")}</div>`;
  return `
   <div class="h"><h2>Quando vou pagar</h2></div>${chart}
   <div class="legend" style="margin-top:16px">${acc.map(a => `<span style="--c:${a.cor}">${esc(a.n)}</span>`).join("")}</div>
   ${detail}
   <div class="h"><h2>Parcelas no tempo</h2></div>${gp.length ? gantt : `<p class="empty">Nenhuma.</p>`}
   <div class="h"><h2>Metas</h2><button class="aside" data-a="novaMeta">+ nova meta</button></div>
   ${(S.metas || []).map(m => `<button class="ln" data-a="meta" data-id="${m.id}" style="grid-template-columns:minmax(0,1fr) auto"><span><span class="t" style="display:block">${esc(m.d)}</span><span class="s" style="display:block">${Math.round(m.atual / m.alvo * 100)}% de ${brl0(m.alvo)}</span></span><span class="v">${M(m.atual)}</span><div class="bars" style="grid-column:1/-1"><div class="track"><i style="width:${Math.min(100, m.atual / m.alvo * 100)}%;background:var(--pos)"></i></div></div></button>`).join("") || `<p class="empty">Nenhuma.</p>`}`;
}
function metaForm(id) {
  const m = id ? S.metas.find(x => x.id === id) : null;
  form(m ? "Editar meta" : "Nova meta", { d: m?.d || "", alvo: m ? fnum(m.alvo) : "", atual: m ? fnum(m.atual) : "" }, f => `${fld("Nome", `<input class="in" data-f="d" value="${esc(f.d)}" autofocus>`)}<div class="row2">${fld("Quanto quero juntar", `<input class="in" data-f="alvo" value="${esc(f.alvo)}" inputmode="decimal">`)}${fld("Quanto já tenho", `<input class="in" data-f="atual" value="${esc(f.atual)}" inputmode="decimal">`)}</div>
    <div class="acts"><button class="primary" data-a="save">Salvar</button>${m ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>`);
  FS.save = () => { if (!FS.d.trim() || !num(FS.alvo)) return; const s0 = snap(); (S.metas ??= []); const o = { d: FS.d.trim(), alvo: num(FS.alvo), atual: num(FS.atual) }; if (m) Object.assign(m, o); else S.metas.push({ id: uid(), ...o }); closeSheet(); commit("Meta salva", s0); };
  FS.del = () => { const s0 = snap(); S.metas = S.metas.filter(x => x.id !== id); closeSheet(); commit("Meta excluída", s0); };
}

/* ---------- Ajustes ---------- */
function pgAjustes() {
  const th = S.prefs?.theme || "auto";
  return `<div class="h"><h2>Aparência</h2></div>${seg("tema", [{ v: "auto", l: "Noite musgo" }, { v: "light", l: "Papel" }], th).replace(/data-a="set" data-f="tema"/g, 'data-a="tema"')}
   <div class="h"><h2>Categorias</h2><button class="aside" data-a="novaCat">+ nova</button></div>${S.cats.map(c => `<button class="ln" data-a="editCat" data-id="${c.id}" style="grid-template-columns:14px minmax(0,1fr) auto"><i style="width:10px;height:10px;border-radius:3px;background:${c.cor}"></i><span class="t">${esc(c.n)}</span><span class="s">${{ saida: "saída", entrada: "entrada", invest: "investimento" }[c.tipo]}</span></button>`).join("")}
   <div class="h"><h2>Formas de pagamento</h2><button class="aside" data-a="novaConta">+ nova</button></div>${S.contas.filter(a => !a.pessoa).map(a => `<button class="ln" data-a="editConta" data-id="${a.id}" style="grid-template-columns:14px minmax(0,1fr) auto"><i style="width:10px;height:10px;border-radius:3px;background:${a.cor}"></i><span class="t">${esc(a.n)}</span><span class="s">${{ debito: "débito / pix", boleto: "boleto", credito: "crédito" + (a.venc ? ", vence dia " + a.venc : "") }[a.tipo]}</span></button>`).join("")}
   <div class="h"><h2>Ao abrir o Fluo</h2></div>${(() => { const em = Store.user?.email || "", m = Store.remembered ? "direto" : Store.bioEnabled(em) ? "bio" : "senha"; return `<div class="seg">${[["direto", "Entrar direto"], ...(bioOk ? [["bio", "Biometria"]] : []), ["senha", "Pedir a senha"]].map(([v, l]) => `<button data-a="openMode" data-v="${v}" aria-pressed="${m === v}">${l}</button>`).join("")}</div>`; })()}
   <div class="h"><h2>Avisos</h2></div><div class="acts" style="margin-top:12px"><button class="secondary" data-a="avisosOn">Ativar notificações do aparelho</button></div>
   <div class="h"><h2>Conta</h2></div><p class="lede">${esc(Store.user?.email || "")}</p>
   <div class="acts"><button class="secondary" data-a="chPw">Trocar senha</button><button class="secondary" data-a="backup">Baixar backup</button><button class="secondary" data-a="importar">Restaurar backup</button><button class="secondary" data-a="sobre">Sobre e contato</button><button class="secondary" data-a="sair">Sair</button><button class="danger" data-a="apagar">Apagar tudo</button></div>`;
}
function catForm(id) {
  const c = id ? cat(id) : null;
  form(c ? "Editar categoria" : "Nova categoria", { n: c?.n || "", cor: c?.cor || PAL[0], tipo: c?.tipo || "saida" }, f => `${fld("Nome", `<input class="in" data-f="n" value="${esc(f.n)}" autofocus>`)}${fld("Tipo", seg("tipo", [{ v: "saida", l: "Saída" }, { v: "entrada", l: "Entrada" }, { v: "invest", l: "Investimento" }], f.tipo))}${fld("Cor", colorChips("cor", f.cor))}
    <div class="acts"><button class="primary" data-a="save">Salvar</button>${c ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>`);
  FS.save = () => { if (!FS.n.trim()) return; const s0 = snap(), o = { n: FS.n.trim(), cor: FS.cor, tipo: FS.tipo }; if (c) Object.assign(c, o); else S.cats.push({ id: uid(), e: "outros", ...o }); closeSheet(); commit("Categoria salva", s0); };
  FS.del = () => { const s0 = snap(); S.cats = S.cats.filter(x => x.id !== id); closeSheet(); commit("Categoria excluída", s0); };
}
function contaForm(id) {
  const a = id ? conta(id) : null;
  form(a ? "Editar forma de pagamento" : "Nova forma de pagamento", { n: a?.n || "", tipo: a?.tipo || "credito", venc: a?.venc || "", fecha: a?.fecha || "", limite: a?.limite ? fnum(a.limite) : "", cor: a?.cor || PAL[2] }, f => `${fld("Nome", `<input class="in" data-f="n" value="${esc(f.n)}" placeholder="ex.: Nubank" autofocus>`)}${fld("Tipo", seg("tipo", [{ v: "credito", l: "Cartão de crédito" }, { v: "debito", l: "Débito / Pix" }, { v: "boleto", l: "Boleto" }], f.tipo))}
    ${f.tipo === "credito" ? `<div class="row2">${fld("Fecha dia", `<input class="in" data-f="fecha" value="${esc(f.fecha)}" inputmode="numeric" placeholder="${+f.venc && !+f.fecha ? fechaDeVenc(+f.venc) + " (calculado)" : "ex.: 3"}">`)}${fld("Vence dia", `<input class="in" data-f="venc" value="${esc(f.venc)}" inputmode="numeric" placeholder="${+f.fecha && !+f.venc ? vencDeFecha(+f.fecha) + " (calculado)" : "ex.: 10"}">`)}</div>${fld("Limite", `<input class="in" data-f="limite" value="${esc(f.limite)}" inputmode="decimal">`)}` : ""}${fld("Cor", colorChips("cor", f.cor))}
    <div class="acts"><button class="primary" data-a="save">Salvar</button>${a ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>`);
  FS.save = () => { if (!FS.n.trim()) return; const s0 = snap(), o = { n: FS.n.trim(), tipo: FS.tipo, cor: FS.cor, venc: FS.tipo === "credito" ? (+FS.venc || undefined) : undefined, fecha: FS.tipo === "credito" ? (+FS.fecha || undefined) : undefined, limite: FS.tipo === "credito" ? (num(FS.limite) || undefined) : undefined }; if (a) Object.assign(a, o); else S.contas.push({ id: uid(), ...o }); closeSheet(); commit("Salvo", s0); };
  FS.del = () => { const s0 = snap(); S.contas = S.contas.filter(x => x.id !== id); closeSheet(); commit("Forma de pagamento excluída", s0); };
}

/* ---------- Lançar / editar ---------- */
const KW = { alimentacao: "mercado supermercado restaurante ifood jantar almoco padaria lanche pizza cafe feira", transporte: "uber 99 gasolina combustivel estacionamento pedagio oficina mecanico onibus", assinaturas: "netflix spotify prime disney assinatura youtube duo", saude: "farmacia medico consulta dentista exame remedio", lazer: "cinema bar show viagem jogo festa", moradia: "aluguel condominio mudanca", contas: "luz agua internet telefone celular", salario: "salario", extra: "recebi ganhei pix" };
function guessCat(d, tipo) {
  const nd = norm(d), valid = c => c.tipo === tipo;
  if (nd) {
    const hist = [...S.avulsos, ...S.recorrentes, ...S.parcelas].reverse().find(x => nd.length > 2 && (nd.includes(norm(x.d)) || norm(x.d).includes(nd)) && S.cats.some(c => c.id === x.cat && valid(c))); if (hist) return hist.cat;
    const words = nd.split(/\s+/);
    for (const c of S.cats.filter(valid)) { if (words.some(w => w.length > 2 && norm(c.n).includes(w))) return c.id; const kw = (KW[c.id] || "").split(" "); if (words.some(w => kw.includes(w))) return c.id; }
  }
  return (S.cats.find(c => valid(c) && c.id === "outros") || S.cats.find(valid) || S.cats[0]).id;
}
function parseSmart(text, F) {
  let t = " " + norm(text) + " ", orig = String(text);
  if (/\b(recebi|ganhei|salario|entrada)\b/.test(t)) F.tipo = "entrada"; else if (/\b(invest|investi|aplicar|aplicacao|guardei)\b/.test(t)) F.tipo = "invest"; else F.tipo = "saida";
  const mx = t.match(/(\d+)\s*x\b/); if (mx) { F.rep = "parc"; F.n = Math.max(2, +mx[1]); t = t.replace(mx[0], " "); }
  else if (/\b(todo mes|mensal|recorrente|mensalidade)\b/.test(t)) F.rep = "mes"; else F.rep = "uma";
  const hasTot = /\b(total|no total|ao todo)\b/.test(t); F.tot = hasTot && F.rep === "parc";
  const dm = t.match(/\bdia\s+(\d{1,2})\b/); if (dm) { const k = F.rep === "uma" ? cur : cur; F.data = k + "-" + pad(Math.min(31, +dm[1])); t = t.replace(dm[0], " "); }
  if (/\bontem\b/.test(t)) F.data = addDays(today(), -1); if (/\bhoje\b/.test(t)) F.data = today();
  const am = t.match(/(\d+(?:[.,]\d{1,2})?)/); if (am) { F.v = am[1].replace(".", ","); t = t.replace(am[0], " "); } else F.v = "";
  const c = S.contas.find(a => norm(a.n).split(" ").every(w => t.includes(" " + w))) || (/\b(pix|debito)\b/.test(t) ? S.contas.find(a => a.tipo === "debito") : /\bboleto\b/.test(t) ? S.contas.find(a => a.tipo === "boleto") : null);
  if (c) F.conta = c.id;
  const stop = new Set("hoje ontem dia todo mes mensal recorrente parcelado total no na em de do da reais real r$ pix debito boleto credito cartao ao vezes recebi ganhei entrada".split(" ").concat(c ? norm(c.n).split(" ") : []));
  const words = orig.replace(/\d+\s*x\b/i, " ").replace(/\d+(?:[.,]\d{1,2})?/g, " ").split(/\s+/).filter(w => w && !stop.has(norm(w)));
  F.d = words.join(" "); F.d = F.d.charAt(0).toUpperCase() + F.d.slice(1); F.cat = "";
}
function lancar(it, src) {
  const edit = !!it, last = S.avulsos[S.avulsos.length - 1];
  const F = edit ? { src, tipo: it.tipo || "saida", d: it.d, v: fnum(it.v), data: it.data || cur + "-" + pad(it.dia || 1), dia: it.dia || 1, rep: src === "rec" ? "mes" : src === "parc" ? "parc" : "uma", n: it.n || 2, tot: false, cat: it.cat, conta: it.conta, ev: it.ev || "", scope: "all" }
    : { tipo: "saida", d: "", v: "", data: cur === NOW ? today() : cur + "-01", rep: "uma", n: 2, tot: false, cat: "", conta: last?.conta || S.contas[0].id, ev: "", cal: false, calM: cur };
  const body = f => {
    const catId = f.cat || guessCat(f.d, f.tipo), cats = S.cats.filter(c => c.tipo === f.tipo), isRec = f.src === "rec", isParc = f.src === "parc", locked = edit;
    const dates = [{ v: today(), l: "Hoje" }, { v: addDays(today(), -1), l: "Ontem" }], dsel = dates.some(d => d.v === f.data);
    const v = num(f.v), n = Math.max(2, +f.n || 2), pv = f.rep === "parc" && f.tot ? v / n : v;
    return `${!edit && FS.smartMsg ? `<div class="preview">${FS.smartMsg}</div>` : ""}
     ${edit ? "" : fld("Tipo", seg("tipo", [{ v: "saida", l: "Saída" }, { v: "entrada", l: "Entrada" }, { v: "invest", l: "Investimento" }], f.tipo))}
     <div class="fld"><span class="lb">Valor${f.rep === "parc" && !locked ? (f.tot ? " total" : " da parcela") : ""}</span><input class="in amt" data-f="v" value="${esc(f.v)}" inputmode="decimal" placeholder="0,00" ${edit ? "autofocus" : ""}></div>
     ${fld("Descrição", `<input class="in" data-f="d" value="${esc(f.d)}" placeholder="ex.: Mercado, Salário, Tablet">`)}
     ${isRec ? fld("Dia do mês", `<input class="in" data-f="dia" value="${f.dia}" inputmode="numeric" style="max-width:100px">`) : isParc ? "" : fld("Quando", `<div class="chips">${dates.map(d => `<button type="button" class="chip" data-a="set" data-f="data" data-val="${d.v}" aria-pressed="${f.data === d.v}">${d.l}</button>`).join("")}<button type="button" class="chip" data-a="set" data-f="cal" data-val="${!f.cal}" aria-pressed="${!dsel || f.cal}">${dsel ? "Outro dia…" : fdate(f.data)}</button></div>${f.cal ? calendar(f) : ""}`)}
     ${locked ? "" : fld("Repete?", seg("rep", [{ v: "uma", l: "Só esta vez" }, { v: "mes", l: "Todo mês" }, ...(f.tipo === "saida" ? [{ v: "parc", l: "Parcelado" }] : [])], f.rep))}
     ${f.rep === "parc" && !locked ? `<div class="row2">${fld("Parcelas", `<input class="in" data-f="n" value="${f.n}" inputmode="numeric">`)}${fld("O valor é", seg("tot", [{ v: "false", l: "da parcela" }, { v: "true", l: "total" }], f.tot))}</div><p class="note">${v ? `${n}x de <b>${brl(pv)}</b> · a última cai em ${short(addM(startFor(f), n - 1))}` : "Informe o valor."}</p>` : ""}
     ${isParc ? `<p class="note">Parcela ${Math.min(it.n, Math.max(1, diffM(startM(it), cur) + 1))} de ${it.n}${it.fim ? " · quitada" : ""}</p><div class="fld"><span class="lb">Total de parcelas</span><input class="in" data-f="n" value="${f.n}" inputmode="numeric" style="max-width:100px"></div>` : ""}
     ${fld("Categoria", chips("cat", cats.map(c => ({ v: c.id, l: c.n, c: c.cor })), catId))}
     ${fld(f.tipo === "entrada" ? "Entrou em" : "Pago com", chips("conta", S.contas.map(a => ({ v: a.id, l: a.n, c: a.cor })), f.conta))}${isRec && edit ? "" : cardNote(f)}
     ${(S.eventos || []).length ? fld("Evento (opcional)", chips("ev", [{ v: "", l: "Nenhum" }, ...S.eventos.map(e => ({ v: e.id, l: e.n }))], f.ev)) : ""}
     ${edit && isRec && diffM(it.inicio, cur) > 0 ? fld("Esta mudança vale", seg("scope", [{ v: "all", l: "Todos os meses" }, { v: "from", l: "A partir de " + label(cur) }], f.scope)) : ""}
     <div class="acts"><button class="primary" data-a="save">${edit ? "Salvar" : "Lançar"}</button><button class="secondary" data-a="x">Cancelar</button>${edit ? `<button class="danger" data-a="del">Excluir</button>` : ""}</div>
     ${edit && isRec ? `<p class="note"><button class="danger" data-a="stop" style="padding:0">Parar depois de ${label(cur)}</button></p>` : ""}
     ${edit && isParc && !it.fim ? `<p class="note"><button class="danger" data-a="stop" style="padding:0">Quitar adiantado (último mês pago: ${label(cur)})</button></p>` : ""}`;
  };
  form(edit ? "Editar lançamento" : "Novo lançamento", F, body, { pre: edit ? "" : `<input class="smart" id="smart" data-f="smart" placeholder="Escreva: mercado 85 nubank ontem · tablet 12x 80" autofocus autocomplete="off">` });
  FS.onSet = f => { if (f === "tipo") FS.cat = ""; if (f === "cal") { FS.cal = FS.cal === true || FS.cal === "true"; } if (f === "data") FS.cal = false; };
  FS.smart = txt => { const keep = { cal: FS.cal, calM: FS.calM }; parseSmart(txt, FS); Object.assign(FS, keep); const c = FS.cat || guessCat(FS.d, FS.tipo); FS.smartMsg = txt.trim() ? `Entendi: <b>${{ saida: "saída", entrada: "entrada", invest: "investimento" }[FS.tipo]}</b>${FS.v ? " · " + brl(num(FS.v)) : ""}${FS.rep === "parc" ? ` · ${FS.n}x` : FS.rep === "mes" ? " · todo mês" : ""} · ${esc(FS.d || "sem nome")} · ${esc(cat(c).n)} · ${esc(conta(FS.conta).n)} · ${fdate(FS.data)}` : ""; FS.draw(); };
  FS.save = () => {
    const f = FS, v = num(f.v); if (!v) { toast("Informe o valor"); return; }
    const s0 = snap(), cid = f.cat || guessCat(f.d, f.tipo), d = f.d.trim() || cat(cid).n, n = Math.max(2, +f.n || 2), ev = f.ev || undefined;
    const cr = creditCycle(f.conta, f.tipo, f.data), chg = edit && (f.data !== it.data || f.conta !== it.conta);
    if (!edit) {
      if (f.rep === "uma") S.avulsos.push({ id: uid(), tipo: f.tipo, d, v, cat: cid, conta: f.conta, data: f.data, ev, fat: cr?.fatM });
      else if (f.rep === "mes") S.recorrentes.push({ id: uid(), tipo: f.tipo, d, v, cat: cid, conta: f.conta, dia: +f.data.slice(8), inicio: cr ? cr.fatM : f.data.slice(0, 7), ev });
      else S.parcelas.push({ id: uid(), d, v: Math.round((f.tot ? v / n : v) * 100) / 100, n, cat: cid, conta: f.conta, data: f.data, ev, fat: cr?.fatM });
      closeSheet(); commit("Lançado ✓" + (cr ? ` · fatura de ${short(cr.fatM)}, vence ${fd(cr.dueDate)}` : ""), s0); return;
    }
    const o = { d, v, cat: cid, conta: f.conta, ev };
    if (src === "avulso") { Object.assign(it, o, { data: f.data, tipo: f.tipo }); if (chg) it.fat = cr?.fatM; }
    else if (src === "parc") { Object.assign(it, o, { n }); if (chg) it.fat = cr?.fatM; }
    else { const dia = Math.min(31, Math.max(1, +f.dia || 1)); if (f.scope === "from" && diffM(it.inicio, cur) > 0) { const nr = { ...it, ...o, id: uid(), inicio: cur, dia }; delete nr.fim; const oldFim = it.fim; it.fim = addM(cur, -1); if (oldFim) nr.fim = oldFim; S.recorrentes.push(nr); } else Object.assign(it, o, { dia }); }
    closeSheet(); commit("Salvo", s0);
  };
  FS.del = () => { const s0 = snap(), arr = { rec: "recorrentes", parc: "parcelas", avulso: "avulsos" }[src]; S[arr] = S[arr].filter(x => x.id !== it.id); closeSheet(); commit("Excluído", s0); };
  FS.stop = () => { const s0 = snap(); it.fim = cur; closeSheet(); commit(src === "parc" ? "Parcela quitada" : "Não repete mais depois deste mês", s0); };
}
function calendar(f) {
  const [y, m] = f.calM.split("-").map(Number), first = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate(), t = today();
  return `<div class="cal"><div class="cal-h"><button type="button" data-a="calm" data-n="-1" aria-label="Mês anterior">←</button><span>${MES[m - 1]} ${y}</span><button type="button" data-a="calm" data-n="1" aria-label="Próximo mês">→</button></div>
   <div class="cal-g ${f.calDir ? "sw" + f.calDir : ""}">${"DSTQQSS".split("").map(x => `<b>${x}</b>`).join("")}${Array(first).fill("<span></span>").join("")}${Array.from({ length: days }, (_, i) => { const ds = f.calM + "-" + pad(i + 1), dw = (first + i) % 7; return `<button type="button" class="${ds === t ? "today" : ""} ${dw === 0 || dw === 6 ? "we" : ""}" data-a="set" data-f="data" data-val="${ds}" aria-pressed="${f.data === ds}">${i + 1}</button>`; }).join("")}</div>
   <div class="cal-f"><button type="button" data-a="calToday">Ir para hoje</button></div></div>`;
}

/* ---------- ações (um ouvinte só) ---------- */
const A = {
  go: d => { cur = d.k; render(false); },
  nav: d => { page = d.p; render(true); },
  pay: (d, b) => { (S.pagos[cur] ??= {}); const k = d.k; S.pagos[cur][k] = !S.pagos[cur][k]; const keep = d.keep; Store.save(S); const open = !$("#sheet").hidden; render(false); if (open && keep) { const id = k.slice(5); if ($("#sheet h3")) { const pc = S.contas.find(c => c.id === id); pc?.pessoa ? pessoaSheet(pc.pessoa) : contaSheet(id); } } toast(S.pagos[cur][k] ? "Pago ✓" : "Reaberto"); },
  edit: d => { const it = { rec: S.recorrentes, parc: S.parcelas, avulso: S.avulsos }[d.src].find(x => x.id === d.id); if (it) lancar(it, d.src); },
  filtro: d => { filtro = d.v; render(false); }, agrupar: d => { agrupar = d.v; render(false); }, plano: d => { plano = d.v; render(false); },
  conta: d => contaSheet(d.id), pessoa: d => pessoaSheet(d.id), evento: d => eventoSheet(d.id),
  novaConta: () => contaForm(), editConta: d => contaForm(d.id), novaPessoa: () => pessoaForm(), editPessoa: d => pessoaForm(d.id), novaDivida: d => dividaForm(d.p),
  novoEvento: () => eventoForm(), editEvento: d => eventoForm(d.id), novaMeta: () => metaForm(), meta: d => metaForm(d.id), novaCat: () => catForm(), editCat: d => catForm(d.id),
  pagarDivida: d => { const dv = S.dividas.find(x => x.id === d.id), s0 = snap(); const v = d.part ? num($("#pg" + d.id)?.value) : restante(dv); if (!v) return; (dv.pagtos ??= []).push({ v: Math.min(v, restante(dv)), data: today() }); Store.save(S); render(false); pessoaSheet(dv.pessoa); toast("Pagamento registrado", s0); },
  delDivida: d => { const dv = S.dividas.find(x => x.id === d.id), s0 = snap(); S.dividas = S.dividas.filter(x => x !== dv); Store.save(S); render(false); pessoaSheet(dv.pessoa); toast("Dívida apagada", s0); },
  tema: d => { S.prefs.theme = d.val; applyTheme(); commit(); },
  cpToggle: d => { if (FS.cp?.f === d.f) FS.cp = null; else { const [h, s, v] = hexToHsv(FS[d.f]); FS.cp = { f: d.f, h, s, v }; } FS.draw(); },
  set: d => { const v = d.val === "true" ? true : d.val === "false" ? false : d.val; FS[d.f] = v; if (FS.cp && FS.cp.f === d.f && /^#/.test(v)) { const [h, s, vv] = hexToHsv(v); Object.assign(FS.cp, { h, s, v: vv }); } FS.onSet?.(d.f); FS.draw(); },
  calm: d => { FS.calM = addM(FS.calM, +d.n); FS.calDir = +d.n > 0 ? "r" : "l"; FS.draw(); FS.calDir = null; },
  calToday: () => { FS.data = today(); FS.calM = today().slice(0, 7); FS.cal = false; FS.draw(); },
  save: () => FS?.save(), del: () => FS?.del(), stop: () => FS?.stop(), x: () => closeSheet(),
  backup: () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "fluo-backup-" + today() + ".json"; a.click(); },
  sair: async () => { await Store.signOut(); location.reload(); },
  mais: () => openSheet(`<h3>Mais</h3>${[["plano", "Compromissos", "parcelas, recorrentes e eventos"], ["futuro", "Futuro", "12 meses, parcelas no tempo e metas"], ["carteira", "Carteira", "cartões e pessoas"], ["ajustes", "Ajustes", "categorias, contas e aparência"]].map(([p, t, s]) => `<button class="ln" data-a="irPara" data-p="${p}" style="grid-template-columns:minmax(0,1fr)"><span class="t" style="font:700 22px var(--serif)">${t}</span></button>`).join("")}`),
  irPara: d => { closeSheet(); page = d.p; render(true); },
};
document.addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b && A[b.dataset.a]) { e.preventDefault(); A[b.dataset.a](b.dataset, b); } const x = e.target.closest("[data-x]"); if (x) closeSheet(); });
let cpDrag = null;
const clamp01 = x => Math.max(0, Math.min(1, x));
function cpPaint(box, hex) {
  const cp = FS.cp, sv = box.querySelector(".cp-sv"), hh = box.querySelector(".cp-h i"), hx = box.querySelector(".cp-hex"); FS[cp.f] = hex;
  sv.style.setProperty("--hue", cp.h); sv.firstElementChild.style.left = cp.s * 100 + "%"; sv.firstElementChild.style.top = (1 - cp.v) * 100 + "%"; hh.style.left = cp.h / 360 * 100 + "%";
  box.querySelector(".cp-sw").style.background = hex; if (document.activeElement !== hx) hx.value = hex;
}
function cpMove(e) {
  const r = cpDrag.getBoundingClientRect(), x = clamp01((e.clientX - r.left) / r.width), y = clamp01((e.clientY - r.top) / r.height), cp = FS.cp;
  if (cpDrag.classList.contains("cp-sv")) { cp.s = x; cp.v = 1 - y; } else cp.h = x * 360;
  cpPaint(cpDrag.closest(".cp"), hsvToHex(cp.h, cp.s, cp.v));
}
document.addEventListener("pointerdown", e => { const t = FS?.cp && e.target.closest(".cp-sv, .cp-h"); if (!t) return; cpDrag = t; try { t.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); cpMove(e); });
document.addEventListener("pointermove", e => { if (cpDrag) cpMove(e); });
document.addEventListener("pointerup", () => { if (cpDrag) { cpDrag = null; FS.draw(); } });
document.addEventListener("change", e => { if (FS?.cp && e.target.classList?.contains("cp-hex")) FS.draw(); });
document.addEventListener("input", e => {
  const t = e.target;
  if (FS?.cp && t.classList?.contains("cp-hex")) { let v = t.value.trim().replace(/^#?/, "#"); if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + [...v.slice(1)].map(c => c + c).join(""); if (/^#[0-9a-f]{6}$/i.test(v)) { const [h, s, vv] = hexToHsv(v); Object.assign(FS.cp, { h, s, v: vv }); cpPaint(t.closest(".cp"), v.toLowerCase()); } return; } if (t.id === "busca") { busca = t.value; const p = t.selectionStart; render(false); const n = $("#busca"); n.focus(); n.setSelectionRange(p, p); return; }
  if (!FS || !t.dataset.f) return; if (t.dataset.f === "smart") { FS.smart(t.value); return; } FS[t.dataset.f] = t.value;
  if (t.dataset.f === "fecha" || t.dataset.f === "venc") { const fe = $('#fb [data-f="fecha"]'), ve = $('#fb [data-f="venc"]'), F = +FS.fecha, V = +FS.venc; if (fe && ve) { ve.placeholder = F && !V ? vencDeFecha(F) + " (calculado)" : "ex.: 10"; fe.placeholder = V && !F ? fechaDeVenc(V) + " (calculado)" : "ex.: 3"; } }
  if (["v", "n", "tot"].includes(t.dataset.f) && FS.rep === "parc") { const keep = t.selectionStart; FS.draw(); const nx = $(`#fb [data-f="${t.dataset.f}"]`); if (nx) { nx.focus(); try { nx.setSelectionRange(keep, keep); } catch (e) {} } }
});
addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); if (e.key === "Enter" && FS && e.target.matches("input") && e.target.dataset.f) { e.preventDefault(); FS.save(); } });

/* ---------- shell ---------- */
const PAGES = [["inicio", "Início", pgInicio], ["pagar", "Pagar", pgPagar], ["extrato", "Extrato", pgExtrato], ["carteira", "Carteira", pgCarteira], ["plano", "Compromissos", pgPlano], ["futuro", "Futuro", pgFuturo], ["ajustes", "Ajustes", pgAjustes]];
function applyTheme() {
  const r = document.documentElement, t = S?.prefs?.theme || "auto"; if (t === "auto" || t === "dark") delete r.dataset.theme; else r.dataset.theme = t;
  PRIV = !!S?.prefs?.priv; document.body.classList.toggle("priv", PRIV); const hid = !!S?.prefs?.priv, eye = $("#eye");
  eye.innerHTML = hid
    ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0112 5c6 0 9.5 7 9.5 7a17 17 0 01-3.2 4M6.3 6.7C3.9 8.4 2.5 12 2.5 12S6 19 12 19c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  eye.setAttribute("aria-pressed", hid); eye.setAttribute("aria-label", hid ? "Mostrar valores" : "Ocultar valores"); eye.title = hid ? "Mostrar valores" : "Ocultar valores";
}
const numEls = root => [...root.querySelectorAll(".money")].filter(e => e.classList.contains("big") || !e.children.length);
const parseMoney = el => { const t = el.textContent, n = parseFloat(t.replace(/[^\d,]/g, "").replace(",", ".")); return isNaN(n) ? null : (/[−-]/.test(t) ? -n : n); };
const BARS = [[".river i", "width"], [".tl .col i", "height"], [".tl .col u", "bottom"], [".bars .track i", "width"]];
function tween(oldNums, oldBars, anim) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; if (reduce) return;
  const jobs = numEls($("#view")).map((el, i) => { const big = el.classList.contains("big"); return { el, big, dec: /,/.test(el.textContent), to: parseMoney(el), from: anim ? (big ? 0 : null) : oldNums[i] }; }).filter(j => j.to !== null && j.from != null && j.from !== j.to);
  if (jobs.length) {
    /* duração proporcional à distância (escala logarítmica, com teto): salto pequeno = rápido, grande = um pouco mais longo */
    const t0 = performance.now(), ease = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2; // devagar, acelera, desacelera
    jobs.forEach(j => { j.D = Math.min(1100, 320 + 170 * Math.log10(1 + Math.abs(j.to - j.from) / 5)); });
    const step = t => { let busy = false;
      jobs.forEach(j => { const q = Math.min(1, (t - t0) / j.D); if (q < 1) busy = true; const x = j.from + (j.to - j.from) * ease(q); j.el.innerHTML = j.big ? j.el.dataset.sm + (x < 0 ? "−" : "") + nbr(x) : (j.dec ? brl(x) : brl0(x)); });
      if (busy) requestAnimationFrame(step); };
    jobs.forEach(j => { if (j.big) j.el.dataset.sm = j.el.querySelector("small").outerHTML; });
    requestAnimationFrame(step);
  }
  if (!anim) BARS.forEach(([sel, prop], k) => $("#view").querySelectorAll(sel).forEach((el, i) => { const o = oldBars[k][i], n = el.style[prop]; if (o && n && o !== n) el.animate({ [prop]: [o, n] }, { duration: 700, easing: "cubic-bezier(.65,0,.35,1)" }); }));
}
function render(anim = true) {
  const p = PAGES.find(x => x[0] === page) || PAGES[0], v = $("#view"), y = scrollY, same = lastPage === page;
  const oldNums = same ? numEls(v).map(parseMoney) : [], oldBars = BARS.map(([sel, prop]) => same ? [...v.querySelectorAll(sel)].map(e => e.style[prop]) : []), tlOld = v.querySelector(".tl")?.scrollLeft;
  $("#nav").innerHTML = PAGES.map(([k, t]) => `<button data-a="nav" data-p="${k}" ${k === page ? 'aria-current="page"' : ""}><span>${t}</span></button>`).join("");
  $("#dock").innerHTML = `<button data-a="nav" data-p="inicio" ${page === "inicio" ? 'aria-current="page"' : ""}>Início</button><button data-a="nav" data-p="pagar" ${page === "pagar" ? 'aria-current="page"' : ""}>Pagar</button><button class="plus" id="dockAdd" aria-label="Lançar" data-a="lancar">+</button><button data-a="nav" data-p="extrato" ${page === "extrato" ? 'aria-current="page"' : ""}>Extrato</button><button data-a="mais" ${["carteira", "plano", "futuro", "ajustes"].includes(page) ? 'aria-current="page"' : ""}>Mais</button>`;
  $("#mlabel").textContent = label(cur); $("#mlabel").title = cur === NOW ? "Mês atual" : "Voltar para o mês atual"; $("#today").hidden = cur === NOW;
  const keepAnim = anim && !same;
  v.className = "view" + (keepAnim ? " rise" : " still"); v.innerHTML = `<div>${p[2]()}</div>`;
  if (keepAnim) scrollTo(0, 0); else scrollTo(0, y);
  const tl = v.querySelector(".tl"); if (tl && same && tlOld != null) tl.scrollLeft = tlOld;
  const sel = tl?.querySelector('[aria-current="true"]'); if (sel) { const l = sel.offsetLeft - tl.offsetLeft; if (l < tl.scrollLeft) tl.scrollLeft = l - 8; else if (l + sel.offsetWidth > tl.scrollLeft + tl.clientWidth) tl.scrollLeft = l + sel.offsetWidth - tl.clientWidth + 8; }
  tween(oldNums, oldBars, keepAnim); lastPage = page;
}
A.lancar = () => lancar();
A.futSel = d => { futSel = d.k; render(false); };
A.sobre = () => sobreSheet();
A.openMode = async d => {
  const em = Store.user?.email || "";
  if (d.v === "bio") { try { await Store.bioEnroll(em); Store.setRemember(false); toast("Vai pedir biometria ao abrir"); } catch (e) { toast(/PRF/.test(e.message) ? "Este navegador não suporta biometria aqui." : "Não foi possível ativar a biometria."); } }
  else { Store.bioForget(em); Store.setRemember(d.v === "direto"); toast(d.v === "direto" ? "Vai entrar direto ao abrir" : "Vai pedir a senha ao abrir"); }
  render(false);
};
A.chPw = () => {
  form("Trocar senha", { p1: "", p2: "", err: "" }, f => `${fld("Nova senha", `<input class="in" type="password" data-f="p1" autocomplete="new-password" autofocus>`)}${fld("Repita a senha", `<input class="in" type="password" data-f="p2" autocomplete="new-password">`)}${f.err ? `<div class="err">${esc(f.err)}</div>` : ""}<div class="acts"><button class="primary" data-a="save">Trocar</button><button class="secondary" data-a="x">Cancelar</button></div>`);
  FS.save = async () => { if (FS.p1.length < 8) { FS.err = "Use pelo menos 8 caracteres."; return FS.draw(); } if (FS.p1 !== FS.p2) { FS.err = "As senhas não são iguais."; return FS.draw(); } try { await Store.changePassword(FS.p1); closeSheet(); toast("Senha trocada"); } catch (e) { FS.err = "Não foi possível trocar a senha."; FS.draw(); } };
};
A.importar = () => { const i = document.createElement("input"); i.type = "file"; i.accept = ".json,application/json"; i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); if (!d.cats || !d.contas) throw 0; const s0 = snap(); S = d; S.pagos ??= {}; S.metas ??= []; S.eventos ??= []; S.prefs ??= { theme: "auto", priv: false }; commit("Backup restaurado", s0); } catch (e) { toast("Arquivo inválido: use um backup do Fluo (.json)"); } }; i.click(); };
let confirmFn = null;
A.apagar = () => { confirmFn = () => { const s0 = snap(); S = baseState(); commit("Dados apagados", s0); }; openSheet(`<h3>Apagar tudo?</h3><p class="lede">Lançamentos, cartões, pessoas e metas serão apagados. Dá para desfazer logo depois.</p><div class="acts"><button class="primary" data-a="confirmYes" style="background:var(--neg)">Apagar tudo</button><button class="secondary" data-a="x">Cancelar</button></div>`); };
A.confirmYes = () => { closeSheet(); confirmFn?.(); };
A.avisosOn = async () => {
  if (!("Notification" in window)) return toast("Este navegador não permite notificações");
  const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (p === "granted") { ls.set("fluo.avisos", "1"); pushNotices(); toast("Avisos ativados neste aparelho"); render(false); } else toast("Permissão negada no navegador");
};
addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S) pushNotices(); });
$("#prev").onclick = () => { cur = addM(cur, -1); futSel = null; render(false); }; $("#next").onclick = () => { cur = addM(cur, 1); futSel = null; render(false); }; $("#mlabel").onclick = $("#today").onclick = () => { cur = NOW; futSel = null; render(false); };
$("#add").onclick = () => lancar();
$("#eye").onclick = () => { S.prefs.priv = !S.prefs.priv; applyTheme(); Store.save(S); render(false); };
Store.onStatus(s => { if (s === "err") setTimeout(() => Store.flush(), 8000); if (s === "conflict") Store.reload().then(st => { S = st; render(false); toast("Seus dados mudaram em outro aparelho. Atualizei."); }); const el = $("#sync"); el.className = "sync " + s; el.textContent = { busy: "salvando…", ok: "salvo", err: "sem conexão — tentando de novo", conflict: "outro aparelho salvou: recarregue" }[s] || s; });

function enter(state) {
  clearInterval(window.__lgT); S = state; S.pagos ??= {}; S.metas ??= []; S.eventos ??= []; S.prefs ??= { theme: "auto", priv: false };
  $("#auth").hidden = true; $("#app").hidden = false; $("#dock").hidden = false;
  $("#who").textContent = Store.user?.email || ""; Store.bioSupported().then(v => { bioOk = v; if (page === "ajustes") render(false); }); applyTheme(); render(true); setTimeout(pushNotices, 1500);
}

/* ---------- entrada ---------- */
const MARK = '<svg class="mark" viewBox="12 24 96 72" aria-hidden="true"><circle class="m1" cx="46" cy="60" r="25"/><circle class="m2" cx="74" cy="60" r="25"/></svg>';
const LG_MONTHS = [["Maio 2026", 1820.35, [34, 22, 12, 8, 24]], ["Junho 2026", 2310.9, [30, 20, 10, 9, 31]], ["Julho 2026", 640.2, [44, 26, 14, 10, 6]], ["Agosto 2026", 1286.4, [36, 21, 11, 10, 22]], ["Setembro 2026", 1710.75, [32, 19, 10, 10, 29]]];
const LG_FEED = [["Salário", "Entrada", "+R$ 5.200,00", "#86c8a2", 1], ["Mercado", "Alimentação", "R$ 192,30", "#d4755a"], ["Fatura do cartão", "Cartão", "R$ 684,15", "#8f7aa8"], ["Combustível", "Transporte", "R$ 320,00", "#6b86d1"], ["Freela", "Entrada", "+R$ 780,00", "#86c8a2", 1], ["Streaming", "Assinaturas", "R$ 39,90", "#d4755a"], ["Financiamento", "Carro", "R$ 890,00", "#44524a"], ["Reserva", "Investimento", "R$ 400,00", "#c9d848"], ["Farmácia", "Saúde", "R$ 58,70", "#d4755a"], ["Curso", "Educação", "R$ 250,00", "#6b86d1"]];
function lgStart() {
  clearInterval(window.__lgT); let i = 3, cur = LG_MONTHS[3][1];
  const val = $("#lgV"), mon = $("#lgM"), segs = [...document.querySelectorAll("#lgR i")]; if (!val) return;
  const ease = q => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
  const fmt = v => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = idx => { LG_MONTHS[idx][2].forEach((p, k) => { segs[k].style.flexBasis = p + "%"; }); };
  set(i);
  window.__lgT = setInterval(() => {
    if (!document.body.contains(val)) return clearInterval(window.__lgT);
    i = (i + 1) % LG_MONTHS.length; const [m, to, sg] = LG_MONTHS[i], from = cur, t0 = performance.now(), D = Math.min(1300, 500 + Math.abs(to - from) * .35);
    mon.classList.add("out"); setTimeout(() => { mon.textContent = m; mon.classList.remove("out"); }, 220); set(i);
    const step = t => { const q = Math.min(1, (t - t0) / D); cur = from + (to - from) * ease(q); val.textContent = fmt(cur); if (q < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, 3600);
}
function sobreSheet() {
  openSheet(`<div class="sb-brand">${MARK}<span>Fluo</span></div>
   <p class="sb-t">Controle financeiro pessoal, mês a mês.</p>
   <div class="sb-list"><div><b>Privacidade</b><span>Seus dados são criptografados no seu aparelho. Só você consegue ler.</span></div><div><b>Versão</b><span>1.0 beta</span></div></div>
   <div class="h"><h2>Contato</h2></div>
   <a class="primary sb-mail" href="mailto:vertecproj@gmail.com?subject=Fluo">vertecproj@gmail.com</a>`);
}
function baseState() {
  return {
    v: 1, prefs: { theme: "auto", priv: false },
    cats: [["salario", "Salário", "#2d6a4d", "entrada"], ["extra", "Renda extra", "#6aa77f", "entrada"], ["invest", "Investimento", "#4b5fa8", "invest"], ["moradia", "Moradia", "#8a6a9e", "saida"], ["contas", "Contas", "#6b7389", "saida"], ["transporte", "Transporte", "#2f86a8", "saida"], ["alimentacao", "Alimentação", "#c4573b", "saida"], ["assinaturas", "Assinaturas", "#a8497e", "saida"], ["saude", "Saúde", "#7a8a3a", "saida"], ["lazer", "Lazer", "#c98a12", "saida"], ["compras", "Compras", "#b5604a", "saida"], ["outros", "Outros", "#8b8f85", "saida"]].map(([id, n, cor, tipo]) => ({ id, n, e: id, cor, tipo })),
    contas: [{ id: "debito", n: "Débito / Pix", cor: "#6b7389", tipo: "debito" }, { id: "boleto", n: "Boleto", cor: "#8a7a3a", tipo: "boleto" }],
    pessoas: [], recorrentes: [], parcelas: [], avulsos: [], dividas: [], pagos: {}, metas: [], eventos: [],
  };
}
const EYE_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0112 5c6 0 9.5 7 9.5 7a17 17 0 01-3.2 4M6.3 6.7C3.9 8.4 2.5 12 2.5 12S6 19 12 19c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>';
/* entrar · up: pede código por e-mail · upcode: código + senha cria a conta · forgot/code: recuperar senha · rec: código de recuperação · bio: biometria */
function showAuth(msg, startMode, preEmail) {
  const au = $("#auth"); au.hidden = false; $("#app").hidden = true; $("#dock").hidden = true;
  let mode = startMode || "in", email0 = preEmail || Store.user?.email || "", autoBio = false;
  au.innerHTML = `<section class="lg-art"><div class="lg-brand">${MARK}Fluo</div>
    <div class="lg-demo" aria-hidden="true"><div class="lg-k"><span id="lgM">Agosto 2026</span></div><div class="lg-big"><small>R$</small><span id="lgV">1.286,40</span></div>
      <div class="lg-river" id="lgR"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="lg-feed"><div class="lg-track">${LG_FEED.map(([n, c, v, col, pos]) => `<div class="lg-r"><i style="background:${col}"></i><span><b>${n}</b><small>${c}</small></span><em class="${pos ? "pos" : ""}">${v}</em></div>`).join("").repeat(2)}</div></div></div>
    <h1 class="lg-h">Seu dinheiro,<br>mês a mês.</h1></section><form class="lg-form" id="lf" novalidate></form>`;
  lgStart();
  const form = $("#lf");
  const pw = (id, label, auto) => `<label class="lg-f"><span>${label}</span><div class="lg-pw"><input id="${id}" type="password" autocomplete="${auto}" minlength="8" required><button type="button" class="pwEye" aria-label="Mostrar senha">${EYE_ON}</button></div></label>`;
  const emailF = `<label class="lg-f"><span>E-mail</span><input id="aEmail" type="email" required autocomplete="username" value="${esc(email0)}"></label>`;
  const otp = `<label class="lg-f"><span>Código do e-mail</span><input id="aOtp" required inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" class="otp"></label>`;
  const rcode = `<label class="lg-f"><span>Código de recuperação</span><input id="aCode" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off"></label>`;
  const remember = () => email0 && Store.bioEnabled(email0) ? "" : `<label class="lg-chk"><input type="checkbox" id="aRemember" checked><i></i>Manter minha sessão neste aparelho</label>`;
  const E = () => `<div class="err" id="er" ${msg ? "" : "hidden"}>${esc(msg || "")}</div>`;
  const back = '<button type="button" class="lg-link" data-m="in">← Voltar</button>';
  const V = {
    in: () => `<h2>Entrar</h2>${emailF}${pw("aPw", "Senha", "current-password")}${remember()}${E()}<button class="primary lg-go" type="submit">Entrar</button>
      <div class="lg-links"><button type="button" class="lg-link" data-m="forgot">Esqueci a senha</button></div>
      <div class="lg-or"><span>ou</span></div><button type="button" class="secondary lg-demo-btn" data-m="up">Criar conta</button><button type="button" class="lg-about" data-a="sobre">Sobre e contato</button>`,
    up: () => `<h2>Criar conta</h2><p class="lg-hint">Enviamos um código de 6 dígitos para confirmar o e-mail.</p>${emailF}${E()}<button class="primary lg-go" type="submit">Enviar código</button>${back}`,
    upcode: () => `<h2>Confirmar e-mail</h2><p class="lg-hint">Código enviado para <b>${esc(email0)}</b>. Veja também o spam.</p>${otp}${pw("aPw", "Senha (mínimo 8 caracteres)", "new-password")}${pw("aPw2", "Repita a senha", "new-password")}${remember()}${E()}<button class="primary lg-go" type="submit">Criar conta</button><button type="button" class="lg-link" data-m="up">Reenviar código</button>`,
    forgot: () => `<h2>Esqueci a senha</h2><p class="lg-hint">Enviamos um código de 6 dígitos para o seu e-mail.</p>${emailF}${E()}<button class="primary lg-go" type="submit">Enviar código</button>${back}`,
    code: () => `<h2>Nova senha</h2><p class="lg-hint">Código enviado para <b>${esc(email0)}</b>. Para abrir seus dados também precisamos do código de recuperação guardado na criação da conta.</p>${otp}${pw("aPw", "Nova senha", "new-password")}${rcode}${E()}<button class="primary lg-go" type="submit">Trocar senha e entrar</button><button type="button" class="lg-link" data-m="forgot">Reenviar código</button>`,
    rec: () => `<h2>Destravar dados</h2><p class="lg-hint">Sua senha mudou. Digite o código de recuperação guardado na criação da conta.</p>${rcode}${pw("aPw", "Sua senha", "current-password")}${E()}<button class="primary lg-go" type="submit">Destravar</button>`,
    bio: () => `<h2>Olá de novo</h2><p class="lg-hint">${esc(email0)}</p><button type="button" class="primary lg-go" id="aBioGo">Desbloquear com biometria</button>${E()}<button type="button" class="lg-link" data-m="in">Usar senha</button>`,
  };
  const draw = () => {
    form.innerHTML = V[mode]();
    form.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { email0 = $("#aEmail")?.value.trim() || email0; mode = b.dataset.m; msg = ""; draw(); });
    form.querySelectorAll(".pwEye").forEach(b => b.onclick = () => { const i = b.parentNode.querySelector("input"), show = i.type === "password"; i.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE_ON; b.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha"); i.focus(); });
    if (mode === "bio") {
      $("#aBioGo").onclick = async () => { const b = $("#aBioGo"); b.disabled = true; try { enter((await Store.bioUnlock(email0)).state); } catch (ex) { msg = ex?.name === "NotAllowedError" ? "" : "Não foi possível desbloquear. Use sua senha."; if (b.isConnected) { draw(); } } };
      if (!autoBio) { autoBio = true; $("#aBioGo").click(); }
    }
    const f = form.querySelector("input:not([type=checkbox])"); if (f && matchMedia("(pointer:fine)").matches) f.focus();
  };
  const err = t => { const e = $("#er"); e.textContent = t; e.hidden = !t; };
  form.onsubmit = async ev => {
    ev.preventDefault(); const btn = form.querySelector(".lg-go"); if (!btn || btn.id === "aBioGo") return;
    const bad = [...form.querySelectorAll("input[required]")].find(i => !i.checkValidity());
    if (bad) { bad.focus(); return err(bad.type === "email" ? "Digite um e-mail válido." : bad.minLength > 0 && bad.value ? `Use pelo menos ${bad.minLength} caracteres.` : "Preencha este campo."); }
    const old = btn.textContent; btn.textContent = "Aguarde…"; btn.disabled = true;
    try {
      const email = ($("#aEmail")?.value || email0).trim().toLowerCase(), pass = $("#aPw")?.value;
      if (email) email0 = email;
      if ($("#aRemember")) Store.setRemember($("#aRemember").checked);
      if (mode === "up") {
        const r = await Store.messenger({ action: "signup", email });
        if (r.status === "exists") { mode = "in"; msg = "Esse e-mail já tem conta. Entre com sua senha."; return draw(); }
        if (r.status === "invalid") return err("Digite um e-mail válido.");
        if (r.status === "wait") return err("Código enviado há pouco. Aguarde um minuto.");
        if (r.status !== "ok") throw new Error(r.message || "falha");
        mode = "upcode"; msg = ""; draw(); return;
      }
      if (mode === "forgot") { const r = await Store.messenger({ action: "forgot", email }); if (r.status === "wait") return err("Código enviado há pouco. Aguarde um minuto."); mode = "code"; msg = ""; return draw(); }
      if (mode === "code") {
        const r = await Store.finishReset(email, $("#aOtp").value.trim(), pass);
        if (r.status !== "ok") return err({ wrong: "Código incorreto.", expired: "Código vencido. Peça outro.", locked: "Muitas tentativas. Peça um novo código.", weak: "Use pelo menos 8 caracteres." }[r.status] || "Não foi possível trocar a senha.");
        const s = await Store.signIn(email, pass);
        return enter(s.needRecovery ? (await Store.recover($("#aCode").value, pass)).state : s.state);
      }
      if (mode === "rec") return enter((await Store.recover($("#aCode").value, pass)).state);
      if (mode === "upcode") {
        if (pass !== $("#aPw2").value) return err("As senhas não são iguais.");
        const v = await Store.verifySignup(email, $("#aOtp").value.trim());
        if (v.status !== "ok") return err({ wrong: "Código incorreto.", expired: "Código vencido. Peça outro.", locked: "Muitas tentativas. Peça um novo código." }[v.status] || "Não foi possível confirmar o código.");
        const r = await Store.signUp(email, pass, baseState());
        if (r.confirmEmail) { mode = "in"; msg = "Conta criada! Confirme pelo e-mail e depois entre."; return draw(); }
        return showRecovery(r.recoveryCode, r.state);
      }
      const r = await Store.signIn(email, pass);
      if (r.noVault) { const c = await Store.createVault(pass, baseState()); return showRecovery(c.recoveryCode, c.state); }
      if (r.needRecovery) { mode = "rec"; msg = ""; return draw(); }
      enter(r.state);
    } catch (ex) {
      const m = ex?.message || "";
      err(/NOT_APPROVED|Database error saving/i.test(m) ? "Confirme seu e-mail com o código antes de criar a conta." : /Invalid login/i.test(m) ? "E-mail ou senha incorretos." : /registered|already/i.test(m) ? "Esse e-mail já tem conta. Tente entrar." : /fetch|network|Failed/i.test(m) ? "Sem conexão. Verifique a internet." : /decrypt|operation/i.test(m) ? "Código de recuperação incorreto." : "Algo deu errado. Tente de novo.");
    } finally { if (btn.isConnected) { btn.textContent = old; btn.disabled = false; } }
  };
  draw();
}
function showRecovery(code, state) {
  $("#lf").innerHTML = `<h2>Guarde este código</h2><p class="lg-hint">É a única forma de recuperar seus dados se esquecer a senha. Anote ou tire print.</p><div class="reccode">${code}</div>
    <button type="button" class="secondary lg-go" id="copyRec" style="margin-top:0">Copiar código</button><label class="lg-chk" style="margin-top:18px"><input type="checkbox" id="saved"><i></i>Guardei o código em lugar seguro</label>
    <button type="button" class="primary lg-go" id="goIn" disabled>Começar a usar</button>`;
  $("#copyRec").onclick = () => navigator.clipboard?.writeText(code).then(() => { $("#copyRec").textContent = "Copiado ✓"; }, () => {});
  $("#saved").onchange = e => $("#goIn").disabled = !e.target.checked;
  $("#goIn").onclick = () => enter(state);
}
(async () => {
  try {
    const criar = new URLSearchParams(location.search).get("criar");
    if (criar) { history.replaceState(null, "", location.pathname); return showAuth("", "up", criar); }
    const r = await Store.resume();
    if (r?.state) return enter(r.state);
    if (r?.needPassword && r.bioAvail) return showAuth("", "bio", r.email);
    showAuth(r?.needPassword ? "Digite sua senha para destravar seus dados." : "", r?.needPassword ? "in" : undefined, r?.email);
  } catch (e) { showAuth("Não foi possível conectar. Verifique a internet."); }
  finally { if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {}); }
})();
})();
