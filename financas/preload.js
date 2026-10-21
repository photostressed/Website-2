const { contextBridge, ipcRenderer } = require('electron');

// Funções da app de Mac disponíveis na página (só existem dentro do Electron).
contextBridge.exposeInMainWorld('appMac', {
  estadoTouchId: () => ipcRenderer.invoke('touchid:estado'),
  definirTouchId: ativar => ipcRenderer.invoke('touchid:definir', ativar),
});
