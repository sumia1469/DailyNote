/* Stable references serialize as plain text so existing tree, copy and import flows retain them. */
(function(root){
  const kinds=new Set(['files','memos','worklogs']);
  function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
  function label(value){return String(value).replace(/[\r\n]/g,' ').slice(0,200).replace(/[\\\[\]]/g,'\\$&');}
  function internal(kind,id,title){if(!kinds.has(kind)||!/^\d+$/.test(String(id))||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('참조 대상을 확인해 주세요.');return `@[${label(title)}](${kind}:${Number(id)})`;}
  function external(title,value){const url=safeUrl(value);if(!url)throw Error('http:// 또는 https:// 주소를 입력해 주세요.');return `#[${label(title||url)}](${url.replace(/\(/g,'%28').replace(/\)/g,'%29')})`;}
  function parts(text){
    const value=String(text||''),pattern=/([@#])\[((?:[^\]\\\n]|\\.){1,400})\]\(([^\s()]{1,4096})\)/g,result=[];let from=0;
    for(const match of value.matchAll(pattern)){
      const target=match[3],ref=match[1]==='@'?target.match(/^(files|memos|worklogs):([1-9]\d*)$/):null;
      const href=ref&&Number.isSafeInteger(Number(ref[2]))?'#'+ref[1]+'/'+ref[2]:match[1]==='#'?safeUrl(target):null;
      if(!href)continue;
      if(match.index>from)result.push({text:value.slice(from,match.index)});
      result.push({text:match[2].replace(/\\([\\\[\]])/g,'$1'),href,kind:ref?.[1]||'url',id:ref?.[2],token:match[0]});from=match.index+match[0].length;
    }
    if(from<value.length)result.push({text:value.slice(from)});return result;
  }
  function plain(text){return parts(text).map(p=>p.text).join('');}
  const api={safeUrl,internal,external,parts,plain};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReferenceCore=api;
})(typeof window!=='undefined'?window:globalThis);
