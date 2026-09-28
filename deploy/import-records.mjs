import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const file=process.argv[2];
if(!file)throw new Error('Usage: node import-records.mjs records-backup.json');
const rows=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(!Array.isArray(rows)||rows.some(r=>typeof r.id!=='string'||!Number.isSafeInteger(r.started)||(r.ended!==null&&(!Number.isSafeInteger(r.ended)||r.ended<r.started))))throw new Error('Invalid backup');
const folder=resolve(process.env.DATA_DIR||fileURLToPath(new URL('./data',import.meta.url)));
mkdirSync(folder,{recursive:true});
const db=new DatabaseSync(resolve(folder,'study.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY NOT NULL, started INTEGER NOT NULL, ended INTEGER, active INTEGER); CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(active) WHERE active=1;');
const insert=db.prepare('INSERT INTO sessions(id,started,ended,active) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING');
db.exec('BEGIN IMMEDIATE');
try{for(const row of rows)insert.run(row.id,row.started,row.ended,row.ended===null?1:null);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
console.log('Imported backup without replacing existing records');
