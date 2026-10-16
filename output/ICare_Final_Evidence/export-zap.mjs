import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
async function generate(template,file){
 const u=new URL('http://zap/JSON/reports/action/generate/');
 for(const[k,v]of Object.entries({title:'ICare Final Native ZAP - Manual 12-Case Traffic',template,reportDir:'/home/zap/icare-reports',reportFileName:file,sites:'http://host.docker.internal:4021',contexts:'ICare final 12 verification',display:'false',description:'Group 113. Isolated synthetic fixtures only. Passive scan and targeted manual HTTP verification. No spider or active scan.'}))u.searchParams.set(k,v);
 return new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:8091,path:u.href,headers:{Host:'zap'}},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>{const result=JSON.parse(s);result.code?reject(Error(s)):resolve(result)})}).on('error',reject));
}
const result={timestampUTC:new Date().toISOString(),html:await generate('traditional-html','ICare_Final_ZAP_Native_Report_HTML'),pdf:await generate('traditional-pdf','ICare_Final_ZAP_Native_Report')};
fs.writeFileSync(path.join(import.meta.dirname,'zap-native-export.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
