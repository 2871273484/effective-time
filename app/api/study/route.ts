import { database } from '../../../db/raw';
export const dynamic='force-dynamic';
async function snapshot() {const r=await database().prepare('SELECT id, started, ended FROM sessions ORDER BY started DESC').all();return Response.json({sessions:r.results,now:Date.now()},{headers:{'Cache-Control':'no-store'}});}
export async function GET(){try{return await snapshot();}catch(e){console.error(e);return Response.json({error:'暂时无法读取记录，请重试。'},{status:503});}}
export async function POST(request:Request){
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
 try{const {action,id}=await request.json() as {action:string;id:string};if(!['start','stop'].includes(action)||typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))return Response.json({error:'无效操作'},{status:400});
 const db=database();if(action==='start')await db.prepare('INSERT OR IGNORE INTO sessions (id, started, active) VALUES (?, ?, 1)').bind(id,Date.now()).run();
 else await db.prepare('UPDATE sessions SET ended = MAX(started, ?), active = NULL WHERE id = ? AND ended IS NULL').bind(Date.now(),id).run();return await snapshot();
 }catch(e){console.error(e);return Response.json({error:'保存未完成，请重试。'},{status:503});}
}

