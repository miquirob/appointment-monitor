// Conservative detector: report only verifiable, selectable appointment times.
const MONTHS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
const NO_SLOTS=/(no\s+(?:hay|existen|tiene|cuenta\s+con|se\s+encontraron)\s+(?:horas|cupos|resultados)|sin\s+(?:horas|cupos|disponibilidad)|horas\s+no\s+disponibles|sin\s+resultados)/i;
const BLOCKED=/(iniciar sesi[oó]n|ingresa tu rut|ingrese su rut|captcha|verifica que eres humano|acceso denegado|access denied|403 forbidden|demasiadas solicitudes)/i;
const TIME_RE=/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
const pad=n=>String(n).padStart(2,'0');
const normalized=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function validDate(y,m,d){
  const t=new Date(Date.UTC(y,m-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d ? `${y}-${pad(m)}-${pad(d)}` : null;
}
export function dateFromContext(s,startDay){
  if(!s)return null;
  for(const m of s.matchAll(/\b([0-3]?\d)[\/-]([01]?\d)[\/-](20\d\d)\b/g)){
    const iso=validDate(+m[3],+m[2],+m[1]);if(iso&&iso>=startDay)return iso;
  }
  for(const m of s.matchAll(/\b(20\d\d)-([01]\d)-([0-3]\d)\b/g)){
    const iso=validDate(+m[1],+m[2],+m[3]);if(iso&&iso>=startDay)return iso;
  }
  for(const m of s.toLowerCase().matchAll(/\b([0-3]?\d)\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(20\d\d))?\b/g)){
    const year=m[3]?+m[3]:+startDay.slice(0,4);
    let iso=validDate(year,MONTHS[m[2]],+m[1]);
    if(!m[3]&&iso&&iso<startDay)iso=validDate(year+1,MONTHS[m[2]],+m[1]);
    if(iso&&iso>=startDay)return iso;
  }
  return null;
}
export function analyze(snapshot,startDay,expectedName){
  const body=String(snapshot.bodyText||'');
  const tokens=normalized(expectedName).split(' ').filter(Boolean);
  const bodyWords=` ${normalized(body)} `;
  const practitionerConfirmed=tokens.length>=2&&tokens.slice(0,2).every(t=>bodyWords.includes(` ${t} `));
  const reason=[];
  if(!practitionerConfirmed)reason.push('Practitioner not confirmed in visible page');
  if(BLOCKED.test(body))reason.push('The page may need authentication or prohibit automated access');
  const slots=[];
  const candidates=(snapshot.candidates||[]).slice(0,1000);
  for(const c of candidates){
    if(c.disabled||!c.visible)continue;
    const label=String(c.label||'').trim(),raw=String(c.text||'').trim();
    const time=`${label} ${raw}`.match(TIME_RE)?.[0];
    if(!time)continue;
    const clickableTime=/^\s*(?:[01]?\d|2[0-3]):[0-5]\d\s*$/.test(raw)||/(?:reservar|agendar|seleccionar|disponible|hora)/i.test(label);
    if(!clickableTime||/(?:hora\s+desde|hora\s+hasta|horario\s+de\s+atenci[oó]n|rango\s+horario)/i.test(label))continue;
    const contexts=[label,String(c.nearText||'').slice(0,500),String(c.dateAttribute||'')];
    const date=contexts.map(x=>dateFromContext(x,startDay)).find(Boolean);
    if(!date){reason.push('Time control without verifiable date');continue;}
    const diff=(Date.parse(date+'T12:00:00Z')-Date.parse(startDay+'T12:00:00Z'))/86400000;
    if(diff<0||diff>90||!practitionerConfirmed||BLOCKED.test(body))continue;
    const t=time.padStart(5,'0');
    if(!slots.some(s=>s.date===date&&s.time===t))slots.push({date,time:t});
  }
  slots.sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const status=slots.length?'available':practitionerConfirmed&&NO_SLOTS.test(body)&&!BLOCKED.test(body)?'no_slots':'unknown';
  if(status==='unknown'&&!reason.length)reason.push('No unambiguous bookable slot was identified');
  return {status,practitionerConfirmed,slots,candidateCount:candidates.length,reasons:[...new Set(reason)].slice(0,8)};
}
