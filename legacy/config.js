/* Общий конфиг и помощники для всех страниц MEDINA */

/* ВСТАВЬТЕ СЮДА URL веб-приложения Apps Script (из «Развернуть → Веб-приложение») */
var API_URL = "https://script.google.com/macros/s/AKfycbyJau-CUHZlXnpBEvkWfmvzLADJ_-QHIYTGtIoWY6C8GFu0Ew-SfdD-A4BTG3bvwfy7iQ/exec";

/* Запрос к API. Всё через GET с параметрами — так работает кросс-доменно с GitHub Pages. */
async function api(action, params){
  if(!API_URL || API_URL.indexOf('http')!==0){
    alert('Не указан адрес базы. Откройте config.js и вставьте API_URL из Apps Script.');
    throw new Error('API_URL not set');
  }
  var qs = new URLSearchParams(Object.assign({action:action, t:Date.now()}, params||{}));
  var res = await fetch(API_URL + '?' + qs.toString(), {method:'GET'});
  if(!res.ok) throw new Error('Сеть: '+res.status);
  return await res.json();
}

/* --- утилиты --- */
function esc(s){return String(s==null?'':s).replace(/</g,'&lt;');}
function initials(f){var p=String(f||'').trim().split(/\s+/);return((p[0]||'')[0]||'')+((p[1]||'')[0]||'');}
function fmt(d){if(!d)return'—';d=String(d);if(d.indexOf('T')>0)d=d.slice(0,10);var p=d.split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d;}
function timeHM(iso){if(!iso)return'';var d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function hoursText(h){h=+h||0;var H=Math.floor(h),M=Math.round((h-H)*60);if(M===60){H++;M=0;}return H+' ч '+(M<10?'0':'')+M+' мин';}
function nights(a,b){if(!a||!b)return'';var d=(new Date(b)-new Date(a))/86400000;return d>=0?Math.round(d):'';}
function money(n){return (Math.round(+n||0)).toLocaleString('ru-RU')+' ₸';}
function uidLocal(){return Date.now()+''+Math.floor(Math.random()*1000);}
function todayStr(){return new Date().toISOString().slice(0,10);}
function qParam(name){var m=location.hash.match(new RegExp(name+'=([^&]*)'));return m?decodeURIComponent(m[1]):'';}
function busy(on){var b=document.getElementById('busy'); if(b) b.style.display=on?'flex':'none';}
