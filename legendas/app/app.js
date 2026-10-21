'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = window.appLegendas;
const CHAVE_OPCOES = 'legendas.opcoes.v1';
const CHAVE_RASCUNHO = 'legendas.rascunho.v1';

let ficheiro = null;       // caminho do vídeo/áudio escolhido
let legendas = [];         // [{ inicio, fim, texto }] em ms
let srtGuardado = null;    // último .srt guardado
let aTrabalhar = false;

// O texto de erro do Electron vem com um prefixo técnico; fica só a mensagem.
const mensagemErro = err => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const nomeFicheiro = p => p.split(/[\\/]/).pop();

let temporizadorAviso;
function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- Opções guardadas ----------

function lerOpcoes() {
  try { return JSON.parse(localStorage.getItem(CHAVE_OPCOES)) || {}; } catch { return {}; }
}
function guardarOpcoes() {
  const o = { modo: modo(), prompt: $('#prompt').value, maxCar: +$('#max-car').value, maxLinhas: +$('#max-linhas').value };
  try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify(o)); } catch {}
}
const modo = () => $('input[name=modo]:checked').value;
const limites = () => ({
  maxCar: Math.min(70, Math.max(20, +$('#max-car').value || 42)),
  maxLinhas: +$('#max-linhas').value === 1 ? 1 : 2,
});

// ---------- Preparação ----------

let dependencias = null;

async function verificar() {
  dependencias = await api.dependencias();
  const programas = !!(dependencias.ffmpeg && dependencias.whisper);
  $('#passo-programas').classList.toggle('feito', programas);
  $('#passo-modelo').classList.toggle('feito', !!dependencias.modelo);
  $('#prep').hidden = programas && !!dependencias.modelo;
  $('#chave-estado').textContent = dependencias.temChaveDeepl ? 'Chave guardada ✓' : '';
  atualizarBotao();
}

function atualizarBotao() {
  const pronto = dependencias && dependencias.ffmpeg && dependencias.whisper && dependencias.modelo;
  $('#btn-criar').disabled = !pronto || !ficheiro || aTrabalhar;
  $('#deepl').hidden = modo() !== 'en-pt';
}

$('#btn-verificar').addEventListener('click', async () => { await verificar(); aviso('Verificado.'); });

$('#btn-modelo').addEventListener('click', async () => {
  const caixa = $('#modelo-progresso');
  $('#btn-modelo').disabled = true;
  caixa.hidden = false;
  $('span', caixa).textContent = 'A ligar…';
  try {
    await api.descarregarModelo();
    aviso('Modelo descarregado.');
  } catch (err) {
    if (mensagemErro(err) !== 'CANCELADO') $('span', caixa).textContent = mensagemErro(err);
  } finally {
    $('#btn-modelo').disabled = false;
    await verificar();
  }
});

api.aoProgressoModelo(({ recebido, total }) => {
  const caixa = $('#modelo-progresso');
  $('.barra i', caixa).style.width = `${(recebido / total * 100).toFixed(1)}%`;
  $('span', caixa).textContent = `${(recebido / 1e9).toFixed(2).replace('.', ',')} de ${(total / 1e9).toFixed(2).replace('.', ',')} GB`;
});

document.addEventListener('click', e => {
  const copiar = e.target.closest('[data-copiar]');
  if (copiar) { api.copiar($('code', copiar.parentElement).textContent); aviso('Copiado. Cola no Terminal.'); }
  const link = e.target.closest('a[data-link]');
  if (link) { e.preventDefault(); api.abrirLink(link.href); }
});

// ---------- Escolher ficheiro ----------

function escolherFicheiro(caminho) {
  if (!caminho || aTrabalhar) return;
  ficheiro = caminho;
  $('#ficheiro-nome').textContent = nomeFicheiro(caminho);
  $('#erro').hidden = true;
  atualizarBotao();
}

