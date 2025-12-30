// 渲染进程脚本 - 处理UI交互和Monaco Editor

// 从预加载脚本中获取 Electron API
const { ipcRenderer } = window.electronAPI;

let editor; // Monaco编辑器实例
let currentFilePath = null; // 当前文件路径
let searchResults = []; // 搜索结果数组
let currentSearchKeyword = ''; // 当前搜索关键字
let replacedCount = 0; // 已替换计数
let ignoredCount = 0; // 已忽略计数
let isSearching = false; // 是否正在搜索
let searchAborted = false; // 搜索是否被中止

// 虚拟列表队列相关
let renderQueue = []; // 待渲染队列（分组后的结果）
let renderedGroups = []; // 已渲染的分组
const MAX_RENDERED_ITEMS = 200; // 最大同时渲染的结果项数量

// DOM元素引用
let openFileBtn, saveFileBtn, saveAsBtn, filePathDisplay;
let searchInput, replaceInput, searchBtn, stopSearchBtn, replaceAllBtn, searchInfo;
let resultsModal, closeModal, backToEditor, resultsList, resultCount, replacedCountEl, ignoredCountEl;
let queueInfo, queueCountEl; // 队列信息显示
let compareBtn, comparisonSidebar, closeSidebar;
let compareCount, compareOldText, compareNewText, comparisonList;
let paragraphModal, closeParagraphModal, prevParagraph, currentParagraph, nextParagraph; // 段落详情弹窗元素
let customAlertModal, alertTitle, alertMessage, alertConfirmBtn, closeAlertModal; // 自定义Alert
let customConfirmModal, confirmTitle, confirmMessage, confirmOkBtn, confirmCancelBtn, closeConfirmModal; // 自定义Confirm
let customPromptModal, promptTitle, promptMessage, promptInput, promptOkBtn, promptCancelBtn, closePromptModal; // 自定义Prompt
let secondaryFilterBtn; // 二次过滤按钮

// 输入框映射记录数组（仅记录关键字和替换文本的对应关系）
let mappingHistory = [];

// 忽略的结果字段数组（存储被忽略的结果字段，用于过滤搜索结果）
let ignoredResultFields = [];

// 快捷字段数组（存储常用的替换文本，用于快速选择）
let quickFields = [];

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  // 获取DOM元素
  openFileBtn = document.getElementById('openFileBtn');
  saveFileBtn = document.getElementById('saveFileBtn');
  saveAsBtn = document.getElementById('saveAsBtn');
  filePathDisplay = document.getElementById('filePath');
  searchInput = document.getElementById('searchInput');
  replaceInput = document.getElementById('replaceInput');
  searchBtn = document.getElementById('searchBtn');
  stopSearchBtn = document.getElementById('stopSearchBtn');
  replaceAllBtn = document.getElementById('replaceAllBtn');
  searchInfo = document.getElementById('searchInfo');
  resultsModal = document.getElementById('resultsModal');
  closeModal = document.getElementById('closeModal');
  backToEditor = document.getElementById('backToEditor');
  resultsList = document.getElementById('resultsList');
  resultCount = document.getElementById('resultCount');
  replacedCountEl = document.getElementById('replacedCount');
  ignoredCountEl = document.getElementById('ignoredCount');
  queueInfo = document.getElementById('queueInfo');
  queueCountEl = document.getElementById('queueCount');
  
  // 替换对照相关元素
  compareBtn = document.getElementById('compareBtn');
  comparisonSidebar = document.getElementById('comparisonSidebar');
  closeSidebar = document.getElementById('closeSidebar');
  confirmReplaceBtn = document.getElementById('confirmReplaceBtn');
  cancelReplaceBtn = document.getElementById('cancelReplaceBtn');
  compareCount = document.getElementById('compareCount');
  compareOldText = document.getElementById('compareOldText');
  compareNewText = document.getElementById('compareNewText');
  comparisonList = document.getElementById('comparisonList');
  
  // 段落详情弹窗元素
  paragraphModal = document.getElementById('paragraphModal');
  closeParagraphModal = document.getElementById('closeParagraphModal');
  prevParagraph = document.getElementById('prevParagraph');
  currentParagraph = document.getElementById('currentParagraph');
  nextParagraph = document.getElementById('nextParagraph');
  
  // 自定义Alert弹窗元素
  customAlertModal = document.getElementById('customAlertModal');
  alertTitle = document.getElementById('alertTitle');
  alertMessage = document.getElementById('alertMessage');
  alertConfirmBtn = document.getElementById('alertConfirmBtn');
  closeAlertModal = document.getElementById('closeAlertModal');
  
  // 自定义Confirm弹窗元素
  customConfirmModal = document.getElementById('customConfirmModal');
  confirmTitle = document.getElementById('confirmTitle');
  confirmMessage = document.getElementById('confirmMessage');
  confirmOkBtn = document.getElementById('confirmOkBtn');
  confirmCancelBtn = document.getElementById('confirmCancelBtn');
  closeConfirmModal = document.getElementById('closeConfirmModal');
  
  // 自定义Prompt弹窗元素
  customPromptModal = document.getElementById('customPromptModal');
  promptTitle = document.getElementById('promptTitle');
  promptMessage = document.getElementById('promptMessage');
  promptInput = document.getElementById('promptInput');
  promptOkBtn = document.getElementById('promptOkBtn');
  promptCancelBtn = document.getElementById('promptCancelBtn');
  closePromptModal = document.getElementById('closePromptModal');
  
  // 二次过滤按钮
  secondaryFilterBtn = document.getElementById('secondaryFilterBtn');

  // 初始化Monaco编辑器
  initMonacoEditor();
  
  // 绑定事件监听器
  bindEventListeners();
});

// 初始化Monaco编辑器
function initMonacoEditor() {
  require.config({ paths: { vs: 'node_modules/monaco-editor/min/vs' } });

  require(['vs/editor/editor.main'], function () {
    // 创建编辑器实例
    editor = monaco.editor.create(document.getElementById('editor'), {
      value: '// 请点击"打开文件"按钮加载TXT文件\n// 或直接在此编辑文本内容',
      language: 'plaintext',
      theme: 'vs',
      fontSize: 14,
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      minimap: {
        enabled: false  // 禁用侧边预览
      },
      wordWrap: 'on',
      readOnly: false,
      unicodeHighlight: {
        ambiguousCharacters: false,  // 禁用不可见Unicode字符提示
        invisibleCharacters: false   // 禁用不可见字符高亮
      }
    });

    // 监听编辑器内容变化
    editor.onDidChangeModelContent(() => {
      updateSaveButtons();
    });
    
    console.log('Monaco Editor 初始化成功');
  });
}

