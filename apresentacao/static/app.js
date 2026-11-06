"use strict";

/* ================================================================ Utilidades */
const NS = "http://www.w3.org/2000/svg";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (v, d = 0) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pct = (v, d = 2) => fmt(v * 100, d) + "%";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function svgEl(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (pai) pai.appendChild(e);
  return e;
}
function el(tag, attrs = {}, html = "", pai) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k.startsWith("data-")) e.setAttribute(k, attrs[k]);
    else if (k === "style") e.style.cssText = attrs[k];
    else e[k] = attrs[k];
  }
  if (html) e.innerHTML = html;
  if (pai) pai.appendChild(e);
  return e;
}
function tween(dur, fn, ease = easeOut) {
  const t0 = performance.now();
  let id, parado = false;
  const passo = (agora) => {
    if (parado) return;
    const t = Math.min(1, (agora - t0) / dur);
    fn(ease(t), t);
    if (t < 1) id = requestAnimationFrame(passo);
  };
  id = requestAnimationFrame(passo);
  return () => { parado = true; cancelAnimationFrame(id); };
}
function contar(alvo, para, { dur = 900, dec = 0, suf = "", de } = {}) {
  const inicio = de ?? (parseFloat(alvo.dataset.v) || 0);
  alvo.dataset.v = para;
  alvo._para?.();
  alvo._para = tween(dur, (t) => (alvo.textContent = fmt(inicio + (para - inicio) * t, dec) + suf));
}

/* ================================================================ Tooltip */
const tip = $("#tip");
function mostrarTip(html, x, y) {
  tip.innerHTML = html;
  tip.classList.add("on");
  const r = tip.getBoundingClientRect();
  let l = x + 16, t = y + 16;
  if (l + r.width > innerWidth - 8) l = x - r.width - 16;
  if (t + r.height > innerHeight - 8) t = y - r.height - 16;
  tip.style.left = l + "px";
  tip.style.top = t + "px";
}
const esconderTip = () => tip.classList.remove("on");
document.addEventListener("mousemove", (e) => {
  const alvo = e.target.closest && e.target.closest("[data-tip]");
  if (alvo) mostrarTip(alvo.dataset.tip, e.clientX, e.clientY);
  else if (!(e.target.closest && e.target.closest("canvas"))) esconderTip();
});

/* ================================================================ Domínio */
const NOME = {
  Portal: "Portal", Catalogo: "Catálogo", Integracoes: "Integrações", Clientes: "Clientes", Checkout: "Checkout",
  Promocoes: "Promoções", Pagamentos: "Pagamentos", Pedidos: "Pedidos", Logistica: "Logística", Notificacoes: "Notificações",
};
const MOD_NOME = {
  Borda: "Borda", Vitrine: "Vitrine", Compra: "Compra", Financeiro: "Financeiro", Distribuicao: "Distribuição",
  Comunicacao: "Comunicação", Identidade: "Identidade", Integracao: "Integração",
};
// Posições escolhidas para que nenhuma seta atravesse um componente e
// os módulos de domínio fiquem lado a lado.
const POS = {
  Portal: { x: 330, y: 80 }, Catalogo: { x: 620, y: 80 }, Integracoes: { x: 880, y: 80 },
  Clientes: { x: 80, y: 260 }, Checkout: { x: 290, y: 270 }, Promocoes: { x: 600, y: 190 },
  Pagamentos: { x: 130, y: 440 }, Pedidos: { x: 470, y: 410 }, Logistica: { x: 800, y: 430 },
  Notificacoes: { x: 500, y: 560 },
};
const NW = 132, NH = 44;
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const seta = (id) => id.split(">").map((c) => NOME[c]).join(" → ");

let DADOS = null;

/* ================================================================ Grafo */
function borda(c, d, extra = 0) {
  const hw = NW / 2 + extra, hh = NH / 2 + extra;
  const t = Math.min(hw / Math.abs(d.x || 1e-9), hh / Math.abs(d.y || 1e-9));
  return { x: c.x + d.x * t, y: c.y + d.y * t };
}

