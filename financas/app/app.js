'use strict';

// ---------- Constantes e utilitários ----------

const CHAVE_DADOS = 'financas.dados.v1';
const CHAVE_UI = 'financas.ui.v1';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS = { entrada: 'Entrada', saida: 'Saída', imposto: 'Imposto' };
// As categorias de imposto são fixas porque os cálculos dependem delas.
const CATEGORIAS_IMPOSTO = ['IVA', 'Segurança Social', 'IRS', 'Outros impostos'];

const VERSAO = 2;
const VISTAS = { resumo: 'Resumo', movimentos: 'Movimentos', fixas: 'Despesas fixas', impostos: 'Impostos', personalizacao: 'Personalização', definicoes: 'Definições' };
// Cores de destaque: [cor, texto sobre a cor] para modo claro e escuro.
const CORES = {
  grafite: { nome: 'Grafite', claro: ['#0b0b0b', '#fcfcfb'], escuro: ['#f0efec', '#121211'] },
  dourado: { nome: 'Dourado', claro: ['#86682f', '#ffffff'], escuro: ['#c9a96e', '#121211'] },
  azul: { nome: 'Azul', claro: ['#2563c9', '#ffffff'], escuro: ['#5b9cf0', '#0d1420'] },
  verde: { nome: 'Verde', claro: ['#1d7a4f', '#ffffff'], escuro: ['#4cbf86', '#0d1a13'] },
  bordeaux: { nome: 'Bordeaux', claro: ['#8e2b3f', '#ffffff'], escuro: ['#e07a8f', '#1a0d10'] },
  violeta: { nome: 'Violeta', claro: ['#5b46c9', '#ffffff'], escuro: ['#9a8af0', '#120f22'] },
};

const padrao = () => ({
  versao: VERSAO,
  definicoes: { iva: 23, irs: 23, ssTaxa: 21.4, ssBase: 70 },
  categorias: {
    entrada: ['Fotografia', 'Vídeo', 'Edição', 'Outros rendimentos'],
    saida: ['Casa', 'Contas da casa', 'Comida', 'Transporte', 'Saúde', 'Equipamento', 'Software e serviços', 'Lazer', 'Outros'],
  },
  personalizacao: { nome: 'Finanças', tema: 'auto', cor: 'grafite', vistaInicial: 'ultima', periodoInicial: 'mes' },
  fixas: [],
  movimentos: [],
});

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const eurCurto = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const fmt = v => eur.format(Math.abs(v) < 0.005 ? 0 : v || 0);
const arred = v => Math.round((v + Number.EPSILON) * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const doisDig = n => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`; };
const dataPt = iso => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const mesChave = d => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}`;
const mesPt = chave => { const [a, m] = chave.split('-'); return `${MESES[+m - 1]} ${a}`; };
const diasNoMes = (a, m) => new Date(a, m, 0).getDate();
const proximoMes = chave => { let [a, m] = chave.split('-').map(Number); if (++m > 12) { m = 1; a++; } return `${a}-${doisDig(m)}`; };

// ---------- Dados ----------

let precisaGuardar = false;
let exemplosRemovidos = 0;

function carregar() {
  let texto = null;
  try { texto = localStorage.getItem(CHAVE_DADOS); } catch { return padrao(); }
  if (!texto) return padrao();
  try {
    return lerDados(JSON.parse(texto));
  } catch {
    // Guarda o conteúdo ilegível à parte para não o perder ao gravar por cima.
    try { localStorage.setItem(CHAVE_DADOS + '.ilegivel.' + Date.now(), texto); } catch {}
    return padrao();
  }
}

// Converte dados guardados ou importados para o formato atual.
function lerDados(bruto) {
  const d = normalizar(bruto);
  if (!(bruto.versao >= VERSAO)) {
    exemplosRemovidos += removerExemplos(d);
    precisaGuardar = true;
  }
  return d;
}

function normalizar(d) {
  const p = padrao();
  const cat = d.categorias || {};
  const mesValido = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
  return {
    versao: VERSAO,
    definicoes: { ...p.definicoes, ...(d.definicoes || {}) },
    categorias: {
      entrada: Array.isArray(cat.entrada) && cat.entrada.length ? cat.entrada : p.categorias.entrada,
      saida: Array.isArray(cat.saida) && cat.saida.length ? cat.saida : p.categorias.saida,
    },
    personalizacao: { ...p.personalizacao, ...(d.personalizacao || {}) },
    fixas: (Array.isArray(d.fixas) ? d.fixas : [])
      .filter(f => f && TIPOS[f.tipo] && mesValido(f.inicio) && Number.isFinite(+f.valor))
      .map(f => ({
        ...f, id: f.id || novoId(), valor: +f.valor, dia: Math.min(31, Math.max(1, +f.dia || 1)),
        fim: mesValido(f.fim) ? f.fim : '', retomada: mesValido(f.retomada) ? f.retomada : '',
        ativa: f.ativa !== false, iva: +f.iva || 0, irs: +f.irs || 0, geradas: Array.isArray(f.geradas) ? f.geradas : [],
      })),
    movimentos: (Array.isArray(d.movimentos) ? d.movimentos : [])
      .filter(m => m && TIPOS[m.tipo] && /^\d{4}-\d{2}-\d{2}$/.test(m.data) && Number.isFinite(+m.valor))
      .map(m => ({ ...m, valor: +m.valor, iva: +m.iva || 0, irs: +m.irs || 0, id: m.id || novoId() })),
  };
}

// A versão 1 tinha um botão que criava movimentos de exemplo. São reconhecidos
// pela descrição e por terem sido criados todos no mesmo instante (em lote).
const ASSINATURA_EXEMPLO = new Set([
  'saida|Casa|Renda', 'saida|Contas da casa|Luz, água e internet', 'saida|Comida|Supermercado',
  'saida|Software e serviços|Adobe Creative Cloud', 'saida|Transporte|Combustível', 'saida|Equipamento|Objetiva 35mm',
  'entrada|Fotografia|Sessão de fotografia', 'entrada|Vídeo|Vídeo institucional', 'entrada|Fotografia|Casamento',
  'imposto|Segurança Social|Contribuição mensal', 'imposto|IVA|Entrega de IVA do trimestre',
]);

function removerExemplos(d) {
  const candidatos = d.movimentos.filter(m => !m.fixaId && ASSINATURA_EXEMPLO.has(`${m.tipo}|${m.categoria}|${m.descricao}`));
  const emLote = m => candidatos.filter(o => Math.abs((o.criado || 0) - (m.criado || 0)) < 2000).length >= 10;
  const remover = new Set(candidatos.filter(emLote).map(m => m.id));
  d.movimentos = d.movimentos.filter(m => !remover.has(m.id));
  return remover.size;
}

function guardar() {
  try { localStorage.setItem(CHAVE_DADOS, JSON.stringify(estado)); }
  catch (e) { alert('Não foi possível guardar os dados: ' + e.message); }
}

function carregarUI() {
  try { return JSON.parse(localStorage.getItem(CHAVE_UI)) || {}; } catch { return {}; }
}
function guardarUI() {
  try { localStorage.setItem(CHAVE_UI, JSON.stringify({ vista })); } catch {}
}

let estado = carregar();
const agora = new Date();
const inicial = estado.personalizacao;
let vista = inicial.vistaInicial === 'ultima' ? carregarUI().vista : inicial.vistaInicial;
if (!VISTAS[vista]) vista = 'resumo';
// mes 0 = ano inteiro
const periodo = { ano: agora.getFullYear(), mes: inicial.periodoInicial === 'ano' ? 0 : agora.getMonth() + 1 };
const filtros = { texto: '', tipo: '' };
let idEmEdicao = null;
let fixaEmEdicao = null;

// ---------- Despesas fixas ----------

// Primeiro mês a considerar: o início ou, se foi pausada e retomada, o mês em que foi retomada.
const inicioEfetivo = f => (f.retomada && f.retomada > f.inicio ? f.retomada : f.inicio);

// Meses em falta até hoje (inclui o mês atual só quando o dia já chegou).
function mesesPendentes(f, ref = new Date()) {
  const atual = mesChave(ref);
  const pendentes = [];
  if (!f.ativa) return pendentes;
  for (let k = inicioEfetivo(f); k <= atual && (!f.fim || k <= f.fim); k = proximoMes(k)) {
    if (f.geradas.includes(k)) continue;
    const [a, m] = k.split('-').map(Number);
    const dia = Math.min(f.dia, diasNoMes(a, m));
    if (k === atual && dia > ref.getDate()) continue;
    pendentes.push({ k, data: `${k}-${doisDig(dia)}` });
  }
  return pendentes;
}

function gerarFixas() {
  let novos = 0;
  for (const f of estado.fixas) {
    for (const { k, data } of mesesPendentes(f)) {
      estado.movimentos.push({
        id: novoId(), criado: Date.now(), fixaId: f.id, tipo: f.tipo, categoria: f.categoria, descricao: f.descricao,
        valor: f.valor, data, iva: f.tipo === 'entrada' ? f.iva : 0, irs: f.tipo === 'entrada' ? f.irs : 0, notas: '',
      });
      f.geradas.push(k);
      novos++;
    }
  }
  if (novos) guardar();
  return novos;
}

function proximoLancamento(f) {
  if (!f.ativa) return null;
  let k = inicioEfetivo(f);
  const atual = mesChave(new Date());
  if (k < atual) k = atual;
  for (let i = 0; i < 24 && (!f.fim || k <= f.fim); i++, k = proximoMes(k)) {
    if (f.geradas.includes(k)) continue;
    const [a, m] = k.split('-').map(Number);
    return `${k}-${doisDig(Math.min(f.dia, diasNoMes(a, m)))}`;
  }
  return null;
}

// ---------- Aparência ----------

const mqEscuro = matchMedia('(prefers-color-scheme: dark)');

function aplicarAparencia() {
  const p = estado.personalizacao;
  const root = document.documentElement;
  if (p.tema === 'claro') root.dataset.theme = 'light';
  else if (p.tema === 'escuro') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  const escuro = p.tema === 'escuro' || (p.tema === 'auto' && mqEscuro.matches);
  const [cor, tinta] = (CORES[p.cor] || CORES.grafite)[escuro ? 'escuro' : 'claro'];
  root.style.setProperty('--accent', cor);
  root.style.setProperty('--accent-ink', tinta);
  const nome = p.nome.trim() || 'Finanças';
  $('.marca').textContent = nome;
  document.title = nome;
}
mqEscuro.addEventListener('change', aplicarAparencia);

let temporizadorAviso;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 6000);
}

