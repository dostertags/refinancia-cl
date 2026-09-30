// Modo oscuro POR DEFECTO. El <html> nace con la clase "dark"; el script solo la quita si la persona eligió el modo claro.
// La preferencia se guarda únicamente en este dispositivo (localStorage): no se envía a ningún lado.
export const CLASE_INICIAL_HTML = "dark";

export const SCRIPT_TEMA =
  "try{if(localStorage.getItem('tema')==='claro')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}";