function criarGrafo(svg, { interativo = false } = {}) {
  const { arestas, componentes } = DADOS.parte2;
  svg.setAttribute("viewBox", "-14 22 994 596");
  svg.innerHTML = "";
  const gH = svgEl("g", {}, svg), gL = svgEl("g", {}, svg), gE = svgEl("g", {}, svg), gN = svgEl("g", {}, svg);
  const nos = {}, ars = {}, hulls = {}, atual = {};
  let pararHull = null;

  const rectDe = (c, pad = 12) => ({ x: POS[c].x - NW / 2 - pad, y: POS[c].y - NH / 2 - pad, w: NW + 2 * pad, h: NH + 2 * pad });
  const aplicar = (r, b) => { r.setAttribute("x", b.x); r.setAttribute("y", b.y); r.setAttribute("width", b.w); r.setAttribute("height", b.h); };

  for (const c of componentes) {
    const g = svgEl("g", { class: "hull" }, gH);
    g.style.opacity = 0;
    g.style.transition = "opacity .5s";
    hulls[c] = svgEl("rect", { rx: 18 }, g);
    atual[c] = rectDe(c);
    aplicar(hulls[c], atual[c]);
  }

  for (const id of arestas) {
    const [a, b] = id.split(">");
    const p1 = POS[a], p2 = POS[b];
    const d = { x: p2.x - p1.x, y: p2.y - p1.y };
    const n = Math.hypot(d.x, d.y), u = { x: d.x / n, y: d.y / n };
    const ini = borda(p1, d, 3);
    const ponta = borda(p2, { x: -d.x, y: -d.y }, 4);
    const fim = { x: ponta.x - u.x * 9, y: ponta.y - u.y * 9 };
    const g = svgEl("g", { class: "aresta" }, gE);
    g.dataset.tip = interativo ? `<b>${seta(id)}</b><div class="t">clique para alternar síncrona / fila</div>` : `<b>${seta(id)}</b><div class="t">${NOME[a]} depende de ${NOME[b]}</div>`;
    const dd = `M${ini.x.toFixed(1)},${ini.y.toFixed(1)} L${fim.x.toFixed(1)},${fim.y.toFixed(1)}`;
    const linha = svgEl("path", { class: "linha", d: dd }, g);
    const len = Math.hypot(fim.x - ini.x, fim.y - ini.y);
    g.style.setProperty("--len", len.toFixed(1));
    const nx = -u.y, ny = u.x;
    svgEl("polygon", {
      class: "ponta",
      points: `${ponta.x},${ponta.y} ${fim.x + nx * 5},${fim.y + ny * 5} ${fim.x - nx * 5},${fim.y - ny * 5}`,
    }, g);
    const mid = { x: (ini.x + fim.x) / 2, y: (ini.y + fim.y) / 2 };
    const fila = svgEl("g", { class: "fila", transform: `translate(${mid.x},${mid.y})` }, g);
    svgEl("rect", { x: -13, y: -9, width: 26, height: 18, rx: 5 }, fila);
    for (const dx of [-6, 0, 6]) svgEl("line", { x1: dx, x2: dx, y1: -4, y2: 4 }, fila);
    if (interativo) svgEl("path", { class: "hit", d: dd }, g);
    ars[id] = { g, a, b, d: dd, linha, len };
  }

  for (const c of componentes) {
    const p = POS[c];
    const g = svgEl("g", { class: "no", transform: `translate(${p.x},${p.y})` }, gN);
    const inner = svgEl("g", {}, g);
    const r = svgEl("rect", { x: -NW / 2, y: -NH / 2, width: NW, height: NH, rx: 12 }, inner);
    svgEl("text", { x: 0, y: 1 }, inner).textContent = NOME[c];
    const badge = svgEl("g", { transform: `translate(${NW / 2 - 4},${-NH / 2 + 2})`, opacity: 0 }, inner);
    const badgeBg = svgEl("rect", { class: "badge-bg", x: -16, y: -10, width: 32, height: 20, rx: 10 }, badge);
    const badgeTx = svgEl("text", { class: "badge", x: 0, y: 1, "text-anchor": "middle", "dominant-baseline": "central" }, badge);
    const db = svgEl("g", { transform: `translate(${-NW / 2 + 2},${NH / 2 - 2})`, opacity: 0 }, inner);
    const dbForma = svgEl("path", { class: "db", d: "M-8,-6 a8,3 0 0,1 16,0 v11 a8,3 0 0,1 -16,0 z", "stroke-width": 1.2 }, db);
    svgEl("path", { d: "M-8,-6 a8,3 0 0,0 16,0", fill: "none", stroke: "rgba(0,0,0,.35)", "stroke-width": 1.2 }, db);
    nos[c] = { g, inner, r, badge, badgeBg, badgeTx, db, dbForma };
  }

  const api = {
    svg, nos, ars,
    mostrarNos(visivel, escalonar = 0) {
      componentes.forEach((c, i) => {
        const g = nos[c].g;
        if (!escalonar) { g.classList.toggle("escondido", !visivel); return; }
        g.classList.add("escondido");
        setTimeout(() => g.classList.toggle("escondido", !visivel), 80 + i * escalonar);
      });
    },
    desenharArestas(escalonar = 0, atraso = 0) {
      // Ao terminar, tira a classe de desenho para os estilos de fila e rede valerem.
      Object.values(ars).forEach(({ g }, i) => {
        if (!escalonar) { g.classList.remove("desenhando", "on"); return; }
        g.classList.add("desenhando");
        g.classList.remove("on");
        setTimeout(() => g.classList.add("on"), atraso + i * escalonar);
        setTimeout(() => g.classList.remove("desenhando", "on"), atraso + i * escalonar + 1700);
      });
    },
    foco({ nos: fn = [], arestas: fa = [], apagar = false } = {}) {
      for (const c of componentes) {
        nos[c].g.classList.toggle("foco", fn.includes(c));
        nos[c].g.classList.toggle("apagado", apagar && !fn.includes(c));
      }
      for (const id in ars) {
        ars[id].g.classList.toggle("foco", fa.includes(id));
        ars[id].g.classList.toggle("apagado", apagar && !fa.includes(id));
      }
    },
    origem(c) { for (const k of componentes) nos[k].g.classList.toggle("origem", k === c); },
    remotas(lista) { for (const id in ars) ars[id].g.classList.toggle("remota", lista.includes(id)); },
    async(conj) { for (const id in ars) ars[id].g.classList.toggle("async", conj.has(id)); },
    forma(artefatoDe, { rotulo = () => null, mostrar = true, dur = 900 } = {}) {
      const grupos = {};
      for (const c of componentes) (grupos[artefatoDe[c]] ||= []).push(c);
      const alvo = {};
      for (const art in grupos) {
        const m = grupos[art], pad = m.length > 1 ? 18 : 12;
        const xs = m.map((c) => POS[c].x), ys = m.map((c) => POS[c].y);
        const b = {
          x: Math.min(...xs) - NW / 2 - pad, y: Math.min(...ys) - NH / 2 - pad,
          w: Math.max(...xs) - Math.min(...xs) + NW + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + NH + 2 * pad,
        };
        for (const c of m) alvo[c] = b;
      }
      const de = Object.fromEntries(componentes.map((c) => [c, { ...atual[c] }]));
      pararHull?.();
      pararHull = tween(dur, (t) => {
        for (const c of componentes) {
          const a = de[c], b = alvo[c];
          atual[c] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
          aplicar(hulls[c], atual[c]);
        }
      }, easeInOut);
      // Um retângulo por componente, mas só o primeiro de cada artefato aparece:
      // ao dividir, os outros surgem do contorno antigo e deslizam até o novo.
      const lider = new Set(Object.values(grupos).map((m) => m[0]));
      for (const c of componentes) hulls[c].parentNode.style.opacity = mostrar && lider.has(c) ? 1 : 0;
      gL.innerHTML = "";
      if (!mostrar) return;
      for (const art in grupos) {
        const texto = rotulo(art, grupos[art]);
        if (!texto) continue;
        const b = alvo[grupos[art][0]];
        const t = svgEl("text", { class: "hull-rotulo", x: b.x + 16, y: b.y + 1, "dominant-baseline": "central" }, gL);
        t.textContent = texto;
        t.style.opacity = 0;
        setTimeout(() => (t.style.opacity = 1), dur * 0.7);
      }
    },
    quanta(grupos, banco) {
      const cor = {};
      grupos.forEach((g, i) => g.forEach((c) => (cor[c] = { v: i < SERIES.length ? `var(${SERIES[i]})` : "var(--ref)", i })));
      for (const c of componentes) {
        const n = nos[c], k = cor[c];
        if (!k) {
          n.r.style.fill = n.r.style.stroke = "";
          n.badge.setAttribute("opacity", 0);
          n.db.setAttribute("opacity", 0);
          continue;
        }
        n.r.style.fill = `color-mix(in srgb, ${k.v} 22%, var(--node-fill))`;
        n.r.style.stroke = k.v;
        n.r.style.strokeWidth = 2;
        n.badge.setAttribute("opacity", 1);
        n.badgeBg.style.fill = k.v;
        n.badgeTx.textContent = "Q" + (k.i + 1);
        n.db.setAttribute("opacity", 1);
        n.dbForma.style.fill = banco === "unico" ? "var(--text-2)" : k.v;
        n.dbForma.style.stroke = "var(--surface)";
      }
    },
    pulsos(lista, dur = 1.6) {
      gE.querySelectorAll(".pacote").forEach((p) => p.remove());
      lista.forEach((id, i) => {
        const c = svgEl("circle", { class: "pacote", r: 5 }, gE);
        const am = svgEl("animateMotion", { dur: dur + "s", repeatCount: "indefinite", path: ars[id].d, begin: (i * 0.3).toFixed(2) + "s" }, c);
        am.beginElement?.();
      });
    },
  };
  return api;
}

/* ================================================================ Deck */
const slides = $$(".slide");
const ganchos = {};
let idx = 0, build = 0, iniciado = false;
const totalBuilds = (i) => +slides[i].dataset.builds || 0;

function ir(i, b, forcar = false) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  b = Math.max(0, Math.min(totalBuilds(i), b));
  const entrou = forcar || i !== idx || !iniciado;
  slides.forEach((s, k) => {
    s.classList.toggle("ativo", k === i);
    s.classList.toggle("antes", k < i);
  });
  const s = slides[i];
  const itens = $$("[data-build]", s);
  if (entrou) { itens.forEach((e) => e.classList.remove("on")); void s.offsetWidth; }
  itens.forEach((e) => e.classList.toggle("on", +e.dataset.build <= b));
  idx = i; build = b; iniciado = true;
  try { ganchos[s.id]?.(b, entrou); } catch (erro) { console.error(erro); }
  atualizarMoldura();
  history.replaceState(null, "", `#${i + 1}.${b}`);
}
const proximo = () => (build < totalBuilds(idx) ? ir(idx, build + 1) : idx < slides.length - 1 && ir(idx + 1, 0));
const anterior = () => (build > 0 ? ir(idx, build - 1) : idx > 0 && ir(idx - 1, totalBuilds(idx - 1)));
const definirBuild = (b) => ir(idx, b);

