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
