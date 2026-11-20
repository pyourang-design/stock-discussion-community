import fs from 'node:fs';
import { richTextLength } from 'file:///D:/claude/homepage/api/_rich.js';
const dir='D:/claude/homepage/scripts/data/backup-1118/';
const rows=[];
for (const f of fs.readdirSync(dir).filter(f=>f.startsWith('COLNEWS_'))) { const p=JSON.parse(fs.readFileSync(dir+f,'utf8')); rows.push({id:p.id,title:p.title,ts:p.ts,textChars:richTextLength(p.content),maxComment:Math.min(700,2980-richTextLength(p.content)-12)}); }
rows.sort((a,b)=>a.ts-b.ts);
fs.writeFileSync('D:/claude/homepage/scripts/data/sihwang-comments/INFO.tsv', rows.map(r=>[r.id,r.maxComment,r.textChars,r.title].join('\t')).join('\n'));
console.log(rows.length, rows.map(r=>r.maxComment).join(','));
