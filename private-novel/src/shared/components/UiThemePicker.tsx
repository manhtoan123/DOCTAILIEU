import {uiThemes,type UiTheme} from '../ui-theme';

export function UiThemePicker({value,onChange,disabled=false}:{value:UiTheme;onChange:(value:UiTheme)=>void;disabled?:boolean}){
  return <div className="ui-theme-picker" role="group" aria-label="Màu giao diện">
    {uiThemes.map(theme=><button key={theme.value} type="button" aria-pressed={value===theme.value} disabled={disabled} onClick={()=>onChange(theme.value)}>
      <span className="ui-theme-dot" data-theme={theme.value} aria-hidden="true"/>{theme.label}
    </button>)}
  </div>;
}
