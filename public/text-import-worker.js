/* File parsing runs away from the editor; closing the preview terminates this worker. */
importScripts('text-import-core.js');
self.onmessage = async ({data}) => {
  try {
    const {kind, buffer, encoding, sheet, column, textFormat} = data;
    if (kind === 'excel') {
      importScripts('vendor/xlsx/xlsx.full.min.js');
      const book = XLSX.read(textFormat ? TextImportCore.decode(buffer, encoding) : buffer,
        {type: textFormat ? 'string' : 'array', cellHTML: false, cellFormula: false, bookVBA: false});
      if (!book.SheetNames.length) throw Error('읽을 수 있는 시트가 없습니다.');
      const name = book.SheetNames.includes(sheet) ? sheet : book.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(book.Sheets[name], {header: 1, raw: false, defval: '', blankrows: true});
      const width = rows.reduce((n, row) => Math.max(n, row.length), 0);
      const selected = column === 'all' ? rows : rows.map(row => [row[Number(column)] || '']);
      self.postMessage({text: TextImportCore.rowsToText(selected), sheets: book.SheetNames, sheet: name, width});
    } else if (kind === 'docx') {
      importScripts('vendor/jszip/jszip.min.js');
      const zip = await JSZip.loadAsync(buffer);
      const entry = zip.file('word/document.xml');
      if (!entry) throw Error('Word 문서 본문을 찾을 수 없습니다.');
      self.postMessage({xml: await entry.async('string')});
    } else {
      self.postMessage({text: TextImportCore.decode(buffer, encoding)});
    }
  } catch (error) { self.postMessage({error: error.message || '파일을 읽지 못했습니다.'}); }
};
