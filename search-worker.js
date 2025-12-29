// Web Worker 用于多线程搜索
// 每个 Worker 处理文本的一个分块

self.onmessage = function(e) {
  const { chunk, chunkOffset, keyword, workerId } = e.data;
  
  // 搜索结果数组
  const results = [];
  
  // 将分块内容按行分割
  const lines = chunk.split('\n');
  let lineOffset = 0;
  let lineNumber = 0;
  
  // 先计算起始行号（从整个文档的偏移位置推算）
  // 这个会在主线程中计算并传入
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let startIndex = 0;
    
    // 在当前行中查找所有匹配
    while (true) {
      const index = line.indexOf(keyword, startIndex);
      if (index === -1) break;
      
      // 计算在整个文档中的绝对位置
      const absolutePosition = chunkOffset + lineOffset + index;
      
      // 提取关键字前后各2个字符作为结果字段
      const beforeStart = Math.max(0, lineOffset + index - 2);
      const beforeChars = chunk.substring(beforeStart, lineOffset + index);
      
      const afterEnd = Math.min(chunk.length, lineOffset + index + keyword.length + 2);
      const afterChars = chunk.substring(lineOffset + index + keyword.length, afterEnd);
      
      const resultField = beforeChars + keyword + afterChars;
      
      // 获取上下文（前后各30个字符）
      const contextStart = Math.max(0, lineOffset + index - 30);
      const contextEnd = Math.min(chunk.length, lineOffset + index + keyword.length + 30);
      const context = chunk.substring(contextStart, contextEnd);
      
      results.push({
        line: lineNumber + lineIndex + 1,
        column: index + 1,
        position: absolutePosition,
        resultField: resultField,
        context: context,
        beforeChars: beforeChars,
        afterChars: afterChars
      });
      
      startIndex = index + 1;
    }
    
    lineOffset += line.length + 1; // +1 for newline
  }
  
  // 返回搜索结果
  self.postMessage({
    workerId: workerId,
    results: results,
    processed: true
  });
};