$('#btn-escolher').addEventListener('click', async () => escolherFicheiro(await api.escolher()));
const zona = $('#zona');
['dragenter', 'dragover'].forEach(t => zona.addEventListener(t, e => { e.preventDefault(); zona.classList.add('arrastar'); }));
['dragleave', 'drop'].forEach(t => zona.addEventListener(t, () => zona.classList.remove('arrastar')));
zona.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) escolherFicheiro(api.caminhoDe(f));
});
// Largar um ficheiro fora da zona não deve abrir o vídeo na janela.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

$$('input[name=modo]').forEach(r => r.addEventListener('change', () => { guardarOpcoes(); atualizarBotao(); }));
['#prompt', '#max-car', '#max-linhas'].forEach(s => $(s).addEventListener('change', guardarOpcoes));

$('#btn-chave').addEventListener('click', async () => {
  await api.guardarChaveDeepl($('#chave-deepl').value);
  $('#chave-deepl').value = '';
  await verificar();
  aviso(dependencias.temChaveDeepl ? 'Chave do DeepL guardada.' : 'Chave removida.');
});

// ---------- Criar legendas ----------

function mostrarProgresso(texto, pct) {
  $('#progresso').hidden = false;
  $('#progresso-texto').textContent = pct == null ? texto : `${texto} ${pct}%`;
  const barra = $('#progresso .barra');
  barra.classList.toggle('indeterminada', pct == null);
  $('i', barra).style.width = pct == null ? '' : `${pct}%`;
}
api.aoProgresso(({ fase, pct }) => { if (aTrabalhar) mostrarProgresso(fase, pct); });

$('#btn-cancelar').addEventListener('click', () => api.cancelar());

$('#btn-criar').addEventListener('click', async () => {
  const m = modo();
  if (m === 'en-pt' && !dependencias.temChaveDeepl) {
    $('#erro').textContent = 'Para traduzir, guarda primeiro a chave do DeepL (logo acima).';
    $('#erro').hidden = false;
    return;
  }
  aTrabalhar = true;
  atualizarBotao();
  $('#erro').hidden = true;
  const inicio = Date.now();
  try {
    const brutos = await api.transcrever({ ficheiro, lingua: m === 'pt' ? 'pt' : 'en', prompt: $('#prompt').value.trim() });
    let segmentos = limparSegmentos(brutos);
    if (!segmentos.length) throw new Error('Não foi detetada fala neste ficheiro. Confirma a língua escolhida e se o áudio tem voz.');
    if (m === 'en-pt') {
      mostrarProgresso('A traduzir para português…', null);
      const traduzidos = await api.traduzir(segmentos.map(s => s.texto));
      segmentos = segmentos.map((s, i) => ({ ...s, texto: traduzidos[i] || s.texto }));
    }
    legendas = dividirEmLegendas(segmentos, limites());
    srtGuardado = null;
    abrirEditor();
    const segundos = Math.round((Date.now() - inicio) / 1000);
    aviso(`${legendas.length} legendas criadas em ${segundos < 60 ? `${segundos} s` : `${Math.round(segundos / 60)} min`}. Revê e guarda o .srt.`);
  } catch (err) {
    const msg = mensagemErro(err);
    if (msg !== 'CANCELADO') { $('#erro').textContent = msg; $('#erro').hidden = false; }
  } finally {
    aTrabalhar = false;
    $('#progresso').hidden = true;
    atualizarBotao();
  }
});

// ---------- Editor ----------

const video = $('#video');

function guardarRascunho() {
  try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ ficheiro, legendas, srtGuardado, quando: Date.now() })); } catch {}
}

function abrirEditor() {
  $('#novo').hidden = true;
  $('#editor').hidden = false;
  $('#btn-novo').hidden = false;
  $('#ed-titulo').textContent = nomeFicheiro(ficheiro);
  $('#btn-mostrar').hidden = !srtGuardado;
  $('#sem-video').hidden = true;
  video.hidden = false;
  video.src = api.urlDe(ficheiro);
  renderLista();
  guardarRascunho();
}

video.addEventListener('error', () => { video.hidden = true; $('#sem-video').hidden = false; });