// ---------- Cálculos ----------

// Entradas: o valor é a base sem IVA. O cliente paga base + IVA e retém o IRS.
// Saídas e impostos: o valor é o total pago.
function valores(m) {
  if (m.tipo !== 'entrada') return { base: 0, iva: 0, irs: 0, liquido: -m.valor };
  const base = m.valor;
  const iva = arred(base * (m.iva || 0) / 100);
  const irs = arred(base * (m.irs || 0) / 100);
  return { base, iva, irs, liquido: arred(base + iva - irs) };
}

const noPeriodo = (m, ano, mes) => m.data.startsWith(String(ano)) && (!mes || +m.data.slice(5, 7) === mes);
const doPeriodo = () => estado.movimentos.filter(m => noPeriodo(m, periodo.ano, periodo.mes));
const ordenar = lista => [...lista].sort((a, b) => b.data.localeCompare(a.data) || (b.criado || 0) - (a.criado || 0));

function totais(lista) {
  const d = estado.definicoes;
  const t = { faturado: 0, ivaCobrado: 0, irsRetido: 0, recebido: 0, despesas: 0, impostos: 0, ivaPago: 0, ssPago: 0, irsPago: 0, porCategoria: {} };
  for (const m of lista) {
    const v = valores(m);
    if (m.tipo === 'entrada') {
      t.faturado += v.base; t.ivaCobrado += v.iva; t.irsRetido += v.irs; t.recebido += v.liquido;
    } else if (m.tipo === 'saida') {
      t.despesas += m.valor;
      t.porCategoria[m.categoria] = (t.porCategoria[m.categoria] || 0) + m.valor;
    } else {
      t.impostos += m.valor;
      if (m.categoria === 'IVA') t.ivaPago += m.valor;
      else if (m.categoria === 'Segurança Social') t.ssPago += m.valor;
      else if (m.categoria === 'IRS') t.irsPago += m.valor;
    }
  }
  t.ssEstimada = t.faturado * d.ssBase / 100 * d.ssTaxa / 100;
  t.ivaPorEntregar = Math.max(0, t.ivaCobrado - t.ivaPago);
  t.ssPorPagar = Math.max(0, t.ssEstimada - t.ssPago);
  t.saldo = t.recebido - t.despesas - t.impostos;
  t.aPagar = t.ivaPorEntregar + t.ssPorPagar;
  // O que fica realmente para ti: já descontados os impostos pagos e os que ainda estão por pagar.
  t.livre = t.saldo - t.aPagar;
  return t;
}

// ---------- Moldura (navegação e período) ----------

function preencherPeriodo() {
  const anos = new Set([agora.getFullYear(), agora.getFullYear() + 1, periodo.ano]);
  estado.movimentos.forEach(m => anos.add(+m.data.slice(0, 4)));
  const ordenados = [...anos].sort((a, b) => b - a);
  $('#sel-ano').innerHTML = ordenados.map(a => `<option value="${a}"${a === periodo.ano ? ' selected' : ''}>${a}</option>`).join('');
  $('#sel-mes').innerHTML = `<option value="0"${periodo.mes === 0 ? ' selected' : ''}>Ano inteiro</option>` +
    MESES_LONGOS.map((n, i) => `<option value="${i + 1}"${periodo.mes === i + 1 ? ' selected' : ''}>${n}</option>`).join('');
  // O separador Impostos é sempre anual.
  const semPeriodo = ['fixas', 'personalizacao', 'definicoes'].includes(vista);
  $('#sel-mes').hidden = semPeriodo || vista === 'impostos';
  $('#sel-ano').hidden = semPeriodo;
}

function nomePeriodo() {
  return periodo.mes ? `${MESES_LONGOS[periodo.mes - 1]} ${periodo.ano}` : String(periodo.ano);
}

