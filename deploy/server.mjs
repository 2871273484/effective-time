import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudyApi } from './study-api.mjs';
const base=fileURLToPath(new URL('.',import.meta.url));
const publicDir=resolve(base,'public');
const dataDir=resolve(process.env.DATA_DIR || resolve(base,'data'));
mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(resolve(dataDir,'study.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY NOT NULL, started INTEGER NOT NULL, ended INTEGER, active INTEGER); CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON sessions(active) WHERE active=1;');
const api=createStudyApi(db);
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
function snapshot(res){json(res,200,api.payload());}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/api/health'){json(res,200,{ok:db.prepare('SELECT 1 AS ok').get().ok===1});return;}
  if(path==='/api/study'){
   if(req.method==='GET'){snapshot(res);return;}
   if(req.method!=='POST'){json(res,405,{error:'不支持的请求方法'});return;}
   if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{json(res,403,{error:'请求来源不允许'});return;}if(!['http:','https:'].includes(origin.protocol)||origin.host!==req.headers.host){json(res,403,{error:'请求来源不允许'});return;}}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096){json(res,413,{error:'请求过大'});return;}}
   let payload;try{payload=JSON.parse(body);}catch{json(res,400,{error:'无效请求'});return;}
   const problem=api.apply(payload);
   if(problem){json(res,problem.status,{error:problem.error});return;}
   snapshot(res);return;
  }
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'不支持的请求方法'});return;}
  const file=resolve(publicDir,'.'+decodeURIComponent(path==='/'?'/index.html':path));
  if(!file.startsWith(publicDir+sep)){json(res,403,{error:'Forbidden'});return;}
  let info;try{info=statSync(file);}catch{json(res,404,{error:'Not found'});return;}
  if(!info.isFile()){json(res,404,{error:'Not found'});return;}
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':path.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});
  res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch(error){console.error(error);if(!res.headersSent)json(res,500,{error:'暂时无法保存或读取记录，请重试。'});else res.end();}
});
server.requestTimeout=15000;
server.listen(Number(process.env.PORT||8089),process.env.HOST||'0.0.0.0',()=>console.log('Study server listening on port '+server.address().port));
function shutdown(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