function montarMoldura() {
  const pontos = $("#pontos");
  let parteAnt = null;
  slides.forEach((s, i) => {
    const parte = s.dataset.parte.split(" ·")[0];
    if (parteAnt && parte !== parteAnt) el("span", { class: "sep" }, "", pontos);
    parteAnt = parte;
    const b = el("button", { "data-tip": `<b>${i + 1}.</b> ${s.dataset.parte}<div class="t">${$(".kicker", s)?.textContent || "Capa"}</div>` }, "", pontos);
    b.addEventListener("click", (e) => { e.currentTarget.blur(); ir(i, 0); });
  });
  $("#btn-prox").addEventListener("click", (e) => { e.currentTarget.blur(); proximo(); });
  $("#btn-ant").addEventListener("click", (e) => { e.currentTarget.blur(); anterior(); });
  $("#btn-tema").addEventListener("click", (e) => { e.currentTarget.blur(); alternarTema(); });
  $("#btn-tela").addEventListener("click", (e) => { e.currentTarget.blur(); telaCheia(); });
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); proximo(); }
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); anterior(); }
    else if (e.key === "Home") ir(0, 0);
    else if (e.key === "End") ir(slides.length - 1, totalBuilds(slides.length - 1));
    else if (e.key.toLowerCase() === "f") telaCheia();
    else if (e.key.toLowerCase() === "t") alternarTema();
  });
  let x0 = null;
  document.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  document.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 60) (dx < 0 ? proximo : anterior)();
    x0 = null;
  });
}
function atualizarMoldura() {
  const botoes = $$("#pontos button");
  botoes.forEach((b, i) => { b.classList.toggle("on", i === idx); b.classList.toggle("feito", i < idx); });
  $("#contador").textContent = `${idx + 1} / ${slides.length}`;
  $("#parte-chip").textContent = slides[idx].dataset.parte;
  const mini = $("#etapas-mini");
  const n = totalBuilds(idx);
  mini.innerHTML = n ? Array.from({ length: n + 1 }, (_, i) => `<i class="${i <= build ? "on" : ""}"></i>`).join("") : "";
  const total = slides.reduce((a, _, i) => a + totalBuilds(i) + 1, 0);
  const feito = slides.slice(0, idx).reduce((a, _, i) => a + totalBuilds(i) + 1, 0) + build + 1;
  $("#barra-progresso").style.width = (100 * feito) / total + "%";
  const ultimo = idx === slides.length - 1 && build === n;
  $("#btn-prox-txt").textContent = ultimo ? "Fim" : build < n ? "Próxima etapa" : "Próximo slide";
}
function alternarTema() {
  const novo = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = novo;
  try { localStorage.setItem("tema", novo); } catch (_) {}
  waffle?.redesenhar();
}
function telaCheia() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

/* ================================================================ 1 · Capa */
function montarCapa() {
  const { alunos } = DADOS.projeto;
  const iniciais = (n) => n.split(" ").filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join("");
  for (const a of alunos) el("div", { class: "aluno cartao" }, `<span class="avatar">${iniciais(a)}</span><span>${a}</span>`, $("#alunos"));
  $("#creditos").innerHTML = alunos.map((a) => `<span class="aluno cartao" style="padding:6px 14px 6px 6px"><span class="avatar" style="width:28px;height:28px;font-size:11px">${iniciais(a)}</span><span>${a}</span></span>`).join("")
    + `<span>Dados gerados por <code>meu_ensaio.py</code> e <code>meu_quantum.py</code> · base de Eduardo da Silva (<code>07-remoto</code>)</span>`;

  const svg = $("#capa-grafo");
  svg.setAttribute("viewBox", "-200 -80 1360 760");
  for (const id of DADOS.parte2.arestas) {
    const [a, b] = id.split(">");
    svgEl("line", {
      x1: POS[a].x, y1: POS[a].y, x2: POS[b].x, y2: POS[b].y, stroke: "var(--accent)", "stroke-width": 1.2,
      "stroke-dasharray": "4 8", style: `animation: fluxo ${2 + Math.random() * 2}s linear infinite`,
    }, svg);
  }
  for (const c of DADOS.parte2.componentes) {
    const g = svgEl("circle", { cx: POS[c].x, cy: POS[c].y, r: 6, fill: "var(--accent-2)" }, svg);
    g.style.filter = "drop-shadow(0 0 8px var(--accent-2))";
  }
}

/* ================================================================ 2 · Cenário */
let gCenario, cenarioDesenhado = false;
const ENTRADAS = () => DADOS.parte2.filas_notificacoes;
ganchos["s-cenario"] = (b, entrou) => {
  const g = gCenario;
  const fontes = ENTRADAS().map((e) => e.split(">")[0]);
  if (entrou && !cenarioDesenhado && b === 0) {
    g.mostrarNos(true, 70);
    g.desenharArestas(55, 600);
    cenarioDesenhado = true;
  } else if (!cenarioDesenhado) {
    g.mostrarNos(true); g.desenharArestas(); cenarioDesenhado = true;
  }
  g.async(new Set(b >= 3 ? ENTRADAS() : []));
  if (b === 0) { g.foco(); g.pulsos([]); }
  if (b === 1) { g.foco({ nos: ["Notificacoes"], apagar: false }); g.pulsos([]); }
  if (b >= 2) { g.foco({ nos: ["Notificacoes", ...fontes], arestas: ENTRADAS(), apagar: true }); g.pulsos(ENTRADAS()); }
};

/* ================================================================ 3 · Hipóteses */
function montarHipoteses() {
  const h = DADOS.parte1.hipoteses, q = DADOS.parte2.hipoteses;
  const cards = [
    { rot: "Mediana da rede", v: h.novo.mediana_ms, suf: " ms", antes: `${h.base.mediana_ms} ms`, dir: "sobe", por: "Comunicação rápida, mas com mais sobrecarga que a base." },
    { rot: "P99 da rede", v: h.novo.p99_ms, suf: " ms", antes: `${h.base.p99_ms} ms`, dir: "sobe", por: "Cauda longa por contenção." },
    { rot: "Falha sorteada", v: h.novo.falha * 100, suf: "%", antes: pct(h.base.falha, 0), dir: "desce", por: "Menos perdas que na campanha original." },
    { rot: "Timeout por chamada", v: h.timeout_s, suf: " s", antes: "mantido", dir: "igual", por: `${pct(h.novo.perda_na_volta, 0)} das falhas sorteadas perdem a resposta na volta.` },
    { rot: "Amostra", v: h.compras, suf: "", unid: "compras", antes: "mantida", dir: "igual", por: `Semente ${h.semente}, e uma varredura das sementes 1 a 10.` },
    { rot: "Disponibilidade", v: q.disponibilidade * 100, dec: 1, suf: "%", unid: "por artefato", antes: "mantida", dir: "igual", por: `Mês de 30 dias = ${fmt(q.minutos_mes)} minutos (Aula 17).` },
  ];
  const grade = $("#hip-grade");
  cards.forEach((c, i) => {
    const seta = { sobe: "↑ maior", desce: "↓ menor", igual: "= igual" }[c.dir];
    const d = el("div", { class: "cartao hip", "data-build": "0", style: `transition-delay:${i * 90}ms` }, `
      <div class="rot">${c.rot}</div>
      <div class="valor num"><span class="cv" data-alvo="${c.v}" data-dec="${c.dec || 0}" data-suf="${c.suf}">0</span>${c.unid ? `<small>${c.unid}</small>` : ""}</div>
      <div class="antes"><span class="seta-mudou ${c.dir}">${seta}</span>${c.dir === "igual" ? `<span>${c.antes}</span>` : `base: <s>${c.antes}</s>`}</div>
      <div class="por">${c.por}</div>`, grade);
    d.dataset.i = i;
  });
}
ganchos["s-hipoteses"] = (b, entrou) => {
  if (!entrou) return;
  $$("#hip-grade .cv").forEach((s, i) => {
    s.dataset.v = 0;
    setTimeout(() => contar(s, +s.dataset.alvo, { dur: 1100, dec: +s.dataset.dec, suf: s.dataset.suf }), 150 + i * 90);
  });
};