function render() {
  $$('#nav button').forEach(b => b.classList.toggle('ativo', b.dataset.vista === vista));
  $('#titulo').textContent = VISTAS[vista];
  preencherPeriodo();
  esconderTooltip();
  ({ resumo: renderResumo, movimentos: renderMovimentos, fixas: renderFixas, impostos: renderImpostos, personalizacao: renderPersonalizacao, definicoes: renderDefinicoes }[vista])();
}

// ---------- Resumo ----------

function cartao(rotulo, valor, sub = '', classe = '') {
  return `<div class="cartao ${classe}"><div class="rot">${rotulo}</div>
    <div class="val${valor < 0 ? ' negativo' : ''}">${fmt(valor)}</div><div class="sub">${sub}</div></div>`;
}

function linha(nome, valor, nota = '', classe = '') {
  return `<div class="linha ${classe}"><span class="l-nome">${nome}${nota ? `<small>${nota}</small>` : ''}</span>
    <span class="num${valor < 0 ? ' negativo' : ''}">${fmt(valor)}</span></div>`;
}

function vazio(texto, botoes = '') {
  return `<div class="vazio">${texto}${botoes ? `<div class="botoes">${botoes}</div>` : ''}</div>`;
}

const BOTOES_INICIO = '<button class="primario" data-acao="novo">+ Novo movimento</button><button data-acao="nova-fixa">+ Nova despesa fixa</button>';

function renderResumo() {
  const lista = doPeriodo();
  const t = totais(lista);
  const semDados = estado.movimentos.length === 0;

  $('#conteudo').innerHTML = `
    <section class="cartoes">
      ${cartao('Recebido', t.recebido, `Faturado ${fmt(t.faturado)} sem IVA`)}
      ${cartao('Despesas', t.despesas, `${lista.filter(m => m.tipo === 'saida').length} movimentos`)}
      ${cartao('Impostos a pagar', t.aPagar, `IVA ${fmt(t.ivaPorEntregar)} · SS ${fmt(t.ssPorPagar)} · já pagos ${fmt(t.impostos)}`)}
      ${cartao('Saldo (fica para ti)', t.livre, 'recebido − despesas − impostos pagos e a pagar', 'destaque')}
    </section>

    ${semDados ? `<section class="painel">${vazio('Ainda não tens movimentos registados. Regista o primeiro, ou configura a renda, contas e subscrições como despesas fixas para serem lançadas sozinhas.', BOTOES_INICIO)}</section>` : ''}

    <div class="duas">
      <section class="painel">
        <h2>Entradas e saídas por mês <small>${periodo.ano}</small></h2>
        ${graficoMensal(periodo.ano)}
      </section>
      <section class="painel">
        <h2>Impostos a pagar <small>${nomePeriodo()}</small></h2>
        <div class="linhas">
          ${linha('IVA por entregar', t.ivaPorEntregar, `cobrado ${fmt(t.ivaCobrado)} − entregue ${fmt(t.ivaPago)}`)}
          ${linha('Segurança Social por pagar', t.ssPorPagar, `estimativa ${fmt(t.ssEstimada)} − paga ${fmt(t.ssPago)}`)}
          ${linha('Total a pagar', t.aPagar, 'reserva este valor; não é teu', 'total')}
          ${linha('IRS já retido pelos clientes', t.irsRetido, 'adiantamento ao IRS anual (informativo)')}
          ${linha('Saldo antes de impostos a pagar', t.saldo, 'recebido − despesas − impostos já pagos')}
        </div>
      </section>
    </div>

    <div class="duas">
      <section class="painel">
        <h2>Últimos movimentos <small>${nomePeriodo()}</small></h2>
        ${lista.length ? tabelaMovimentos(ordenar(lista).slice(0, 8), false) : vazio('Sem movimentos neste período.')}
      </section>
      <section class="painel">
        <h2>Despesas por categoria <small>${nomePeriodo()}</small></h2>
        ${barrasCategorias(t.porCategoria)}
      </section>
    </div>`;
  ligarGrafico();
}

function maximoRedondo(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}

