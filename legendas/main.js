const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, safeStorage, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

app.setPath('userData', path.join(app.getPath('appData'), 'Legendas'));

const MODELO = {
  nome: 'ggml-large-v3-turbo.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
  tamanho: 1624555275,
};

// ---------- Configuração ----------

const ficheiroConfig = () => path.join(app.getPath('userData'), 'config.json');
function lerConfig() {
  try { return JSON.parse(fs.readFileSync(ficheiroConfig(), 'utf8')); } catch { return {}; }
}
function gravarConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(ficheiroConfig(), JSON.stringify(config, null, 2));
}

// A chave do DeepL fica cifrada com o Porta-chaves do Mac quando possível.
function lerChaveDeepl() {
  const { deepl } = lerConfig();
  if (!deepl) return '';
  try { return deepl.cifrada ? safeStorage.decryptString(Buffer.from(deepl.valor, 'base64')) : deepl.valor; } catch { return ''; }
}
function gravarChaveDeepl(chave) {
  const config = lerConfig();
  if (!chave) delete config.deepl;
  else if (safeStorage.isEncryptionAvailable()) config.deepl = { cifrada: true, valor: safeStorage.encryptString(chave).toString('base64') };
  else config.deepl = { cifrada: false, valor: chave };
  gravarConfig(config);
}

// ---------- Programas necessários (instalados com o Homebrew) ----------

// Apps abertas pelo Finder não herdam o PATH do Terminal, por isso procura nas pastas do Homebrew.
const PASTAS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
function procurar(nomes) {
  for (const pasta of PASTAS) {
    for (const nome of nomes) {
      const p = path.join(pasta, nome);
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
    }
  }
  return null;
}

const caminhoModelo = () => process.env.LEGENDAS_MODELO || path.join(app.getPath('userData'), 'modelos', MODELO.nome);

function estadoDependencias() {
  const modelo = caminhoModelo();
  return {
    ffmpeg: process.env.LEGENDAS_FFMPEG || procurar(['ffmpeg']),
    whisper: process.env.LEGENDAS_WHISPER || procurar(['whisper-cli', 'whisper-cpp']),
    modelo: fs.existsSync(modelo) ? modelo : null,
    tamanhoModelo: MODELO.tamanho,
    temChaveDeepl: !!lerChaveDeepl(),
  };
}

// ---------- Execução de processos com cancelamento ----------

let processoAtual = null;
let cancelado = false;

function correr(programa, args, aoLer) {
  return new Promise((resolve, reject) => {
    const p = spawn(programa, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    processoAtual = p;
    let ultimas = '';
    const ler = dados => {
      const texto = dados.toString();
      ultimas = (ultimas + texto).slice(-3000);
      if (aoLer) texto.split(/\r?\n|\r/).forEach(aoLer);
    };
    p.stdout.on('data', ler);
    p.stderr.on('data', ler);
    p.on('error', reject);
    p.on('close', codigo => {
      processoAtual = null;
      if (cancelado) reject(new Error('CANCELADO'));
      else if (codigo === 0) resolve();
      else reject(new Error(`${path.basename(programa)} terminou com erro (${codigo}):\n${ultimas.trim().split('\n').slice(-6).join('\n')}`));
    });
  });
}

ipcMain.handle('dependencias', () => estadoDependencias());

ipcMain.handle('cancelar', () => {
  cancelado = true;
  if (processoAtual) processoAtual.kill('SIGTERM');
  if (descarga) descarga.abort();
});

ipcMain.handle('transcrever', async (e, { ficheiro, lingua, prompt }) => {
  const dep = estadoDependencias();
  if (!dep.ffmpeg || !dep.whisper || !dep.modelo) throw new Error('Faltam programas ou o modelo. Vê a secção Preparação.');
  const enviar = dados => { if (!e.sender.isDestroyed()) e.sender.send('progresso', dados); };
  cancelado = false;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'legendas-'));
  try {
    enviar({ fase: 'A extrair o áudio do vídeo…', pct: null });
    const wav = path.join(pasta, 'audio.wav');
    await correr(dep.ffmpeg, ['-hide_banner', '-nostdin', '-y', '-i', ficheiro, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);

    enviar({ fase: 'A reconhecer a fala…', pct: 0 });
    const saida = path.join(pasta, 'resultado');
    const args = ['-m', dep.modelo, '-f', wav, '-l', lingua, '-oj', '-of', saida, '-pp', '-sns',
      '-t', String(Math.min(8, Math.max(2, os.cpus().length - 2)))];
    if (prompt) args.push('--prompt', prompt);
    await correr(dep.whisper, args, linha => {
      const m = /progress\s*=\s*(\d+)%/.exec(linha);
      if (m) enviar({ fase: 'A reconhecer a fala…', pct: Math.min(100, +m[1]) });
    });

    const json = JSON.parse(fs.readFileSync(`${saida}.json`, 'utf8'));
    return (json.transcription || []).map(s => ({ inicio: s.offsets.from, fim: s.offsets.to, texto: s.text }));
  } finally {
    fs.rm(pasta, { recursive: true, force: true }, () => {});
  }
});