// 绑定所有事件监听器
function bindEventListeners() {
  // 打开文件
  openFileBtn.addEventListener('click', async () => {
    console.log('点击了打开文件按钮');
    try {
      const result = await ipcRenderer.invoke('open-file-dialog');
      console.log('文件对话框结果:', result);
      
      if (result.success) {
        currentFilePath = result.filePath;
        if (editor) {
          editor.setValue(result.content);
        }
        filePathDisplay.textContent = result.filePath;
        updateSaveButtons();
        clearSearchResults();
      } else if (!result.canceled) {
        customAlert('打开文件失败: ' + result.error);
      }
    } catch (error) {
      console.error('打开文件错误:', error);
      customAlert('打开文件时发生错误: ' + error.message);
    }
  });

  // 保存文件
  saveFileBtn.addEventListener('click', async () => {
    if (!currentFilePath) {
      // 如果没有文件路径，则另存为
      saveAsFile();
      return;
    }
    
    const content = editor.getValue();
    const result = await ipcRenderer.invoke('save-file', currentFilePath, content);
    
    if (result.success) {
      showNotification('文件已保存');
    } else {
      customAlert('保存文件失败: ' + result.error);
    }
  });

  // 另存为
  saveAsBtn.addEventListener('click', saveAsFile);

  // 搜索功能
  searchBtn.addEventListener('click', performSearch);
  
  // 停止搜索
  stopSearchBtn.addEventListener('click', stopSearch);

  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  // 监听搜索框和替换框输入，动态启用/禁用映射按钮
  // 映射按钮显示输入框映射记录，所以只要有映射记录就启用
  const updateCompareButton = () => {
    if (compareBtn) {
      compareBtn.disabled = mappingHistory.length === 0;
    }
  };
  
  // 初始更新按钮状态
  updateCompareButton();

  // 一键替换全部
  replaceAllBtn.addEventListener('click', handleReplaceAll);
  
  // 替换内容对照
  compareBtn.addEventListener('click', showComparisonSidebar);
  
  closeSidebar.addEventListener('click', () => {
    comparisonSidebar.classList.remove('show');
  });
  
  // 关闭段落详情弹窗
  closeParagraphModal.addEventListener('click', () => {
    paragraphModal.classList.remove('show');
  });
  
  // 二次过滤按钮
  if (secondaryFilterBtn) {
    secondaryFilterBtn.addEventListener('click', showSecondaryFilter);
  }
  
  // 删除确认替换和取消按钮的事件监听（历史记录只查看，不操作）
  // confirmReplaceBtn 和 cancelReplaceBtn 按钮可以隐藏或删除

  // 关闭模态框
  closeModal.addEventListener('click', () => {
    resultsModal.classList.remove('show');
  });

  backToEditor.addEventListener('click', () => {
    resultsModal.classList.remove('show');
  });

  // 移除点击模态框外部关闭的功能（只能通过关闭按钮关闭）
  // resultsModal.addEventListener('click', (e) => {
  //   if (e.target === resultsModal) {
  //     resultsModal.classList.remove('show');
  //   }
  // });

  // 键盘快捷键
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

// 保存文件（另存为）
async function saveAsFile() {
  const content = editor.getValue();
  const result = await ipcRenderer.invoke('save-file-as-dialog', content);
  
  if (result.success) {
    currentFilePath = result.filePath;
    filePathDisplay.textContent = result.filePath;
    showNotification('文件已保存');
  } else if (!result.canceled) {
    alert('保存文件失败: ' + result.error);
  }
}

// 更新保存按钮状态
function updateSaveButtons() {
  if (!editor || !saveFileBtn || !saveAsBtn) return;
  const hasContent = editor && editor.getValue().trim().length > 0;
  saveFileBtn.disabled = !hasContent;
  saveAsBtn.disabled = !hasContent;
  
  // 映射按钮状态由映射记录决定
  if (compareBtn) {
    compareBtn.disabled = mappingHistory.length === 0;
  }
}

// 执行静默搜索（多线程版本，支持中断，根据文件大小智能分块）
async function performSilentSearch(keyword) {
  const content = editor.getValue();
  if (!content || content.trim().length === 0) {
    return;
  }
  
  searchAborted = false; // 重置中止标志
  currentSearchKeyword = keyword;
  searchResults = [];
  
  const contentSize = content.length;
  
  // 根据文件大小决定是否使用多线程
  // 小于 100KB 使用单线程，100KB-1MB 使用 2-4 线程，大于 1MB 使用 4-8 线程
  let workerCount = 1;
  if (contentSize < 100 * 1024) {
    workerCount = 1; // 小文件单线程更快
  } else if (contentSize < 1024 * 1024) {
    workerCount = 2; // 中等文件 2 线程
  } else if (contentSize < 5 * 1024 * 1024) {
    workerCount = 4; // 大文件 4 线程
  } else {
    workerCount = 8; // 超大文件 8 线程
  }
  
  searchInfo.textContent = `搜索中... 0% (使用 ${workerCount} 线程)`;
  
  // 如果是单线程，使用原来的逻辑（避免 Worker 开销）
  if (workerCount === 1) {
    return await performSingleThreadSearch(keyword, content);
  }
  
  // 多线程搜索
  return await performMultiThreadSearch(keyword, content, workerCount);
}

// 单线程搜索（优化后的原逻辑）
async function performSingleThreadSearch(keyword, content) {
  const lines = content.split('\n');
  let globalOffset = 0;
  let matchCounter = 0;
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    // 每处理20行让出控制权
    if (lineIndex % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      
      if (searchAborted) {
        searchInfo.textContent = '搜索已停止';
        return false;
      }
      
      const progress = Math.floor((lineIndex / lines.length) * 100);
      searchInfo.textContent = `搜索中... ${progress}% (已找到 ${searchResults.length} 个)`;
    }
    
    const line = lines[lineIndex];
    let startIndex = 0;
    
    while (true) {
      const index = line.indexOf(keyword, startIndex);
      if (index === -1) break;
      
      const absolutePosition = globalOffset + index;
      const beforeChars = content.substring(Math.max(0, absolutePosition - 2), absolutePosition);
      const afterChars = content.substring(absolutePosition + keyword.length, Math.min(content.length, absolutePosition + keyword.length + 2));
      const resultField = beforeChars + keyword + afterChars;
      
      const contextStart = Math.max(0, absolutePosition - 30);
      const contextEnd = Math.min(content.length, absolutePosition + keyword.length + 30);
      const context = content.substring(contextStart, contextEnd);
      
      searchResults.push({
        line: lineIndex + 1,
        column: index + 1,
        position: absolutePosition,
        resultField: resultField,
        context: context,
        beforeChars: beforeChars,
        afterChars: afterChars
      });
      
      startIndex = index + 1;
    }
    
    globalOffset += line.length + 1;
  }
  
  searchInfo.textContent = `找到 ${searchResults.length} 个匹配项`;
  return true;
}