// Caminho de barra com os cantos de cima arredondados (base assente no eixo).
function barra(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

let dadosMensais = [];

function graficoMensal(ano) {
  dadosMensais = MESES.map((nome, i) => {
    const t = totais(estado.movimentos.filter(m => noPeriodo(m, ano, i + 1)));
    return { i, nome, entradas: t.recebido, saidas: t.despesas + t.impostos, saldo: t.saldo };
  });
  const maior = Math.max(...dadosMensais.flatMap(d => [d.entradas, d.saidas]));
  if (maior <= 0) return vazio(`Sem movimentos em ${ano}.`);

  const W = 640, H = 230, ml = 58, mr = 4, mt = 8, mb = 22;
  const pw = W - ml - mr, ph = H - mt - mb, gw = pw / 12;
  const bw = Math.min(16, (gw - 8) / 2);
  const topo = maximoRedondo(maior);
  const y = v => mt + ph - (v / topo) * ph;

  let svg = '';
  for (let k = 0; k <= 4; k++) {
    const v = topo * k / 4, yy = y(v);
    svg += `<line class="grelha-l" x1="${ml}" x2="${W - mr}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="eixo" x="${ml - 8}" y="${yy + 4}" text-anchor="end">${eurCurto.format(v)}</text>`;
  }
  for (const d of dadosMensais) {
    const x0 = ml + gw * d.i + (gw - 2 * bw - 2) / 2;
    svg += `<rect class="alvo" data-i="${d.i}" x="${ml + gw * d.i}" y="${mt}" width="${gw}" height="${ph}" rx="4"/>`;
    svg += `<path class="s1" d="${barra(x0, y(d.entradas), bw, mt + ph - y(d.entradas))}" pointer-events="none"/>`;
    svg += `<path class="s2" d="${barra(x0 + bw + 2, y(d.saidas), bw, mt + ph - y(d.saidas))}" pointer-events="none"/>`;
    svg += `<text class="eixo" x="${ml + gw * d.i + gw / 2}" y="${H - 6}" text-anchor="middle">${d.nome}</text>`;
  }

  const linhasTabela = dadosMensais.map(d => `<tr><td>${MESES_LONGOS[d.i]}</td><td class="num">${fmt(d.entradas)}</td><td class="num">${fmt(d.saidas)}</td><td class="num">${fmt(d.saldo)}</td></tr>`).join('');
  return `
    <div class="legenda"><span><i style="background:var(--series-1)"></i>Entradas (recebido)</span><span><i style="background:var(--series-2)"></i>Saídas (despesas + impostos)</span></div>
    <div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês em ${ano}">${svg}</svg></div>
    <details><summary>Ver como tabela</summary><div class="tabela-wrap"><table>
      <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead>
      <tbody>${linhasTabela}</tbody></table></div></details>`;
}

function ligarGrafico() {
  $$('.grafico .alvo').forEach(r => {
    r.addEventListener('mousemove', e => {
      const d = dadosMensais[+r.dataset.i];
      $$('.grafico .alvo').forEach(o => o.classList.toggle('ativo', o === r));
      mostrarTooltip(e, `<b>${MESES_LONGOS[d.i]} ${periodo.ano}</b>
        <div><span><i style="background:var(--series-1)"></i>Entradas</span><span class="num">${fmt(d.entradas)}</span></div>
        <div><span><i style="background:var(--series-2)"></i>Saídas</span><span class="num">${fmt(d.saidas)}</span></div>
        <div><span>Saldo</span><span class="num">${fmt(d.saldo)}</span></div>`);
    });
    r.addEventListener('mouseleave', () => { r.classList.remove('ativo'); esconderTooltip(); });
  });
}

function mostrarTooltip(e, html) {
  const tt = $('#tooltip');
  tt.innerHTML = html;
  tt.hidden = false;
  const { offsetWidth: w, offsetHeight: h } = tt;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 14;
  if (y + h > innerHeight - 8) y = e.clientY - h - 14;
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}
function esconderTooltip() { $('#tooltip').hidden = true; }

function barrasCategorias(porCategoria) {
  const itens = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  if (!itens.length) return vazio('Sem despesas neste período.');
  const total = itens.reduce((s, [, v]) => s + v, 0);
  const maior = itens[0][1];
  return `<div class="barras">${itens.map(([c, v]) => `
    <div class="bl"><span class="bl-nome" title="${esc(c)}">${esc(c)}</span>
      <span class="bl-trilho"><span class="bl-barra" style="width:${(v / maior * 100).toFixed(1)}%"></span></span>
      <span class="bl-valor">${fmt(v)}<small>${Math.round(v / total * 100)}%</small></span></div>`).join('')}</div>`;
}

// ---------- Movimentos ----------

function tabelaMovimentos(lista, comAcoes) {
  const linhas = lista.map(m => {
    const v = valores(m);
    const ent = m.tipo === 'entrada';
    return `<tr>
      <td>${dataPt(m.data)}</td>
      <td>${esc(m.descricao)}${m.fixaId ? ' <span class="etiqueta" title="Lançada automaticamente como despesa fixa">fixa</span>' : ''}${m.notas ? `<small>${esc(m.notas)}</small>` : ''}</td>
      <td>${esc(m.categoria)}</td>
      <td><span class="tipo ${m.tipo}"><i></i>${TIPOS[m.tipo]}</span></td>
      ${comAcoes ? `<td class="num">${fmt(m.valor)}</td>
      <td class="num">${ent ? fmt(v.iva) : '—'}</td>
      <td class="num">${ent ? fmt(-v.irs) : '—'}</td>` : ''}
      <td class="num${v.liquido < 0 ? ' negativo' : ''}">${v.liquido > 0 ? '+' : ''}${fmt(v.liquido)}</td>
      ${comAcoes ? `<td class="acoes-l">
        <button class="link" data-acao="editar" data-id="${m.id}">Editar</button>
        <button class="link" data-acao="duplicar" data-id="${m.id}">Duplicar</button>
        <button class="link perigo" data-acao="apagar" data-id="${m.id}">Apagar</button></td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="tabela-wrap"><table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th>
      ${comAcoes ? '<th class="num">Valor</th><th class="num">IVA</th><th class="num">IRS retido</th>' : ''}
      <th class="num">Na conta</th>${comAcoes ? '<th></th>' : ''}</tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
}

function renderMovimentos() {
  $('#conteudo').innerHTML = `
    <section class="painel">
      <div class="filtros">
        <input type="search" id="f-texto" placeholder="Procurar descrição, categoria ou notas…" value="${esc(filtros.texto)}">
        <select id="f-tipo">
          <option value="">Todos os tipos</option>
          ${Object.entries(TIPOS).map(([k, n]) => `<option value="${k}"${filtros.tipo === k ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
        <span class="resumo-f" id="f-resumo"></span>
      </div>
      <div id="lista-mov"></div>
    </section>`;
  $('#f-texto').addEventListener('input', e => { filtros.texto = e.target.value; atualizarLista(); });
  $('#f-tipo').addEventListener('change', e => { filtros.tipo = e.target.value; atualizarLista(); });
  atualizarLista();
}

function atualizarLista() {
  const q = filtros.texto.trim().toLocaleLowerCase('pt');
  const lista = ordenar(doPeriodo().filter(m =>
    (!filtros.tipo || m.tipo === filtros.tipo) &&
    (!q || [m.descricao, m.categoria, m.notas].some(s => (s || '').toLocaleLowerCase('pt').includes(q)))));
  const soma = lista.reduce((s, m) => s + valores(m).liquido, 0);
  $('#f-resumo').textContent = `${lista.length} movimento${lista.length === 1 ? '' : 's'} · ${soma >= 0 ? '+' : ''}${fmt(soma)}`;
  $('#lista-mov').innerHTML = lista.length ? tabelaMovimentos(lista, true)
    : vazio(estado.movimentos.length ? `Sem movimentos em ${nomePeriodo()} com estes filtros.` : 'Ainda não tens movimentos registados.', estado.movimentos.length ? '' : BOTOES_INICIO);
}

// ---------- Impostos ----------

function renderImpostos() {
  const ano = periodo.ano;
  const d = Object.fromEntries(Object.entries(estado.definicoes).map(([k, v]) => [k, v.toLocaleString('pt-PT')]));
  const meses = MESES_LONGOS.map((n, i) => ({ nome: n, t: totais(estado.movimentos.filter(m => noPeriodo(m, ano, i + 1))) }));
  const tAno = totais(estado.movimentos.filter(m => noPeriodo(m, ano, 0)));
  const trimestres = [0, 1, 2, 3].map(q => meses.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.t.ivaCobrado, 0));
  const colunas = t => `<td class="num">${fmt(t.faturado)}</td><td class="num">${fmt(t.ivaCobrado)}</td><td class="num">${fmt(t.ivaPago)}</td>
    <td class="num">${fmt(t.irsRetido)}</td><td class="num">${fmt(t.ssEstimada)}</td><td class="num">${fmt(t.ssPago)}</td>`;

  $('#conteudo').innerHTML = `
    <section class="cartoes">
      ${cartao('Total a pagar', tAno.aPagar, `IVA + Segurança Social em ${ano}`, 'destaque')}
      ${cartao('IVA por entregar', tAno.ivaPorEntregar, `cobrado ${fmt(tAno.ivaCobrado)}`)}
      ${cartao('Segurança Social por pagar', tAno.ssPorPagar, `estimativa ${fmt(tAno.ssEstimada)}`)}
      ${cartao('IRS retido pelos clientes', tAno.irsRetido, `faturado ${fmt(tAno.faturado)} sem IVA`)}
    </section>

    <section class="painel">
      <h2>Mês a mês <small>${ano}</small></h2>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Mês</th><th class="num">Faturado</th><th class="num">IVA cobrado</th><th class="num">IVA entregue</th>
          <th class="num">IRS retido</th><th class="num">SS estimada</th><th class="num">SS paga</th></tr></thead>
        <tbody>${meses.map(m => `<tr><td>${m.nome}</td>${colunas(m.t)}</tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td>${colunas(tAno)}</tr></tfoot>
      </table></div>
    </section>

    <div class="duas">
      <section class="painel">
        <h2>IVA cobrado por trimestre <small>${ano}</small></h2>
        <div class="linhas">${trimestres.map((v, q) => linha(`${q + 1}.º trimestre`, v, `${MESES_LONGOS[q * 3]} a ${MESES_LONGOS[q * 3 + 2]}`)).join('')}</div>
      </section>
      <section class="painel">
        <h2>Como é calculado</h2>
        <p class="nota"><b>IVA:</b> ${d.iva}% sobre o valor sem IVA de cada entrada (podes mudar por movimento). Se estás isento (art. 53.º), põe 0% nas Definições.</p>
        <p class="nota"><b>IRS retido:</b> ${d.irs}% do valor sem IVA, quando o cliente é empresa e faz retenção. Põe 0% se não houver retenção.</p>
        <p class="nota"><b>Segurança Social:</b> ${d.ssTaxa}% sobre ${d.ssBase}% do faturado. É uma estimativa: não considera isenções do 1.º ano nem o valor exato declarado.</p>
        <p class="nota">Regista os pagamentos ao Estado como movimentos do tipo <b>Imposto</b> (IVA, Segurança Social, IRS) para o “por pagar” ir descendo. Confirma sempre os valores com o teu contabilista.</p>
      </section>
    </div>`;
}

// ---------- Despesas fixas (vista) ----------

function renderFixas() {
  const atual = mesChave(new Date());
  const emVigor = f => f.ativa && (!f.fim || f.fim >= atual);
  const porMes = tipo => estado.fixas.filter(f => emVigor(f) && f.tipo === tipo).reduce((s, f) => s + f.valor, 0);
  const ordenadas = [...estado.fixas].sort((a, b) => (b.ativa - a.ativa) || a.dia - b.dia || a.descricao.localeCompare(b.descricao, 'pt'));

  const linhas = ordenadas.map(f => {
    const prox = proximoLancamento(f);
    const terminou = f.fim && f.fim < atual;
    const estadoF = !f.ativa ? 'Pausada' : terminou ? 'Terminada' : 'Ativa';
    return `<tr class="${f.ativa && !terminou ? '' : 'inativa'}">
      <td>${esc(f.descricao)}<small>${esc(f.categoria)}</small></td>
      <td><span class="tipo ${f.tipo}"><i></i>${TIPOS[f.tipo]}</span></td>
      <td class="num">${fmt(f.valor)}</td>
      <td class="num">dia ${f.dia}</td>
      <td>${mesPt(f.inicio)} – ${f.fim ? mesPt(f.fim) : 'sem fim'}</td>
      <td>${prox ? dataPt(prox) : '—'}</td>
      <td>${estadoF}</td>
      <td class="acoes-l">
        <button class="link" data-acao="editar-fixa" data-fixa="${f.id}">Editar</button>
        <button class="link" data-acao="pausar-fixa" data-fixa="${f.id}">${f.ativa ? 'Pausar' : 'Retomar'}</button>
        <button class="link perigo" data-acao="apagar-fixa" data-fixa="${f.id}">Apagar</button></td>
    </tr>`;
  }).join('');

  $('#conteudo').innerHTML = `
    <section class="cartoes">
      ${cartao('Saídas fixas por mês', porMes('saida'), 'renda, contas, subscrições…')}
      ${cartao('Impostos fixos por mês', porMes('imposto'), 'ex.: Segurança Social')}
      ${cartao('Entradas fixas por mês', porMes('entrada'), 'valor sem IVA (ex.: avenças)')}
      ${cartao('Compromisso mensal', porMes('saida') + porMes('imposto'), `${estado.fixas.filter(emVigor).length} ativas`, 'destaque')}
    </section>
    <section class="painel">
      <div class="painel-topo"><h2>As tuas despesas fixas</h2><button class="primario" data-acao="nova-fixa">+ Nova despesa fixa</button></div>
      ${estado.fixas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Descrição</th><th>Tipo</th><th class="num">Valor</th><th class="num">Quando</th><th>Período</th><th>Próximo lançamento</th><th>Estado</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
        : vazio('Ainda não tens despesas fixas. Adiciona a renda, as contas da casa e as subscrições: passam a ser lançadas sozinhas todos os meses.')}
      <p class="nota" style="margin-top:.9rem">Cada despesa fixa é lançada automaticamente em Movimentos no dia do mês que escolheres (sempre que abres a app, ou enquanto está aberta). Se o mês tiver menos dias, é lançada no último dia. Podes editar ou apagar um lançamento sem afetar os seguintes; ao editar a despesa fixa, as alterações valem para os próximos meses.</p>
    </section>`;
}

const dlgFixa = $('#dlg-fixa');
const formFixa = $('#form-fixa');
const campoFx = n => formFixa.elements[n];

function lerFormFixa() {
  const tipo = campoFx('tipo').value;
  const ent = tipo === 'entrada';
  return {
    tipo,
    descricao: campoFx('descricao').value.trim(),
    categoria: campoFx('categoria').value,
    valor: arred(parseFloat(campoFx('valor').value)),
    dia: parseInt(campoFx('dia').value, 10),
    inicio: campoFx('inicio').value,
    fim: campoFx('fim').value,
    iva: ent ? Math.max(0, parseFloat(campoFx('iva').value) || 0) : 0,
    irs: ent ? Math.max(0, parseFloat(campoFx('irs').value) || 0) : 0,
  };
}

function atualizarFormFixa() {
  const f = lerFormFixa();
  $$('.so-entrada', formFixa).forEach(el => { el.hidden = f.tipo !== 'entrada'; });
  $('#fixa-lbl-valor').textContent = f.tipo === 'entrada' ? 'Valor sem IVA (€)' : 'Valor por mês (€)';
  campoFx('descricao').placeholder = { saida: 'ex.: Renda', imposto: 'ex.: Segurança Social', entrada: 'ex.: Avença mensal' }[f.tipo];
  let texto = '';
  if (f.dia >= 1 && f.dia <= 31 && /^\d{4}-\d{2}$/.test(f.inicio)) {
    texto = `Lançada todos os meses no dia <b>${f.dia}</b>, de ${mesPt(f.inicio)} ${f.fim ? `a ${mesPt(f.fim)}` : 'em diante'}.`;
    if (!fixaEmEdicao) {
      const n = mesesPendentes({ ...f, ativa: true, retomada: '', geradas: [] }).length;
      if (n) texto += ` Ao guardar, ${n === 1 ? 'é lançado já 1 movimento' : `são lançados já ${n} movimentos`} (meses que já passaram).`;
    }
  }
  $('#fixa-previa').innerHTML = texto;
}

function abrirFormFixa(f = null) {
  formFixa.reset();
  $('#fixa-erro').hidden = true;
  fixaEmEdicao = f ? f.id : null;
  $('#fixa-titulo').textContent = f ? 'Editar despesa fixa' : 'Nova despesa fixa';
  const tipo = f?.tipo || 'saida';
  campoFx('tipo').value = tipo;
  preencherCategorias(campoFx('categoria'), tipo, f?.categoria);
  campoFx('descricao').value = f?.descricao || '';
  campoFx('valor').value = f?.valor ?? '';
  campoFx('dia').value = f?.dia ?? Math.min(agora.getDate(), 28);
  campoFx('inicio').value = f?.inicio || mesChave(agora);
  campoFx('fim').value = f?.fim || '';
  campoFx('iva').value = f?.tipo === 'entrada' ? f.iva : estado.definicoes.iva;
  campoFx('irs').value = f?.tipo === 'entrada' ? f.irs : estado.definicoes.irs;
  atualizarFormFixa();
  dlgFixa.showModal();
  campoFx(f ? 'valor' : 'descricao').focus();
}

formFixa.addEventListener('change', e => {
  if (e.target.name === 'tipo') preencherCategorias(campoFx('categoria'), e.target.value);
  atualizarFormFixa();
});
formFixa.addEventListener('input', atualizarFormFixa);
$('#fixa-cancelar').addEventListener('click', () => dlgFixa.close());

formFixa.addEventListener('submit', e => {
  e.preventDefault();
  const f = lerFormFixa();
  const erro = !f.descricao ? 'Escreve uma descrição.'
    : !(f.valor > 0) ? 'O valor tem de ser maior que zero.'
    : !(f.dia >= 1 && f.dia <= 31) ? 'O dia tem de estar entre 1 e 31.'
    : !/^\d{4}-\d{2}$/.test(f.inicio) ? 'Indica o mês em que começa.'
    : f.fim && f.fim < f.inicio ? 'O mês em que termina tem de ser depois do início.' : '';
  if (erro) { $('#fixa-erro').textContent = erro; $('#fixa-erro').hidden = false; return; }

  if (fixaEmEdicao) {
    const i = estado.fixas.findIndex(x => x.id === fixaEmEdicao);
    estado.fixas[i] = { ...estado.fixas[i], ...f };
  } else {
    estado.fixas.push({ ...f, id: novoId(), ativa: true, retomada: '', geradas: [] });
  }
  guardar();
  dlgFixa.close();
  const n = gerarFixas();
  if (n) aviso(`${n === 1 ? 'Lançado 1 movimento' : `Lançados ${n} movimentos`} de despesas fixas.`);
  render();
});

// ---------- Personalização ----------

function usoCategoria(tipo, nome) {
  return estado.movimentos.filter(m => m.tipo === tipo && m.categoria === nome).length
    + estado.fixas.filter(f => f.tipo === tipo && f.categoria === nome).length;
}

function editorCategorias(tipo, titulo) {
  const itens = estado.categorias[tipo].map((c, i) => {
    const uso = usoCategoria(tipo, c);
    return `<li class="cat-item">
      <input value="${esc(c)}" data-cat-tipo="${tipo}" data-cat-i="${i}" aria-label="Nome da categoria">
      <span class="cat-uso">${uso ? `${uso} uso${uso === 1 ? '' : 's'}` : ''}</span>
      <button class="link" data-acao="cat-subir" data-tipo="${tipo}" data-i="${i}" title="Subir"${i ? '' : ' disabled'}>↑</button>
      <button class="link perigo" data-acao="cat-apagar" data-tipo="${tipo}" data-i="${i}" title="Apagar">Apagar</button>
    </li>`;
  }).join('');
  return `<div><h3>${titulo}</h3><ul class="cat-lista">${itens}</ul>
    <form class="cat-nova" data-tipo="${tipo}"><input placeholder="Nova categoria" aria-label="Nova categoria"><button>Adicionar</button></form></div>`;
}

function renderPersonalizacao() {
  const p = estado.personalizacao;
  const opcao = (grupo, valor, rotulo) => `<label><input type="radio" name="${grupo}" value="${valor}"${p[grupo] === valor ? ' checked' : ''}><span>${rotulo}</span></label>`;
  $('#conteudo').innerHTML = `
    <section class="painel">
      <h2>Aparência</h2>
      <div class="campos">
        <div class="campo"><span class="rot-campo">Tema</span>
          <div class="seg seg-3" data-pers="tema">${opcao('tema', 'auto', 'Automático')}${opcao('tema', 'claro', 'Claro')}${opcao('tema', 'escuro', 'Escuro')}</div>
          <small>Automático segue o modo claro/escuro do Mac.</small></div>
        <div class="campo"><span class="rot-campo">Cor de destaque</span>
          <div class="cores">${Object.entries(CORES).map(([k, c]) => `
            <button class="cor${p.cor === k ? ' ativa' : ''}" data-acao="cor" data-cor="${k}" title="${c.nome}" aria-label="${c.nome}" aria-pressed="${p.cor === k}"
              style="--c-claro:${c.claro[0]};--c-escuro:${c.escuro[0]}"></button>`).join('')}</div>
          <small>${CORES[p.cor]?.nome || ''} · usada nos botões principais e no menu.</small></div>
      </div>
    </section>

    <section class="painel">
      <h2>Geral</h2>
      <div class="campos">
        <label>Nome da app<input id="p-nome" maxlength="30" value="${esc(p.nome)}"><small>Aparece no topo do menu.</small></label>
        <label>Ao abrir, mostrar
          <select id="p-vista">
            <option value="ultima"${p.vistaInicial === 'ultima' ? ' selected' : ''}>O último separador usado</option>
            ${['resumo', 'movimentos', 'fixas', 'impostos'].map(v => `<option value="${v}"${p.vistaInicial === v ? ' selected' : ''}>${VISTAS[v]}</option>`).join('')}
          </select></label>
        <label>Período ao abrir
          <select id="p-periodo">
            <option value="mes"${p.periodoInicial === 'mes' ? ' selected' : ''}>Mês atual</option>
            <option value="ano"${p.periodoInicial === 'ano' ? ' selected' : ''}>Ano inteiro</option>
          </select></label>
      </div>
    </section>

    <section class="painel" id="p-seguranca" hidden>
      <h2>Segurança</h2>
      <label class="interruptor"><input type="checkbox" id="p-touchid"><span>Pedir impressão digital (Touch ID) para abrir a app</span></label>
      <p class="nota" id="p-touchid-nota" style="margin-top:.5rem"></p>
    </section>

    <section class="painel">
      <h2>Categorias <small>muda o nome diretamente; os movimentos e despesas fixas acompanham</small></h2>
      <div class="cat-grelha">
        ${editorCategorias('entrada', 'Entradas')}
        ${editorCategorias('saida', 'Saídas')}
        <div><h3>Impostos</h3><ul class="cat-lista">${CATEGORIAS_IMPOSTO.map(c => `<li class="cat-item"><span class="cat-fixa">${c}</span></li>`).join('')}</ul>
          <p class="nota">Estas são fixas, porque são usadas nos cálculos de impostos.</p></div>
      </div>
    </section>`;

  ligarTouchId();
  const mudar = (chave, valor) => { estado.personalizacao[chave] = valor; guardar(); aplicarAparencia(); };
  $('[data-pers="tema"]').addEventListener('change', e => mudar('tema', e.target.value));
  $('#p-nome').addEventListener('input', e => mudar('nome', e.target.value));
  $('#p-nome').addEventListener('change', e => { if (!e.target.value.trim()) { e.target.value = 'Finanças'; mudar('nome', 'Finanças'); } });
  $('#p-vista').addEventListener('change', e => mudar('vistaInicial', e.target.value));
  $('#p-periodo').addEventListener('change', e => mudar('periodoInicial', e.target.value));

  $$('[data-cat-i]').forEach(inp => inp.addEventListener('change', () => {
    const tipo = inp.dataset.catTipo, i = +inp.dataset.catI;
    const antigo = estado.categorias[tipo][i];
    const novo = inp.value.trim();
    if (!novo || novo === antigo) { inp.value = antigo; return; }
    if (estado.categorias[tipo].includes(novo)) { alert(`Já existe a categoria “${novo}”.`); inp.value = antigo; return; }
    estado.categorias[tipo][i] = novo;
    for (const x of [...estado.movimentos, ...estado.fixas]) if (x.tipo === tipo && x.categoria === antigo) x.categoria = novo;
    guardar();
    renderPersonalizacao();
  }));
  $$('.cat-nova').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const tipo = f.dataset.tipo, nome = f.elements[0].value.trim();
    if (!nome) return;
    if (estado.categorias[tipo].includes(nome)) { alert(`Já existe a categoria “${nome}”.`); return; }
    estado.categorias[tipo].push(nome);
    guardar();
    renderPersonalizacao();
    $(`.cat-nova[data-tipo="${tipo}"] input`).focus();
  }));
}

// Só existe na app de Mac (Electron); no browser a secção fica escondida.
async function ligarTouchId() {
  if (!window.appMac) return;
  const { disponivel, ativo } = await window.appMac.estadoTouchId();
  const cb = $('#p-touchid');
  if (!cb) return;
  $('#p-seguranca').hidden = false;
  cb.checked = ativo;
  cb.disabled = !disponivel && !ativo;
  $('#p-touchid-nota').textContent = disponivel
    ? 'Quando está ativo, também volta a pedir sempre que o Mac bloqueia ou adormece.'
    : 'O Touch ID não está disponível neste momento (por exemplo, com a tampa fechada).';
  cb.addEventListener('change', async () => {
    cb.disabled = true;
    const r = await window.appMac.definirTouchId(cb.checked);
    cb.disabled = false;
    if (!r.ok) { cb.checked = !cb.checked; alert(r.erro); return; }
    aviso(cb.checked ? 'Bloqueio com impressão digital ativado.' : 'Bloqueio com impressão digital desativado.');
  });
}

function acaoCategoria(acao, tipo, i) {
  const lista = estado.categorias[tipo];
  if (acao === 'cat-subir' && i > 0) {
    [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
  } else if (acao === 'cat-apagar') {
    if (lista.length === 1) { alert('Tem de existir pelo menos uma categoria.'); return; }
    const uso = usoCategoria(tipo, lista[i]);
    const msg = uso
      ? `Apagar a categoria “${lista[i]}”? Os ${uso} movimentos/despesas fixas que a usam mantêm-se, com este nome.`
      : `Apagar a categoria “${lista[i]}”?`;
    if (!confirm(msg)) return;
    lista.splice(i, 1);
  }
  guardar();
  renderPersonalizacao();
}

// ---------- Definições ----------

function renderDefinicoes() {
  const d = estado.definicoes;
  const campo = (nome, rot, ajuda) => `<label>${rot}<input type="number" step="0.1" min="0" data-def="${nome}" value="${d[nome]}"><small>${ajuda}</small></label>`;
  $('#conteudo').innerHTML = `
    <section class="painel">
      <h2>Taxas por omissão</h2>
      <div class="campos">
        ${campo('iva', 'IVA (%)', 'Aplicado a novas entradas')}
        ${campo('irs', 'Retenção de IRS (%)', 'Aplicada a novas entradas')}
        ${campo('ssTaxa', 'Taxa Segurança Social (%)', 'Trabalhador independente')}
        ${campo('ssBase', 'Base Segurança Social (%)', 'Parte do faturado considerada')}
      </div>
      <p class="nota" style="margin-top:.8rem">Categorias, cores e tema estão em <button class="link" data-acao="ir" data-vista="personalizacao">Personalização</button>.</p>
    </section>

    <section class="painel">
      <h2>Dados</h2>
      <p class="nota" style="margin-bottom:.8rem">Os dados ficam guardados só neste computador. Faz uma cópia de segurança de vez em quando.</p>
      <div class="botoes">
        <button data-acao="exportar-json">Exportar cópia de segurança (.json)</button>
        <button data-acao="importar-json">Importar cópia de segurança</button>
        <button data-acao="exportar-csv">Exportar para Excel/Numbers (.csv)</button>
        <button data-acao="apagar-tudo" class="perigo">Apagar todos os dados</button>
      </div>
    </section>`;

  $$('[data-def]').forEach(i => i.addEventListener('change', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v) && v >= 0) { estado.definicoes[i.dataset.def] = v; guardar(); }
    else i.value = estado.definicoes[i.dataset.def];
  }));
}

// ---------- Exportar / importar ----------

function descarregar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarCSV() {
  const celula = v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'IVA %', 'IVA', 'IRS %', 'IRS retido', 'Na conta', 'Despesa fixa', 'Notas'];
  const linhas = ordenar(estado.movimentos).reverse().map(m => {
    const v = valores(m), ent = m.tipo === 'entrada';
    return [dataPt(m.data), TIPOS[m.tipo], m.categoria, m.descricao, m.valor, ent ? m.iva : '', v.iva, ent ? m.irs : '', v.irs, v.liquido, m.fixaId ? 'sim' : '', m.notas || '']
      .map(celula).join(';');
  });
  // BOM + ponto e vírgula para o Excel/Numbers em português abrirem bem.
  descarregar(`financas-${hoje()}.csv`, '﻿' + [cab.map(celula).join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
}

$('#ficheiro').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let dados;
  try {
    dados = lerDados(JSON.parse(await f.text()));
  } catch {
    alert('Este ficheiro não parece ser uma cópia de segurança válida.');
    return;
  }
  if (!confirm(`Importar ${dados.movimentos.length} movimentos e ${dados.fixas.length} despesas fixas? Os dados atuais serão substituídos.`)) return;
  estado = dados;
  guardar();
  gerarFixas();
  aplicarAparencia();
  render();
});

