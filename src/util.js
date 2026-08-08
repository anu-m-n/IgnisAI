export function parseJsonLoose(text) {
  if (!text) throw new Error("Empty LLM response, cannot parse JSON");
  let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Clean and escape literal newlines/control characters inside JSON strings
    let processed = "";
    let inString = false;
    let escape = false;
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (char === '"' && !escape) {
        inString = !inString;
        processed += char;
      } else if (char === '\\' && inString) {
        escape = !escape;
        processed += char;
      } else {
        escape = false;
        if (inString && char === '\n') {
          processed += '\\n';
        } else if (inString && char === '\r') {
          processed += '\\r';
        } else {
          processed += char;
        }
      }
    }

    try {
      return JSON.parse(processed);
    } catch (err2) {
      // Last resort: grab the first {...} block in the text.
      const match = processed.match(/\{[\s\S]*\}/);
      if (match) {
        let repaired = match[0].trim();
        try {
          return JSON.parse(repaired);
        } catch (err3) {
          // Attempt to repair truncation by appending closing quotes and braces
          // Let's check if the last character is not a closing brace
          if (!repaired.endsWith("}")) {
            // If we were inside a string when it truncated, close the string
            if (inString) {
              repaired += '"';
            }
            // Count open vs close braces
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            let diff = openBraces - closeBraces;
            while (diff > 0) {
              repaired += "}";
              diff--;
            }
          }
          try {
            return JSON.parse(repaired);
          } catch (err4) {
            throw err2;
          }
        }
      }
      throw err;
    }
  }
}
