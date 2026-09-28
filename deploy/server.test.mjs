import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {streakDays, heat, monthCells, dailyTotal, dayKey, weekDates, sumDays, clock} from '../lib/study-math.mjs';
const data=await mkdtemp(join(tmpdir(),'study-server-test-'));
async function boot(){
 const proc=spawn(process.execPath,['outputs/server/server.mjs'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',DATA_DIR:data},stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{proc.stdout.on('data',chunk=>{const m=String(chunk).match(/port (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});proc.on('error',reject);proc.on('exit',code=>reject(new Error('Early exit '+code)));});
 return {proc,url};
}
test('server API, concurrent starts, idempotency, persistence and static files',async()=>{
 let {proc,url}=await boot();
 const call=async(action,id,origin=url)=>fetch(url+'/api/study',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({action,id})});
 try{
  assert.equal((await fetch(url+'/')).status,200);
  assert.equal((await fetch(url+'/api/health')).status,200);
  assert.equal((await fetch(url+'/server.mjs')).status,404);
  assert.equal((await call('start','a','http://evil.example')).status,403);
  assert.equal((await call('bogus','a')).status,400);
  await Promise.all([call('start','a'),call('start','b')]);
  let rows=(await (await fetch(url+'/api/study')).json()).sessions;
  assert.equal(rows.length,1);assert.equal(rows[0].ended,null);
  const id=rows[0].id;
  await call('stop',id);
  rows=(await (await fetch(url+'/api/study')).json()).sessions;
  const end=rows[0].ended;
  await call('stop',id);assert.equal((await (await fetch(url+'/api/study')).json()).sessions[0].ended,end);
  await call('start','c');
  assert.equal((await (await fetch(url+'/api/study')).json()).sessions.length,2);
  await new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});
  ({proc,url}=await boot());
  rows=(await (await fetch(url+'/api/study')).json()).sessions;
  assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='c').ended,null);
  console.log('Verified: daily session storage survives server restart');
 }finally{proc.kill();}
});

test('edit, delete, overlap and the daily goal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'study-edit-'));
  const proc = spawn(process.execPath, ['outputs/server/server.mjs'], {env: {...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir}, stdio: ['ignore', 'pipe', 'pipe']});
  const url = await new Promise((resolve, reject) => { proc.stdout.on('data', chunk => { const m = String(chunk).match(/port (\d+)/); if (m) resolve('http://127.0.0.1:' + m[1]); }); proc.on('error', reject); proc.on('exit', code => reject(new Error('Early exit ' + code))); });
  const send = (body) => fetch(url + '/api/study', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: url}, body: JSON.stringify(body)});
  try {
    const first = await (await fetch(url + '/api/study')).json();
    assert.equal(first.goalMs, 8 * 60 * 60 * 1000);
    assert.equal((await send({action: 'goal', goalMs: 1000})).status, 400);
    assert.equal((await send({action: 'goal', goalMs: 90 * 60 * 1000})).status, 400);
    assert.equal((await send({action: 'goal', goalMs: 8 * 60 * 60 * 1000})).status, 200);
    assert.equal((await (await fetch(url + '/api/study')).json()).goalMs, 8 * 60 * 60 * 1000);
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    await send({action: 'start', id: 'a'});
    await send({action: 'stop', id: 'a'});
    assert.equal((await send({action: 'update', id: 'a', started: now - 5 * hour, ended: now - 4 * hour})).status, 200);
    await send({action: 'start', id: 'b'});
    await send({action: 'stop', id: 'b'});
    assert.equal((await send({action: 'update', id: 'b', started: now - 4.5 * hour, ended: now - 3 * hour})).status, 409);
    assert.equal((await send({action: 'update', id: 'missing', started: now - hour, ended: now})).status, 404);
    assert.equal((await send({action: 'update', id: 'b', started: now - 3 * hour, ended: now - 4 * hour})).status, 400);
    const moved = await (await send({action: 'update', id: 'b', started: now - 4 * hour, ended: now - 3 * hour})).json();
    assert.equal(moved.sessions.find((row) => row.id === 'b').started, now - 4 * hour);
    await send({action: 'start', id: 'c'});
    assert.equal((await send({action: 'update', id: 'b', started: now - 4 * hour, ended: null})).status, 409);
    await send({action: 'stop', id: 'c'});
    await send({action: 'delete', id: 'c'});
    assert.equal((await send({action: 'update', id: 'b', started: now - 4 * hour, ended: null})).status, 200);
    assert.equal((await (await fetch(url + '/api/study')).json()).sessions.filter((row) => row.ended === null).length, 1);
    assert.equal((await send({action: 'delete', id: 'a'})).status, 200);
    const left = await (await fetch(url + '/api/study')).json();
    assert.equal(left.sessions.some((row) => row.id === 'a'), false);
    await new Promise((resolve) => { proc.once('exit', resolve); proc.kill(); });
    const again = spawn(process.execPath, ['outputs/server/server.mjs'], {env: {...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dir}, stdio: ['ignore', 'pipe', 'pipe']});
    const nextUrl = await new Promise((resolve, reject) => { again.stdout.on('data', chunk => { const m = String(chunk).match(/port (\d+)/); if (m) resolve('http://127.0.0.1:' + m[1]); }); again.on('error', reject); });
    const kept = await (await fetch(nextUrl + '/api/study')).json();
    assert.equal(kept.goalMs, 8 * 60 * 60 * 1000);
    assert.equal(kept.sessions.some((row) => row.id === 'a'), false);
    again.kill();
  } finally { proc.kill(); }
});

