// 预加载脚本 - 安全地暴露 Electron API 到渲染进程
const { contextBridge, ipcRenderer } = require('electron');

// 使用 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', {
  ipcRenderer: {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      ipcRenderer.on(channel, listener);
    },
    once: (channel, listener) => {
      ipcRenderer.once(channel, listener);
    },
    removeListener: (channel, listener) => {
      ipcRenderer.removeListener(channel, listener);
    }
  }
});

console.log('Electron API 已安全初始化（使用 contextBridge）');
