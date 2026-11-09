const { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, shell, systemPreferences } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Pasta de dados com nome sem acentos, igual em `npm start` e na app instalada.
app.setPath('userData', path.join(app.getPath('appData'), 'Financas'));

// ---------- Configuração da app (fora do localStorage, para o processo principal a ler antes de abrir) ----------

const ficheiroConfig = () => path.join(app.getPath('userData'), 'config.json');

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(ficheiroConfig(), 'utf8')); } catch { return {}; }
}

function gravarConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(ficheiroConfig(), JSON.stringify(config, null, 2));
}

// ---------- Touch ID ----------

const touchIdDisponivel = () => process.platform === 'darwin' && systemPreferences.canPromptTouchID();
const bloqueioAtivo = () => lerConfig().touchId === true;

async function pedirTouchId(motivo) {
  try {
    await systemPreferences.promptTouchID(motivo);
    return true;
  } catch {
    return false;
  }
}

// Pede a impressão digital até ser aceite ou a pessoa desistir. Devolve true se desbloqueou.
async function desbloquear() {
  if (!bloqueioAtivo()) return true;
  for (;;) {
    if (!touchIdDisponivel()) {
      await dialog.showMessageBox({
        type: 'warning',
        message: 'O Touch ID não está disponível',
        detail: 'A app está protegida com impressão digital. Abre a tampa do MacBook (ou usa um teclado com Touch ID) e volta a abrir a app.',
        buttons: ['Sair'],
      });
      return false;
    }
    if (await pedirTouchId('desbloquear as tuas finanças')) return true;
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: 'Impressão digital não reconhecida',
      buttons: ['Tentar outra vez', 'Sair'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 1) return false;
  }
}

ipcMain.handle('touchid:estado', () => ({ disponivel: touchIdDisponivel(), ativo: bloqueioAtivo() }));

ipcMain.handle('touchid:definir', async (_e, ativar) => {
  if (ativar) {
    if (!touchIdDisponivel()) return { ok: false, erro: 'O Touch ID não está disponível neste Mac.' };
    // Confirma que a impressão digital funciona antes de ativar o bloqueio.
    if (!(await pedirTouchId('ativar o bloqueio com impressão digital'))) return { ok: false, erro: 'Impressão digital não confirmada.' };
  }
  gravarConfig({ ...lerConfig(), touchId: !!ativar });
  return { ok: true };
});

// ---------- Documentos (recibos, comprovativos) ----------

// Os ficheiros são copiados para uma pasta própria (por omissão dentro dos dados da app;
// pode ser mudada, por exemplo para o iCloud Drive). O caminho fica num ficheiro à parte.
const ficheiroPastaDocs = () => path.join(app.getPath('userData'), 'pasta-documentos.txt');
const pastaDocsPadrao = () => path.join(app.getPath('userData'), 'documentos');
function pastaDocs() {
  try { const p = fs.readFileSync(ficheiroPastaDocs(), 'utf8').trim(); if (p) return p; } catch {}
  return pastaDocsPadrao();
}
// Só aceita nomes gerados pela app (sem barras), para nunca sair da pasta dos documentos.
const NOME_VALIDO = /^[\w .-]+\.[a-z0-9]{1,5}$/i;
function caminhoDoc(nome) {
  if (!NOME_VALIDO.test(nome) || nome.includes('..')) throw new Error('Nome de ficheiro inválido.');
  return path.join(pastaDocs(), nome);
}
const EXTENSOES = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'gif', 'tif', 'tiff', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'xml', 'zip'];

ipcMain.handle('docs:escolher', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Documentos', extensions: EXTENSOES }, { name: 'Todos os ficheiros', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('docs:info', (_e, origem) => {
  const st = fs.statSync(origem);
  if (!st.isFile()) throw new Error('Isto não é um ficheiro.');
  return { nome: path.basename(origem), tamanho: st.size };
});

// Copia o ficheiro para a pasta dos documentos com um nome legível e único.
ipcMain.handle('docs:guardar', (_e, { origem, prefixo }) => {
  const pasta = pastaDocs();
  fs.mkdirSync(pasta, { recursive: true });
  const ext = (path.extname(origem).slice(1) || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const base = String(prefixo || 'documento').replace(/º/g, 'o').replace(/ª/g, 'a').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'documento';
  let nome = `${base}.${ext}`;
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = `${base}-${i}.${ext}`;
  fs.copyFileSync(origem, path.join(pasta, nome), fs.constants.COPYFILE_EXCL);
  return { ficheiro: nome, tamanho: fs.statSync(path.join(pasta, nome)).size };
});

ipcMain.handle('docs:abrir', async (_e, nome) => {
  const erro = await shell.openPath(caminhoDoc(nome));
  if (erro) throw new Error(erro);
});
ipcMain.handle('docs:mostrar', (_e, nome) => shell.showItemInFolder(caminhoDoc(nome)));
ipcMain.handle('docs:apagar', (_e, nome) => fs.rmSync(caminhoDoc(nome), { force: true }));
ipcMain.handle('docs:existentes', () => { try { return fs.readdirSync(pastaDocs()); } catch { return []; } });
ipcMain.handle('docs:pasta', () => pastaDocs());
ipcMain.handle('docs:abrir-pasta', () => { fs.mkdirSync(pastaDocs(), { recursive: true }); return shell.openPath(pastaDocs()); });

// Muda a pasta: copia os documentos que já existem e só depois apaga os originais.
ipcMain.handle('docs:mudar-pasta', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], message: 'Escolhe a pasta onde guardar os documentos (por exemplo, no iCloud Drive).' });
  if (r.canceled || !r.filePaths[0]) return null;
  const antiga = pastaDocs();
  const nova = r.filePaths[0];
  if (path.resolve(nova) === path.resolve(antiga)) return nova;
  fs.mkdirSync(nova, { recursive: true });
  let nomes = [];
  try { nomes = fs.readdirSync(antiga).filter(n => NOME_VALIDO.test(n)); } catch {}
  for (const n of nomes) {
    if (fs.existsSync(path.join(nova, n))) throw new Error(`Já existe “${n}” na pasta escolhida. Escolhe uma pasta vazia.`);
  }
  for (const n of nomes) fs.copyFileSync(path.join(antiga, n), path.join(nova, n));
  fs.writeFileSync(ficheiroPastaDocs(), nova);
  for (const n of nomes) fs.rmSync(path.join(antiga, n), { force: true });
  return nova;
});

// ---------- Janela ----------

let aDesbloquear = false;

function criarJanela() {
  const win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Finanças',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121211' : '#f6f5f2',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Links externos abrem no browser, nunca dentro da app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function abrir() {
  if (aDesbloquear || BrowserWindow.getAllWindows().length) return;
  aDesbloquear = true;
  const ok = await desbloquear();
  aDesbloquear = false;
  if (ok) criarJanela();
  else app.quit();
}

// Fecha as janelas para que seja preciso desbloquear outra vez.
function bloquear() {
  if (!bloqueioAtivo()) return;
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
}

app.whenReady().then(() => {
  abrir();
  app.on('activate', abrir);
  powerMonitor.on('lock-screen', bloquear);
  powerMonitor.on('suspend', bloquear);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