test('streak, heat and month grid follow the local day', () => {
  const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();
  const rows = [
    {id: '1', started: at(2026, 9, 27, 9, 0), ended: at(2026, 9, 27, 12, 0)},
    {id: '2', started: at(2026, 9, 28, 9, 0), ended: at(2026, 9, 28, 11, 30)},
    {id: '3', started: at(2026, 9, 29, 9, 0), ended: at(2026, 9, 29, 10, 0)},
  ];
  const goal = 2 * 60 * 60 * 1000;
  const now = at(2026, 9, 29, 18, 0);
  assert.equal(streakDays(rows, goal, now), 2);
  assert.equal(streakDays([...rows, {id: '4', started: at(2026, 9, 29, 11, 0), ended: at(2026, 9, 29, 13, 0)}], goal, now), 3);
  const dayGoal = 8 * 60 * 60 * 1000;
  assert.equal(heat(0, dayGoal), 0);
  assert.equal(heat(40 * 60 * 1000, dayGoal), 1);
  assert.equal(heat(90 * 60 * 1000, dayGoal), 2);
  assert.equal(heat(3 * 60 * 60 * 1000, dayGoal), 3);
  assert.equal(heat(5 * 60 * 60 * 1000, dayGoal), 4);
  assert.equal(heat(dayGoal, dayGoal), 5);
  const week = weekDates('2026-09-29');
  assert.deepEqual(week, ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(sumDays(rows, ['2026-09-27', '2026-09-28', '2026-09-29'], now), (3 + 2.5 + 1) * 60 * 60 * 1000);
  const cells = monthCells(2026, 9);
  assert.equal(cells.length, 42);
  assert.equal(cells.filter((d) => d.startsWith('2026-09')).length, 30);
  assert.equal(cells.includes('2026-09-01'), true);
  const split = dailyTotal([{id: 'x', started: at(2026, 9, 22, 23, 0), ended: at(2026, 9, 23, 1, 0)}], '2026-09-23', now);
  assert.equal(split, 60 * 60 * 1000);
  assert.equal(dayKey(at(2026, 9, 29, 3, 0)), '2026-09-29');
  assert.equal(clock((2 * 60 + 30) * 60 * 1000 + 34000), '02:30');
});

test('server copies match the library', () => {
  const math = readFileSync(new URL('../lib/study-math.mjs', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../lib/study-api.mjs', import.meta.url), 'utf8');
  assert.equal(readFileSync(new URL('./study-math.mjs', import.meta.url), 'utf8'), math);
  assert.equal(readFileSync(new URL('../outputs/server/study-math.mjs', import.meta.url), 'utf8'), math);
  assert.equal(readFileSync(new URL('./study-api.mjs', import.meta.url), 'utf8'), api);
  assert.equal(readFileSync(new URL('../outputs/server/study-api.mjs', import.meta.url), 'utf8'), api);
});