// ---------- Formulário de movimento ----------

const dlg = $('#dlg');
const form = $('#form');
const campoF = n => form.elements[n];

function categoriasDe(tipo) {
  return tipo === 'imposto' ? CATEGORIAS_IMPOSTO : estado.categorias[tipo];
}

function preencherCategorias(select, tipo, atual) {
  const lista = [...categoriasDe(tipo)];
  if (atual && !lista.includes(atual)) lista.push(atual); // categoria entretanto removida
  select.innerHTML = lista.map(c => `<option${c === atual ? ' selected' : ''}>${esc(c)}</option>`).join('');
}

function atualizarForm() {
  const tipo = campoF('tipo').value;
  const ent = tipo === 'entrada';
  $$('.so-entrada', form).forEach(el => { el.hidden = !ent; });
  $('#lbl-valor').textContent = ent ? 'Valor sem IVA (€)' : 'Valor pago (€)';
  campoF('descricao').placeholder = { entrada: 'ex.: Casamento Ana & Rui', saida: 'ex.: Supermercado', imposto: 'ex.: IVA 3.º trimestre' }[tipo];
  const valor = parseFloat(campoF('valor').value);
  if (ent && valor > 0) {
    const v = valores({ tipo, valor, iva: parseFloat(campoF('iva').value) || 0, irs: parseFloat(campoF('irs').value) || 0 });
    $('#previa').innerHTML = `O cliente paga <b>${fmt(valor + v.iva)}</b> e retém ${fmt(v.irs)} de IRS. Recebes <b>${fmt(v.liquido)}</b>, dos quais ${fmt(v.iva)} são IVA a entregar.`;
  } else {
    $('#previa').innerHTML = '';
  }
}