// 多线程搜索（使用 Web Workers）
async function performMultiThreadSearch(keyword, content, workerCount) {
  return new Promise((resolve) => {
    const chunkSize = Math.ceil(content.length / workerCount);
    const workers = [];
    const workerResults = new Array(workerCount);
    let completedWorkers = 0;
    
    // 创建并启动所有 Workers
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('search-worker.js');
      workers.push(worker);
      
      // 计算分块边界（按行分割避免切断关键字）
      let chunkStart = i * chunkSize;
      let chunkEnd = Math.min((i + 1) * chunkSize, content.length);
      
      // 向前扩展到行首（除了第一个分块）
      if (i > 0) {
        while (chunkStart > 0 && content[chunkStart - 1] !== '\n') {
          chunkStart--;
        }
      }
      
      // 向后扩展到行尾（除了最后一个分块）
      if (i < workerCount - 1) {
        while (chunkEnd < content.length && content[chunkEnd] !== '\n') {
          chunkEnd++;
        }
        if (chunkEnd < content.length) chunkEnd++; // 包含换行符
      }
      
      const chunk = content.substring(chunkStart, chunkEnd);
      
      // 计算该分块的起始行号
      let lineNumber = 0;
      for (let j = 0; j < chunkStart; j++) {
        if (content[j] === '\n') lineNumber++;
      }
      
      // 监听 Worker 返回结果
      worker.onmessage = function(e) {
        const { workerId, results } = e.data;
        workerResults[workerId] = results;
        completedWorkers++;
        
        // 更新进度
        const progress = Math.floor((completedWorkers / workerCount) * 100);
        const currentTotal = workerResults.filter(r => r).reduce((sum, r) => sum + r.length, 0);
        searchInfo.textContent = `搜索中... ${progress}% (已找到 ${currentTotal} 个)`;
        
        // 所有 Worker 完成后合并结果
        if (completedWorkers === workerCount) {
          // 检查是否被中止
          if (searchAborted) {
            workers.forEach(w => w.terminate());
            searchInfo.textContent = '搜索已停止';
            resolve(false);
            return;
          }
          
          // 合并所有结果并按位置排序
          searchResults = workerResults.flat().sort((a, b) => a.position - b.position);
          
          // 终止所有 Workers
          workers.forEach(w => w.terminate());
          
          searchInfo.textContent = `找到 ${searchResults.length} 个匹配项`;
          resolve(true);
        }
      };
      
      // 处理 Worker 错误
      worker.onerror = function(error) {
        console.error(`Worker ${i} 错误:`, error);
        worker.terminate();
        completedWorkers++;
        
        if (completedWorkers === workerCount) {
          workers.forEach(w => w.terminate());
          searchInfo.textContent = '搜索出错，已回退到单线程';
          // 回退到单线程搜索
          performSingleThreadSearch(keyword, content).then(resolve);
        }
      };
      
      // 发送任务给 Worker
      worker.postMessage({
        chunk: chunk,
        chunkOffset: chunkStart,
        keyword: keyword,
        workerId: i,
        lineNumber: lineNumber
      });
    }
    
    // 定期检查是否被中止
    const checkAbort = setInterval(() => {
      if (searchAborted) {
        clearInterval(checkAbort);
        workers.forEach(w => w.terminate());
        searchInfo.textContent = '搜索已停止';
        resolve(false);
      }
    }, 100);
    
    // 清理定时器
    Promise.race([
      new Promise(res => setTimeout(res, 60000)), // 最多等待 60 秒
      new Promise(res => {
        const checkComplete = setInterval(() => {
          if (completedWorkers === workerCount) {
            clearInterval(checkComplete);
            clearInterval(checkAbort);
            res();
          }
        }, 50);
      })
    ]);
  });
}

// 执行搜索（显示结果弹窗）- 异步版本
async function performSearch() {
  if (isSearching) {
    return; // 正在搜索中，防止重复点击
  }
  
  const keyword = searchInput.value.trim();
  
  if (!keyword) {
    await customAlert('请输入搜索关键字');
    return;
  }
  
  const content = editor.getValue();
  if (!content || content.trim().length === 0) {
    await customAlert('编辑器内容为空');
    return;
  }
  
  // 显示停止按钮，隐藏搜索按钮
  isSearching = true;
  searchBtn.style.display = 'none';
  stopSearchBtn.style.display = 'inline-flex';
  searchInfo.textContent = '搜索中... 0%';
  
  // 使用 setTimeout 让UI有时间更新
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // 调用异步静默搜索
  const searchCompleted = await performSilentSearch(keyword);
  
  // 恢复按钮状态
  isSearching = false;
  searchBtn.style.display = 'inline-flex';
  stopSearchBtn.style.display = 'none';
  
  if (searchAborted) {
    searchAborted = false;
    // 确保输入框可用
    ensureInputsEnabled();
    return;
  }
  
  if (!searchCompleted) {
    // 搜索被中止
    ensureInputsEnabled();
    return;
  }
  
  if (searchResults.length > 0) {
    // 显示搜索结果弹窗
    showSearchResults();
    
    // 高亮第一个结果
    highlightSearchResult(0);
  } else {
    await customAlert('未找到匹配项');
  }
  
  // 确保输入框可用
  ensureInputsEnabled();
}

// 停止搜索
function stopSearch() {
  searchAborted = true;
  isSearching = false;
  searchBtn.style.display = 'inline-flex';
  stopSearchBtn.style.display = 'none';
  searchInfo.textContent = '搜索已停止';
  
  // 确保输入框可用
  ensureInputsEnabled();
}

// 确保输入框始终可用（修复焦点问题）
function ensureInputsEnabled() {
  setTimeout(() => {
    if (searchInput) {
      searchInput.disabled = false;
      searchInput.style.pointerEvents = 'auto';
      searchInput.style.userSelect = 'text';
      searchInput.style.webkitUserSelect = 'text';
      searchInput.removeAttribute('readonly');
    }
    if (replaceInput) {
      replaceInput.disabled = false;
      replaceInput.style.pointerEvents = 'auto';
      replaceInput.style.userSelect = 'text';
      replaceInput.style.webkitUserSelect = 'text';
      replaceInput.removeAttribute('readonly');
    }
  }, 0);
}

// 显示搜索结果弹窗（带虚拟列表队列优化）
function showSearchResults() {
  // 重置计数
  replacedCount = 0;
  ignoredCount = 0;
  resultCount.textContent = searchResults.length;
  replacedCountEl.textContent = '0';
  ignoredCountEl.textContent = '0';
  resultsList.innerHTML = '';
  
  // 按结果字段分组（相同的前后2字符+关键字归为一组）
  const groupedResults = groupResultsByField();
  
  // 初始化队列系统
  if (groupedResults.length > MAX_RENDERED_ITEMS) {
    // 大数据量：使用队列渲染
    renderQueue = groupedResults.slice(MAX_RENDERED_ITEMS); // 后面的放入队列
    renderedGroups = groupedResults.slice(0, MAX_RENDERED_ITEMS); // 前200个渲染
    
    // 显示队列信息
    updateQueueDisplay();
    
    console.log(`[队列渲染] 总计 ${groupedResults.length} 个分组，初始渲染 ${renderedGroups.length} 个，队列中 ${renderQueue.length} 个`);
  } else {
    // 小数据量：直接全部渲染
    renderQueue = [];
    renderedGroups = groupedResults;
    
    // 隐藏队列信息
    if (queueInfo) queueInfo.style.display = 'none';
  }
  
  // 渲染已渲染队列中的项
  renderedGroups.forEach((group, index) => {
    renderResultItem(group, index);
  });
  
  resultsModal.classList.add('show');
  
  // 聚焦到弹窗容器，使快捷键立即生效
  setTimeout(() => {
    if (resultsModal) {
      resultsModal.focus();
      resultsModal.setAttribute('tabindex', '-1'); // 允许聚焦
    }
  }, 100);
  
  // 确保输入框可用
  ensureInputsEnabled();
}

