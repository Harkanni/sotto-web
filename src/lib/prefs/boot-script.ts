/**
 * Runs inline in <head> before the first paint (next-themes does the same for the theme).
 *
 * - data-platform="apple" switches the type tracking to SF's values (tokens.css).
 * - data-hand="left" mirrors the + button for left-handed use (Settings → Handedness).
 * - data-standalone marks the installed PWA, where Sotto draws its own swipe-back gesture.
 *
 * Kept tiny and dependency-free; any failure (private mode, no storage) leaves the defaults.
 */
export const HAND_STORAGE_KEY = 'sotto.hand';

export const BOOT_SCRIPT = `(function(){try{var d=document.documentElement,n=navigator,u=n.userAgent||'';
if(/Mac|iPhone|iPad|iPod/.test(n.platform||'')||/Mac OS X|iPhone|iPad/.test(u))d.dataset.platform='apple';
if(localStorage.getItem('${HAND_STORAGE_KEY}')==='left')d.dataset.hand='left';
if(n.standalone===true||matchMedia('(display-mode: standalone)').matches)d.dataset.standalone='';
}catch(e){}})();`;
