/* Guarda la página para abrir al instante y recibe avisos de sismos aunque la app esté cerrada.
   Los datos de sismos siempre se piden en vivo. */
var C='sismos-pa-v2',CFG='sismos-cfg';
var SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C&&k!==CFG}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(function(r){var cp=r.clone();caches.open(C).then(function(c){c.put(e.request,cp)});return r}).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match('./index.html')})}));
});

/* ---------- notificación ---------- */
var fmtHour=new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',hour:'numeric',minute:'2-digit',hour12:true});
function show(d){
  var big=(d.mag||0)>=5;
  return self.registration.showNotification(d.title||'Sismo en Panamá',{
    body:d.body||'Se registró un sismo. Mantén la calma. Agáchate, cúbrete y sujétate.',
    icon:'icon-192.png',badge:'icon-192.png',tag:'sismo-alerta',renotify:true,
    vibrate:[200,100,200],requireInteraction:big,lang:'es',timestamp:d.time||Date.now(),
    data:{url:'./#panel'}
  });
}
self.addEventListener('push',function(e){
  var d={};
  try{d=e.data?e.data.json():{}}catch(x){}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
    cs.forEach(function(c){c.postMessage({type:'quake',data:d})});   /* si la app está abierta, ella reproduce el silbido */
    return show(d);
  }));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
    for(var i=0;i<cs.length;i++){if('focus' in cs[i])return cs[i].focus()}
    return self.clients.openWindow('./');
  }));
});

/* ---------- respaldo: revisión periódica del USGS (Chrome en Android con la app instalada) ---------- */
function readCfg(){return caches.open(CFG).then(function(c){return c.match('./cfg.json')}).then(function(r){return r?r.json():null}).catch(function(){return null})}
function writeCfg(o){return caches.open(CFG).then(function(c){return c.put('./cfg.json',new Response(JSON.stringify(o)))}).catch(function(){})}
function checkQuakes(){
  return readCfg().then(function(cfg){
    if(!cfg||!cfg.armed||!cfg.seen)return;
    var since=new Date(Date.now()-3*36e5).toISOString().slice(0,19);
    var u='https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=200&minmagnitude='+(cfg.thr||4)+'&starttime='+since+'&minlatitude=5.5&maxlatitude=10.5&minlongitude=-84.5&maxlongitude=-76';
    return fetch(u).then(function(r){return r.json()}).then(function(j){
      var seen=cfg.seen,fresh=[];
      (j.features||[]).forEach(function(f){
        if(seen.indexOf(f.id)>=0)return;
        seen.push(f.id);
        var c=f.geometry.coordinates;
        if(cfg.onlyPA&&!(c[1]>=7&&c[1]<=9.8&&c[0]>=-83.1&&c[0]<=-77))return;
        fresh.push(f);
      });
      cfg.seen=seen.slice(-300);
      return writeCfg(cfg).then(function(){
        if(!fresh.length)return;
        fresh.sort(function(a,b){return b.properties.mag-a.properties.mag});
        var f=fresh[0],p=f.properties,m=(Math.round(p.mag*10)/10).toFixed(1);
        var town=String(p.place||'Panamá').replace(/^\d+\s*km\s+[NSEW]+\s+of\s+/i,'').replace(/,\s*Panama$/i,'');
        return show({mag:p.mag,time:p.time,title:'Sismo M '+m+' · '+town,
          body:'Mantén la calma. Agáchate, cúbrete y sujétate.\n'+town+' · '+fmtHour.format(p.time)+' · prof. '+Math.round(f.geometry.coordinates[2])+' km'});
      });
    });
  }).catch(function(){});
}
self.addEventListener('periodicsync',function(e){if(e.tag==='sismos')e.waitUntil(checkQuakes())});
