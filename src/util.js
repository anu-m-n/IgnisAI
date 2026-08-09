export function parseJsonLoose(text) {
  if (!text) throw new Error("Empty LLM response, cannot parse JSON");
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    let repaired = cleaned;
    
    // Count quotes to check if we ended inside an unclosed string
    let openQuotes = 0;
    let escape = false;
    for (let i = 0; i < repaired.length; i++) {
      if (repaired[i] === '\\') {
        escape = !escape;
      } else if (repaired[i] === '"' && !escape) {
        openQuotes++;
        escape = false;
      } else {
        escape = false;
      }
    }
    
    if (openQuotes % 2 !== 0) {
      repaired += '"';
    }
    
    // Balance braces and brackets
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    escape = false;
    
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '\\') {
        escape = !escape;
      } else if (char === '"' && !escape) {
        inString = !inString;
        escape = false;
      } else {
        escape = false;
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }
    }
    
    while (openBrackets > 0) {
      repaired += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      repaired += '}';
      openBraces--;
    }
    
    // Clean up trailing key/property name without value
    repaired = repaired.replace(/,\s*"[^"]*"\s*([}\]])/g, '$1');
    
    // Clean up trailing commas before closing braces/brackets
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    try {
      return JSON.parse(repaired);
    } catch (err2) {
      const match = cleaned.match(/\{[\s\S]*/);
      if (match) {
        let block = match[0].trim();
        let blockQuotes = 0;
        let esc = false;
        for (let i = 0; i < block.length; i++) {
          if (block[i] === '\\') esc = !esc;
          else if (block[i] === '"' && !esc) { blockQuotes++; esc = false; }
          else esc = false;
        }
        if (blockQuotes % 2 !== 0) block += '"';
        
        let braces = 0;
        let brackets = 0;
        let str = false;
        let es = false;
        for (let i = 0; i < block.length; i++) {
          const c = block[i];
          if (c === '\\') es = !es;
          else if (c === '"' && !es) { str = !str; es = false; }
          else {
            es = false;
            if (!str) {
              if (c === '{') braces++;
              else if (c === '}') braces--;
              else if (c === '[') brackets++;
              else if (c === ']') brackets--;
            }
          }
        }
        while (brackets > 0) { block += ']'; brackets--; }
        while (braces > 0) { block += '}'; braces--; }
        
        // Clean up trailing key/property name without value
        block = block.replace(/,\s*"[^"]*"\s*([}\]])/g, '$1');
        
        block = block.replace(/,\s*([}\]])/g, '$1');
        
        try {
          return JSON.parse(block);
        } catch (err3) {
          throw err;
        }
      }
      throw err;
    }
  }
}