function abrirForm(m = null, duplicar = false) {
  form.reset();
  $('#erro').hidden = true;
  idEmEdicao = m && !duplicar ? m.id : null;
  $('#dlg-titulo').textContent = idEmEdicao ? 'Editar movimento' : 'Novo movimento';
  const tipo = m?.tipo || 'entrada';
  campoF('tipo').value = tipo;
  preencherCategorias(campoF('categoria'), tipo, m?.categoria);
  const dataPadrao = periodo.mes && !(periodo.ano === agora.getFullYear() && periodo.mes === agora.getMonth() + 1)
    ? `${periodo.ano}-${doisDig(periodo.mes)}-01` : hoje();
  campoF('data').value = m && !duplicar ? m.data : dataPadrao;
  campoF('descricao').value = m?.descricao || '';
  campoF('valor').value = m?.valor ?? '';
  campoF('iva').value = m?.tipo === 'entrada' ? m.iva : estado.definicoes.iva;
  campoF('irs').value = m?.tipo === 'entrada' ? m.irs : estado.definicoes.irs;
  campoF('notas').value = m?.notas || '';
  atualizarForm();
  dlg.showModal();
  campoF(m ? 'valor' : 'descricao').focus();
}

form.addEventListener('change', e => {
  if (e.target.name === 'tipo') preencherCategorias(campoF('categoria'), e.target.value);
  atualizarForm();
});
form.addEventListener('input', atualizarForm);
$('#btn-cancelar').addEventListener('click', () => dlg.close());

