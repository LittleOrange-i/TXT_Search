// 预加载脚本 - 在 Monaco Editor 加载之前初始化 Electron
// 这个脚本在 Monaco 的 AMD 加载器启动之前运行

// 保存原生的 require 和 Electron API
window.electronAPI = {
  ipcRenderer: require('electron').ipcRenderer
};

console.log('Electron API 已初始化');