// 渲染单个结果项（提取为独立函数）
function renderResultItem(group, displayIndex) {
  const resultItem = document.createElement('div');
  resultItem.className = 'result-item';
  resultItem.dataset.status = 'pending'; // 状态：pending, replaced, ignored
  resultItem.dataset.groupId = displayIndex; // 用于追踪
  
  // 序号标签
  const indexBadge = document.createElement('div');
  indexBadge.className = 'result-index';
  indexBadge.textContent = `#${displayIndex + 1}`;
  
  const header = document.createElement('div');
  header.className = 'result-header';
  
  const position = document.createElement('span');
  position.className = 'result-position';
  // 显示所有匹配位置
  if (group.results.length === 1) {
    position.textContent = `行 ${group.results[0].line}, 列 ${group.results[0].column}`;
  } else {
    const firstThree = group.results.slice(0, 3);
    const positionText = firstThree.map(r => `行${r.line}`).join(', ');
    position.textContent = group.results.length > 3 
      ? `${positionText}... (共${group.results.length}处)`
      : positionText;
  }
  
  const count = document.createElement('span');
  count.className = 'result-count';
  count.textContent = `${group.results.length} 个匹配`;
  
  header.appendChild(position);
  header.appendChild(count);
  
  const context = document.createElement('div');
  context.className = 'result-context';
  
  // 显示结果字段，高亮关键字
  const resultField = group.resultField;
  const keyword = currentSearchKeyword;
  
  // 高亮关键字（结果字段 - 金黄色背景）
  const regex = new RegExp(escapeRegExp(keyword), 'g');
  const highlightedField = escapeHtml(resultField).replace(
    new RegExp(escapeRegExp(escapeHtml(keyword)), 'g'),
    match => `<span class="highlight">${match}</span>`
  );
  
  // 高亮上下文中的关键字（红色文本 + 淡红色背景）
  const contextText = group.results[0].context;
  const highlightedContext = escapeHtml(contextText).replace(
    new RegExp(escapeRegExp(escapeHtml(keyword)), 'g'),
    match => `<span style="color: #e53e3e; font-weight: bold; background: rgba(229, 62, 62, 0.1); padding: 1px 3px; border-radius: 2px;">${match}</span>`
  );
  
  context.innerHTML = `<strong>结果字段：</strong>${highlightedField}<br><small>上下文：${highlightedContext}</small>`;
  
  // 创建操作区域（替换输入框和按钮）
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'result-actions';
  
  const replaceInputDiv = document.createElement('div');
  replaceInputDiv.className = 'result-replace-input-group';
  
  const replaceLabel = document.createElement('label');
  replaceLabel.textContent = '替换为：';
  
  const replaceInputField = document.createElement('input');
  replaceInputField.type = 'text';
  replaceInputField.className = 'neumorphic-input result-replace-input';
  replaceInputField.placeholder = '输入替换文本';
  // 防止触发跳转和允许输入
  replaceInputField.addEventListener('click', (e) => e.stopPropagation());
  replaceInputField.addEventListener('mousedown', (e) => e.stopPropagation());
  replaceInputField.addEventListener('focus', (e) => e.stopPropagation());
  replaceInputField.addEventListener('input', (e) => e.stopPropagation());
  
  // 创建快捷字段按钮
  const quickFieldBtn = document.createElement('button');
  quickFieldBtn.className = 'neumorphic-btn quick-field-btn';
  quickFieldBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  quickFieldBtn.title = '选择快捷字段';
  quickFieldBtn.style.cssText = `
    margin-left: 8px;
    padding: 6px 10px;
    min-width: unset;
    height: 32px;
  `;
  quickFieldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showQuickFieldMenu(replaceInputField, quickFieldBtn);
  });
  
  replaceInputDiv.appendChild(replaceLabel);
  replaceInputDiv.appendChild(replaceInputField);
  replaceInputDiv.appendChild(quickFieldBtn);
  
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'result-buttons';
  
  // 段落详情按钮
  const paragraphBtn = document.createElement('button');
  paragraphBtn.className = 'neumorphic-btn result-btn paragraph-btn';
  paragraphBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
    段落详情
  `;
  paragraphBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showParagraphDetail(group.results[0].position);
  });
  
  const replaceBtn = document.createElement('button');
  replaceBtn.className = 'neumorphic-btn result-btn replace-btn';
  replaceBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    替换
  `;
  replaceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSingleReplace(group, replaceInputField.value, resultItem, displayIndex);
  });
  
  const ignoreBtn = document.createElement('button');
  ignoreBtn.className = 'neumorphic-btn result-btn ignore-btn';
  ignoreBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
    忽略
  `;
  ignoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleIgnore(resultItem, displayIndex);
  });
  
  buttonsDiv.appendChild(paragraphBtn);
  buttonsDiv.appendChild(replaceBtn);
  buttonsDiv.appendChild(ignoreBtn);
  
  actionsDiv.appendChild(replaceInputDiv);
  actionsDiv.appendChild(buttonsDiv);
  
  resultItem.appendChild(indexBadge);
  resultItem.appendChild(header);
  resultItem.appendChild(context);
  resultItem.appendChild(actionsDiv);
  
  // 点击结果项跳转到第一个匹配位置
  resultItem.addEventListener('click', () => {
    if (resultItem.dataset.status === 'pending') {
      jumpToSearchResult(group.results[0]);
    }
  });
  
  resultsList.appendChild(resultItem);
}

// 处理单个替换（支持队列补充）
function handleSingleReplace(group, replaceText, resultItem, groupIndex) {
  if (resultItem.dataset.status !== 'pending') return; // 已处理过的不再处理
  
  const keyword = currentSearchKeyword;
  const content = editor.getValue();
  
  // 替换该组的所有匹配项
  let newContent = content;
  let replacedCountInGroup = 0;
  
  // 从后往前替换，避免位置偏移问题
  const sortedResults = group.results.sort((a, b) => b.position - a.position);
  
  sortedResults.forEach(result => {
    const start = result.position;
    const end = start + keyword.length;
    
    // 验证位置是否仍然匹配
    if (newContent.substring(start, end) === keyword) {
      newContent = newContent.substring(0, start) + replaceText + newContent.substring(end);
      replacedCountInGroup++;
    }
  });
  
  if (replacedCountInGroup > 0) {
    // 更新编辑器内容
    const model = editor.getModel();
    const fullRange = model.getFullModelRange();
    editor.executeEdits('single-replace', [{
      range: fullRange,
      text: newContent
    }]);
    
    // 更新状态
    resultItem.dataset.status = 'replaced';
    resultItem.classList.add('replaced');
    replacedCount++;
    replacedCountEl.textContent = replacedCount;
    
    // 添加到映射记录
    updateMappingHistory(keyword, replaceText, replacedCountInGroup);
    
    // 使用动画移除并从队列补充新项
    requestAnimationFrame(() => {
      resultItem.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
      resultItem.style.opacity = '0';
      resultItem.style.transform = 'translateX(20px)';
      
      // 动画完成后处理队列
      setTimeout(() => {
        resultItem.style.display = 'none';
        requestAnimationFrame(() => {
          // 从队列中补充一个新的项
          addNextFromQueue();
          reorderResultItems();
          checkAllCompleted();
        });
      }, 200);
    });
    
    showNotification(`已替换 ${replacedCountInGroup} 处`);
  }
}

// 处理忽略（优化性能，避免卡顿，支持队列补充，记录忽略的结果字段）
function handleIgnore(resultItem, groupIndex) {
  if (resultItem.dataset.status !== 'pending') return; // 已处理过的不再处理
  
  // 获取该组的结果字段并添加到忽略列表
  const groupId = parseInt(resultItem.dataset.groupId);
  if (groupId >= 0 && groupId < renderedGroups.length) {
    const group = renderedGroups[groupId];
    const resultField = group.resultField;
    
    // 提取前3位+关键字+后3位作为忽略字段
    const keyword = currentSearchKeyword;
    const beforeChars = group.results[0].beforeChars;
    const afterChars = group.results[0].afterChars;
    const ignoreField = beforeChars + keyword + afterChars;
    
    // 添加到忽略列表（去重）
    if (!ignoredResultFields.includes(ignoreField)) {
      ignoredResultFields.push(ignoreField);
      console.log(`[忽略记录] 已添加忽略字段: "${ignoreField}"`);
    }
  }
  
  resultItem.dataset.status = 'ignored';
  ignoredCount++;
  ignoredCountEl.textContent = ignoredCount;
  
  // 使用 requestAnimationFrame 优化动画性能
  requestAnimationFrame(() => {
    resultItem.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
    resultItem.style.opacity = '0';
    resultItem.style.transform = 'translateX(-20px)';
    
    // 动画完成后隐藏元素并处理队列
    setTimeout(() => {
      resultItem.style.display = 'none';
      requestAnimationFrame(() => {
        // 从队列中补充一个新的项
        addNextFromQueue();
        reorderResultItems();
        checkAllCompleted();
      });
    }, 200);
  });
}

// 从队列中添加下一个待渲染项
function addNextFromQueue() {
  if (renderQueue.length === 0) {
    return; // 队列为空，不需要补充
  }
  
  // 从队列中取出第一个
  const nextGroup = renderQueue.shift();
  
  // 计算新的显示索引（已渲染的数量）
  const newIndex = renderedGroups.length;
  
  // 添加到已渲染列表
  renderedGroups.push(nextGroup);
  
  // 渲染到DOM
  renderResultItem(nextGroup, newIndex);
  
  // 更新队列显示
  updateQueueDisplay();
  
  console.log(`[队列补充] 从队列添加新项，当前队列剩余: ${renderQueue.length}`);
}

// 更新队列显示信息
function updateQueueDisplay() {
  if (!queueInfo || !queueCountEl) return;
  
  if (renderQueue.length > 0) {
    queueInfo.style.display = 'inline';
    queueCountEl.textContent = renderQueue.length;
  } else {
    queueInfo.style.display = 'none';
  }
}

// 重新排序结果项序号
function reorderResultItems() {
  const visibleItems = Array.from(resultsList.querySelectorAll('.result-item'))
    .filter(item => item.style.display !== 'none');
  
  visibleItems.forEach((item, index) => {
    const indexBadge = item.querySelector('.result-index');
    if (indexBadge) {
      indexBadge.textContent = `#${index + 1}`;
    }
  });
}

