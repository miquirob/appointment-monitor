import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,dateFromContext} from '../src/analyze.mjs';
const now='2026-10-21';
const body='Dra. Ana Pérez Gómez - Reservar una hora';
const doctor='Ana Pérez';
test('detects verifiable slot for chosen practitioner',()=>{
  const a=analyze({bodyText:body,candidates:[{text:'09:30',label:'Reservar 09:30',nearText:'Miércoles 21 de octubre de 2026 - 09:30',disabled:false,visible:true}]},now,doctor);
  assert.equal(a.status,'available');assert.deepEqual(a.slots,[{date:'2026-10-21',time:'09:30'}]);
});
test('does not invent date from time alone',()=>{
  assert.equal(analyze({bodyText:body,candidates:[{text:'09:30',label:'',nearText:'',visible:true}]},now,doctor).status,'unknown');
});
test('ignores disabled controls',()=>{
  assert.equal(analyze({bodyText:body,candidates:[{text:'09:30',nearText:'21/10/2026',disabled:true,visible:true}]},now,doctor).status,'unknown');
});
test('requires practitioner to confirm no slots',()=>{
  assert.equal(analyze({bodyText:body+' No hay horas disponibles',candidates:[]},now,doctor).status,'no_slots');
  assert.equal(analyze({bodyText:'No hay horas disponibles',candidates:[]},now,doctor).status,'unknown');
});
test('does not confuse login with no slots',()=>{
  assert.equal(analyze({bodyText:body+' Iniciar sesión. No hay horas disponibles',candidates:[]},now,doctor).status,'unknown');
});
test('ignores filter time selectors',()=>{
  assert.equal(analyze({bodyText:body,candidates:[{text:'09:30',label:'Hora desde 09:30',nearText:'21/10/2026',visible:true}]},now,doctor).status,'unknown');
});
test('never alerts for another practitioner',()=>{
  assert.equal(analyze({bodyText:'Dr. Pedro García',candidates:[{text:'09:30',nearText:'21/10/2026',visible:true}]},now,doctor).status,'unknown');
});
test('parses next-year textual date',()=>{
  assert.equal(dateFromContext('lunes 4 de enero','2026-12-22'),'2027-01-04');
});
test('rejects impossible dates',()=>{
  assert.equal(dateFromContext('32/10/2026',now),null);
});
test('supports accents for practitioner match',()=>{
  assert.equal(analyze({bodyText:'Ana Perez - Sin cupos',candidates:[]},now,doctor).status,'no_slots');
});