function atualizarInfo() {
  const duracao = legendas.length ? legendas[legendas.length - 1].fim : 0;
  $('#ed-info').textContent = `${legendas.length} legendas · ${formatarTempo(duracao).slice(0, 8)}`;
}

function contagem(texto) {
  const { maxCar } = limites();
  const linhas = texto.split('\n');
  const maior = Math.max(...linhas.map(l => l.length));
  return { texto: linhas.map(l => l.length).join(' / ') + ' car.', excede: maior > maxCar };
}

function renderLista() {
  $('#lista').innerHTML = legendas.map((l, i) => {
    const c = contagem(l.texto);
    return `<div class="leg" data-i="${i}">
      <div class="leg-tempos">
        <button class="leg-num" data-acao="ir" title="Ir para este momento">${i + 1}</button>
        <input class="t-ini" value="${formatarTempo(l.inicio)}" aria-label="Início">
        <input class="t-fim" value="${formatarTempo(l.fim)}" aria-label="Fim">
      </div>
      <div><textarea rows="2" aria-label="Texto da legenda ${i + 1}"></textarea><span class="contagem${c.excede ? ' excede' : ''}">${c.texto}</span></div>
      <div class="leg-acoes">
        <button data-acao="juntar" title="Juntar com a legenda seguinte"${i === legendas.length - 1 ? ' disabled' : ''}>Juntar ↓</button>
        <button data-acao="dividir" title="Dividir onde está o cursor">Dividir</button>
        <button data-acao="apagar" class="perigo">Apagar</button>
      </div>
    </div>`;
  }).join('');
  // O texto é posto por propriedade para não ter de o escapar no HTML.
  $$('#lista textarea').forEach((t, i) => { t.value = legendas[i].texto; });
  atualizarInfo();
}

$('#lista').addEventListener('input', e => {
  const caixa = e.target.closest('.leg');
  if (!caixa || e.target.tagName !== 'TEXTAREA') return;
  const i = +caixa.dataset.i;
  legendas[i].texto = e.target.value;
  const c = contagem(e.target.value);
  const el = $('.contagem', caixa);
  el.textContent = c.texto;
  el.classList.toggle('excede', c.excede);
  guardarRascunho();
});

$('#lista').addEventListener('change', e => {
  const caixa = e.target.closest('.leg');
  if (!caixa || !e.target.matches('.t-ini, .t-fim')) return;
  const i = +caixa.dataset.i;
  const campo = e.target.matches('.t-ini') ? 'inicio' : 'fim';
  const ms = lerTempo(e.target.value);
  const valido = ms !== null && (campo === 'inicio' ? ms < legendas[i].fim : ms > legendas[i].inicio);
  e.target.classList.toggle('invalido', !valido);
  if (!valido) return;
  legendas[i][campo] = ms;
  e.target.value = formatarTempo(ms);
  guardarRascunho();
});

$('#lista').addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  const caixa = e.target.closest('.leg');
  if (!b || !caixa) return;
  const i = +caixa.dataset.i;
  const l = legendas[i];
  if (b.dataset.acao === 'ir') {
    if (!video.hidden) { video.currentTime = l.inicio / 1000 + 0.01; video.play(); }
    return;
  }
  if (b.dataset.acao === 'juntar' && legendas[i + 1]) {
    const s = legendas[i + 1];
    legendas.splice(i, 2, { inicio: l.inicio, fim: s.fim, texto: `${l.texto.replace(/\n/g, ' ')} ${s.texto.replace(/\n/g, ' ')}` });
  } else if (b.dataset.acao === 'dividir') {
    const t = $('textarea', caixa);
    const texto = t.value.replace(/\n/g, ' ');
    let pos = t.selectionStart;
    if (!pos || pos >= t.value.length) pos = texto.lastIndexOf(' ', Math.floor(texto.length / 2)) + 1 || Math.floor(texto.length / 2);
    const a = texto.slice(0, pos).trim();
    const c = texto.slice(pos).trim();
    if (!a || !c) return;
    const meio = Math.round(l.inicio + (l.fim - l.inicio) * a.length / (a.length + c.length));
    legendas.splice(i, 1, { inicio: l.inicio, fim: meio, texto: a }, { inicio: meio, fim: l.fim, texto: c });
  } else if (b.dataset.acao === 'apagar') {
    legendas.splice(i, 1);
  }
  renderLista();
  guardarRascunho();
});

