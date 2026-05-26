/**
 * Unwrappers for OEM XML files that arrive wrapped in another envelope.
 *
 * Currently handles: Gulfstream `XmlProc.Source["..."] = '...';` JS shell.
 * Each unwrapper returns the inner XML payload or null if it doesn't apply.
 */

/**
 * Unwrap Gulfstream-style `.js`-wrapped XML.
 *
 * The file looks like:
 *   XmlProc.Source["05-10-00-in_xml.js"] = '\
 *   <?xml ...?>\
 *   <printgroup>...
 *   ';
 *
 * Each non-final line ends with `\` (JS string line continuation). The body may
 * also contain `\'`, `\"`, `\\`, `\n`, `\r`, `\t`. We honor those escapes safely
 * without eval / Function so untrusted uploads cannot execute code.
 */
export function unwrapGulfstreamXml(text: string): { filename: string; xml: string } | null {
  const headerRe = /^\s*XmlProc\.Source\s*\[\s*"([^"]+)"\s*\]\s*=\s*'/;
  const match = text.match(headerRe);
  if (!match) return null;

  const filename = match[1]!;
  const bodyStart = match[0].length;

  let xml = '';
  let i = bodyStart;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "'") {
      // Unescaped closing quote — end of the JS string literal.
      break;
    }
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) {
        xml += ch;
        i++;
        continue;
      }
      if (next === '\n') {
        i += 2;
        continue;
      }
      if (next === '\r') {
        i += text[i + 2] === '\n' ? 3 : 2;
        continue;
      }
      if (next === 'n') {
        xml += '\n';
        i += 2;
        continue;
      }
      if (next === 'r') {
        xml += '\r';
        i += 2;
        continue;
      }
      if (next === 't') {
        xml += '\t';
        i += 2;
        continue;
      }
      if (next === '\\' || next === "'" || next === '"') {
        xml += next;
        i += 2;
        continue;
      }
      if (next === '0') {
        xml += '\0';
        i += 2;
        continue;
      }
      if (next === 'x' && /[0-9a-fA-F]/.test(text[i + 2] || '') && /[0-9a-fA-F]/.test(text[i + 3] || '')) {
        xml += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
      if (next === 'u' && text[i + 2] === '{') {
        const end = text.indexOf('}', i + 2);
        if (end > 0) {
          xml += String.fromCodePoint(parseInt(text.slice(i + 3, end), 16));
          i = end + 1;
          continue;
        }
      }
      if (next === 'u' && /[0-9a-fA-F]{4}/.test(text.slice(i + 2, i + 6))) {
        xml += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      xml += ch;
      i++;
      continue;
    }
    xml += ch;
    i++;
  }
  return { filename, xml };
}

/** Returns true if the file content looks like a JS-wrapped XML payload. */
export function looksJsWrapped(text: string): boolean {
  return /^\s*XmlProc\.Source\s*\[/.test(text);
}