/* ================================================================ 4 · Sequência */
const seq = { id: 0, svg: null };
const CENAS = ["1 · Resposta perdida", "2 · Repetir sem chave", "3 · Repetir com chave"];
const X = { checkout: 130, rede: 450, pag: 770 };
function montarSequencia() {
  const svg = $("#seq");
  seq.svg = svg;
  CENAS.forEach((n, i) => {
    const b = el("button", { class: "cena-tab" }, n, $("#cenas-tabs"));
    b.addEventListener("click", (e) => { e.currentTarget.blur(); definirBuild(i); });
  });
  const atores = [["Checkout", X.checkout], ["Rede", X.rede], ["Pagamentos", X.pag]];
  for (const [n, x] of atores) {
    const g = svgEl("g", { class: "ator" }, svg);
    svgEl("line", { class: "vida", x1: x, x2: x, y1: 56, y2: 460 }, svg);
    svgEl("rect", { x: x - 80, y: 12, width: 160, height: 44, rx: 12, ...(n === "Rede" ? { "stroke-dasharray": "4 4" } : {}) }, g);
    svgEl("text", { x, y: 35 }, g).textContent = n === "Rede" ? "☁  Rede" : n;
  }
  seq.camada = svgEl("g", {}, svg);
  const cont = svgEl("g", { class: "contador-pag", transform: `translate(${X.pag + 4},80)` }, svg);
  svgEl("rect", { x: -70, y: -14, width: 140, height: 28, rx: 14 }, cont);
  seq.contTx = svgEl("text", { x: 0, y: 5, "font-size": 13 }, cont);
  seq.cont = cont;
}
function setCobrancas(n, estado = "") {
  seq.contTx.textContent = `Cobranças: ${n}`;
  seq.cont.setAttribute("class", "contador-pag " + estado);
  seq.cont.animate([{ transform: `translate(${X.pag + 4}px,80px) scale(1.18)` }, { transform: `translate(${X.pag + 4}px,80px) scale(1)` }], { duration: 400, easing: "ease-out" });
}
async function mensagem(id, { de, para, y, rotulo, sub, classe = "ida", dur = 800, pararEm, chave }) {
  if (id !== seq.id) return false;
  const g = svgEl("g", { class: "msg " + classe }, seq.camada);
  const x2 = pararEm ?? para;
  const linha = svgEl("line", { x1: de, x2: de, y1: y, y2: y }, g);
  const pac = svgEl("circle", { cx: de, cy: y, r: 6, fill: "currentColor" }, g);
  pac.style.color = classe === "volta" || classe === "reuso" ? "var(--good)" : classe === "perdida" ? "var(--critical)" : "var(--accent-2)";
  pac.style.filter = "drop-shadow(0 0 6px currentColor)";
  const mx = (de + x2) / 2;
  const tx = svgEl("text", { x: mx, y: y - 12, "text-anchor": "middle", opacity: 0 }, g);
  tx.textContent = rotulo;
  if (sub) { const s = svgEl("text", { class: "sub", x: mx, y: y + 22, "text-anchor": "middle", opacity: 0 }, g); s.textContent = sub; s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" }); }
  tx.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" });
  if (chave) {
    const k = svgEl("g", { class: "chave", transform: `translate(${de + (para > de ? 18 : -18)},${y - 34})`, opacity: 0 }, g);
    svgEl("rect", { x: 0, y: -10, width: 102, height: 20, rx: 6 }, k);
    svgEl("text", { x: 8, y: 1 }, k).textContent = "🔑 " + chave;
    k.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "forwards" });
  }
  await new Promise((r) => tween(dur, (t) => {
    const x = de + (x2 - de) * t;
    linha.setAttribute("x2", x); pac.setAttribute("cx", x);
    if (t >= 1) r();
  }, easeInOut));
  if (id !== seq.id) return false;
  if (pararEm === undefined) {
    const s = Math.sign(para - de);
    svgEl("polygon", { points: `${para},${y} ${para - s * 10},${y - 5} ${para - s * 10},${y + 5}`, fill: "currentColor" }, g).style.color = pac.style.color;
    pac.animate([{ r: 6, opacity: 1 }, { r: 16, opacity: 0 }], { duration: 400, fill: "forwards" });
  } else {
    const xx = svgEl("text", { class: "marca-x", x: x2, y }, g);
    xx.textContent = "✕";
    pac.remove();
    xx.animate([{ transform: "scale(2)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 350, easing: "ease-out" });
    xx.style.transformBox = "fill-box"; xx.style.transformOrigin = "center";
  }
  return true;
}
async function relogio(id, y, rotulo) {
  if (id !== seq.id) return;
  const g = svgEl("g", { transform: `translate(${X.checkout - 52},${y})` }, seq.camada);
  svgEl("circle", { r: 13, fill: "none", stroke: "var(--border-2)", "stroke-width": 2.4 }, g);
  const arco = svgEl("circle", { class: "relogio", r: 13, transform: "rotate(-90)", "stroke-dasharray": "81.7", "stroke-dashoffset": "81.7" }, g);
  const t = svgEl("text", { x: 24, y: 5, "font-size": 13, fill: "var(--warning)", "font-weight": 600 }, g);
  t.textContent = rotulo;
  await new Promise((r) => tween(1100, (k) => { arco.setAttribute("stroke-dashoffset", 81.7 * (1 - k)); if (k >= 1) r(); }, (x) => x));
}
function veredito(id, texto, cor) {
  if (id !== seq.id) return;
  const g = svgEl("g", { opacity: 0 }, seq.camada);
  const t = svgEl("text", { x: 450, y: 440, "text-anchor": "middle", "font-size": 17, "font-weight": 700, fill: cor }, g);
  t.textContent = texto;
  g.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 500, fill: "forwards" });
}
async function tocarCena(cena) {
  const id = ++seq.id;
  seq.camada.innerHTML = "";
  $$(".cena-tab").forEach((b, i) => b.classList.toggle("on", i === cena));
  setCobrancas(0);
  const chave = cena === 2 ? "k-7f3a" : null;
  await sleep(250);
  if (!(await mensagem(id, { de: X.checkout, para: X.pag, y: 130, rotulo: "cobrar R$ 300", chave }))) return;
  setCobrancas(1, "");
  await sleep(250);
  if (!(await mensagem(id, { de: X.pag, para: X.checkout, y: 185, rotulo: "aprovado", classe: "perdida", pararEm: X.rede + 10, sub: "resposta perdida na volta", dur: 650 }))) return;
  await relogio(id, 240, "espera o timeout de 1 s…");
  if (id !== seq.id) return;
  if (cena === 0) {
    veredito(id, "O Checkout não sabe se cobrou: o resultado fica incerto.", "var(--warning)");
    return;
  }
  await sleep(200);
  if (!(await mensagem(id, { de: X.checkout, para: X.pag, y: 300, rotulo: "repete: cobrar R$ 300", chave }))) return;
  if (cena === 1) setCobrancas(2, "ruim");
  else setCobrancas(1, "bom");
  const nota = svgEl("text", { x: X.pag - 12, y: 336, "text-anchor": "end", "font-size": 13, "font-weight": 600, fill: cena === 1 ? "var(--critical)" : "var(--good)", opacity: 0 }, seq.camada);
  nota.textContent = cena === 1 ? "pedido “novo”: cobra de novo" : "chave já vista: devolve o resultado anterior";
  nota.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "forwards" });
  await sleep(450);
  if (!(await mensagem(id, { de: X.pag, para: X.checkout, y: 375, rotulo: "aprovado", classe: cena === 1 ? "volta" : "reuso", dur: 700 }))) return;
  veredito(id, cena === 1 ? "Pedido confirmado, mas o cliente pagou duas vezes (R$ 600)." : "Pedido confirmado e cobrado uma vez só (R$ 300).", cena === 1 ? "var(--critical)" : "var(--good)");
}
ganchos["s-problema"] = (b) => tocarCena(b);