// Legenda por cima do vídeo e destaque da legenda atual.
let ativa = -1;
video.addEventListener('timeupdate', () => {
  const t = video.currentTime * 1000;
  const i = legendas.findIndex(l => t >= l.inicio && t < l.fim);
  $('#sobreposicao').textContent = i >= 0 ? legendas[i].texto : '';
  if (i === ativa) return;
  $(`.leg[data-i="${ativa}"]`)?.classList.remove('ativa');
  ativa = i;
  const el = $(`.leg[data-i="${i}"]`);
  if (el) {
    el.classList.add('ativa');
    if (!video.paused) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

$('#btn-substituir').addEventListener('click', () => {
  const de = $('#procurar').value;
  if (!de) return;
  const para = $('#substituir').value;
  const regex = new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let n = 0;
  for (const l of legendas) l.texto = l.texto.replace(regex, () => { n++; return para; });
  renderLista();
  guardarRascunho();
  aviso(n ? `${n} substituiç${n === 1 ? 'ão' : 'ões'}.` : `“${de}” não foi encontrado.`);
});

$('#btn-guardar').addEventListener('click', async () => {
  const caminho = await api.guardarSrt({ conteudo: gerarSrt(legendas), origem: ficheiro });
  if (!caminho) return;
  srtGuardado = caminho;
  $('#btn-mostrar').hidden = false;
  guardarRascunho();
  aviso(`Guardado: ${nomeFicheiro(caminho)}`);
});
$('#btn-mostrar').addEventListener('click', () => api.mostrar(srtGuardado));

$('#btn-novo').addEventListener('click', () => {
  if (!srtGuardado && legendas.length && !confirm('Ainda não guardaste o .srt destas legendas. Começar outro vídeo na mesma?')) return;
  video.pause();
  video.removeAttribute('src');
  legendas = [];
  ficheiro = null;
  srtGuardado = null;
  try { localStorage.removeItem(CHAVE_RASCUNHO); } catch {}
  $('#ficheiro-nome').textContent = '';
  $('#editor').hidden = true;
  $('#novo').hidden = false;
  $('#btn-novo').hidden = true;
  $('#retomar').hidden = true;
  atualizarBotao();
});

document.addEventListener('keydown', e => {
  // Espaço fora de um campo de texto: reproduzir / pausar.
  if (e.code === 'Space' && !$('#editor').hidden && !e.target.matches('input, textarea, button')) {
    e.preventDefault();
    if (!video.hidden) (video.paused ? video.play() : video.pause());
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !$('#editor').hidden) { e.preventDefault(); $('#btn-guardar').click(); }
});

// ---------- Arranque ----------

function retomarRascunho() {
  let r;
  try { r = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO)); } catch { return; }
  if (!r || !r.ficheiro || !Array.isArray(r.legendas) || !r.legendas.length) return;
  const el = $('#retomar');
  el.innerHTML = `Tens legendas por terminar de <b></b>. <button>Continuar</button>`;
  $('b', el).textContent = nomeFicheiro(r.ficheiro);
  el.hidden = false;
  $('button', el).addEventListener('click', () => {
    ficheiro = r.ficheiro;
    legendas = r.legendas;
    srtGuardado = r.srtGuardado || null;
    abrirEditor();
  });
}

if (!api) {
  $('#so-mac').hidden = false;
  $('#novo').hidden = true;
} else {
  if (navigator.userAgent.includes('Mac')) document.body.classList.add('electron');
  const o = lerOpcoes();
  if (o.modo) $(`input[name=modo][value="${o.modo}"]`).checked = true;
  if (o.prompt) $('#prompt').value = o.prompt;
  if (o.maxCar) $('#max-car').value = o.maxCar;
  if (o.maxLinhas) $('#max-linhas').value = o.maxLinhas;
  verificar();
  retomarRascunho();
}