// ---------- Tradução (DeepL) ----------

ipcMain.handle('deepl:guardar', (_e, chave) => { gravarChaveDeepl((chave || '').trim()); return { ok: true }; });

ipcMain.handle('traduzir', async (_e, textos) => {
  const chave = lerChaveDeepl();
  if (!chave) throw new Error('Falta a chave do DeepL. Põe-na nas opções de tradução.');
  const servidor = chave.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const traduzidos = [];
  for (let i = 0; i < textos.length; i += 50) {
    const lote = textos.slice(i, i + 50);
    const res = await fetch(`https://${servidor}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${chave}`, 'Content-Type': 'application/json' },
      // O texto à volta ajuda o DeepL a traduzir frases que o Whisper partiu a meio.
      body: JSON.stringify({ text: lote, source_lang: 'EN', target_lang: 'PT-PT', context: textos.slice(Math.max(0, i - 3), i + 53).join(' ') }),
    });
    if (!res.ok) {
      throw new Error(res.status === 403 ? 'A chave do DeepL não é válida.'
        : res.status === 456 ? 'Atingiste o limite mensal gratuito do DeepL.'
        : `O DeepL respondeu com erro (${res.status}).`);
    }
    const dados = await res.json();
    traduzidos.push(...dados.translations.map(t => t.text));
  }
  return traduzidos;
});

// ---------- Descarga do modelo ----------

let descarga = null;

ipcMain.handle('modelo:descarregar', async e => {
  const destino = caminhoModelo();
  const parcial = `${destino}.parcial`;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  descarga = new AbortController();
  try {
    const res = await fetch(MODELO.url, { signal: descarga.signal });
    if (!res.ok) throw new Error(`Não foi possível descarregar o modelo (${res.status}).`);
    const total = +res.headers.get('content-length') || MODELO.tamanho;
    const ficheiro = fs.createWriteStream(parcial);
    let recebido = 0;
    let ultimo = 0;
    for await (const pedaco of res.body) {
      recebido += pedaco.length;
      if (!ficheiro.write(pedaco)) await new Promise(r => ficheiro.once('drain', r));
      if (Date.now() - ultimo > 250) { ultimo = Date.now(); e.sender.send('modelo:progresso', { recebido, total }); }
    }
    await new Promise((r, j) => ficheiro.end(err => (err ? j(err) : r())));
    fs.renameSync(parcial, destino);
    return { ok: true };
  } catch (err) {
    fs.rm(parcial, { force: true }, () => {});
    if (err.name === 'AbortError') throw new Error('CANCELADO');
    throw err;
  } finally {
    descarga = null;
  }
});

// ---------- Ficheiros ----------

const VIDEO = ['mp4', 'mov', 'm4v', 'mkv', 'mxf', 'avi', 'webm', 'mts', 'm2ts', 'wav', 'mp3', 'm4a', 'aac', 'flac', 'aif', 'aiff'];

ipcMain.handle('escolher', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Vídeo ou áudio', extensions: VIDEO }] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('guardar-srt', async (_e, { conteudo, origem }) => {
  const sugestao = origem ? path.join(path.dirname(origem), `${path.parse(origem).name}.srt`) : 'legendas.srt';
  const r = await dialog.showSaveDialog({ defaultPath: sugestao, filters: [{ name: 'Legendas SRT', extensions: ['srt'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, conteudo, 'utf8');
  return r.filePath;
});

ipcMain.handle('mostrar', (_e, ficheiro) => shell.showItemInFolder(ficheiro));
ipcMain.handle('copiar', (_e, texto) => clipboard.writeText(String(texto)));
ipcMain.handle('abrir-link', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

// ---------- Janela ----------

function criarJanela() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Legendas',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121211' : '#f6f5f2',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  criarJanela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on('window-all-closed', () => {
  if (processoAtual) processoAtual.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