/* ================================================================ 6 · Waffle */
const CATS = {
  ok: { nome: "Confirmada na 1ª tentativa", cor: "--neutral-cell", ic: "" },
  rec: { nome: "Recuperada pela repetição", cor: "--good", ic: "↻" },
  dup: { nome: "Cobrança duplicada", cor: "--critical", ic: "×2" },
  inc_cob: { nome: "Incerta e cobrada", cor: "--serious", ic: "?$" },
  inc: { nome: "Incerta, sem cobrança", cor: "--warning", ic: "?" },
};
const categoria = (c) => (c[1] > 1 ? "dup" : c[0] === 0 && c[1] >= 1 ? "inc_cob" : c[0] === 0 ? "inc" : c[2] >= 1000 ? "rec" : "ok");
const NOME_POL = { "1s": ["1 tentativa", "sem repetir"], "2s": ["2 tentativas", "sem chave"], "3s": ["3 tentativas", "sem chave"], "2c": ["2 tentativas", "com chave"], "3c": ["3 tentativas", "com chave"] };
let waffle = null;

function montarWaffle() {
  const pols = DADOS.parte1.novo;
  pols.forEach((p, i) => {
    const [n, s] = NOME_POL[p.id];
    const b = el("button", { class: "pol" }, `<b>${n}</b><span class="${p.com_chave ? "chave-tag" : p.tentativas > 1 ? "sem-tag" : ""}">${p.com_chave ? "🔑 " : ""}${s}</span>`, $("#politicas"));
    b.addEventListener("click", (e) => { e.currentTarget.blur(); definirBuild(i); });
  });
  $("#waffle-leg").innerHTML = Object.entries(CATS).map(([k, c]) =>
    `<span class="item"><span class="cor" style="background:var(${c.cor})"></span>${c.ic ? `<b class="icone">${c.ic}</b>` : ""}${c.nome}</span>`).join("");
  const M = [
    ["dup", "Duplicadas", "critico", "×2"],
    ["incertos", "Resultados incertos", "serio", "?"],
    ["csp", "Cobrado sem pedido", "serio", "?$"],
    ["rec", "Recuperadas pela repetição", "", "↻"],
  ];
  $("#metricas").innerHTML = M.map(([k, r, c, ic]) =>
    `<div class="metrica ${c}" id="m-${k}"><div class="rot">${ic ? `<b>${ic}</b>` : ""}${r}</div><div class="v num"><span>0</span><small>/ 2.000</small></div></div>`).join("");

  const canvas = $("#waffle");
  const ctx = canvas.getContext("2d");
  const COLS = 50, ROWS = 40;
  let pol = null, prog = 0, pararAnim = null, t0 = 0, cel = 10, gap = 2, revelado = [];

  function tamanho() {
    const w = canvas.parentElement.clientWidth - 36;
    const hDisp = innerHeight - 400;
    cel = Math.max(4, Math.floor(Math.min(w / COLS, hDisp / ROWS)));
    gap = cel >= 9 ? 2 : 1;
    const dpr = devicePixelRatio || 1;
    canvas.width = COLS * cel * dpr; canvas.height = ROWS * cel * dpr;
    canvas.style.width = COLS * cel + "px"; canvas.style.height = ROWS * cel + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function desenhar(agora) {
    if (!pol) return;
    const cores = Object.fromEntries(Object.entries(CATS).map(([k, c]) => [k, cssVar(c.cor)]));
    const vazio = cssVar("--surface-3");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = Math.floor(prog);
    let aneis = false;
    for (let i = 0; i < COLS * ROWS; i++) {
      const x = (i % COLS) * cel, y = Math.floor(i / COLS) * cel;
      const s = cel - gap;
      if (i >= n) { ctx.fillStyle = vazio; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.roundRect(x, y, s, s, 2); ctx.fill(); ctx.globalAlpha = 1; continue; }
      const k = pol.cat[i];
      ctx.fillStyle = cores[k];
      const idade = agora - (revelado[i] || 0);
      const novo = idade < 260;
      if (k === "ok") ctx.globalAlpha = novo ? 0.6 + 0.4 * (idade / 260) : 1;
      ctx.beginPath(); ctx.roundRect(x, y, s, s, 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (k !== "ok" && idade < 900) {
        aneis = true;
        const f = idade / 900;
        ctx.strokeStyle = cores[k]; ctx.lineWidth = 2; ctx.globalAlpha = 1 - f;
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s / 2 + f * cel * 2.2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    return aneis;
  }
  function metricas(n) {
    const c = { dup: 0, incertos: 0, csp: 0, rec: 0 };
    for (let i = 0; i < n; i++) {
      const p = pol.compras[i];
      if (p[1] > 1) c.dup++;
      if (p[0] === 0) c.incertos++;
      if (p[1] >= 1 && p[0] === 0) c.csp++;
      if (pol.cat[i] === "rec") c.rec++;
    }
    for (const k in c) {
      const v = $(`#m-${k} .v span`);
      if (v.textContent !== String(c[k])) {
        v.textContent = c[k];
        const m = $(`#m-${k}`); m.classList.remove("pisca"); void m.offsetWidth; m.classList.add("pisca");
      }
    }
    $("#waffle-prog").textContent = `${fmt(n)} / 2.000 compras · P95 ${fmt(pol.p95_ms)} ms · pior ${fmt(pol.pior_s, 1)} s`;
  }
  function selecionar(i, animar = true) {
    pol = DADOS.parte1.novo[i];
    pol.cat ||= pol.compras.map(categoria);
    $$(".pol").forEach((b, k) => b.classList.toggle("on", k === i));
    const [n, s] = NOME_POL[pol.id];
    $("#waffle-titulo").textContent = `${n} ${s}`;
    pararAnim?.();
    tamanho();
    $$("#metricas .v span").forEach((s) => (s.textContent = "0"));
    if (!animar) { prog = 2000; revelado = []; desenhar(performance.now() + 1e5); metricas(2000); return; }
    prog = 0; revelado = new Array(2000);
    t0 = performance.now();
    const DUR = 2600;
    let ativo = true;
    pararAnim = () => (ativo = false);
    const passo = (agora) => {
      if (!ativo) return;
      const t = Math.min(1, (agora - t0) / DUR);
      const alvo = 2000 * (t < 1 ? 1 - Math.pow(1 - t, 1.6) : 1);
      for (let k = Math.floor(prog); k < Math.floor(alvo); k++) revelado[k] = agora;
      prog = alvo;
      const aneis = desenhar(agora);
      metricas(Math.floor(prog));
      if (t < 1 || aneis) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  canvas.addEventListener("mousemove", (e) => {
    if (!pol) return;
    const r = canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / cel), l = Math.floor((e.clientY - r.top) / cel);
    const i = l * COLS + c;
    if (c < 0 || c >= COLS || i < 0 || i >= Math.floor(prog)) return esconderTip();
    const p = pol.compras[i], k = pol.cat[i];
    mostrarTip(`<b>Compra nº ${fmt(i + 1)}</b><div>${CATS[k].nome}</div><div class="t">${p[0] ? "confirmada" : "resultado incerto"} · ${p[1]} cobrança${p[1] === 1 ? "" : "s"} · ${fmt(p[2])} ms</div>`, e.clientX, e.clientY);
  });
  canvas.addEventListener("mouseleave", esconderTip);
  addEventListener("resize", () => pol && slides[idx].id === "s-ensaio" && (tamanho(), desenhar(performance.now() + 1e5)));
  waffle = { selecionar, redesenhar: () => pol && desenhar(performance.now() + 1e5) };
}
ganchos["s-ensaio"] = (b) => waffle.selecionar(b);

/* ================================================================ 7 · Comparação */
function montarComparacao() {
  const novo = DADOS.parte1.novo, base = Object.fromEntries(DADOS.parte1.base.map((p) => [p.id, p]));
  const painel = (alvo, campo) => {
    const max = Math.max(...novo.map((p) => p[campo]), ...DADOS.parte1.base.map((p) => p[campo])) * 1.08;
    $(alvo).innerHTML = novo.map((p) => {
      const [n, s] = NOME_POL[p.id];
      const bv = base[p.id]?.[campo];
      const tipTxt = `<b>${n} ${s}</b><div>Nosso cenário: ${p[campo]}</div><div class="t">${bv === undefined ? "política nova, sem equivalente na base" : `Base do professor: ${bv}`}</div>`;
      return `<div class="barra-linha" data-id="${p.id}" data-tip='${tipTxt}'>
        <span class="nome"><b>${n}</b> ${s}</span>
        <span class="trilho"><span class="b" data-w="${(100 * p[campo]) / max}"></span>${bv === undefined ? "" : `<span class="tick" style="left:0" data-l="${(100 * bv) / max}"></span>`}</span>
        <span class="val num" data-alvo="${p[campo]}">0</span></div>`;
    }).join("");
  };
  painel("#barras-dup", "duplicadas");
  painel("#barras-inc", "incertos");
}
ganchos["s-comparacao"] = (b, entrou) => {
  const linhas = $$("#s-comparacao .barra-linha");
  if (entrou) {
    linhas.forEach((l) => { $(".b", l).style.width = 0; const t = $(".tick", l); if (t) { t.style.left = 0; t.classList.remove("on"); } $(".val", l).dataset.v = 0; $(".val", l).textContent = "0"; });
    requestAnimationFrame(() => linhas.forEach((l, i) => setTimeout(() => {
      $(".b", l).style.width = $(".b", l).dataset.w + "%";
      const t = $(".tick", l); if (t) { t.style.left = t.dataset.l + "%"; t.classList.add("on"); }
      contar($(".val", l), +$(".val", l).dataset.alvo, { dur: 1000 });
    }, 200 + (i % 5) * 110)));
  }
  linhas.forEach((l) => {
    const foco = ["2s", "3s"].includes(l.dataset.id);
    l.classList.toggle("destaque", b >= 1 && foco);
    l.classList.toggle("esmaece", b >= 1 && !foco);
  });
};

/* ================================================================ 8 · Varredura */
const dumbs = {};
function montarDumbbell(svg, chave, { dominio, ticks, fmtV, unid }) {
  const v = DADOS.parte1.varredura;
  const W = 560, L = 84, R = 20, T = 6, RH = 23, H = T + v.length * RH + 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (val) => L + ((val - dominio[0]) / (dominio[1] - dominio[0])) * (W - L - R);
  const grid = svgEl("g", { class: "grid" }, svg), eixo = svgEl("g", { class: "eixo" }, svg);
  for (const t of ticks) {
    svgEl("line", { x1: x(t), x2: x(t), y1: T, y2: H - 26 }, grid);
    svgEl("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, eixo).textContent = fmtV(t);
  }
  const linhas = v.map((s, i) => {
    const y = T + i * RH + RH / 2;
    const b = s[chave + "_base"], n = s[chave + "_novo"];
    const g = svgEl("g", {}, svg);
    g.dataset.tip = `<b>Semente ${s.semente}</b><div>Base: ${fmtV(b)}${unid}</div><div>Nosso: ${fmtV(n)}${unid}</div>`;
    svgEl("rect", { class: "hit", x: 0, y: y - RH / 2, width: W, height: RH }, g);
    svgEl("text", { class: "rotulo", x: L - 14, y }, g).textContent = `Semente ${s.semente}`;
    const liga = svgEl("line", { class: "liga", x1: x(b), x2: x(b), y1: y, y2: y }, g);
    const pb = svgEl("circle", { class: "pb", cx: x(b), cy: y, r: 6 }, g);
    const pn = svgEl("circle", { class: "pn", cx: x(b), cy: y, r: 7, opacity: 0 }, g);
    return { liga, pb, pn, xb: x(b), xn: x(n) };
  });
  dumbs[svg.id] = {
    reset() { linhas.forEach((l) => { l.pn.setAttribute("cx", l.xb); l.pn.setAttribute("opacity", 0); l.liga.setAttribute("x2", l.xb); l.pb.setAttribute("opacity", 0); }); },
    tocar() {
      linhas.forEach((l, i) => {
        setTimeout(() => {
          l.pb.setAttribute("opacity", 1);
          l.pb.animate([{ r: 0 }, { r: 6 }], { duration: 300 });
          setTimeout(() => {
            l.pn.setAttribute("opacity", 1);
            tween(900, (t) => { const xx = l.xb + (l.xn - l.xb) * t; l.pn.setAttribute("cx", xx); l.liga.setAttribute("x2", xx); }, easeInOut);
          }, 250);
        }, i * 70);
      });
    },
    final() { linhas.forEach((l) => { l.pb.setAttribute("opacity", 1); l.pn.setAttribute("opacity", 1); l.pn.setAttribute("cx", l.xn); l.liga.setAttribute("x2", l.xn); }); },
  };
}
const varEstado = { p95: false, dup: false };
ganchos["s-varredura"] = (b, entrou) => {
  if (entrou) {
    dumbs["dumb-p95"].reset(); dumbs["dumb-dup"].reset(); varEstado.p95 = varEstado.dup = false;
    if (b >= 1) { dumbs["dumb-p95"].final(); varEstado.p95 = true; }
    if (b >= 2) { dumbs["dumb-dup"].final(); varEstado.dup = true; }
  }
  if (!varEstado.p95) { varEstado.p95 = true; setTimeout(() => dumbs["dumb-p95"].tocar(), 300); }
  if (b >= 1 && !varEstado.dup) { varEstado.dup = true; setTimeout(() => dumbs["dumb-dup"].tocar(), 300); }
};

/* ================================================================ 9 · Decisão */
function montarDecisao() {
  const p = Object.fromEntries(DADOS.parte1.novo.map((x) => [x.id, x]));
  const itens = [
    { v: p["3c"].duplicadas, suf: "", r: "compras com cobrança duplicada", c: `sem chave, 3 tentativas: ${p["3s"].duplicadas}`, cor: "var(--good)" },
    { v: p["3c"].incertos, suf: "", r: "resultado incerto", c: `com 1 tentativa: ${p["1s"].incertos}`, cor: "var(--text)" },
    { v: p["3c"].pior_s, suf: " s", r: "pior tempo de espera", c: `com 1 tentativa: ${fmt(p["1s"].pior_s)} s`, cor: "var(--serious)" },
  ];
  $("#hero-decisao").innerHTML = itens.map((it, i) =>
    `<div class="cartao" data-build="0" style="transition-delay:${i * 120}ms"><div class="v num" style="color:${it.cor}" data-alvo="${it.v}" data-suf="${it.suf}">0</div><div class="r">${it.r}</div><div class="compara">${it.c}</div></div>`).join("");
}
ganchos["s-decisao1"] = (b, entrou) => {
  if (!entrou) return;
  $$("#hero-decisao .v").forEach((v, i) => { v.dataset.v = i === 0 ? 21 : i === 1 ? 31 : 0; setTimeout(() => contar(v, +v.dataset.alvo, { dur: 1300, suf: v.dataset.suf }), 200 + i * 120); });
};

/* ================================================================ 10 · Formas */
let gFormas;
const EXPLICA = {
  monolito: "Tudo num artefato só: <b>nenhuma dependência cruza a rede</b>.",
  extracao: "As 4 remotas são as entradas de <b>Pedidos, Pagamentos, Logística e Integrações</b> em Notificações. O Checkout continua sem nenhuma chamada remota direta.",
  dominio: "Só <b>Checkout → Pedidos</b> e <b>Promoções → Catálogo</b> ficam internas: 17 − 2 = <b>15 remotas</b>.",
  micro: "Cada componente é um artefato: <b>as 17 dependências viram chamadas de rede</b>, 5 delas saindo direto do Checkout.",
};
const SUB_FORMA = { monolito: "1 artefato", extracao: "2 artefatos", dominio: "8 módulos", micro: "10 serviços" };
function rotuloForma(fid) {
  return (art, membros) => {
    if (fid === "micro") return null;
    if (membros.length < 2) return null;
    return fid === "dominio" ? MOD_NOME[art] || art : art;
  };
}
function montarFormas() {
  gFormas = criarGrafo($("#grafo-formas"));
  gFormas.origem(DADOS.parte2.origem);
  DADOS.parte2.formas.forEach((f, i) => {
    const b = el("button", { class: "forma-tab" }, `${f.nome}<small>${SUB_FORMA[f.id]}</small>`, $("#formas-tabs"));
    b.addEventListener("click", (e) => { e.currentTarget.blur(); definirBuild(i); });
  });
  $("#stats-forma").innerHTML = [
    ["artefatos", "Artefatos"], ["remotas", "Dependências remotas"], ["diretas", "Remotas diretas do Checkout"], ["quanta_sincrono", "Quanta (tudo síncrono)"],
  ].map(([k, r]) => `<div class="metrica" id="f-${k}"><div class="rot">${r}</div><div class="v num"><span>0</span></div></div>`).join("");
}
ganchos["s-formas"] = (b) => {
  const f = DADOS.parte2.formas[b];
  $$(".forma-tab").forEach((t, i) => t.classList.toggle("on", i === b));
  gFormas.forma(f.artefato_de, { rotulo: rotuloForma(f.id) });
  gFormas.remotas(f.arestas_remotas);
  for (const k of ["artefatos", "remotas", "diretas", "quanta_sincrono"]) contar($(`#f-${k} .v span`), f[k], { dur: 800 });
  const ex = $("#explica-forma");
  ex.style.opacity = 0;
  setTimeout(() => { ex.innerHTML = EXPLICA[f.id]; ex.style.opacity = 1; }, 200);
};

/* ================================================================ 11 · Custos */
function montarCustos() {
  const fs = DADOS.parte2.formas;
  const max = Math.max(...fs.map((f) => f.minutos)) * 1.4;
  $("#custo-tab").innerHTML = `<thead><tr><th>Forma</th><th class="n">Artefatos tocados <span style=\"text-transform:none\">(k)</span></th><th class="n">Chamadas diretas <span style=\"text-transform:none\">(n)</span></th><th class="n">Chance de falha</th><th class="n">Disponibilidade</th><th>Minutos fora por mês</th></tr></thead><tbody>` +
    fs.map((f, i) => `<tr data-build="0" style="transition-delay:${i * 90}ms" class="${f.minutos === fs[0].minutos ? "melhor" : ""}"
      data-tip="<b>${f.nome}</b><div>k = ${f.tocados} → A = 0,999^${f.tocados} = ${pct(f.disponibilidade)}</div><div>n = ${f.diretas} → P = 1 − 0,99^${f.diretas} = ${pct(f.p_falha)}</div>">
      <td>${f.nome}</td><td class="n num">${f.tocados}</td><td class="n num">${f.diretas}</td><td class="n num">${pct(f.p_falha)}</td><td class="n num">${pct(f.disponibilidade)}</td>
      <td><span class="trilho"><span class="b" data-w="${(100 * f.minutos) / max}"></span><span class="lbl num" data-alvo="${f.minutos}">0</span></span></td></tr>`).join("") + "</tbody>";
}
let custosTocados = false;
ganchos["s-custos"] = (b, entrou) => {
  const barras = $$("#custo-tab .b"), lbls = $$("#custo-tab .lbl");
  if (entrou || b < 1) {
    custosTocados = false;
    barras.forEach((x) => (x.style.width = 0));
    lbls.forEach((l) => { l._para?.(); l.dataset.v = 0; l.textContent = ""; });
  }
  if (b >= 1 && !custosTocados) {
    custosTocados = true;
    barras.forEach((x, i) => setTimeout(() => {
      x.style.width = x.dataset.w + "%";
      contar(lbls[i], +lbls[i].dataset.alvo, { dur: 1100, dec: 2 });
    }, 250 + i * 140));
  }
};

/* ================================================================ 12 · Quanta */
let gQuanta;
const qEstado = { forma: "extracao", banco: "unico", async: new Set(), msg: null, req: 0 };
function montarQuanta() {
  gQuanta = criarGrafo($("#grafo-quanta"), { interativo: true });
  for (const id in gQuanta.ars) {
    gQuanta.ars[id].g.addEventListener("click", () => {
      qEstado.async.has(id) ? qEstado.async.delete(id) : qEstado.async.add(id);
      qEstado.msg = null;
      atualizarQuanta();
    });
  }
  const formas = $("#q-forma");
  DADOS.parte2.formas.forEach((f) => {
    const b = el("button", { "data-f": f.id }, f.nome.replace("Só Notificações separado", "Extração"), formas);
    b.addEventListener("click", () => { qEstado.forma = f.id; qEstado.msg = null; atualizarQuanta(); });
  });
  [["unico", "Compartilhado"], ["servico", "Um por serviço"]].forEach(([k, n]) => {
    const b = el("button", { "data-b": k }, n, $("#q-banco"));
    b.addEventListener("click", () => { qEstado.banco = k; qEstado.msg = null; atualizarQuanta(); });
  });
  const presets = [
    ["Tudo síncrono", () => new Set()],
    ["As 4 entradas de Notificações por fila", () => new Set(ENTRADAS())],
    ["Isolar Clientes (2 arestas)", () => new Set(["Portal>Clientes", "Checkout>Clientes"])],
    ["Tudo assíncrono", () => new Set(DADOS.parte2.arestas)],
  ];
  presets.forEach(([n, fn]) => {
    const b = el("button", {}, n, $("#q-presets"));
    b.addEventListener("click", () => { qEstado.async = fn(); qEstado.msg = null; atualizarQuanta(); });
  });
}
function mensagemQuanta(r) {
  const { banco, async: as, forma } = qEstado;
  if (qEstado.msg) return qEstado.msg;
  if (r.quanta === 1 && as.size === 0) return ["Tudo síncrono: o grafo segue conectado, e há <b>um único quantum</b> em qualquer forma.", "ruim"];
  if (r.quanta === 1 && banco === "unico") return ["As filas não bastam: <b>o banco compartilhado ainda liga todos os componentes</b>.", "ruim"];
  if (r.quanta === 1) {
    const faltam = ENTRADAS().filter((e) => !as.has(e));
    if (forma !== "monolito" && faltam.length && faltam.length < 4) return [`Ainda há entrada síncrona em Notificações (<b>${faltam.map(seta).join(", ")}</b>), e ela basta para manter tudo num quantum.`, "ruim"];
    if (forma === "monolito") return ["No monólito, tudo vive no mesmo artefato: <b>sempre um quantum</b>.", "ruim"];
    return ["Ainda existe um caminho síncrono ligando todos os componentes.", "ruim"];
  }
  const menores = r.grupos.slice(1).map((g) => g.map((c) => NOME[c]).join(" + "));
  if (r.grupos.some((g) => g.length === 1 && g[0] === "Notificacoes"))
    return [`<b>${r.quanta} quanta.</b> Notificações executa sozinha: falhas no envio dos avisos não param a compra.`, "bom"];
  return [`<b>${r.quanta} quanta.</b> Executam separados: ${menores.slice(0, 4).join("; ")}${menores.length > 4 ? "…" : ""}.`, "bom"];
}
async function atualizarQuanta() {
  const { forma, banco, async: as } = qEstado;
  $$("#q-forma button").forEach((b) => b.classList.toggle("on", b.dataset.f === forma));
  $$("#q-banco button").forEach((b) => b.classList.toggle("on", b.dataset.b === banco));
  const f = DADOS.parte2.formas.find((x) => x.id === forma);
  gQuanta.forma(f.artefato_de, { rotulo: rotuloForma(forma), dur: 700 });
  gQuanta.async(as);
  const req = ++qEstado.req;
  const q = new URLSearchParams({ forma, banco, assincronas: [...as].join(",") });
  let r;
  try { r = await (await fetch("/api/quanta?" + q)).json(); } catch (e) { console.error(e); return; }
  if (req !== qEstado.req || r.erro) return;
  gQuanta.quanta(r.grupos, banco);
  const num = $("#q-num");
  if (num.textContent !== String(r.quanta)) {
    num.textContent = r.quanta;
    num.animate([{ transform: "scale(1.35)", color: "var(--accent-2)" }, { transform: "scale(1)" }], { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  $("#q-u").textContent = r.quanta === 1 ? "quantum" : "quanta";
  const [txt, tom] = mensagemQuanta(r);
  const m = $("#q-msg");
  m.innerHTML = txt; m.className = "mensagem " + tom;
  const pill = banco === "unico" ? `<span class="banco"><i style="background:var(--text-2)"></i>Banco compartilhado: liga todos</span>` : `<span class="banco"><i style="background:var(--accent-2)"></i>Um banco por serviço</span>`;
  $("#q-leg").innerHTML = pill + r.grupos.map((g, i) => `<span><i style="background:var(${i < SERIES.length ? SERIES[i] : "--ref"})"></i>Q${i + 1} · ${g.length > 3 ? g.length + " componentes" : g.map((c) => NOME[c]).join(", ")}</span>`).join("");
}
const ETAPAS_QUANTA = [
  { forma: "extracao", banco: "unico", async: () => [], msg: null },
  { forma: "extracao", banco: "unico", async: () => ENTRADAS(), msg: null },
  { forma: "extracao", banco: "servico", async: () => ENTRADAS(), msg: null },
  { forma: "extracao", banco: "servico", async: () => ENTRADAS().filter((e) => e !== "Integracoes>Notificacoes"), msg: null },
  { forma: "micro", banco: "servico", async: () => ["Portal>Clientes", "Checkout>Clientes"],
    msg: ["Nos microsserviços, o menor corte tem <b>duas arestas</b>: Portal → Clientes e Checkout → Clientes isolam Clientes. Nenhuma aresta sozinha basta. É uma possibilidade do grafo, <b>não uma recomendação</b>.", "bom"] },
];
ganchos["s-quanta"] = (b) => {
  const e = ETAPAS_QUANTA[b];
  Object.assign(qEstado, { forma: e.forma, banco: e.banco, async: new Set(e.async()), msg: e.msg });
  atualizarQuanta();
};

/* ================================================================ 13 · Matriz */
function montarMatriz() {
  const cols = [["⇄", "Síncrono", "banco único"], ["≡", "Filas", "banco único"], ["⇄", "Síncrono", "bancos separados"], ["≡", "Filas", "bancos separados"]];
  $("#matriz").innerHTML = `<thead><tr><th></th>${cols.map(([i, a, b]) => `<th><span class="ic">${i}</span>${a}<br>${b}</th>`).join("")}</tr></thead><tbody>` +
    DADOS.parte2.matriz_quanta.map((f, r) => `<tr><th class="linha">${f.nome}</th>${f.valores.map((v, c) =>
      `<td class="num ${v > 1 ? "dois" : ""}" style="transition-delay:${(r * 4 + c) * 60}ms" data-tip="<b>${f.nome}</b><div>${cols[c][1]}, ${cols[c][2]}</div><div class='t'>${v} quant${v === 1 ? "um" : "a"}</div>">${v}</td>`).join("")}</tr>`).join("") + "</tbody>";
}
ganchos["s-matriz"] = (b, entrou) => {
  const tds = $$("#matriz td"), m = $("#matriz");
  if (entrou) { tds.forEach((t) => t.classList.remove("on")); m.classList.remove("foco"); void m.offsetWidth; requestAnimationFrame(() => tds.forEach((t) => t.classList.add("on"))); }
  m.classList.toggle("foco", b >= 1);
};

/* ================================================================ Início */
async function iniciar() {
  try { const t = localStorage.getItem("tema"); if (t) document.documentElement.dataset.theme = t; } catch (_) {}
  try {
    DADOS = await (await fetch("/api/dados")).json();
  } catch (erro) {
    $("#carregando").innerHTML = `<div style="text-align:center;color:var(--text-2)"><h2>Servidor indisponível</h2><p>Rode <code>python apresentacao/server.py</code> ou <code>docker compose up</code>.</p></div>`;
    return;
  }
  montarCapa();
  gCenario = criarGrafo($("#grafo-cenario"));
  gCenario.mostrarNos(false);
  Object.values(gCenario.ars).forEach(({ g }) => g.classList.add("desenhando"));
  montarHipoteses();
  montarSequencia();
  montarWaffle();
  montarComparacao();
  montarDumbbell($("#dumb-p95"), "p95", { dominio: [150, 380], ticks: [150, 200, 250, 300, 350], fmtV: (v) => fmt(v), unid: " ms" });
  montarDumbbell($("#dumb-dup"), "dup", { dominio: [0.005, 0.016], ticks: [0.006, 0.008, 0.01, 0.012, 0.014, 0.016], fmtV: (v) => pct(v), unid: "" });
  montarDecisao();
  montarFormas();
  montarCustos();
  montarQuanta();
  montarMatriz();
  montarMoldura();
  const lerHash = () => {
    const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
    return m ? [+m[1] - 1, m[2] ? +m[2] : 0] : [0, 0];
  };
  addEventListener("hashchange", () => {
    const [i, b] = lerHash();
    if (i !== idx || b !== build) ir(i, b);
  });
  $("#carregando").classList.add("fora");
  ir(...lerHash(), true);
}
iniciar();
