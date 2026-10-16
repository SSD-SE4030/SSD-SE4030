import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(root,'ICare/backend/package.json'));
const mongoose=require('mongoose'), jwt=require('jsonwebtoken'), bcrypt=require('bcryptjs');
const load=async p=>(await import(pathToFileURL(path.join(root,'ICare/backend',p)))).default;
const useZap=process.env.ICARE_WITH_ZAP!=='0';
const database=(useZap?'icare_afterfix_':'icare_afterfix_direct_')+crypto.randomBytes(6).toString('hex');
const uri='mongodb://127.0.0.1:27028/'+database;
const secret=crypto.randomBytes(48).toString('hex');
const dir=useZap?import.meta.dirname:path.join(import.meta.dirname,'direct');fs.mkdirSync(dir,{recursive:true});
const results=[], exchanges=[];
const redact=text=>text.replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED JWT]').replace(/\b[a-f0-9]{64}\b/g,'[REDACTED DIGEST]');
const sanitize=value=>JSON.parse(JSON.stringify(value, (key,val)=> /^(token|password|resetToken|resetTokenExpiresAt|googleSub|authorization)$/i.test(key)?'[REDACTED]':typeof val==='string'?redact(val):val));
let logs='';
const safeEnv={ SystemRoot:process.env.SystemRoot, PATH:process.env.PATH, TEMP:process.env.TEMP, TMP:process.env.TMP,
  PORT:'4021', MONGODB_URI:uri, JWT_SECRET:secret, NODE_ENV:'test', FRONTEND_ORIGIN:'http://127.0.0.1:4021',
  MAILGUN_API_KEY:'', MAILGUN_DOMAIN:'', CLOUDINARY_API_KEY:'', CLOUDINARY_API_SECRET:'', CLOUDINARY_URL:'',
  GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'', GOOGLE_REDIRECT_URI:'', PAYPAL_CLIENT_ID:'', GOOGLE_API_KEY:'' };