form.addEventListener('submit', e => {
  e.preventDefault();
  const tipo = campoF('tipo').value;
  const valor = arred(parseFloat(campoF('valor').value));
  const data = campoF('data').value;
  const descricao = campoF('descricao').value.trim();
  const erro = !/^\d{4}-\d{2}-\d{2}$/.test(data) ? 'Indica a data.'
    : !descricao ? 'Escreve uma descrição.'
    : !(valor > 0) ? 'O valor tem de ser maior que zero.' : '';
  if (erro) { $('#erro').textContent = erro; $('#erro').hidden = false; return; }

  const ent = tipo === 'entrada';
  const mov = {
    id: idEmEdicao || novoId(), tipo, data, descricao, valor,
    categoria: campoF('categoria').value,
    iva: ent ? Math.max(0, parseFloat(campoF('iva').value) || 0) : 0,
    irs: ent ? Math.max(0, parseFloat(campoF('irs').value) || 0) : 0,
    notas: campoF('notas').value.trim(),
  };
  if (idEmEdicao) {
    const i = estado.movimentos.findIndex(m => m.id === idEmEdicao);
    estado.movimentos[i] = { ...estado.movimentos[i], ...mov };
  } else {
    estado.movimentos.push({ ...mov, criado: Date.now() });
  }
  guardar();
  dlg.close();
  // Mostra o período onde o movimento ficou, para não "desaparecer".
  if (!noPeriodo(mov, periodo.ano, periodo.mes)) {
    periodo.ano = +data.slice(0, 4);
    if (periodo.mes) periodo.mes = +data.slice(5, 7);
  }
  render();
});

