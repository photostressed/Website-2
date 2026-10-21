'use strict';

// Funções sem dependências: tempos, limpeza do texto do Whisper, divisão em legendas e formato SRT.
// Usadas pela página e pelos testes em Node.

const doisDig = n => String(n).padStart(2, '0');

// 83456 → "00:01:23,456"
function formatarTempo(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${doisDig(h)}:${doisDig(m)}:${doisDig(s)},${String(ms % 1000).padStart(3, '0')}`;
}

// Aceita "01:23,4", "1:23.456", "00:01:23,456". Devolve ms ou null.
function lerTempo(texto) {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?\s*$/.exec(texto || '');
  if (!m) return null;
  const [, h = '0', min, s, frac = '0'] = m;
  if (+min > 59 || +s > 59) return null;
  return ((+h * 60 + +min) * 60 + +s) * 1000 + +frac.padEnd(3, '0');
}

// Frases que o Whisper "inventa" em silêncio ou música (vêm dos dados de treino).
const ALUCINACOES = [
  /amara\.org/i,
  /legendas? (pela|da) comunidade/i,
  /subtitles? by the amara/i,
  /^\s*(legendas?|subtítulos?) (por|de)\b.{0,40}$/i,
];

// Marcas de som como [Música], (risos), ♪ — não são fala.
const MARCA_SOM = /^[\s\-–—]*([[(].*[\])]|♪+.*♪*|\*.*\*)[\s.]*$/;

function limparSegmentos(segmentos, { removerMarcas = true } = {}) {
  const limpos = [];
  for (const s of segmentos) {
    let texto = String(s.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    if (ALUCINACOES.some(r => r.test(texto))) continue;
    if (removerMarcas) {
      if (MARCA_SOM.test(texto)) continue;
      texto = texto.replace(/\s*[[(][^\])]{1,30}[\])]\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (!texto) continue;
    }
    if (!(s.fim > s.inicio)) continue;
    const anterior = limpos[limpos.length - 1];
    // O Whisper às vezes repete a mesma frase em ciclo; junta repetições seguidas.
    if (anterior && anterior.texto.toLowerCase() === texto.toLowerCase()) { anterior.fim = Math.max(anterior.fim, s.fim); continue; }
    limpos.push({ inicio: s.inicio, fim: s.fim, texto });
  }
  return limpos;
}

// Divide o texto em até maxLinhas linhas com no máximo maxCar caracteres, equilibradas
// e, se possível, cortadas depois de pontuação. Devolve null se não couber.
function quebrarLinhas(texto, maxCar, maxLinhas) {
  if (texto.length <= maxCar) return [texto];
  if (maxLinhas < 2) return null;
  const palavras = texto.split(' ');
  let melhor = null;
  for (let i = 1; i < palavras.length; i++) {
    const a = palavras.slice(0, i).join(' ');
    const b = palavras.slice(i).join(' ');
    if (a.length > maxCar) break;
    if (b.length > maxCar && maxLinhas === 2) continue;
    let custo = Math.abs(a.length - b.length);
    if (/[.!?]$/.test(a)) custo -= 12;
    else if (/[,;:]$/.test(a)) custo -= 8;
    // Evita deixar uma palavra curta sozinha no fim da primeira linha ("de", "a", "o"...).
    if (/^\S{1,2}$/.test(palavras[i - 1])) custo += 6;
    if (!melhor || custo < melhor.custo) melhor = { custo, linhas: [a, b] };
  }
  if (!melhor) return null;
  if (melhor.linhas[1].length > maxCar) {
    const resto = quebrarLinhas(melhor.linhas[1], maxCar, maxLinhas - 1);
    return resto ? [melhor.linhas[0], ...resto] : null;
  }
  return melhor.linhas;
}

// Transforma segmentos do Whisper (frases com tempos) em legendas curtas e legíveis.
// Frases longas são partidas em vários blocos; o tempo é repartido pelo nº de caracteres.
function dividirEmLegendas(segmentos, { maxCar = 42, maxLinhas = 2 } = {}) {
  const capacidade = maxCar * maxLinhas;
  const cabe = txt => quebrarLinhas(txt, maxCar, maxLinhas) !== null;
  const legendas = [];
  for (const s of segmentos) {
    const palavras = s.texto.split(' ').filter(Boolean);
    const blocos = [];
    let atual = [];
    for (const p of palavras) {
      if (atual.length && !cabe([...atual, p].join(' '))) { blocos.push(atual); atual = []; }
      atual.push(p);
      const txt = atual.join(' ');
      // Prefere terminar a legenda no fim de uma frase ou numa vírgula, se já vai a meio.
      if (/[.!?…]$/.test(p) && txt.length >= capacidade * 0.45) { blocos.push(atual); atual = []; }
      else if (/[,;:]$/.test(p) && txt.length >= capacidade * 0.7) { blocos.push(atual); atual = []; }
    }
    if (atual.length) blocos.push(atual);
    // Não deixa uma última legenda com uma ou duas palavras soltas: junta-a à anterior se couber.
    if (blocos.length > 1 && blocos[blocos.length - 1].join(' ').length < 12) {
      const junto = [...blocos[blocos.length - 2], ...blocos[blocos.length - 1]];
      if (cabe(junto.join(' '))) blocos.splice(-2, 2, junto);
    }

    const textos = blocos.map(b => b.join(' '));
    const total = textos.reduce((n, t) => n + t.length, 0);
    const duracao = s.fim - s.inicio;
    let t = s.inicio;
    textos.forEach((txt, i) => {
      const fim = i === textos.length - 1 ? s.fim : Math.round(t + duracao * txt.length / total);
      legendas.push({ inicio: t, fim, texto: (quebrarLinhas(txt, maxCar, maxLinhas) || [txt]).join('\n') });
      t = fim;
    });
  }
  return legendas;
}

// Corrige sobreposições e durações impossíveis antes de exportar.
function arrumarTempos(legendas) {
  const ordenadas = [...legendas].sort((a, b) => a.inicio - b.inicio);
  return ordenadas.map((l, i) => {
    const seguinte = ordenadas[i + 1];
    let fim = Math.max(l.fim, l.inicio + 300);
    if (seguinte && fim > seguinte.inicio) fim = Math.max(l.inicio + 100, seguinte.inicio);
    return { ...l, fim };
  });
}

function gerarSrt(legendas) {
  return arrumarTempos(legendas)
    .filter(l => l.texto.trim())
    .map((l, i) => `${i + 1}\n${formatarTempo(l.inicio)} --> ${formatarTempo(l.fim)}\n${l.texto.trim()}\n`)
    .join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = { formatarTempo, lerTempo, limparSegmentos, quebrarLinhas, dividirEmLegendas, arrumarTempos, gerarSrt };
}
