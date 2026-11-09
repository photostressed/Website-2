const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Funções da app de Mac disponíveis na página (só existem dentro do Electron).
contextBridge.exposeInMainWorld('appMac', {
  estadoTouchId: () => ipcRenderer.invoke('touchid:estado'),
  definirTouchId: ativar => ipcRenderer.invoke('touchid:definir', ativar),
  docs: {
    escolher: () => ipcRenderer.invoke('docs:escolher'),
    info: origem => ipcRenderer.invoke('docs:info', origem),
    guardar: dados => ipcRenderer.invoke('docs:guardar', dados),
    abrir: nome => ipcRenderer.invoke('docs:abrir', nome),
    mostrar: nome => ipcRenderer.invoke('docs:mostrar', nome),
    apagar: nome => ipcRenderer.invoke('docs:apagar', nome),
    existentes: () => ipcRenderer.invoke('docs:existentes'),
    pasta: () => ipcRenderer.invoke('docs:pasta'),
    abrirPasta: () => ipcRenderer.invoke('docs:abrir-pasta'),
    mudarPasta: () => ipcRenderer.invoke('docs:mudar-pasta'),
    caminhoDe: ficheiro => webUtils.getPathForFile(ficheiro),
  },
});
