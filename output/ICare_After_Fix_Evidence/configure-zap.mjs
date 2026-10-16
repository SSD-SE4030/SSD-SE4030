import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const base='http://zap/JSON/';
async function api(endpoint,params={}){const u=new URL(endpoint,base);for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);const data=await new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:8091,path:u.href,headers:{Host:'zap'}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>{try{resolve(JSON.parse(text))}catch(e){reject(e)}})}).on('error',reject));if(data.code)throw Error(JSON.stringify(data));return data;}
for(let i=0;i<60;i++){try{await api('core/view/version/');break}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,500));}}
const context='ICare isolated after-fix';
const created=await api('context/action/newContext/',{contextName:context});
await api('context/action/includeInContext/',{contextName:context,regex:'http://host\\.docker\\.internal:4021/.*'});
await api('context/action/setContextInScope/',{contextName:context,booleanInScope:'true'});
await api('core/action/setMode/',{mode:'protect'});
await api('pscan/action/setScanOnlyInScope/',{onlyInScope:'true'});
await api('pscan/action/enableAllScanners/');
const data={timestampUTC:new Date().toISOString(),version:await api('core/view/version/'),contextId:created.contextId,context:await api('context/view/context/',{contextName:context}),mode:await api('core/view/mode/'),passiveOnlyInScope:await api('pscan/view/scanOnlyInScope/'),activeScans:await api('ascan/view/scans/'),spiders:await api('spider/view/scans/'),target:'http://host.docker.internal:4021',proxy:'127.0.0.1:8091',externalDomainsRequested:false};
fs.writeFileSync(path.join(import.meta.dirname,'zap-configuration.json'),JSON.stringify(data,null,2));
console.log(JSON.stringify(data));