// 检查是否所有项都已处理完成（考虑队列）
// skipAutoClose: 是否跳过自动关闭（用于二次过滤等批量操作）
function checkAllCompleted(skipAutoClose = false) {
  const groupedResults = groupResultsByField();
  const totalGroups = groupedResults.length;
  const processedGroups = replacedCount + ignoredCount;
  
  if (processedGroups === totalGroups) {
    if (skipAutoClose) {
      // 批量操作时不自动关闭，只显示提示
      showNotification('✓ 已完成所有项的处理，可以关闭弹窗');
    } else {
      // 正常单个操作时自动关闭
      showNotification('✓ 已完成所有项的处理');
      setTimeout(() => {
        resultsModal.classList.remove('show');
        // 清空队列
        renderQueue = [];
        renderedGroups = [];
      }, 1000);
    }
  }
}

// 更新映射记录
function updateMappingHistory(from, to, count) {
  const existingIndex = mappingHistory.findIndex(m => m.from === from && m.to === to);
  if (existingIndex !== -1) {
    mappingHistory[existingIndex].timestamp = new Date();
    mappingHistory[existingIndex].count += count;
  } else {
    mappingHistory.unshift({
      timestamp: new Date(),
      from: from,
      to: to,
      count: count
    });
  }
  
  // 只保留最近20条映射记录
  if (mappingHistory.length > 20) {
    mappingHistory = mappingHistory.slice(0, 20);
  }
  
  // 启用映射按钮
  if (compareBtn) {
    compareBtn.disabled = false;
  }
}

// 按结果字段分组搜索结果（相同的前后2字符+关键字归为一组，过滤忽略的字段）
function groupResultsByField() {
  const groups = [];
  const fieldMap = new Map();
  
  searchResults.forEach(result => {
    const fieldKey = result.resultField;
    
    // 检查该结果字段是否在忽略列表中
    if (ignoredResultFields.includes(fieldKey)) {
      console.log(`[过滤] 跳过被忽略的字段: "${fieldKey}"`);
      return; // 跳过被忽略的结果
    }
    
    if (fieldMap.has(fieldKey)) {
      fieldMap.get(fieldKey).results.push(result);
    } else {
      const group = {
        resultField: result.resultField,
        results: [result]
      };
      fieldMap.set(fieldKey, group);
      groups.push(group);
    }
  });
  
  return groups;
}

// 跳转到搜索结果
function jumpToSearchResult(result) {
  const model = editor.getModel();
  const position = model.getPositionAt(result.position);
  
  editor.setSelection({
    startLineNumber: position.lineNumber,
    startColumn: position.column,
    endLineNumber: position.lineNumber,
    endColumn: position.column + currentSearchKeyword.length
  });
  
  editor.revealLineInCenter(position.lineNumber);
  editor.focus();
}

// 高亮搜索结果
function highlightSearchResult(index) {
  if (index < 0 || index >= searchResults.length) return;
  
  const result = searchResults[index];
  jumpToSearchResult(result);
}

// 一键替换全部处理函数（不需要先搜索）
async function handleReplaceAll() {
  const keyword = searchInput.value.trim();
  const replaceText = replaceInput.value;
  
  if (!keyword) {
    await customAlert('请输入搜索关键字');
    return;
  }
  
  const content = editor.getValue();
  if (!content || content.trim().length === 0) {
    await customAlert('编辑器内容为空');
    return;
  }
  
  // 快速统计匹配数量
  let tempOffset = 0;
  let count = 0;
  while (tempOffset < content.length) {
    const index = content.indexOf(keyword, tempOffset);
    if (index === -1) break;
    count++;
    tempOffset = index + 1;
  }
  
  if (count === 0) {
    await customAlert('未找到匹配项');
    return;
  }
  
  const confirmed = await customConfirm(
    `确定要将所有 "${keyword}" 替换为 "${replaceText}" 吗？\n` +
    `共有 ${count} 处匹配项。`
  );
  
  if (!confirmed) {
    // 用户取消时也要确保输入框可用
    setTimeout(() => {
      if (searchInput) searchInput.focus();
    }, 0);
    return;
  }
  
  // 执行替换 - 使用 executeEdits 保持编辑器状态
  const model = editor.getModel();
  const fullRange = model.getFullModelRange();
  const newContent = content.split(keyword).join(replaceText);
  
  // 使用 executeEdits 替代 setValue，避免失去焦点
  editor.executeEdits('replace-all', [{
    range: fullRange,
    text: newContent
  }]);
  
  // 添加到映射记录（仅记录输入框的映射关系）
  const mappingRecord = {
    timestamp: new Date(),
    from: keyword,      // 搜索框内容
    to: replaceText,    // 替换框内容
    count: count        // 替换次数
  };
  
  // 检查是否已存在相同的映射
  const existingIndex = mappingHistory.findIndex(m => m.from === keyword && m.to === replaceText);
  if (existingIndex !== -1) {
    // 如果存在，更新时间戳和次数
    mappingHistory[existingIndex].timestamp = new Date();
    mappingHistory[existingIndex].count += count;
  } else {
    // 不存在则添加新记录
    mappingHistory.unshift(mappingRecord); // 最新的记录放在前面
  }
  
  // 只保留最近20条映射记录
  if (mappingHistory.length > 20) {
    mappingHistory = mappingHistory.slice(0, 20);
  }
  
  clearSearchResults();
  showNotification(`已替换 ${count} 处`);
  
  // 启用映射按钮
  if (compareBtn) {
    compareBtn.disabled = false;
  }
  
  // 确保输入框可以继续使用 - 强制恢复焦点能力
  setTimeout(() => {
    if (searchInput) {
      searchInput.disabled = false;
      searchInput.style.pointerEvents = 'auto';
    }
    if (replaceInput) {
      replaceInput.disabled = false;
      replaceInput.style.pointerEvents = 'auto';
    }
  }, 0);
}