// ---------- Eventos globais ----------

function irPara(v) {
  vista = v;
  guardarUI();
  render();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const m = b.dataset.id && estado.movimentos.find(x => x.id === b.dataset.id);
  const f = b.dataset.fixa && estado.fixas.find(x => x.id === b.dataset.fixa);
  switch (b.dataset.acao) {
    case 'novo': abrirForm(); break;
    case 'editar': abrirForm(m); break;
    case 'duplicar': abrirForm(m, true); break;
    case 'apagar':
      if (m && confirm(`Apagar “${m.descricao}” (${fmt(m.valor)})?${m.fixaId ? ' Não volta a ser lançado este mês.' : ''}`)) {
        estado.movimentos = estado.movimentos.filter(x => x.id !== m.id);
        guardar(); render();
      }
      break;
    case 'nova-fixa': abrirFormFixa(); break;
    case 'editar-fixa': abrirFormFixa(f); break;
    case 'pausar-fixa':
      if (!f) break;
      f.ativa = !f.ativa;
      // Ao retomar, não lança os meses em que esteve pausada.
      if (f.ativa) { f.retomada = mesChave(new Date()); gerarFixas(); }
      guardar(); render();
      break;
    case 'apagar-fixa': {
      if (!f || !confirm(`Apagar a despesa fixa “${f.descricao}”? Deixa de ser lançada.`)) break;
      const lancados = estado.movimentos.filter(x => x.fixaId === f.id);
      if (lancados.length && confirm(`Apagar também os ${lancados.length} movimentos já lançados por ela?\n\nOK = apagar · Cancelar = manter`)) {
        estado.movimentos = estado.movimentos.filter(x => x.fixaId !== f.id);
      }
      estado.fixas = estado.fixas.filter(x => x.id !== f.id);
      guardar(); render();
      break;
    }
    case 'cor': estado.personalizacao.cor = b.dataset.cor; guardar(); aplicarAparencia(); renderPersonalizacao(); break;
    case 'cat-subir':
    case 'cat-apagar': acaoCategoria(b.dataset.acao, b.dataset.tipo, +b.dataset.i); break;
    case 'ir': irPara(b.dataset.vista); break;
    case 'exportar-json': descarregar(`financas-copia-${hoje()}.json`, JSON.stringify(estado, null, 2), 'application/json'); break;
    case 'importar-json': $('#ficheiro').click(); break;
    case 'exportar-csv': exportarCSV(); break;
    case 'apagar-tudo':
      if (confirm('Apagar TODOS os movimentos e despesas fixas? Isto não pode ser desfeito. Exporta uma cópia antes, se quiseres.')) {
        estado.movimentos = [];
        estado.fixas = [];
        guardar(); render();
      }
      break;
  }
});

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-vista]');
  if (b) irPara(b.dataset.vista);
});
$('#btn-novo').addEventListener('click', () => abrirForm());
$('#sel-ano').addEventListener('change', e => { periodo.ano = +e.target.value; render(); });
$('#sel-mes').addEventListener('change', e => { periodo.mes = +e.target.value; render(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !dlg.open && !dlgFixa.open) { e.preventDefault(); abrirForm(); }
});

// Lança as despesas fixas que chegaram ao dia, também com a app aberta durante dias.
function verificarFixas() {
  const n = gerarFixas();
  if (!n) return;
  aviso(`${n === 1 ? 'Lançado 1 movimento' : `Lançados ${n} movimentos`} de despesas fixas.`);
  if (!dlg.open && !dlgFixa.open) render();
}
setInterval(verificarFixas, 30 * 60 * 1000);
window.addEventListener('focus', verificarFixas);

if (navigator.userAgent.includes('Electron')) document.body.classList.add('electron');
aplicarAparencia();
if (precisaGuardar) guardar();
const lancadosAoAbrir = gerarFixas();
render();
if (exemplosRemovidos) aviso(`Removidos ${exemplosRemovidos} movimentos de exemplo.`);
else if (lancadosAoAbrir) aviso(`${lancadosAoAbrir === 1 ? 'Lançado 1 movimento' : `Lançados ${lancadosAoAbrir} movimentos`} de despesas fixas.`);
