/* Line-based controls shared by touch buttons and keyboard shortcuts. */
(function(root) {
  function bounds(value, start, end) {
    const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const to = value.indexOf('\n', last);
    return {from: start === 0 ? 0 : from, to: to < 0 ? value.length : to};
  }
  function changeDepth(value, start, end, direction) {
    const selected = bounds(value, start, end);
    const lines=value.split('\n');let position=0;
    const rows=lines.map(line=>{const row={line,position,depth:line.match(/^\t*/)[0].length,continuation:line.replace(/^\t*/,'').startsWith('\\ ')};position+=line.length+1;return row;});
    let first=rows.findIndex(row=>row.position===selected.from);if(first<0)first=0;
    const preceding=rows.slice(0,first).filter(row=>row.line.trim()&&!row.continuation);
    let previousDepth=preceding.length?preceding.at(-1).depth:-1;
    const edits=[];let i=first;
    while(i<rows.length&&rows[i].position<=selected.to){
      const root=rows[i];let last=i+1;
      while(last<rows.length&&(!rows[last].line.trim()||rows[last].continuation||rows[last].depth>root.depth))last++;
      const delta=direction>0?(previousDepth>=root.depth?1:0):(root.depth>0?-1:0);
      for(let j=i;j<last;j++){
        const row=rows[j];if(!row.line.trim())continue;
        const shift=delta<0&&row.depth===0?0:delta;
        edits.push({position:row.position,delta:shift});
        row.line=shift>0?'\t'+row.line:shift<0?row.line.slice(1):row.line;
        if(!row.continuation)previousDepth=row.depth+delta;
      }
      i=last;
    }
    function mapOffset(offset){return offset+edits.reduce((sum,edit)=>sum+(edit.position<=offset?(edit.delta<0&&edit.position===offset?0:edit.delta):0),0);}
    return {value:rows.map(row=>row.line).join('\n'),start:mapOffset(start),end:mapOffset(end)};
  }
  function addLine(value, start, end) {
    const {from, to} = bounds(value, start, end);
    const lastLine = value.slice(from, to).split('\n').at(-1);
    const indent = lastLine.match(/^\t*/)[0];
    const insertion = '\n' + indent;
    return {value: value.slice(0, to) + insertion + value.slice(to),
      start: to + insertion.length, end: to + insertion.length};
  }
  const api = {changeDepth, addLine};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ListEditor = api;
})(typeof window !== 'undefined' ? window : globalThis);

