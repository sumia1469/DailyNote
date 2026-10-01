/* Minimal OOXML/ZIP writer: no runtime libraries, network requests or formulas. */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  function xml(value) {
    return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function text(value) { return root.ReferenceCore ? root.ReferenceCore.plain(value) : String(value ?? ''); }
  function dateValue(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
    if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return (date.getTime() - Date.UTC(1899, 11, 31)) / 86400000 + (date >= new Date(Date.UTC(1900, 2, 1)) ? 1 : 0);
  }
  function rowsFor(worklog) {
    const rows = [['일정 카드'], ['업무일자', worklog.workDate || ''], [], ['구분', '항목 번호', '단계', '완료 상태', '내용']];
    function append(items, kind, prefix = '') {
      (Array.isArray(items) ? items : []).filter(item => item != null).forEach((item, index) => {
        const number = prefix + (index + 1), object = typeof item === 'object';
        rows.push([kind, number, number.split('.').length, object && item.checked ? '완료' : '미완료', text(object ? item.task : item)]);
        if (object) append(item.children, kind, number + '.');
      });
    }
    append(worklog.todo, 'TODO'); append(worklog.nextDayPlan, '익일 계획');
    for (const [field, kind] of [['remarks', '비고'], ['memo', '메모']]) {
      if (Array.isArray(worklog[field + 'Items'])) append(worklog[field + 'Items'], kind);
      else rows.push([kind, '', '', '', text(worklog[field])]);
    }
    return rows;
  }
  function worksheet(worklog) {
    const rows = rowsFor(worklog), date = dateValue(worklog.workDate);
    const body = rows.map((row, i) => {
      const height = i === 0 ? 30 : i === 3 ? 26 : Math.min(409, Math.max(24, ...row.map(v => 18 * String(v).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 40)), 0))));
      return `<row r="${i + 1}" ht="${height}" customHeight="1">` + row.map((value, j) => {
        const address = String.fromCharCode(65 + j) + (i + 1);
        if (i === 1 && j === 1 && date !== null) return `<c r="${address}" s="3"><v>${date}</v></c>`;
        const style = i === 0 ? 1 : i === 3 ? 2 : 0;
        if (typeof value === 'number') return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
        if (String(value).length > 32767) throw Error('엑셀 셀 한도를 넘는 내용이 있습니다. 한 항목을 32,767자 이하로 나눠 주세요.');
        return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      }).join('') + '</row>';
    }).join('');
    if (rows.length > 1048576) throw Error('엑셀 행 한도를 넘었습니다.');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}"><dimension ref="A1:E${rows.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="10" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/><col min="5" max="5" width="85" customWidth="1"/></cols><sheetData>${body}</sheetData><autoFilter ref="A4:E${rows.length}"/><mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells></worksheet>`;
  }
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="12"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const crcTable = Array.from({length: 256}, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
  function crc32(bytes) { let n = 0xffffffff; for (const b of bytes) n = crcTable[(n ^ b) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const chunks = [], directory = []; let offset = 0, directorySize = 0;
    for (const [name, content] of Object.entries(files)) {
      const path = encoder.encode(name), data = encoder.encode(content), crc = crc32(data);
      const local = new Uint8Array(30 + path.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 33, true);
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, path.length, true); local.set(path, 30);
      const central = new Uint8Array(46 + path.length), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, path.length, true); c.setUint32(42, offset, true); central.set(path, 46);
      chunks.push(local, data); directory.push(central); offset += local.length + data.length; directorySize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, directory.length, true); e.setUint16(10, directory.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
    const result = new Uint8Array(offset + directorySize + end.length); let position = 0;
    for (const chunk of [...chunks, ...directory, end]) { result.set(chunk, position); position += chunk.length; }
    return result;
  }
  function build(worklog) {
    return zip({
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="일정 카드" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': styles, 'xl/worksheets/sheet1.xml': worksheet(worklog)
    });
  }
  function filename(worklog) { return '일정_' + String(worklog.workDate || '날짜없음').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') + '_' + String(worklog.id || '').replace(/[^\w-]/g, '_') + '.xlsx'; }
  function download(worklog) {
    const message = document.getElementById('worklog-action-msg');
    try {
      const blob = new Blob([build(worklog)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      try { link.href = url; link.download = filename(worklog); document.body.append(link); link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
      if (message) message.textContent = '엑셀 다운로드를 시작했습니다.';
    } catch (error) { if (message) message.textContent = '엑셀 다운로드 실패: ' + error.message; }
  }
  const api = {rowsFor, build, filename, download};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WorklogExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