const runtime=path.join(root,'tmp/pdfs/afterfix/runtime');fs.mkdirSync(runtime,{recursive:true});
await mongoose.connect(uri,{serverSelectionTimeoutMS:10000,autoIndex:false,autoCreate:false});
if(mongoose.connection.name!==database||mongoose.connection.host!=='127.0.0.1')throw Error('Isolation failed');
const existing=await mongoose.connection.db.listCollections().toArray();
if(existing.length)throw Error('Refusing nonempty assessment database. Use a new disposable instance.');
const [User,Order,Product,Prescription,Ticket]=await Promise.all(['models/userModel.js','models/orderModel.js','models/productModel.js','models/prescriptionModel.js','models/ticketModel.js'].map(load));
const app=spawn(process.execPath,[path.join(root,'ICare/backend/server.js')],{cwd:runtime,env:safeEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b);
async function zapText(url){return new Promise((resolve,reject)=>http.get({hostname:'127.0.0.1',port:8091,path:url,headers:{Host:'zap'}},r=>{let text='';r.on('data',b=>text+=b);r.on('end',()=>resolve(text));}).on('error',reject));}
async function api(endpoint,params={}) { const u=new URL(`http://zap/JSON/${endpoint}`);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);return JSON.parse(await zapText(u.href)); }
async function req(method,url,role,body,headers={}) {
  const target='http://host.docker.internal:4021'+url;
  let payload=body===undefined?null:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  const h={Host:'host.docker.internal:4021',Accept:'application/json',...headers};
  if(role)h.Authorization='Bearer '+(typeof role==='string'?role:jwt.sign({_id:role._id,isAdmin:role.isAdmin},secret,{expiresIn:'10m'}));
  if(payload){h['Content-Length']=payload.length;if(!h['Content-Type'])h['Content-Type']='application/json';}
  const response=await new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:useZap?8091:4021,path:useZap?target:url,method,headers:h,timeout:20000},s=>{const chunks=[];s.on('data',b=>chunks.push(b));s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,text:Buffer.concat(chunks).toString()}));});r.on('error',reject);r.on('timeout',()=>r.destroy(Error('timeout')));if(payload)r.write(payload);r.end();});
  try{response.body=JSON.parse(response.text)}catch{response.body=response.text.slice(0,300)}
  exchanges.push({index:exchanges.length+1,method,url,status:response.status,request:Buffer.isBuffer(body)?`synthetic multipart ${body.length} bytes`:sanitize(body??{}),response:sanitize(response.body)});
  return response;
}
async function check(id,name,expected,fn){try{const actual=await fn();const pass=actual.pass!==false;results.push({id,name,expected,status:pass?'PASS':'FAIL',...actual});console.log(`${pass?'PASS':'FAIL'} ${id} ${name}`);}catch(e){results.push({id,name,expected,status:'FAIL',detail:e.message.replace(/eyJ[\w.-]+/g,'[REDACTED]')});console.log(`FAIL ${id} ${name}`);}}
const token=()=>crypto.randomBytes(32).toString('hex');
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4021/api/keys/google');break}catch{await new Promise(r=>setTimeout(r,250));}}
 const names=['owner','other','admin','demoted'];
 const users={};for(const name of names)users[name]=await User.create({name:`Synthetic ${name}`,email:`${name}@example.invalid`,password:bcrypt.hashSync('Synthetic-only-2026!',4),isAdmin:['admin','demoted'].includes(name)});
 const product=await Product.create({name:'Synthetic frames',slug:'synthetic-frames',image:'/synthetic.png',brand:'Synthetic',category:'Frames',description:'Test only',price:200,countInStock:5,rating:0,numReviews:0});
 const orderData={user:users.owner._id,orderItems:[{product:product._id,slug:product.slug,name:product.name,image:product.image,price:200,quantity:1}],shippingAddress:{fullName:'Synthetic Owner',address:'Test address',city:'Test city',postalCode:'00000',country:'Test'},paymentMethod:'Cash On Delivery',itemsPrice:200,shippingPrice:0,taxPrice:30,totalPrice:230};
 const order=await Order.create(orderData), noncod=await Order.create({...orderData,paymentMethod:'PayPal'}), demo=await Order.create({...orderData,paymentMethod:'Demo - Cash on Delivery'});
 const rx=await Prescription.create({patientName:'Synthetic Patient',optometrist:new mongoose.Types.ObjectId(),prescriptionDetails:'Synthetic private details',dateIssued:new Date()});
 const ticket=await Ticket.create({user:users.owner._id,subject:'Synthetic ticket',description:'Test only'});
 await check('V01','seed route removed','404; database counts unchanged',async()=>{const before=await Promise.all([User.countDocuments(),Product.countDocuments()]);const r=await req('GET','/api/seed');const after=await Promise.all([User.countDocuments(),Product.countDocuments()]);return{http:r.status,before,after,pass:r.status===404&&JSON.stringify(before)===JSON.stringify(after)}});
 for(const [role,status]of [['owner',200],['other',404],['admin',200]])await check('V02',`${role} reads owner order`,`${status}`,async()=>{const r=await req('GET',`/api/orders/${order.id}`,users[role]);return{http:r.status,pass:r.status===status}});
 for(const [name,role,suffix,status]of [['anonymous pay',null,'pay',401],['customer pay',users.other,'pay',403],['customer delivery',users.other,'deliver',403]])await check('V03',name,`${status}; record unchanged`,async()=>{const before=await Order.findById(order.id).lean();const r=await req('PUT',`/api/orders/${order.id}/${suffix}`,role,{});const after=await Order.findById(order.id).lean();return{http:r.status,before:{isPaid:before.isPaid,isDelivered:before.isDelivered},after:{isPaid:after.isPaid,isDelivered:after.isDelivered},pass:r.status===status&&JSON.stringify(before)===JSON.stringify(after)}});
 await check('V03','admin confirms canonical COD','200; persisted paid timestamp/status',async()=>{const r=await req('PUT',`/api/orders/${order.id}/pay`,users.admin,{});const after=await Order.findById(order.id).lean();return{http:r.status,before:{isPaid:false},after:{isPaid:after.isPaid,paidAt:after.paidAt,paymentResult:after.paymentResult},pass:r.status===200&&after.isPaid&&!!after.paidAt&&after.paymentResult.status==='Paid'}});
 for(const [name,item,status]of [['already paid',order,400],['non-COD',noncod,400],['Demo label mismatch',demo,400]])await check('V03',name,`${status}; no mutation`,async()=>{const before=await Order.findById(item.id).lean();const r=await req('PUT',`/api/orders/${item.id}/pay`,users.admin,{});const after=await Order.findById(item.id).lean();return{http:r.status,message:r.body.message,paymentMethod:after.paymentMethod,unchanged:JSON.stringify(before)===JSON.stringify(after),pass:r.status===status&&JSON.stringify(before)===JSON.stringify(after)}});
 await check('V03','missing order','404',async()=>{const r=await req('PUT',`/api/orders/${new mongoose.Types.ObjectId()}/pay`,users.admin,{});return{http:r.status,pass:r.status===404}});
 await check('V03','admin delivery','200; delivered stored',async()=>{const r=await req('PUT',`/api/orders/${order.id}/deliver`,users.admin,{});const saved=await Order.findById(order.id);return{http:r.status,pass:r.status===200&&saved.isDelivered}});
 const newBody={...orderData,orderItems:[{_id:product.id,quantity:2,price:0.01}],itemsPrice:0.01,totalPrice:0.01};
 await check('V04','catalog price defeats tampering','201; items=400 tax=60 shipping=0 total=460',async()=>{const r=await req('POST','/api/orders',users.owner,newBody);const saved=await Order.findById(r.body.order?._id).lean();return{http:r.status,after:saved?{price:saved.orderItems[0].price,items:saved.itemsPrice,tax:saved.taxPrice,shipping:saved.shippingPrice,total:saved.totalPrice}:null,pass:r.status===201&&saved.totalPrice===460&&saved.orderItems[0].price===200}});
 for(const [name,items]of [['excess stock',[{_id:product.id,quantity:6}]],['fractional quantity',[{_id:product.id,quantity:1.5}]],['zero quantity',[{_id:product.id,quantity:0}]],['duplicate',[{_id:product.id,quantity:1},{_id:product.id,quantity:1}]],['unknown product',[{_id:new mongoose.Types.ObjectId().toString(),quantity:1}]],['invalid product',[{_id:'bad-id',quantity:1}]]])await check('V04',name,'400; no order created',async()=>{const before=await Order.countDocuments();const r=await req('POST','/api/orders',users.owner,{...newBody,orderItems:items});const after=await Order.countDocuments();return{http:r.status,before,after,pass:r.status===400&&before===after}});
 await check('V04','shipping threshold arithmetic','201; items=100 tax=15 shipping=10 total=125',async()=>{await Product.updateOne({_id:product.id},{$set:{price:100}});const r=await req('POST','/api/orders',users.owner,{...newBody,orderItems:[{_id:product.id,quantity:1}]});const o=r.body.order;return{http:r.status,after:{items:o?.itemsPrice,tax:o?.taxPrice,shipping:o?.shippingPrice,total:o?.totalPrice},pass:r.status===201&&o.totalPrice===125&&o.shippingPrice===10}});
 for(const method of ['GET','POST'])await check('V05',`removed card API ${method}`,'404',async()=>{const r=await req(method,'/api/card-details',users.owner,method==='POST'?{}:undefined);return{http:r.status,pass:r.status===404}});
 await check('V05','synthetic order ignores card-shaped fields','201; no card fields stored/returned',async()=>{const r=await req('POST','/api/orders',users.owner,{...newBody,cardDetails:{cardNumber:'SYNTHETIC-NOT-A-CARD',cvv:'NOT-A-CVV'}});const saved=await Order.findById(r.body.order?._id).lean();const text=JSON.stringify([saved,r.body.order]);return{http:r.status,pass:r.status===201&&!/cardDetails|cardNumber|cvv/.test(text)}});
 for(const [name,method,url,body]of [['customer list','GET','/api/prescriptions'],['customer detail','GET',`/api/prescriptions/${rx.id}`],['customer edit','PUT',`/api/prescriptions/${rx.id}`,{prescriptionDetails:'tamper'}],['customer create','POST','/api/prescriptions',{}]])await check('V06',name,'403; prescription unchanged',async()=>{const before=await Prescription.findById(rx.id).lean();const r=await req(method,url,users.other,body);const after=await Prescription.findById(rx.id).lean();return{http:r.status,unchanged:JSON.stringify(before)===JSON.stringify(after),pass:r.status===403&&JSON.stringify(before)===JSON.stringify(after)}});
 await check('V06','admin prescription read','200',async()=>{const r=await req('GET',`/api/prescriptions/${rx.id}`,users.admin);return{http:r.status,pass:r.status===200}});
 await check('V07','demoted administrator old token','403 after database demotion',async()=>{const old=jwt.sign({_id:users.demoted.id,isAdmin:true},secret);await User.updateOne({_id:users.demoted.id},{$set:{isAdmin:false}});const r=await req('GET','/api/orders',old);return{http:r.status,pass:r.status===403}});
 await check('V07','deleted account old token','401',async()=>{const old=jwt.sign({_id:users.demoted.id,isAdmin:true},secret);await User.deleteOne({_id:users.demoted.id});const r=await req('GET','/api/orders',old);return{http:r.status,pass:r.status===401}});
 await User.updateOne({_id:users.owner.id},{$set:{resetToken:'SYNTHETIC-HASH-MARKER',resetTokenExpiresAt:new Date(Date.now()+600000),googleSub:'SYNTHETIC-SUB'}});
 for(const [name,method,url,body]of [['admin list','GET','/api/users'],['admin detail','GET',`/api/users/${users.owner.id}`],['admin update','PUT',`/api/users/${users.owner.id}`,{name:'Synthetic owner updated',isAdmin:false}]])await check('V08',name,'200; sensitive keys absent',async()=>{const r=await req(method,url,users.admin,body);return{http:r.status,pass:r.status===200&&!/"(?:password|resetToken|resetTokenExpiresAt|googleSub)"/.test(r.text)}});
 const fixtureReset=async(expires)=>{const raw=token();await User.updateOne({_id:users.owner.id},{$set:{resetToken:crypto.createHash('sha256').update(raw).digest('hex'),resetTokenExpiresAt:new Date(Date.now()+expires)}});return raw;};
 await check('V09','expired token','400; password unchanged',async()=>{const raw=await fixtureReset(-1000),before=(await User.findById(users.owner.id)).password;const r=await req('POST','/api/users/reset-password',null,{token:raw,password:'New-synthetic-pass-2026!'});return{http:r.status,pass:r.status===400&&(await User.findById(users.owner.id)).password===before}});
 await check('V09','single-use reset token','200 then 400; cleared hash/expiry; no token in logs',async()=>{const raw=await fixtureReset(600000);const a=await req('POST','/api/users/reset-password',null,{token:raw,password:'New-synthetic-pass-2026!'});const b=await req('POST','/api/users/reset-password',null,{token:raw,password:'Second-synthetic-pass-2026!'});const saved=await User.findById(users.owner.id);return{http:[a.status,b.status],tokenLogged:logs.includes(raw),pass:a.status===200&&b.status===400&&!saved.resetToken&&!saved.resetTokenExpiresAt&&!logs.includes(raw)&&bcrypt.compareSync('New-synthetic-pass-2026!',saved.password)}});
 await check('V09','known/unknown email generic response, mail disabled','same 200 response',async()=>{const a=await req('POST','/api/users/forget-password',null,{email:users.owner.email});const b=await req('POST','/api/users/forget-password',null,{email:'absent@example.invalid'});return{http:[a.status,b.status],message:a.body.message,pass:a.status===200&&b.status===200&&a.text===b.text}});
 await check('V09','opaque reset token rejected as API bearer','401',async()=>{const raw=await fixtureReset(600000);const r=await req('GET','/api/orders/mine',raw);return{http:r.status,pass:r.status===401}});
 await check('V09','legacy reset-shaped JWT accepted as access token','401 desired; defense-in-depth check',async()=>{const old=jwt.sign({_id:users.owner.id},secret);const r=await req('GET','/api/orders/mine',old);return{http:r.status,pass:r.status===401,detail:'New reset flow issues opaque tokens, not JWTs. Shared-secret legacy reset-shaped JWTs still satisfy isAuth; no issuer/audience/purpose enforcement.'}});
 const multipart=(bytes,mime)=>{const boundary='icareafterfixboundary';return{body:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.png"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]),headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`}}};
 for(const [name,bytes,mime,status]of [['MIME spoof',Buffer.from('harmless text'),'image/png',400],['disallowed type',Buffer.from('harmless text'),'text/plain',400],['oversized image',Buffer.alloc(5*1024*1024+1),'image/png',413]])await check('V10',name,`${status}; no external upload`,async()=>{const m=multipart(bytes,mime);const r=await req('POST','/api/upload',users.admin,m.body,m.headers);return{http:r.status,pass:r.status===status}});
 const {isAllowedImage}=await import(pathToFileURL(path.join(root,'ICare/backend/routes/uploadRoutes.js')));
 await check('V10','allowed JPEG PNG WebP signatures (unit only)','recognized; external upload excluded',async()=>{const cases=[['image/jpeg',[255,216,255,0]],['image/png',[137,80,78,71,13,10,26,10]],['image/webp',Array.from(Buffer.from('RIFFxxxxWEBP'))]];return{pass:cases.every(([m,b])=>isAllowedImage({mimetype:m,buffer:Buffer.from(b)})),detail:'Signature recognition only; not full image decoding or end-to-end Cloudinary upload.'}});
 await check('V11','other customer cannot respond','404; responses unchanged',async()=>{const before=await Ticket.findById(ticket.id).lean();const r=await req('POST',`/api/tickets/${ticket.id}/responses`,users.other,{message:'Synthetic unauthorized'});const after=await Ticket.findById(ticket.id).lean();return{http:r.status,unchanged:JSON.stringify(before)===JSON.stringify(after),pass:r.status===404&&JSON.stringify(before)===JSON.stringify(after)}});
 await check('V11','owner can respond','201',async()=>{const r=await req('POST',`/api/tickets/${ticket.id}/responses`,users.owner,{message:'Synthetic owner response'});return{http:r.status,pass:r.status===201&&(await Ticket.findById(ticket.id)).responses.length===1}});
 await check('V12','malformed order identifier','400 generic; no stack/cast details',async()=>{const r=await req('GET','/api/orders/not-a-valid-object-id',users.admin);return{http:r.status,message:r.body.message,pass:r.status===400&&r.body.message==='Invalid request'}});
 await check('V12','internal prescription validation error','generic error without implementation details',async()=>{const r=await req('PUT',`/api/prescriptions/${rx.id}`,users.admin,{patientName:{synthetic:'invalid object'}});return{http:r.status,pass:!r.text.includes('Cast to string')&&!r.text.includes('prescriptionSchema'),detail:'Route-local catch may expose Mongoose validation details even though global middleware is generic.'}});
 await check('EXTRA-PASSWORD','single-character signup rejected','400; no account created',async()=>{const before=await User.countDocuments();const r=await req('POST','/api/users/signup',null,{name:'Synthetic weak',email:'weak@example.invalid',password:'a',nic:'TEST',address:'Test',phone:'000'});return{http:r.status,pass:r.status===400&&await User.countDocuments()===before}});
 for(const page of ['/','/signin','/signup'])await check('HEADERS',`HTML headers and SRI ${page}`,'security headers and external stylesheet integrity',async()=>{const r=await req('GET',page,null,undefined,{Accept:'text/html'});const h=r.headers;const external=/<link[^>]+href="https:\/\/cdn\.jsdelivr[^>]+>/.exec(r.text)?.[0];return{http:r.status,pass:!!h['content-security-policy']&&!!(h['x-frame-options']||h['content-security-policy']?.includes('frame-ancestors'))&&h['x-content-type-options']==='nosniff'&&!h['x-powered-by']&&(!external||external.includes('integrity=')),headers:{csp:h['content-security-policy']??null,xFrameOptions:h['x-frame-options']??null,nosniff:h['x-content-type-options']??null,xPoweredBy:h['x-powered-by']??null},externalStylesheetWithoutIntegrity:!!external&&!external.includes('integrity=')}});
 await check('V12','malformed JSON global internal handler','generic 500 without stack',async()=>{const r=await req('POST','/api/users/signin',null,Buffer.from('{malformed'),{'Content-Type':'application/json'});return{http:r.status,message:r.body.message,pass:r.status===500&&r.body.message==='Internal server error',detail:'Generic response verified; malformed JSON should preferably return 400.'}});
 const counts={};for(const name of ['users','orders','products','prescriptions','tickets'])counts[name]=await mongoose.connection.db.collection(name).countDocuments();
 fs.writeFileSync(path.join(dir,'isolation.json'),JSON.stringify({database,mongo:'127.0.0.1:27028',backend:'127.0.0.1:4021',zapTarget:useZap?'http://host.docker.internal:4021':'NOT USED',zapProxy:useZap?'127.0.0.1:8091':'NOT USED - independent direct tests',initialCollections:existing.length,syntheticOnly:true,externalIntegrations:'disabled; no valid external-provider requests attempted',counts,assessmentTime:new Date().toISOString()},null,2));
 if(useZap){
 let queue;
 for(let i=0;i<100;i++){queue=await api('pscan/view/recordsToScan/');if(Number(queue.recordsToScan)===0)break;await new Promise(r=>setTimeout(r,500));}
 fs.writeFileSync(path.join(dir,'zap-completion.json'),JSON.stringify({timestampUTC:new Date().toISOString(),queue,activeScans:await api('ascan/view/scans/'),spiders:await api('spider/view/scans/')},null,2));
 const alerts=await api('core/view/alerts/',{baseurl:'http://host.docker.internal:4021',start:'0',count:'9999'});
 fs.writeFileSync(path.join(dir,'zap-alerts.json'),JSON.stringify(sanitize(alerts),null,2));
 const messages=await api('core/view/messages/',{baseurl:'http://host.docker.internal:4021',start:'0',count:'9999'});
 fs.writeFileSync(path.join(dir,'zap-history-index.json'),JSON.stringify((messages.messages??[]).map(m=>({id:m.id,requestLine:m.requestHeader?.split('\r\n')[0],statusLine:m.responseHeader?.split('\r\n')[0]})),null,2));
 const version=await api('core/view/version/');fs.writeFileSync(path.join(dir,'zap-version.json'),JSON.stringify(version));
 // Use export-zap.mjs for native target-filtered reports; avoid unscoped core exports.
 }
} finally {
 app.kill();await mongoose.disconnect();
 fs.writeFileSync(path.join(dir,'test-results.json'),JSON.stringify(results,null,2));
 fs.writeFileSync(path.join(dir,'http-exchanges.json'),JSON.stringify(exchanges,null,2));
 fs.writeFileSync(path.join(dir,'backend-log-sanitized.txt'),logs.replace(/eyJ[\w.-]+/g,'[REDACTED JWT]'));
 console.log(JSON.stringify({passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,total:results.length}));
}