// 清除搜索结果
function clearSearchResults() {
  searchResults = [];
  currentSearchKeyword = '';
  if (searchInfo) {
    searchInfo.textContent = '未搜索';
  }
  // 不再在这里禁用compareBtn，由输入框内容决定
}

// 显示通知
function showNotification(message) {
  const prevInfo = searchInfo.textContent;
  searchInfo.textContent = message;
  searchInfo.style.color = '#48bb78';
  
  setTimeout(() => {
    searchInfo.textContent = prevInfo;
    searchInfo.style.color = '';
  }, 2000);
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 转义HTML特殊字符
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示输入框映射记录侧边栏
async function showComparisonSidebar() {
  if (mappingHistory.length === 0) {
    await customAlert('还没有映射记录，请先使用"一键替换全部"功能');
    return;
  }
  
  // 隐藏顶部摘要区域（不需要显示特定的某次替换）
  document.querySelector('.comparison-summary').style.display = 'none';
  
  // 清空映射列表
  comparisonList.innerHTML = '';
  
  // 添加标题
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = 'padding: 16px 16px 12px; font-size: 18px; font-weight: bold; color: #2d3748; border-bottom: 2px solid #e2e8f0;';
  titleDiv.textContent = `映射记录 (${mappingHistory.length} 条)`;
  comparisonList.appendChild(titleDiv);
  
  // 显示所有映射记录
  mappingHistory.forEach((record, index) => {
    const mappingItem = document.createElement('div');
    mappingItem.style.cssText = `
      padding: 16px;
      margin: 12px;
      background: white;
      border-radius: 12px;
      box-shadow: 4px 4px 12px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9);
      transition: all 0.3s;
      cursor: pointer;
    `;
    
    // 映射关系展示
    const mappingContent = document.createElement('div');
    mappingContent.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 12px;';
    mappingContent.innerHTML = `
      <div style="
        flex: 1;
        padding: 12px 16px;
        background: #fff5f5;
        border: 2px solid #fc8181;
        border-radius: 8px;
        color: #c53030;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        word-break: break-all;
      ">${escapeHtml(record.from)}</div>
      
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4a5568" stroke-width="2" style="flex-shrink: 0;">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
      
      <div style="
        flex: 1;
        padding: 12px 16px;
        background: #f0fff4;
        border: 2px solid #68d391;
        border-radius: 8px;
        color: #2f855a;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        word-break: break-all;
      ">${escapeHtml(record.to || '(空)')}</div>
    `;
    
    // 底部信息（时间和次数）
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096;';
    infoDiv.innerHTML = `
      <span>🕐 ${formatTime(record.timestamp)}</span>
      <span style="background: #4299e1; color: white; padding: 4px 12px; border-radius: 12px; font-weight: bold;">已替换 ${record.count} 次</span>
    `;
    
    mappingItem.appendChild(mappingContent);
    mappingItem.appendChild(infoDiv);
    
    // 鼠标悬停效果
    mappingItem.addEventListener('mouseenter', () => {
      mappingItem.style.transform = 'translateY(-2px)';
      mappingItem.style.boxShadow = '6px 6px 16px rgba(0,0,0,0.15), -6px -6px 16px rgba(255,255,255,1)';
    });
    mappingItem.addEventListener('mouseleave', () => {
      mappingItem.style.transform = 'translateY(0)';
      mappingItem.style.boxShadow = '4px 4px 12px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9)';
    });
    
    // 点击映射项，自动填充到输入框
    mappingItem.addEventListener('click', () => {
      searchInput.value = record.from;
      replaceInput.value = record.to;
      comparisonSidebar.classList.remove('show');
      showNotification('已填充到输入框');
      searchInput.focus();
    });
    
    comparisonList.appendChild(mappingItem);
  });
  
  // 显示侧边栏
  comparisonSidebar.classList.add('show');
}

// 格式化时间
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  
  return `${month}月${day}日 ${hour}:${minute}`;
}

// 键盘快捷键处理函数
function handleKeyboardShortcuts(e) {
  // Ctrl+S 保存
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (saveFileBtn && !saveFileBtn.disabled) {
      saveFileBtn.click();
    }
  }
  
  // Ctrl+F 搜索或二次过滤（根据搜索结果弹窗状态决定）
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    // 如果搜索结果弹窗已打开，触发二次过滤
    if (resultsModal && resultsModal.classList.contains('show')) {
      showSecondaryFilter();
    } else {
      // 否则聚焦到搜索框
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  }
  
  // Esc 关闭模态框和侧边栏
  if (e.key === 'Escape') {
    if (resultsModal && resultsModal.classList.contains('show')) {
      resultsModal.classList.remove('show');
    }
    if (comparisonSidebar && comparisonSidebar.classList.contains('show')) {
      comparisonSidebar.classList.remove('show');
    }
    if (paragraphModal && paragraphModal.classList.contains('show')) {
      paragraphModal.classList.remove('show');
    }
    if (customAlertModal && customAlertModal.classList.contains('show')) {
      customAlertModal.classList.remove('show');
    }
    if (customConfirmModal && customConfirmModal.classList.contains('show')) {
      customConfirmModal.classList.remove('show');
    }
    if (customPromptModal && customPromptModal.classList.contains('show')) {
      customPromptModal.classList.remove('show');
    }
  }
}

