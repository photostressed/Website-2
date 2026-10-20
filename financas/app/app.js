'use strict';

// ---------- Constantes e utilitários ----------

const CHAVE_DADOS = 'financas.dados.v1';
const CHAVE_UI = 'financas.ui.v1';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TIPOS = { entrada: 'Entrada', saida: 'Saída', imposto: 'Imposto' };
// As categorias de imposto são fixas porque os cálculos dependem delas.
const CATEGORIAS_IMPOSTO = ['IVA', 'Segurança Social', 'IRS', 'Outros impostos'];

const padrao = () => ({
  versao: 1,
  definicoes: { iva: 23, irs: 23, ssTaxa: 21.4, ssBase: 70 },
  categorias: {
    entrada: ['Fotografia', 'Vídeo', 'Edição', 'Outros rendimentos'],
    saida: ['Casa', 'Contas da casa', 'Comida', 'Transporte', 'Saúde', 'Equipamento', 'Software e serviços', 'Lazer', 'Outros'],
  },
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

// ---------- Dados ----------

function carregar() {
  let texto = null;
  try { texto = localStorage.getItem(CHAVE_DADOS); } catch { return padrao(); }
  if (!texto) return padrao();
  try {
    return normalizar(JSON.parse(texto));
  } catch {
    // Guarda o conteúdo ilegível à parte para não o perder ao gravar por cima.
    try { localStorage.setItem(CHAVE_DADOS + '.ilegivel.' + Date.now(), texto); } catch {}
    return padrao();
  }
}

function normalizar(d) {
  const p = padrao();
  const cat = d.categorias || {};
  return {
    versao: 1,
    definicoes: { ...p.definicoes, ...(d.definicoes || {}) },
    categorias: {
      entrada: Array.isArray(cat.entrada) && cat.entrada.length ? cat.entrada : p.categorias.entrada,
      saida: Array.isArray(cat.saida) && cat.saida.length ? cat.saida : p.categorias.saida,
    },
    movimentos: (Array.isArray(d.movimentos) ? d.movimentos : [])
      .filter(m => m && TIPOS[m.tipo] && /^\d{4}-\d{2}-\d{2}$/.test(m.data) && Number.isFinite(+m.valor))
      .map(m => ({ ...m, valor: +m.valor, iva: +m.iva || 0, irs: +m.irs || 0, id: m.id || novoId() })),
  };
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
let vista = carregarUI().vista || 'resumo';
const agora = new Date();
const periodo = { ano: agora.getFullYear(), mes: agora.getMonth() + 1 }; // mes 0 = ano inteiro
const filtros = { texto: '', tipo: '' };
let idEmEdicao = null;

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
  t.livre = t.saldo - t.ivaPorEntregar - t.ssPorPagar;
  return t;
}

// ---------- Moldura (navegação e período) ----------

const TITULOS = { resumo: 'Resumo', movimentos: 'Movimentos', impostos: 'Impostos', definicoes: 'Definições' };

function preencherPeriodo() {
  const anos = new Set([agora.getFullYear(), agora.getFullYear() + 1, periodo.ano]);
  estado.movimentos.forEach(m => anos.add(+m.data.slice(0, 4)));
  const ordenados = [...anos].sort((a, b) => b - a);
  $('#sel-ano').innerHTML = ordenados.map(a => `<option value="${a}"${a === periodo.ano ? ' selected' : ''}>${a}</option>`).join('');
  $('#sel-mes').innerHTML = `<option value="0"${periodo.mes === 0 ? ' selected' : ''}>Ano inteiro</option>` +
    MESES_LONGOS.map((n, i) => `<option value="${i + 1}"${periodo.mes === i + 1 ? ' selected' : ''}>${n}</option>`).join('');
  // O separador Impostos é sempre anual.
  $('#sel-mes').hidden = vista === 'impostos' || vista === 'definicoes';
  $('#sel-ano').hidden = vista === 'definicoes';
}

function nomePeriodo() {
  return periodo.mes ? `${MESES_LONGOS[periodo.mes - 1]} ${periodo.ano}` : String(periodo.ano);
}

function render() {
  $$('#nav button').forEach(b => b.classList.toggle('ativo', b.dataset.vista === vista));
  $('#titulo').textContent = TITULOS[vista];
  preencherPeriodo();
  esconderTooltip();
  ({ resumo: renderResumo, movimentos: renderMovimentos, impostos: renderImpostos, definicoes: renderDefinicoes }[vista])();
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

function vazio(texto, comExemplo = false) {
  return `<div class="vazio">${texto}${comExemplo ? `<br><button data-acao="exemplo">Experimentar com dados de exemplo</button>` : ''}</div>`;
}

function renderResumo() {
  const lista = doPeriodo();
  const t = totais(lista);
  const semDados = estado.movimentos.length === 0;

  $('#conteudo').innerHTML = `
    <section class="cartoes">
      ${cartao('Recebido', t.recebido, `Faturado ${fmt(t.faturado)} sem IVA`)}
      ${cartao('Despesas', t.despesas, `${lista.filter(m => m.tipo === 'saida').length} movimentos`)}
      ${cartao('Impostos pagos', t.impostos, 'IVA, Segurança Social, IRS')}
      ${cartao('Saldo', t.saldo, 'recebido − despesas − impostos', 'destaque')}
    </section>

    ${semDados ? `<section class="painel">${vazio('Ainda não tens movimentos registados.', true)}</section>` : ''}

    <div class="duas">
      <section class="painel">
        <h2>Entradas e saídas por mês <small>${periodo.ano}</small></h2>
        ${graficoMensal(periodo.ano)}
      </section>
      <section class="painel">
        <h2>Reservar para impostos <small>${nomePeriodo()}</small></h2>
        <div class="linhas">
          ${linha('IVA por entregar', t.ivaPorEntregar, `cobrado ${fmt(t.ivaCobrado)} − entregue ${fmt(t.ivaPago)}`)}
          ${linha('Segurança Social por pagar', t.ssPorPagar, `estimativa ${fmt(t.ssEstimada)} − paga ${fmt(t.ssPago)}`)}
          ${linha('IRS já retido pelos clientes', t.irsRetido, 'adiantamento ao IRS anual (informativo)')}
          ${linha('Livre depois de reservar impostos', t.livre, 'saldo − IVA − Segurança Social por pagar', 'total')}
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
      <td>${esc(m.descricao)}${m.notas ? `<small>${esc(m.notas)}</small>` : ''}</td>
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
    : vazio(estado.movimentos.length ? `Sem movimentos em ${nomePeriodo()} com estes filtros.` : 'Ainda não tens movimentos registados.', !estado.movimentos.length);
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
      ${cartao('Faturado (sem IVA)', tAno.faturado, `em ${ano}`)}
      ${cartao('IVA por entregar', tAno.ivaPorEntregar, `cobrado ${fmt(tAno.ivaCobrado)}`)}
      ${cartao('Segurança Social por pagar', tAno.ssPorPagar, `estimativa ${fmt(tAno.ssEstimada)}`)}
      ${cartao('IRS retido pelos clientes', tAno.irsRetido, 'adiantamento ao IRS', 'destaque')}
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
    </section>

    <section class="painel">
      <h2>Categorias <small>uma por linha</small></h2>
      <div class="campos">
        <label>Entradas<textarea data-cat="entrada">${esc(estado.categorias.entrada.join('\n'))}</textarea></label>
        <label>Saídas<textarea data-cat="saida">${esc(estado.categorias.saida.join('\n'))}</textarea></label>
        <label>Impostos<textarea disabled>${CATEGORIAS_IMPOSTO.join('\n')}</textarea><small>Fixas, porque são usadas nos cálculos.</small></label>
      </div>
    </section>

    <section class="painel">
      <h2>Dados</h2>
      <p class="nota" style="margin-bottom:.8rem">Os dados ficam guardados só neste computador. Faz uma cópia de segurança de vez em quando.</p>
      <div class="botoes">
        <button data-acao="exportar-json">Exportar cópia de segurança (.json)</button>
        <button data-acao="importar-json">Importar cópia de segurança</button>
        <button data-acao="exportar-csv">Exportar para Excel/Numbers (.csv)</button>
        <button data-acao="exemplo">Adicionar dados de exemplo</button>
        <button data-acao="apagar-tudo" class="perigo">Apagar todos os dados</button>
      </div>
    </section>`;

  $$('[data-def]').forEach(i => i.addEventListener('change', () => {
    const v = parseFloat(i.value);
    if (Number.isFinite(v) && v >= 0) { estado.definicoes[i.dataset.def] = v; guardar(); }
    else i.value = estado.definicoes[i.dataset.def];
  }));
  $$('[data-cat]').forEach(t => t.addEventListener('change', () => {
    const lista = [...new Set(t.value.split('\n').map(s => s.trim()).filter(Boolean))];
    if (lista.length) { estado.categorias[t.dataset.cat] = lista; guardar(); }
    t.value = estado.categorias[t.dataset.cat].join('\n');
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
  const cab = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'IVA %', 'IVA', 'IRS %', 'IRS retido', 'Na conta', 'Notas'];
  const linhas = ordenar(estado.movimentos).reverse().map(m => {
    const v = valores(m), ent = m.tipo === 'entrada';
    return [dataPt(m.data), TIPOS[m.tipo], m.categoria, m.descricao, m.valor, ent ? m.iva : '', v.iva, ent ? m.irs : '', v.irs, v.liquido, m.notas || '']
      .map(celula).join(';');
  });
  // BOM + ponto e vírgula para o Excel/Numbers em português abrirem bem.
  descarregar(`financas-${hoje()}.csv`, '﻿' + [cab.map(celula).join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
}

$('#ficheiro').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const dados = normalizar(JSON.parse(await f.text()));
    if (!confirm(`Importar ${dados.movimentos.length} movimentos? Os dados atuais (${estado.movimentos.length} movimentos) serão substituídos.`)) return;
    estado = dados;
    guardar();
    render();
  } catch (err) {
    alert('Este ficheiro não parece ser uma cópia de segurança válida.');
  }
});

function adicionarExemplo() {
  const ano = agora.getFullYear();
  const ate = agora.getMonth() + 1;
  const ex = [];
  const add = (mes, dia, tipo, categoria, descricao, valor, extra = {}) =>
    ex.push({ id: novoId(), criado: Date.now(), tipo, categoria, descricao, valor, data: `${ano}-${doisDig(mes)}-${doisDig(dia)}`,
      iva: tipo === 'entrada' ? estado.definicoes.iva : 0, irs: tipo === 'entrada' ? estado.definicoes.irs : 0, notas: '', ...extra });
  for (let m = 1; m <= ate; m++) {
    add(m, 1, 'saida', 'Casa', 'Renda', 750);
    add(m, 5, 'saida', 'Contas da casa', 'Luz, água e internet', 95 + (m % 3) * 12);
    add(m, 8, 'saida', 'Comida', 'Supermercado', 260 + (m % 4) * 25);
    add(m, 12, 'saida', 'Software e serviços', 'Adobe Creative Cloud', 66.42);
    add(m, 18, 'saida', 'Transporte', 'Combustível', 70 + (m % 2) * 30);
    add(m, 10, 'entrada', m % 2 ? 'Fotografia' : 'Vídeo', m % 2 ? 'Sessão de fotografia' : 'Vídeo institucional', 900 + (m % 5) * 280);
    if (m % 3 === 0) add(m, 22, 'entrada', 'Fotografia', 'Casamento', 1800, { irs: 0, notas: 'Cliente particular, sem retenção' });
    add(m, 20, 'imposto', 'Segurança Social', 'Contribuição mensal', 180);
    if (m % 3 === 2) add(m, 15, 'imposto', 'IVA', 'Entrega de IVA do trimestre', 520);
  }
  add(Math.min(3, ate), 14, 'saida', 'Equipamento', 'Objetiva 35mm', 1290, { notas: 'Despesa profissional' });
  estado.movimentos.push(...ex);
  guardar();
  render();
}

// ---------- Formulário ----------

const dlg = $('#dlg');
const form = $('#form');
const campoF = n => form.elements[n];

function categoriasDe(tipo) {
  return tipo === 'imposto' ? CATEGORIAS_IMPOSTO : estado.categorias[tipo];
}

function preencherCategorias(tipo, atual) {
  const lista = [...categoriasDe(tipo)];
  if (atual && !lista.includes(atual)) lista.push(atual); // categoria entretanto removida
  campoF('categoria').innerHTML = lista.map(c => `<option${c === atual ? ' selected' : ''}>${esc(c)}</option>`).join('');
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
  preencherCategorias(tipo, m?.categoria);
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
  if (e.target.name === 'tipo') preencherCategorias(e.target.value);
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

document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if (!b) return;
  const m = b.dataset.id && estado.movimentos.find(x => x.id === b.dataset.id);
  switch (b.dataset.acao) {
    case 'editar': abrirForm(m); break;
    case 'duplicar': abrirForm(m, true); break;
    case 'apagar':
      if (m && confirm(`Apagar “${m.descricao}” (${fmt(m.valor)})?`)) {
        estado.movimentos = estado.movimentos.filter(x => x.id !== m.id);
        guardar(); render();
      }
      break;
    case 'exemplo': adicionarExemplo(); break;
    case 'exportar-json': descarregar(`financas-copia-${hoje()}.json`, JSON.stringify(estado, null, 2), 'application/json'); break;
    case 'importar-json': $('#ficheiro').click(); break;
    case 'exportar-csv': exportarCSV(); break;
    case 'apagar-tudo':
      if (confirm('Apagar TODOS os movimentos? Isto não pode ser desfeito. Exporta uma cópia antes, se quiseres.')) {
        estado.movimentos = [];
        guardar(); render();
      }
      break;
  }
});

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('button[data-vista]');
  if (!b) return;
  vista = b.dataset.vista;
  guardarUI();
  render();
});
$('#btn-novo').addEventListener('click', () => abrirForm());
$('#sel-ano').addEventListener('change', e => { periodo.ano = +e.target.value; render(); });
$('#sel-mes').addEventListener('change', e => { periodo.mes = +e.target.value; render(); });
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !dlg.open) { e.preventDefault(); abrirForm(); }
});

if (navigator.userAgent.includes('Electron')) document.body.classList.add('electron');
render();
