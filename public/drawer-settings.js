(function(){
  function mount({nav,guide=false}){
    const links=[{label:'시작 가이드',href:'onboarding.html',icon:'journal'},{label:'바로가기 만들기',href:'local-start.html',icon:'download'}];
    if(guide)links.push({label:'디자인 하네스',href:'design-harness.html',icon:'appearance'},{label:'로고 하네스',href:'brand-harness.html',icon:'appearance'});
    return UIShell.settingsMenu({opener:nav.querySelector('[data-settings-open]'),id:'drawer-settings-dialog',links});
  }
  window.DrawerSettings={mount};
})();