// 显示段落详情弹窗
// 功能：根据关键字位置，查找并显示当前段落、上一个段落和下一个段落
// 段落定义：以换行符分隔的文本块
async function showParagraphDetail(position) {
  const content = editor.getValue();
  const keyword = currentSearchKeyword;
  
  // 将内容按换行符分割成段落
  const paragraphs = content.split('\n');
  
  // 找到关键字所在的段落索引
  let currentPos = 0;
  let currentParagraphIndex = -1;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraphLength = paragraphs[i].length + 1; // +1 是换行符
    
    if (position >= currentPos && position < currentPos + paragraphLength) {
      currentParagraphIndex = i;
      break;
    }
    
    currentPos += paragraphLength;
  }
  
  if (currentParagraphIndex === -1) {
    await customAlert('无法定位段落位置');
    return;
  }
  
  // 获取三个段落的内容
  const prevParagraphText = currentParagraphIndex > 0 
    ? paragraphs[currentParagraphIndex - 1] 
    : '';
  const currentParagraphText = paragraphs[currentParagraphIndex];
  const nextParagraphText = currentParagraphIndex < paragraphs.length - 1 
    ? paragraphs[currentParagraphIndex + 1] 
    : '';
  
  // 高亮关键字（标记为红色）
  const highlightKeyword = (text) => {
    if (!text) return '(空段落)';
    const regex = new RegExp(escapeRegExp(keyword), 'g');
    return escapeHtml(text).replace(
      new RegExp(escapeRegExp(escapeHtml(keyword)), 'g'),
      match => `<span class="keyword-highlight">${match}</span>`
    );
  };
  
  // 填充内容
  if (prevParagraphText) {
    prevParagraph.innerHTML = highlightKeyword(prevParagraphText);
  } else {
    prevParagraph.innerHTML = '<span style="color: #a0aec0; font-style: italic;">无上一个段落</span>';
  }
  
  currentParagraph.innerHTML = highlightKeyword(currentParagraphText);
  
  if (nextParagraphText) {
    nextParagraph.innerHTML = highlightKeyword(nextParagraphText);
  } else {
    nextParagraph.innerHTML = '<span style="color: #a0aec0; font-style: italic;">无下一个段落</span>';
  }
  
  // 显示弹窗
  paragraphModal.classList.add('show');
}

// 自定义Alert函数（替代原生alert）
function customAlert(message, title = '提示') {
  return new Promise((resolve) => {
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    customAlertModal.classList.add('show');
    
    const handleConfirm = () => {
      customAlertModal.classList.remove('show');
      alertConfirmBtn.removeEventListener('click', handleConfirm);
      closeAlertModal.removeEventListener('click', handleConfirm);
      resolve();
    };
    
    alertConfirmBtn.addEventListener('click', handleConfirm);
    closeAlertModal.addEventListener('click', handleConfirm);
  });
}

// 自定义Confirm函数（替代原生confirm）
function customConfirm(message, title = '确认') {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    customConfirmModal.classList.add('show');
    
    const handleOk = () => {
      customConfirmModal.classList.remove('show');
      cleanup();
      resolve(true);
    };
    
    const handleCancel = () => {
      customConfirmModal.classList.remove('show');
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      confirmOkBtn.removeEventListener('click', handleOk);
      confirmCancelBtn.removeEventListener('click', handleCancel);
      closeConfirmModal.removeEventListener('click', handleCancel);
    };
    
    confirmOkBtn.addEventListener('click', handleOk);
    confirmCancelBtn.addEventListener('click', handleCancel);
    closeConfirmModal.addEventListener('click', handleCancel);
  });
}

// 自定义Prompt函数（替代原生prompt）
// options: { onInput: (value) => string } - 可选的输入回调函数，返回提示文本
function customPrompt(message, defaultValue = '', title = '输入', options = {}) {
  return new Promise((resolve) => {
    promptTitle.textContent = title;
    promptMessage.textContent = message;
    promptInput.value = defaultValue;
    customPromptModal.classList.add('show');
    
    // 聚焦并选中输入框
    setTimeout(() => {
      promptInput.focus();
      promptInput.select();
    }, 100);
    
    // 实时输入回调
    const handleInput = (e) => {
      if (options.onInput && typeof options.onInput === 'function') {
        const hint = options.onInput(e.target.value);
        if (hint) {
          // 更新提示信息（在消息末尾添加）
          const originalMessage = message.split('\n\n匹配项:')[0]; // 移除旧的匹配信息
          promptMessage.textContent = originalMessage + '\n\n' + hint;
        }
      }
    };
    
    const handleOk = () => {
      const value = promptInput.value;
      customPromptModal.classList.remove('show');
      cleanup();
      resolve(value);
    };
    
    const handleCancel = () => {
      customPromptModal.classList.remove('show');
      cleanup();
      resolve(null);
    };
    
    const handleEnter = (e) => {
      if (e.key === 'Enter') {
        handleOk();
      }
    };
    
    const cleanup = () => {
      promptOkBtn.removeEventListener('click', handleOk);
      promptCancelBtn.removeEventListener('click', handleCancel);
      closePromptModal.removeEventListener('click', handleCancel);
      promptInput.removeEventListener('keypress', handleEnter);
      promptInput.removeEventListener('input', handleInput);
    };
    
    promptOkBtn.addEventListener('click', handleOk);
    promptCancelBtn.addEventListener('click', handleCancel);
    closePromptModal.addEventListener('click', handleCancel);
    promptInput.addEventListener('keypress', handleEnter);
    if (options.onInput) {
      promptInput.addEventListener('input', handleInput);
    }
  });
}


