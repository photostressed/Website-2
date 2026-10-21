const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Pontes entre a página e o processo principal (ffmpeg, Whisper, ficheiros, DeepL).
contextBridge.exposeInMainWorld('appLegendas', {
  dependencias: () => ipcRenderer.invoke('dependencias'),
  descarregarModelo: () => ipcRenderer.invoke('modelo:descarregar'),
  transcrever: opcoes => ipcRenderer.invoke('transcrever', opcoes),
  traduzir: textos => ipcRenderer.invoke('traduzir', textos),
  guardarChaveDeepl: chave => ipcRenderer.invoke('deepl:guardar', chave),
  cancelar: () => ipcRenderer.invoke('cancelar'),
  escolher: () => ipcRenderer.invoke('escolher'),
  guardarSrt: dados => ipcRenderer.invoke('guardar-srt', dados),
  mostrar: ficheiro => ipcRenderer.invoke('mostrar', ficheiro),
  copiar: texto => ipcRenderer.invoke('copiar', texto),
  abrirLink: url => ipcRenderer.invoke('abrir-link', url),
  caminhoDe: ficheiro => webUtils.getPathForFile(ficheiro),
  // file:// com cada parte do caminho codificada (espaços, acentos, #, ?).
  urlDe: caminho => 'file://' + caminho.split('/').map(encodeURIComponent).join('/'),
  aoProgresso: fn => ipcRenderer.on('progresso', (_e, d) => fn(d)),
  aoProgressoModelo: fn => ipcRenderer.on('modelo:progresso', (_e, d) => fn(d)),
});
