const fs = require('fs');

function deduplicateFunction(filePath, funcName) {
  let code = fs.readFileSync(filePath, 'utf8');
  let regex = new RegExp("[ \\t]*const " + funcName + " = async \\(\\) => \\{[\\s\\S]*?\\n[ \\t]*\\};(?:\\r?\\n|$)", "g");
  
  let match;
  let matches = [];
  while ((match = regex.exec(code)) !== null) {
    matches.push({
      start: match.index,
      end: regex.lastIndex,
      text: match[0]
    });
  }

  if (matches.length > 1) {
    for (let i = matches.length - 1; i > 0; i--) {
      const m = matches[i];
      code = code.substring(0, m.start) + code.substring(m.end);
    }
    fs.writeFileSync(filePath, code);
    console.log("Fixed " + (matches.length - 1) + " duplicates of " + funcName + " in " + filePath);
  } else {
    console.log("No duplicates found for " + funcName + " in " + filePath);
  }
}

deduplicateFunction('src/components/AdminPanel.tsx', 'handleLoadMoreGuests');
deduplicateFunction('src/components/ClientPanel.tsx', 'handleLoadMoreGuests');

