/* Plain text only: imports never interpret file contents as application HTML. */
(function(root) {
  function normalize(text) { return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\0/g, ''); }
  function decode(buffer, encoding = 'auto') {
    const bytes = new Uint8Array(buffer);
    if (encoding === 'auto') {
      if (bytes[0] === 255 && bytes[1] === 254) encoding = 'utf-16le';
      else if (bytes[0] === 254 && bytes[1] === 255) encoding = 'utf-16be';
      else { try { return normalize(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); } catch { encoding = 'euc-kr'; } }
    }
    return normalize(new TextDecoder(encoding).decode(bytes));
  }
  function combine(existing, incoming, mode) {
    const text = normalize(incoming);
    return mode === 'replace' || !existing ? text : existing + (existing.endsWith('\n') ? '' : '\n') + text;
  }
  function rowsToText(rows) {
    // Cells are separated by spaces, not tabs (tabs mean child TODO items).
    return rows.map(row => row.map(cell => normalize(cell == null ? '' : cell)).join('  ')).join('\n');
  }
  function bodyText(text) {
    return normalize(text).split('\n').map(line => {
      // Strip recognizable ruling/checkbox shapes, never guessed Latin letters or meaningful punctuation.
      if (/^\s*[─━═┄┅┈┉┌┐└┘├┤┬┴┼│┃║┏┓┗┛╔╗╚╝|_\-=+]{2,}\s*$/u.test(line)) return '';
      return line.replace(/^\s*(?:(?:[│┃║]+|\|+(?=\s|\d+[.)]))|(?:\[\s*[xX✓✔ ]?\s*\])|(?:[☐☑☒□■▢✓✔]+)|(?:[[(]\s*[|│┃║](?:\s*[\])])?))\s*:?\s*/u,'').trimEnd();
    }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  const api = {normalize, decode, combine, rowsToText, bodyText};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextImportCore = api;
})(typeof self !== 'undefined' ? self : globalThis);