// 显示快捷字段菜单
function showQuickFieldMenu(inputField, buttonElement) {
  // 移除已存在的菜单
  const existingMenu = document.querySelector('.quick-field-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  // 如果快捷字段为空，显示提示并允许添加
  if (quickFields.length === 0) {
    const menu = document.createElement('div');
    menu.className = 'quick-field-menu';
    menu.style.cssText = `
      position: absolute;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 12px;
      z-index: 10000;
      min-width: 200px;
      max-width: 300px;
    `;
    
    const hint = document.createElement('div');
    hint.style.cssText = 'color: #718096; font-size: 13px; margin-bottom: 8px;';
    hint.textContent = '暂无快捷字段';
    
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = '输入并回车添加';
    addInput.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
    `;
    
    addInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const value = addInput.value.trim();
        if (value && !quickFields.includes(value)) {
          quickFields.push(value);
          showNotification('已添加快捷字段');
          menu.remove();
        }
      }
    });
    
    menu.appendChild(hint);
    menu.appendChild(addInput);
    
    // 定位菜单
    const rect = buttonElement.getBoundingClientRect();
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    document.body.appendChild(menu);
    addInput.focus();
    
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== buttonElement) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
    
    return;
  }
  
  // 创建快捷字段菜单
  const menu = document.createElement('div');
  menu.className = 'quick-field-menu';
  menu.style.cssText = `
    position: absolute;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    padding: 8px;
    z-index: 10000;
    min-width: 200px;
    max-width: 300px;
    max-height: 300px;
    overflow-y: auto;
  `;
  
  // 添加标题
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 8px 12px;
    font-size: 13px;
    font-weight: bold;
    color: #2d3748;
    border-bottom: 1px solid #e2e8f0;
    margin-bottom: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = `
    <span>快捷字段</span>
    <button style="
      background: none;
      border: none;
      color: #4299e1;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 6px;
    " onclick="this.parentElement.parentElement.querySelector('.add-quick-field-input').style.display='block'; this.style.display='none';">+ 添加</button>
  `;
  
  menu.appendChild(header);
  
  // 添加输入框（初始隐藏）
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'add-quick-field-input';
  addInput.placeholder = '输入并回车添加';
  addInput.style.cssText = `
    width: calc(100% - 16px);
    padding: 8px;
    margin: 4px 8px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
    display: none;
  `;
  
  addInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const value = addInput.value.trim();
      if (value && !quickFields.includes(value)) {
        quickFields.push(value);
        showNotification('已添加快捷字段');
        menu.remove();
        // 重新显示菜单
        setTimeout(() => showQuickFieldMenu(inputField, buttonElement), 100);
      }
    }
  });
  
  addInput.addEventListener('click', (e) => e.stopPropagation());
  
  menu.appendChild(addInput);
  
  // 添加快捷字段项
  quickFields.forEach((field, index) => {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 10px 12px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.2s;
    `;
    
    const text = document.createElement('span');
    text.textContent = field;
    text.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '×';
    deleteBtn.style.cssText = `
      background: none;
      border: none;
      color: #e53e3e;
      cursor: pointer;
      font-size: 18px;
      padding: 0 4px;
      margin-left: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    deleteBtn.title = '删除';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      quickFields.splice(index, 1);
      showNotification('已删除快捷字段');
      menu.remove();
      // 重新显示菜单
      if (quickFields.length > 0) {
        setTimeout(() => showQuickFieldMenu(inputField, buttonElement), 100);
      }
    });
    
    item.appendChild(text);
    item.appendChild(deleteBtn);
    
    item.addEventListener('mouseenter', () => {
      item.style.background = '#f7fafc';
      deleteBtn.style.opacity = '1';
    });
    
    item.addEventListener('mouseleave', () => {
      item.style.background = '';
      deleteBtn.style.opacity = '0';
    });
    
    item.addEventListener('click', (e) => {
      if (e.target !== deleteBtn) {
        inputField.value = field;
        menu.remove();
        showNotification('已填入快捷字段');
      }
    });
    
    menu.appendChild(item);
  });
  
  // 定位菜单
  const rect = buttonElement.getBoundingClientRect();
  menu.style.top = (rect.bottom + 5) + 'px';
  menu.style.left = rect.left + 'px';
  
  document.body.appendChild(menu);
  
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(e) {
      if (!menu.contains(e.target) && e.target !== buttonElement) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 0);
}

// 显示二次过滤对话框
// 功能：在搜索结果中进行二次搜索，将匹配的结果批量忽略（包含已渲染和未渲染的）
async function showSecondaryFilter() {
  if (searchResults.length === 0) {
    await customAlert('没有可过滤的搜索结果');
    return;
  }
  
  // 计算总的待处理项数量（包括队列中的）
  const renderedPendingCount = Array.from(resultsList.querySelectorAll('.result-item'))
    .filter(item => item.dataset.status === 'pending' && item.style.display !== 'none').length;
  const totalPendingCount = renderedPendingCount + renderQueue.length;
  
  if (totalPendingCount === 0) {
    await customAlert('没有待处理的搜索结果');
    return;
  }
  
  // 缓存所有待处理的结果组（用于实时匹配计数）
  const allPendingGroups = [];
  
  // 收集已渲染的待处理组
  const resultItems = Array.from(resultsList.querySelectorAll('.result-item'))
    .filter(item => item.dataset.status === 'pending' && item.style.display !== 'none');
  
  resultItems.forEach((resultItem) => {
    const groupId = parseInt(resultItem.dataset.groupId);
    if (groupId >= 0 && groupId < renderedGroups.length) {
      allPendingGroups.push({
        type: 'rendered',
        group: renderedGroups[groupId],
        element: resultItem,
        groupId: groupId
      });
    }
  });
  
  // 收集队列中的组
  renderQueue.forEach((group) => {
    allPendingGroups.push({
      type: 'queued',
      group: group
    });
  });
  
  const originalMessage = `请输入要二次过滤的关键字：(快捷键 Ctrl+F / command + F)\n(匹配到的结果将被批量忽略)\n\n` +
    `当前有 ${totalPendingCount} 个待处理项\n` +
    `(${renderedPendingCount} 个已显示，${renderQueue.length} 个在队列中)`;
  
  // 使用自定义输入对话框，带实时匹配计数
  const filterKeyword = await customPrompt(
    originalMessage,
    '',
    '二次过滤',
    {
      onInput: (value) => {
        if (!value || value.trim() === '') {
          return '匹配项: 输入关键字后显示匹配数量';
        }
        
        const keyword = value.trim();
        let matchCount = 0;
        
        // 统计匹配数量
        allPendingGroups.forEach((item) => {
          const resultField = item.group.resultField;
          const context = item.group.results[0].context;
          
          if (resultField.includes(keyword) || context.includes(keyword)) {
            matchCount++;
          }
        });
        
        return `匹配项: 将批量忽略 ${matchCount} 个结果`;
      }
    }
  );
  
  if (!filterKeyword || filterKeyword.trim() === '') {
    return; // 用户取消或输入为空
  }
  
  const keyword = filterKeyword.trim();
  let matchedCount = 0;
  const elementsToRemove = []; // 批量收集需要处理的元素
  
  // 执行批量忽略（只收集，不立即处理）
  allPendingGroups.forEach((item) => {
    const resultField = item.group.resultField;
    const context = item.group.results[0].context;
    
    if (resultField.includes(keyword) || context.includes(keyword)) {
      if (item.type === 'rendered') {
        // 已渲染的：收集元素
        elementsToRemove.push({
          element: item.element,
          groupId: item.groupId,
          group: item.group
        });
      } else {
        // 队列中的：添加到忽略列表
        const ignoreField = item.group.resultField;
        if (!ignoredResultFields.includes(ignoreField)) {
          ignoredResultFields.push(ignoreField);
          console.log(`[二次过滤] 已添加忽略字段: "${ignoreField}"`);
        }
        ignoredCount++; // 增加忽略计数
      }
      matchedCount++;
    }
  });
  
  // 批量处理DOM操作（无动画，快速处理）
  if (elementsToRemove.length > 0) {
    requestAnimationFrame(() => {
      elementsToRemove.forEach(({ element, groupId, group }) => {
        // 标记为已忽略
        element.dataset.status = 'ignored';
        
        // 获取结果字段并添加到忽略列表
        const keyword = currentSearchKeyword;
        const ignoreField = group.resultField;
        
        if (!ignoredResultFields.includes(ignoreField)) {
          ignoredResultFields.push(ignoreField);
        }
        
        // 直接隐藏，不使用动画
        element.style.display = 'none';
        
        ignoredCount++;
      });
      
      // 更新忽略计数显示
      if (ignoredCountEl) {
        ignoredCountEl.textContent = ignoredCount;
      }
      
      // 重新排序可见项
      reorderResultItems();
    });
  }
  
  // 更新队列（移除被忽略的项）
  if (renderQueue.length > 0) {
    const remainingQueue = [];
    renderQueue.forEach((group) => {
      const resultField = group.resultField;
      const context = group.results[0].context;
      
      if (!resultField.includes(keyword) && !context.includes(keyword)) {
        remainingQueue.push(group);
      }
    });
    
    renderQueue = remainingQueue;
    updateQueueDisplay();
  }
  
  if (matchedCount > 0) {
    showNotification(`已批量忽略 ${matchedCount} 个匹配项`);
    
    // 检查是否所有项都被处理完成
    const remainingPendingCount = Array.from(resultsList.querySelectorAll('.result-item'))
      .filter(item => item.dataset.status === 'pending' && item.style.display !== 'none').length;
    
    if (remainingPendingCount === 0 && renderQueue.length === 0) {
      // 所有项都已处理完成，显示提示但不自动关闭
      setTimeout(() => {
        showNotification('✓ 所有搜索结果已处理完成，可以关闭弹窗');
      }, 500);
    }
  } else {
    await customAlert(`未找到包含 "${keyword}" 的结果`);
  }
}



