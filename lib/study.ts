export type Session = { id:string; started:number; ended:number|null };
export function dayKey(t:number) { const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function dailyTotal(rows:Session[],date:string,now:number) {
 const [y,m,d]=date.split('-').map(Number), start=new Date(y,m-1,d).getTime(),end=new Date(y,m-1,d+1).getTime();
 return rows.reduce((sum,r)=>sum+Math.max(0,Math.min(r.ended??now,end)-Math.max(r.started,start)),0);
}
export function duration(ms:number) {const s=Math.max(0,Math.floor(ms/1000));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':');}
