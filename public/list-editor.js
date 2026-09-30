/* Line-based controls shared by touch buttons and keyboard shortcuts. */
(function(root) {
  function bounds(value, start, end) {
    const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
    const to = value.indexOf('\n', last);
    return {from: start === 0 ? 0 : from, to: to < 0 ? value.length : to};
  }
  function changeDepth(value, start, end, direction) {
    const {from, to} = bounds(value, start, end);
    const lines = value.slice(from, to).split('\n');
    const preceding = value.slice(0, from).split('\n').filter(line => line.trim());
    let previousDepth = preceding.length ? preceding.at(-1).match(/^\t*/)[0].length : -1;
    const edits = [];
    let position = from;
    const updated = lines.map(line => {
      const depth = line.match(/^\t*/)[0].length;
      let delta = 0;
      if (direction > 0 && previousDepth >= depth) delta = 1;
      if (direction < 0 && depth > 0) delta = -1;
      edits.push({position, delta});
      position += line.length + 1;
      const result = delta > 0 ? '\t' + line : delta < 0 ? line.slice(1) : line;
      if (result.trim()) previousDepth = depth + delta;
      return result;
    }).join('\n');
    function mapOffset(offset) {
      return offset + edits.reduce((sum, edit) => sum + (
        edit.position <= offset ? (edit.delta < 0 && edit.position === offset ? 0 : edit.delta) : 0
      ), 0);
    }
    return {value: value.slice(0, from) + updated + value.slice(to),
      start: mapOffset(start), end: mapOffset(end)};
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
