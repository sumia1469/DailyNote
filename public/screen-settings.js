(function () {
  const defaults={fontFamily:'system',fontSize:16,spacing:'normal',theme:'light',background:'autumn',backgroundUrl:null,loadingMotion:'petal'};
  function apply(input,options={}) {
    const value={...defaults,...input};
    value.loadingMotion=window.LoadingMotion?LoadingMotion.normalize(value.loadingMotion):'petal';
    if(window.LoadingMotion)LoadingMotion.apply(value.loadingMotion);
    const size=[14,16,18,20].includes(Number(value.fontSize))?Number(value.fontSize):16;
    document.documentElement.style.setProperty('--app-font-size',size+'px');
    const families={system:'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',sans:'Arial, Malgun Gothic, sans-serif',serif:'Batang, Georgia, serif'};
    document.documentElement.style.setProperty('--app-font-family',families[value.fontFamily]||families.system);
    document.body.dataset.theme=['light','white','dark'].includes(value.theme)?value.theme:'light';
    document.body.dataset.spacing=['compact','normal','comfortable'].includes(value.spacing)?value.spacing:'normal';
    document.body.dataset.background=['autumn','custom','none'].includes(value.background)?value.background:'autumn';
    if(value.backgroundUrl && /^\/api\/background\/1\?v=/.test(value.backgroundUrl))document.documentElement.style.setProperty('--custom-background',`url("${value.backgroundUrl}")`);
    else document.documentElement.style.removeProperty('--custom-background');
    try{if(options.persist!==false)localStorage.setItem('dailynote-screen-settings',JSON.stringify(value));}catch{}
  }
  async function load() {
    try{const response=await fetch('/api/settings');if(response.ok){const data=await response.json();apply(data);return data;}}catch{}
    return defaults;
  }
  try{apply(JSON.parse(localStorage.getItem('dailynote-screen-settings')||'null'));}catch{apply(defaults);}
  window.SiteSettings={apply,load};
  load();
})();
