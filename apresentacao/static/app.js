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
  if (dur <= 0) { fn(1, 1); return () => {}; }
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
  ajustarEscala();
  try { ganchos[s.id]?.(b, entrou); } catch (erro) { console.error(erro); }
  atualizarMoldura();
  history.replaceState(null, "", `#${i + 1}.${b}`);
}
// Se o conteúdo for mais alto que a tela, reduz o slide inteiro em vez de invadir o cabeçalho.
function ajustarEscala() {
  const s = slides[idx], c = $(".conteudo", s);
  if (!c) return;
  c.style.zoom = 1;
  if (innerWidth <= 720) return;
  const cs = getComputedStyle(s);
  const disp = s.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  c.style.zoom = Math.max(0.5, Math.min(1, disp / c.scrollHeight));
}
addEventListener("resize", () => slides.length && ajustarEscala());
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
    else if (e.key.toLowerCase() === "r") zerarCronometro();
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
  atualizarOrador();
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
  const cartao = (a) => `<div class="aluno cartao"><span class="avatar">${iniciais(a.nome)}</span><span class="aluno-txt"><span>${a.nome}</span><small>${a.partes}</small></span></div>`;
  $("#alunos").innerHTML = alunos.map(cartao).join("");
  $("#creditos").innerHTML = alunos.map(cartao).join("");
  NOMES_ORADOR = Object.fromEntries(alunos.map((a) => [a.id, a.nome]));

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
    { rot: "Mediana da rede", v: h.novo.mediana_ms, suf: " ms", antes: `${h.base.mediana_ms} ms`, dir: "sobe", org: "inv", por: "Comunicação rápida, mas com mais sobrecarga que a base." },
    { rot: "P99 da rede", v: h.novo.p99_ms, suf: " ms", antes: `${h.base.p99_ms} ms`, dir: "sobe", org: "inv", por: "Cauda longa por contenção." },
    { rot: "Falha sorteada", v: h.novo.falha * 100, suf: "%", antes: pct(h.base.falha, 0), dir: "desce", org: "inv", por: "Menos perdas que na campanha original. Na Parte 2, 1% por chamada." },
    { rot: "Timeout por chamada", v: h.timeout_s, suf: " s", antes: "mantido", dir: "igual", org: "prof", por: `${pct(h.novo.perda_na_volta, 0)} das falhas sorteadas perdem a resposta na volta.` },
    { rot: "Amostra", v: h.compras, suf: "", unid: "compras", antes: "mantida", dir: "igual", org: "prof", por: `Semente ${h.semente}, e uma varredura das sementes 1 a 10.` },
    { rot: "Disponibilidade", v: q.disponibilidade * 100, dec: 1, suf: "%", unid: "por artefato", antes: "mantida", dir: "igual", org: "aula", por: `Mês de 30 dias = ${fmt(q.minutos_mes)} minutos.` },
  ];
  const grade = $("#hip-grade");
  cards.forEach((c, i) => {
    const seta = { sobe: "↑ maior", desce: "↓ menor", igual: "= igual" }[c.dir];
    const d = el("div", { class: "cartao hip", "data-build": "0", style: `transition-delay:${i * 90}ms` }, `
      <div class="rot">${c.rot}<span class="fonte ${c.org}">${{ inv: "inventado por nós", prof: "padrão do professor", aula: "hipótese da Aula 17" }[c.org]}</span></div>
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
  seq.cena = cena;
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
ganchos["s-problema"] = (b, entrou) => {
  if (b <= 2) return tocarCena(b);
  if (entrou || seq.cena !== 2) tocarCena(2);
};

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
    b.addEventListener("click", (e) => { e.currentTarget.blur(); waffle.selecionar(i); });
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
    const hDisp = Math.max(innerHeight - 330, 240);
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
    const esc = r.width / (COLS * cel);
    const c = Math.floor((e.clientX - r.left) / esc / cel), l = Math.floor((e.clientY - r.top) / esc / cel);
    const i = l * COLS + c;
    if (c < 0 || c >= COLS || i < 0 || i >= Math.floor(prog)) return esconderTip();
    const p = pol.compras[i], k = pol.cat[i];
    mostrarTip(`<b>Compra nº ${fmt(i + 1)}</b><div>${CATS[k].nome}</div><div class="t">${p[0] ? "confirmada" : "resultado incerto"} · ${p[1]} cobrança${p[1] === 1 ? "" : "s"} · ${fmt(p[2])} ms</div>`, e.clientX, e.clientY);
  });
  canvas.addEventListener("mouseleave", esconderTip);
  addEventListener("resize", () => pol && slides[idx].id === "s-ensaio" && (tamanho(), desenhar(performance.now() + 1e5)));
  waffle = { selecionar, redesenhar: () => pol && desenhar(performance.now() + 1e5) };
}
// Etapas: 1 tentativa, 2 sem chave, 3 sem chave, 3 com chave (2 com chave fica na aba).
const ETAPAS_ENSAIO = [0, 1, 2, 4];
ganchos["s-ensaio"] = (b) => waffle.selecionar(ETAPAS_ENSAIO[b]);

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
  const foco = b === 1 ? ["2s", "3s"] : b >= 2 ? ["3c"] : [];
  linhas.forEach((l) => {
    l.classList.toggle("destaque", foco.includes(l.dataset.id));
    l.classList.toggle("esmaece", foco.length > 0 && !foco.includes(l.dataset.id));
  });
};
function montarResultado() {
  const p = Object.fromEntries(DADOS.parte1.novo.map((x) => [x.id, x]));
  const v = DADOS.parte1.varredura.map((x) => x.dup_novo);
  $("#callout-previsao").textContent = `Previsão confirmada: de 2 para 3 tentativas sem chave, as duplicações sobem de ${p["2s"].duplicadas} para ${p["3s"].duplicadas} e os incertos caem de ${p["2s"].incertos} para ${p["3s"].incertos}.`;
  $("#decisao-faixa").innerHTML = `
    <div class="df-esq"><span class="rot">Escolha</span><b>Até 3 tentativas com a mesma chave</b></div>
    <div class="df-num"><b style="color:var(--good)">${p["3c"].duplicadas}</b><span>duplicadas</span></div>
    <div class="df-num"><b>${p["3c"].incertos}</b><span>incerto</span></div>
    <div class="df-num"><b style="color:var(--serious)">${fmt(p["3c"].pior_s)} s</b><span>pior caso</span></div>
    <div class="df-custo">Custa espera e o registro das chaves, e o incerto ainda pede conciliação. Em 10 sementes sem chave, as duplicações ficam entre ${pct(Math.min(...v))} e ${pct(Math.max(...v))}: mudar as hipóteses não elimina o problema.</div>`;
}

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
  // Contagem manual do relatório (artefatos, remotas, diretas do Checkout, quanta síncronos),
  // comparada aqui com o que o meu_quantum.py calcula agora.
  const MANUAL = { monolito: [1, 0, 0, 1], extracao: [2, 4, 0, 1], dominio: [8, 15, 4, 1], micro: [10, 17, 5, 1] };
  const difere = DADOS.parte2.formas.filter((f) => MANUAL[f.id].join() !== [f.artefatos, f.remotas, f.diretas, f.quanta_sincrono].join());
  $("#conferido").innerHTML = difere.length
    ? `<span class="x">✗</span> Contagem manual difere do código em: ${difere.map((f) => f.nome).join(", ")}`
    : `<span class="ok">✓</span> A contagem manual do relatório bate com o <code>meu_quantum.py</code> nas 4 formas · 84 testes passando`;
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

/* ================================================================ 12 · Quanta */
let gQuanta;
const qEstado = { req: 0 };
// Três etapas, sempre na forma "Só Notificações separado".
const ETAPAS_QUANTA = [
  { filas: false, banco: "unico", msg: ["Tudo síncrono e um banco só: <b>1 quantum</b>. Se Notificações cair, a compra sente.", "ruim"] },
  { filas: true, banco: "unico", msg: ["Com as filas, mas o <b>banco ainda é compartilhado</b>: continua 1 quantum.", "ruim"] },
  { filas: true, banco: "servico", msg: ["Filas <b>e</b> banco próprio: Notificações vira um <b>quantum separado</b>. Uma falha no aviso não para a compra.", "bom"] },
];
function montarQuanta() {
  gQuanta = criarGrafo($("#grafo-quanta"));
  const f = DADOS.parte2.formas.find((x) => x.id === "extracao");
  gQuanta.forma(f.artefato_de, { rotulo: rotuloForma("extracao"), dur: 0 });
}
async function atualizarQuanta(e) {
  const as = new Set(e.filas ? ENTRADAS() : []);
  gQuanta.async(as);
  $$("#q-check li").forEach((li) => li.classList.toggle("on", li.dataset.c === "filas" ? e.filas : e.banco === "servico"));
  const m = $("#q-msg");
  m.innerHTML = e.msg[0]; m.className = "mensagem " + e.msg[1];
  const flags = (e.filas ? ` --assincronas "${[...as].join(",")}"` : "") + (e.banco === "servico" ? " --banco-por-servico" : "");
  const req = ++qEstado.req;
  const q = new URLSearchParams({ forma: "extracao", banco: e.banco, assincronas: [...as].join(",") });
  let r;
  try { r = await (await fetch("/api/quanta?" + q)).json(); } catch (erro) { console.error(erro); return; }
  if (req !== qEstado.req || r.erro) return;
  gQuanta.quanta(r.grupos, e.banco);
  const num = $("#q-num");
  if (num.textContent !== String(r.quanta)) {
    num.textContent = r.quanta;
    num.animate([{ transform: "scale(1.35)", color: "var(--accent-2)" }, { transform: "scale(1)" }], { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  $("#q-u").textContent = r.quanta === 1 ? "quantum" : "quanta";
  const cmd = `python meu_quantum.py${flags || " --banco-unico"}`.replace(/</g, "&lt;");
  const cli = $("#q-cli");
  cli.dataset.tip = `<b>Comando completo</b><div class="mono">${cmd}</div>`;
  cli.innerHTML = `<div class="linha-cmd"><span class="pr">$</span> ${cmd}</div><span class="saida">So Notificacoes … Q filas = <b>${r.quanta}</b></span>`;
  $("#q-leg").innerHTML = r.grupos.map((g, i) => `<span><i style="background:var(${SERIES[i]})"></i>${g.length > 3 ? g.length + " componentes" : g.map((c) => NOME[c]).join(", ")}</span>`).join("")
    + `<span class="banco"><i style="background:${e.banco === "unico" ? "var(--text-2)" : "var(--accent-2)"}"></i>${e.banco === "unico" ? "1 banco para todos" : "1 banco por serviço"}</span>`;
}
ganchos["s-quanta"] = (b) => atualizarQuanta(ETAPAS_QUANTA[b]);

/* ================================================================ Orador e cronômetro */
let NOMES_ORADOR = {};
const cron = {};
function atualizarOrador() {
  const quem = slides[idx].dataset.quem;
  $("#orador").classList.toggle("on", !!quem);
  if (!quem) return;
  if (!cron[quem]) {
    // Quem começa a falar inicia o próprio tempo e congela o de quem falou antes.
    const agora = Date.now();
    for (const k in cron) cron[k].fim ??= agora;
    cron[quem] = { ini: agora, fim: null };
  }
  $("#orador-nome").textContent = NOMES_ORADOR[quem] || "";
  tique();
}
function tique() {
  const quem = slides[idx]?.dataset.quem;
  if (!quem || !cron[quem]) return;
  const ms = (cron[quem].fim ?? Date.now()) - cron[quem].ini;
  const seg = Math.floor(ms / 1000);
  const c = $("#cronometro");
  c.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
  c.className = "num " + (seg >= 420 ? "estourou" : seg >= 360 ? "aviso" : "");
}
function zerarCronometro() {
  const quem = slides[idx].dataset.quem;
  if (quem) { cron[quem] = { ini: Date.now(), fim: null }; tique(); }
}

/* ================================================================ Parte 3 · Três falhas */
const FALHAS = [
  { tit: "Cai na ida", sub: "O pedido nem chega ao servidor.", mini: "<code>PERDA_NA_IDA</code>", chave: "Nunca viu a chave: <b>processa</b> normalmente." },
  { tit: "Cai durante o processamento", sub: "O servidor para no meio do trabalho.", mini: "Não simulado: a cobrança do Mini-Orion é atômica.", chave: "Parou no meio: <b>retoma</b> o trabalho." },
  { tit: "A resposta se perde", sub: "A operação termina, a volta falha.", mini: "<code>PERDA_NA_VOLTA</code>", chave: "Já terminou: <b>devolve o resultado guardado</b>, sem cobrar de novo." },
];
const minis = [];
function montarFalhas() {
  const box = $("#falhas");
  FALHAS.forEach((f, i) => {
    const c = el("div", { class: "cartao falha", "data-build": String(i) }, `
      <div class="falha-topo"><span class="n">${i + 1}</span><div><h3>${f.tit}</h3><p class="nota">${f.sub}</p></div></div>
      <svg viewBox="0 0 320 128"></svg>
      <div class="falha-mini"><span class="rot">No Mini-Orion</span>${f.mini}</div>
      <div class="falha-chave"><span>🔑</span><span>${f.chave}</span></div>`, box);
    minis.push(montarMini($("svg", c), i + 1));
  });
}
function montarMini(svg, tipo) {
  const XC = 46, XS = 274;
  svgEl("text", { x: XC, y: 14, "text-anchor": "middle", class: "mini-ator" }, svg).textContent = "Cliente";
  svgEl("text", { x: XS, y: 14, "text-anchor": "middle", class: "mini-ator" }, svg).textContent = "Servidor";
  for (const x of [XC, XS]) svgEl("line", { x1: x, x2: x, y1: 24, y2: 124, class: "mini-vida" }, svg);
  svgEl("rect", { x: XS - 8, y: 48, width: 16, height: 52, rx: 4, class: "mini-srv" }, svg);
  const enche = svgEl("rect", { x: XS - 8, y: 48, width: 16, height: 0, rx: 4, fill: "var(--accent-2)" }, svg);
  const ida = svgEl("line", { x1: XC, x2: XC, y1: 46, y2: 46, stroke: "var(--accent-2)", "stroke-width": 2.4 }, svg);
  const volta = svgEl("line", { x1: XS, x2: XS, y1: 104, y2: 104, stroke: "var(--good)", "stroke-width": 2.4 }, svg);
  const xis = svgEl("text", { class: "marca-x", "text-anchor": "middle", "dominant-baseline": "central", opacity: 0 }, svg);
  xis.textContent = "✕";
  const alvoX = tipo === 1 ? 160 : XS - 8;
  const pos = tipo === 1 ? [160, 46] : tipo === 2 ? [XS, 74] : [160, 104];
  xis.setAttribute("x", pos[0]); xis.setAttribute("y", pos[1]);
  let token = 0;
  const reset = () => {
    ida.setAttribute("x2", XC); volta.setAttribute("x2", XS); volta.setAttribute("opacity", 0);
    enche.setAttribute("height", 0); enche.setAttribute("fill", "var(--accent-2)"); xis.setAttribute("opacity", 0);
  };
  const mostrarX = () => { xis.setAttribute("opacity", 1); xis.animate([{ opacity: 0, transform: "scale(2)" }, { opacity: 1, transform: "scale(1)" }], { duration: 350 }); };
  const anim = (dur, fn) => new Promise((r) => tween(dur, (t) => { fn(t); if (t >= 1) r(); }, easeInOut));
  return {
    async tocar() {
      const id = ++token; reset();
      xis.style.transformBox = "fill-box"; xis.style.transformOrigin = "center";
      await anim(650, (t) => ida.setAttribute("x2", XC + (alvoX - XC) * t));
      if (id !== token) return;
      if (tipo === 1) return mostrarX();
      const h = tipo === 2 ? 26 : 52;
      await anim(500, (t) => enche.setAttribute("height", h * t));
      if (id !== token) return;
      if (tipo === 2) { enche.setAttribute("fill", "var(--critical)"); return mostrarX(); }
      enche.setAttribute("fill", "var(--good)");
      volta.setAttribute("opacity", 1);
      await anim(550, (t) => volta.setAttribute("x2", XS + (160 - XS) * t));
      if (id === token) mostrarX();
    },
    final() {
      ++token; reset();
      ida.setAttribute("x2", alvoX);
      if (tipo >= 2) enche.setAttribute("height", tipo === 2 ? 26 : 52);
      if (tipo === 2) enche.setAttribute("fill", "var(--critical)");
      if (tipo === 3) { enche.setAttribute("fill", "var(--good)"); volta.setAttribute("opacity", 1); volta.setAttribute("x2", 160); }
      xis.setAttribute("opacity", 1);
    },
  };
}
const falhasTocadas = new Set();
ganchos["s-falhas"] = (b, entrou) => {
  if (entrou) falhasTocadas.clear();
  for (let i = 0; i <= Math.min(b, 2); i++) {
    if (falhasTocadas.has(i)) continue;
    falhasTocadas.add(i);
    if (entrou && i < b) minis[i].final();
    else setTimeout(() => minis[i].tocar(), 350);
  }
  $$("#falhas .falha").forEach((c, i) => c.classList.toggle("par", b >= 3 && i !== 1));
};

/* ================================================================ Parte 3 · Repetições em massa */
function aleatorio(semente) {
  return () => { semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Ilustração, não medição: 40 clientes falham juntos em t = 0, o timeout é 1 s
// e o servidor atende no máximo 8 pedidos a cada 0,25 s.
function simularCarga(jitter) {
  const N = 40, CAP = 8, BIN = 0.25, rnd = aleatorio(11);
  let pend = Array.from({ length: N }, () => ({ t: 1, k: 0 }));
  if (jitter) pend.forEach((p) => (p.t = 1 + rnd() * 1));
  const bins = [];
  let recusas = 0, fim = 0;
  for (let i = 0; pend.length && i < 60; i++) {
    const t0 = i * BIN, t1 = t0 + BIN;
    const aqui = pend.filter((p) => p.t >= t0 && p.t < t1);
    pend = pend.filter((p) => !(p.t >= t0 && p.t < t1));
    const ok = Math.min(CAP, aqui.length), no = aqui.length - ok;
    bins.push({ t0, ok, no });
    if (ok) fim = t1;
    recusas += no;
    aqui.slice(ok).forEach((p) => pend.push({ t: t0 + 1 + (jitter ? rnd() * 1 * 2 ** (p.k + 1) : 0), k: p.k + 1 }));
  }
  return { bins, recusas, fim, CAP, BIN };
}
const cargas = {};
function montarCarga(svg, jitter) {
  const sim = simularCarga(jitter);
  const W = 520, H = 190, L = 34, B = 26, T = 8, TMAX = 6, YMAX = 40;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = (t) => L + (t / TMAX) * (W - L - 8), y = (v) => H - B - (v / YMAX) * (H - B - T);
  for (const v of [0, 20, 40]) {
    svgEl("line", { x1: L, x2: W - 8, y1: y(v), y2: y(v), class: "carga-grid" }, svg);
    svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "carga-eixo" }, svg).textContent = v;
  }
  for (let t = 0; t <= TMAX; t++) svgEl("text", { x: x(t), y: H - 8, "text-anchor": "middle", class: "carga-eixo" }, svg).textContent = t + " s";
  const bw = x(sim.BIN) - x(0) - 2;
  const barras = sim.bins.filter((b) => b.ok + b.no).map((b) => {
    const g = svgEl("g", {}, svg);
    g.dataset.tip = `<b>${fmt(b.t0, 2)}–${fmt(b.t0 + sim.BIN, 2)} s</b><div>${b.ok} atendidas · ${b.no} recusadas</div>`;
    const ok = svgEl("rect", { x: x(b.t0) + 1, width: bw, y: y(0), height: 0, rx: 2, fill: "var(--s1)" }, g);
    const no = svgEl("rect", { x: x(b.t0) + 1, width: bw, y: y(0), height: 0, rx: 2, fill: "var(--critical)" }, g);
    return { b, ok, no };
  });
  svgEl("line", { x1: L, x2: W - 8, y1: y(sim.CAP), y2: y(sim.CAP), class: "carga-cap" }, svg);
  svgEl("text", { x: W - 10, y: y(sim.CAP) - 6, "text-anchor": "end", class: "carga-cap-txt" }, svg).textContent = "capacidade";
  const cabeca = svgEl("line", { x1: L, x2: L, y1: T, y2: H - B, class: "carga-cabeca", opacity: 0 }, svg);
  const desenhar = (tAgora) => {
    for (const { b, ok, no } of barras) {
      const f = Math.max(0, Math.min(1, (tAgora - b.t0) / 0.3));
      const hOk = (y(0) - y(b.ok)) * f, hNo = (y(0) - y(b.no)) * f;
      ok.setAttribute("y", y(0) - hOk); ok.setAttribute("height", Math.max(0, hOk - (b.no ? 1 : 0)));
      no.setAttribute("y", y(0) - hOk - hNo); no.setAttribute("height", Math.max(0, hNo - 1));
    }
    cabeca.setAttribute("x1", x(Math.min(tAgora, TMAX))); cabeca.setAttribute("x2", x(Math.min(tAgora, TMAX)));
  };
  return {
    sim,
    tocar() { cabeca.setAttribute("opacity", 1); tween(3200, (t) => { desenhar(t * TMAX); if (t >= 1) cabeca.setAttribute("opacity", 0); }, (k) => k); },
    final() { desenhar(TMAX + 1); cabeca.setAttribute("opacity", 0); },
    zerar() { desenhar(-1); },
  };
}
function montarTempestade() {
  const p = Object.fromEntries(DADOS.parte1.novo.map((x) => [x.id, x]));
  $("#tempestade-lead").innerHTML = `O ensaio sorteia cada falha de forma independente e não modela carga, por isso repetir na hora funciona: os incertos caem de <b>${p["1s"].incertos}</b> (uma tentativa) para <b>${p["3c"].incertos}</b> (três com chave). Numa <b>falha comum</b>, a história é outra.`;
  cargas.hora = montarCarga($("#carga-hora"), false);
  cargas.jitter = montarCarga($("#carga-jitter"), true);
  for (const [k, c] of Object.entries(cargas))
    $(k === "hora" ? "#res-hora" : "#res-jitter").innerHTML = `Todos atendidos em <b>${fmt(c.sim.fim, 2)} s</b> · <b>${c.sim.recusas}</b> recusas`;
}
const cargaTocada = { hora: false, jitter: false };
ganchos["s-tempestade"] = (b, entrou) => {
  if (entrou) { cargaTocada.hora = cargaTocada.jitter = false; cargas.hora.zerar(); cargas.jitter.zerar(); }
  const fila = [["hora", 0], ["jitter", 1]];
  for (const [k, n] of fila) {
    if (b < n || cargaTocada[k]) continue;
    cargaTocada[k] = true;
    if (entrou && b > n) cargas[k].final();
    else setTimeout(() => cargas[k].tocar(), 400);
  }
};

/* ================================================================ Parte 4 · ADR */
ganchos["s-adr-decisao"] = (b) => $("#s-adr-decisao .decisao-card").classList.toggle("carimbou", b >= 2);

function montarAlternativas() {
  const fs = Object.fromEntries(DADOS.parte2.formas.map((f) => [f.id, f]));
  const mq = Object.fromEntries(DADOS.parte2.matriz_quanta.map((m) => [m.id, m.valores]));
  const alts = [
    { nome: "Monólito modular", sub: "Notificações no mesmo artefato", f: fs.monolito, q: mq.monolito[0], qn: "", decisao: true,
      custa: "Continua 1 quantum; mudar Notificações exige implantar tudo.", gatilho: "A condição de falseamento." },
    { nome: "B completa", sub: "4 entradas em fila + banco próprio", f: fs.extracao, q: mq.extracao[3], qn: "a única que separa a execução",
      custa: "Fila, banco e chave por evento.", gatilho: "A medição confirmar o motivador." },
    { nome: "B só no deploy", sub: "síncrono ou banco compartilhado", f: fs.extracao, q: mq.extracao[0], qn: "separa a implantação, não a falha",
      custa: "A mais barata; já publica Notificações sozinha.", gatilho: "O motivador virar cadência de release." },
    { nome: "D · por domínio", sub: "8 serviços", f: fs.dominio, q: mq.dominio[0], qn: `${mq.dominio[3]} só com filas e bancos separados`,
      custa: `${fs.dominio.remotas} remotas e ${fs.dominio.diretas} chamadas diretas do Checkout.`, gatilho: "Vários domínios com motivadores comprovados." },
  ];
  const max = Math.max(...alts.map((a) => a.f.minutos)) * 1.15;
  $("#alternativas").innerHTML = alts.map((a, i) => `
    <div class="cartao alt ${a.decisao ? "escolhida" : ""}" data-build="${i}">
      ${a.decisao ? `<span class="selo-dec">✓ Decisão</span>` : ""}
      <h3>${a.nome}</h3><p class="nota">${a.sub}</p>
      <div class="alt-q"><span class="v num">${a.q}</span><span>quant${a.q === 1 ? "um" : "a"}</span></div>
      <p class="alt-qn">${a.qn || "&nbsp;"}</p>
      <dl>
        <dt>Artefatos</dt><dd class="num">${a.f.artefatos}</dd>
        <dt>Dependências remotas</dt><dd class="num">${a.f.remotas}</dd>
        <dt>Chamadas diretas do Checkout</dt><dd class="num">${a.f.diretas}</dd>
        <dt>Falha por compra</dt><dd class="num">${pct(a.f.p_falha)}</dd>
        <dt>Disponibilidade</dt><dd class="num">${pct(a.f.disponibilidade)}</dd>
      </dl>
      <div class="alt-min"><span>Fora por mês</span><b class="num">${fmt(a.f.minutos, 2)} min</b></div>
      <span class="trilho"><span class="b" data-w="${(100 * a.f.minutos) / max}"></span></span>
      <p class="alt-linha"><b>Custa:</b> ${a.custa}</p>
      <p class="alt-linha"><b>Gatilho:</b> ${a.gatilho}</p>
    </div>`).join("");
}
ganchos["s-adr-alternativas"] = (b, entrou) => {
  const cards = $$("#alternativas .alt");
  cards.forEach((c, i) => {
    const barra = $(".b", c);
    if (entrou || i > b) barra.style.width = 0;
    if (i <= b) setTimeout(() => (barra.style.width = barra.dataset.w + "%"), entrou ? 300 + i * 120 : 300);
  });
};

function montarCusto() {
  const m = DADOS.parte2.formas.find((f) => f.id === "monolito");
  const p3c = DADOS.parte1.novo.find((x) => x.id === "3c");
  const tiles = [
    [m.artefatos, 0, "", "artefato"], [m.remotas, 0, "", "dependências remotas"], [m.p_falha * 100, 2, "%", "falha de rede por compra"],
    [m.disponibilidade * 100, 2, "%", "disponibilidade"], [m.minutos, 2, "", "min/mês fora do ar"],
  ];
  $("#tiles-custo").innerHTML = tiles.map(([v, d, suf, r], i) =>
    `<div class="cartao tile" data-build="0" style="transition-delay:${i * 80}ms"><b class="num" data-alvo="${v}" data-dec="${d}" data-suf="${suf}">0</b><span>${r}</span></div>`).join("");
  const c = $("#custo-parte1");
  c.dataset.build = "2";
  c.innerHTML = `<b>A Parte 1 só valeria depois de extrair</b>Até 3 tentativas com a mesma chave nas 4 entradas: pior caso de ${fmt(p3c.pior_s)} s, registro de chaves e ${p3c.incertos} incerto em ${fmt(2000)} compras para conciliar.`;
}
ganchos["s-adr-custo"] = (b, entrou) => {
  if (!entrou) return;
  $$("#tiles-custo b").forEach((v, i) => { v.dataset.v = 0; setTimeout(() => contar(v, +v.dataset.alvo, { dur: 1000, dec: +v.dataset.dec, suf: v.dataset.suf }), 150 + i * 80); });
};

ganchos["s-adr-falseamento"] = (b, entrou) => {
  const f = $("#s-adr-falseamento .falseia");
  if (entrou) { f.classList.remove("rodando"); void f.offsetWidth; }
  f.classList.toggle("rodando", b >= 1);
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
  // Cada slide monta separado: um erro num deles não trava a apresentação inteira.
  const etapas = [
    montarCapa,
    () => {
      gCenario = criarGrafo($("#grafo-cenario"));
      gCenario.mostrarNos(false);
      Object.values(gCenario.ars).forEach(({ g }) => g.classList.add("desenhando"));
    },
    montarHipoteses, montarSequencia, montarWaffle, montarComparacao, montarResultado, montarFormas,
    montarQuanta, montarFalhas, montarTempestade, montarAlternativas, montarCusto,
  ];
  for (const etapa of etapas) {
    try { etapa(); } catch (erro) { console.error(`Falha ao montar (${etapa.name || "cenário"}):`, erro); }
  }
  setInterval(tique, 500);
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
