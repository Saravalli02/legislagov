const COLS=new Set(['produtos','mesas','vendas','movimentos','fila','estado','config','clientes','reservas']);
const J=(c,b)=>({statusCode:c,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(b)});
const C=process.env.CENTRAL||'https://central.legislagov.com.br/api/central/';
const post=async(p,b)=>{const r=await fetch(C+p,{method:'POST',headers:{'content-type':'application/json','x-lg':'1'},body:JSON.stringify(b),signal:AbortSignal.timeout(4000)});return{s:r.status,b:await r.json().catch(()=>({}))}};
// Base única do comércio (restaurante e açougue): cada cliente da Central tem os próprios dados.
// O primeiro cliente (restaurante-1, Casa Saravalli) continua nas chaves antigas; os outros usam "cliente|coleção/id".
const LEGADO='restaurante-1',CLI_RE=/^[a-z0-9-]{1,60}$/;
const SES=new Map();
// ---- garçom: entra com nome + PIN cadastrados no caixa (Ajustes › Garçons). Token assinado, sem usuário da Central.
const CR=require('crypto'),hm=x=>CR.createHmac('sha256',process.env.KEY||'lg').update(x).digest('base64url');
const pinH=(cli,gid,pin)=>hm('pin|'+cli+'|'+gid+'|'+pin).slice(0,16);
const gTok=o=>{const p=Buffer.from(JSON.stringify(o)).toString('base64url');return 'g.'+p+'.'+hm(p)};
const gLer=t=>{const a=String(t).split('.');if(a.length!==3||hm(a[1])!==a[2])return null;try{return JSON.parse(Buffer.from(a[1],'base64url').toString())}catch(x){return null}};
// ---- certificado próprio (autoassinado) para o QZ Tray: gerado no próprio Lambda, a chave nunca sai da Amazon
const asn=(t,b)=>{const l=b.length,len=l<128?Buffer.from([l]):l<256?Buffer.from([0x81,l]):Buffer.from([0x82,l>>8,l&255]);return Buffer.concat([Buffer.from([t]),len,b])};
const aSeq=(...x)=>asn(0x30,Buffer.concat(x)),aSet=(...x)=>asn(0x31,Buffer.concat(x));
const aOid=s=>{const p=s.split('.').map(Number),o=[40*p[0]+p[1]];for(const n of p.slice(2)){const t=[];let v=n;do{t.unshift(v&127);v>>=7}while(v);for(let i=0;i<t.length-1;i++)t[i]|=128;o.push(...t)}return asn(6,Buffer.from(o))};
const aUtf=s=>asn(0x0c,Buffer.from(s,'utf8')),aNull=()=>Buffer.from([5,0]);
const aUtc=d=>{const z=n=>String(n).padStart(2,'0');return asn(0x17,Buffer.from(z(d.getUTCFullYear()%100)+z(d.getUTCMonth()+1)+z(d.getUTCDate())+z(d.getUTCHours())+z(d.getUTCMinutes())+z(d.getUTCSeconds())+'Z'))};
const novoCertQz=()=>{const {privateKey,publicKey}=CR.generateKeyPairSync('rsa',{modulusLength:2048});
  const nome=aSeq(aSet(aSeq(aOid('2.5.4.6'),asn(0x13,Buffer.from('BR')))),aSet(aSeq(aOid('2.5.4.10'),aUtf('GR Software'))),aSet(aSeq(aOid('2.5.4.3'),aUtf('GR Software - Impressao'))));
  const alg=aSeq(aOid('1.2.840.113549.1.1.11'),aNull()),ser=CR.randomBytes(8);ser[0]&=0x7f;
  const agora=new Date(Date.now()-86400000),fim=new Date(Date.UTC(2045,11,31));
  const bc=asn(0xa3,aSeq(aSeq(aOid('2.5.29.19'),asn(1,Buffer.from([0xff])),asn(4,aSeq(asn(1,Buffer.from([0xff])))))));
  const tbs=aSeq(asn(0xa0,asn(2,Buffer.from([2]))),asn(2,ser),alg,nome,aSeq(aUtc(agora),aUtc(fim)),nome,publicKey.export({type:'spki',format:'der'}),bc);
  const sig=CR.sign('sha256',tbs,privateKey),der=aSeq(tbs,alg,asn(3,Buffer.concat([Buffer.from([0]),sig])));
  return {cert:'-----BEGIN CERTIFICATE-----\n'+der.toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END CERTIFICATE-----\n',chave:privateKey.export({type:'pkcs8',format:'pem'})}};
const QZK=new Map();
const qzCert=async st=>{const m=QZK.get('x');if(m)return m;let x=await st.privGet('qz|cert');
  if(!x){const n=novoCertQz();if(await st.privPutNovo('qz|cert',n))x=n;else x=await st.privGet('qz|cert')}
  QZK.set('x',x);return x};
const ATV=new Map();
const cliAtivo=async cli=>{const c=ATV.get(cli),n=Date.now();if(c&&n-c.t<15000)return c.v;
  try{const r=await post('rest/ativo',{cliente:cli});const v=r.s===200&&r.b.ok?{ativo:!!r.b.ativo,tipo:r.b.tipo==='acougue'?'acougue':'restaurante'}:(c?c.v:null);
    if(v)ATV.set(cli,{t:n,v});return v}catch(x){return c?c.v:null}};
const garcons=async st=>{const g=await doc(st,'config','geral');return ((g&&g.data&&g.data.garcons)||[]).filter(x=>x&&x.id&&x.nome)};
const sessao=async(t,base)=>{if(!t)return{v:0};const c=SES.get(t),n=Date.now();if(c&&n-c.t<15000)return c.s;
  if(String(t).startsWith('g.')){const o=gLer(t);if(!o||!CLI_RE.test(o.cli||'')||o.exp<n)return{v:0};
    const gs=await garcons(base(o.cli)),x=gs.find(y=>y.id===o.gid);if(!x||pinH(o.cli,o.gid,String(x.pin||''))!==o.ph)return{v:0};
    const a=await cliAtivo(o.cli);const s=!a?{v:3}:{v:a.ativo?1:2,cli:o.cli,tipo:a.tipo,nome:x.nome,garcom:true};
    if(SES.size>500)SES.clear();if(s.v!==3)SES.set(t,{t:n,s});return s}
  try{const r=await post('rest/sessao',{token:t});
    const s=r.s!==200?(c?c.s:{v:3}):!r.b.ok?{v:0}:{v:r.b.ativo?1:2,cli:CLI_RE.test(r.b.cliente||'')?r.b.cliente:LEGADO,tipo:r.b.tipo==='acougue'?'acougue':'restaurante',nome:r.b.nome||''};
    if(SES.size>500)SES.clear();SES.set(t,{t:n,s});return s}
  catch(e){return c?c.s:{v:3}}};
// ---- cardápio digital (público, sem login): lê só o que o restaurante marcou para o cardápio
const pubM=new Map(),ipM=new Map();
const doc=async(st,c,i)=>{const x=await st.get(c,i);return x&&!x.del?x:null};
const cardapio=async st=>{const pub=pubM.get(st.cli)||{t:0,v:null};if(pub.v&&Date.now()-pub.t<20000)return pub.v;
  const g=await doc(st,'config','geral'),c=(g&&g.data)||{},cd=c.cardapio||{};
  const ids=(cd.ids||[]).slice(0,300);
  const ps=(await Promise.all(ids.map(id=>doc(st,'produtos',id)))).filter(x=>x&&x.data).map(x=>({...x.data,id:x.id}));
  const e=await doc(st,'estado','atual'),ed=(e&&e.data)||{},mv=ed.movId?await doc(st,'movimentos',ed.movId):null;
  const ativo=cd.ativo!==false,aberto=ativo&&!!(mv&&mv.data&&!mv.data.fechamento);
  const v={loja:{nome:c.razao||'Restaurante',logo:c.logo||'',fone:c.fone||'',endereco:c.endereco||'',whatsapp:cd.whatsapp||''},ativo,aberto,genericas:cd.genericas!==false,
    tipos:cd.tipos||{retirada:true,local:true,entrega:false},taxa:+cd.taxa||0,pagamentos:cd.pagamentos||['Pix','Crédito','Débito','Dinheiro'],aviso:cd.aviso||'',
    produtos:ps.map(p=>({id:p.id,nome:p.nome,unidade:p.unidade||'',cat:p.cat||'Outros',preco:+p.preco||0,custo:+p.custo||0,desc:p.desc||'',img:p.img||'',
      esgotado:!(p.estoque===''||p.estoque==null)&&+p.estoque<=0}))};
  if(pubM.size>200)pubM.clear();pubM.set(st.cli,{t:Date.now(),v});return v};
const pedido=async(st,e,b)=>{
  const ip=(e.requestContext.http&&e.requestContext.http.sourceIp)||'?',now=Date.now(),l=(ipM.get(ip)||[]).filter(t=>now-t<600000);
  if(l.length>=6)return J(429,{erro:'Muitos pedidos seguidos deste aparelho. Espere alguns minutos.'});
  pubM.delete(st.cli);const v=await cardapio(st);
  if(!v.aberto)return J(409,{erro:'O restaurante não está recebendo pedidos agora.'});
  const tipo=['retirada','local','entrega'].includes(b.tipo)&&v.tipos[b.tipo]?b.tipo:'';
  if(!tipo)return J(400,{erro:'Escolha se vai retirar, comer no local ou receber em casa.'});
  const nome=String(b.nome||'').trim().slice(0,60),fone=String(b.fone||'').replace(/\D/g,'').slice(0,13),end=String(b.endereco||'').trim().slice(0,160);
  if(nome.length<2)return J(400,{erro:'Escreva seu nome.'});
  if(fone.length<10)return J(400,{erro:'Escreva seu WhatsApp com DDD.'});
  if(tipo==='entrega'&&end.length<5)return J(400,{erro:'Escreva o endereço de entrega.'});
  const pag=v.pagamentos.includes(b.pagamento)?b.pagamento:'';if(!pag)return J(400,{erro:'Escolha a forma de pagamento.'});
  const mp=new Map(v.produtos.map(p=>[p.id,p])),its=[];
  for(const x of (Array.isArray(b.itens)?b.itens:[]).slice(0,40)){const p=mp.get(String(x.id)),q=Math.floor(+x.qtd);
    if(!p||p.esgotado||!(q>=1&&q<=50))return J(400,{erro:'Algum item acabou de sair do cardápio. Atualize a página e tente de novo.'});
    const it=its.find(i=>i.pid===p.id);if(it)it.qtd+=q;else its.push({pid:p.id,nome:p.nome+(p.unidade?' '+p.unidade:''),preco:p.preco,custo:p.custo,qtd:q})}
  if(!its.length)return J(400,{erro:'Escolha pelo menos um item.'});
  if(tipo==='entrega'&&v.taxa>0)its.push({pid:'taxa-entrega',nome:'Taxa de entrega',preco:v.taxa,custo:0,qtd:1});
  let num=0,movId='';
  for(let k=0;k<6&&!num;k++){const x=await st.get('estado','atual'),ed=(x&&!x.del&&x.data)||{},nd={...ed,seq:(+ed.seq||0)+1};
    if(await st.put({col:'estado',id:'atual',ver:(x?x.ver:0)+1,ts:Date.now(),del:false,data:nd},x?x.ver:0)){num=nd.seq;movId=ed.movId||''}}
  if(!num)return J(503,{erro:'Não deu para registrar agora. Tente de novo.'});
  const id='d-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),agora=new Date().toISOString();
  const ped={tipo,cliente:nome,fone,endereco:tipo==='entrega'?end:'',obs:String(b.obs||'').trim().slice(0,200),num,status:'preparo',itens:its,criado:agora,aberta:agora,
    movId,origem:'cardapio',pagamento:pag,troco:pag==='Dinheiro'?String(b.troco||'').slice(0,20):''};
  await st.put({col:'mesas',id,ver:1,ts:Date.now(),del:false,data:ped},0);
  await st.put({col:'fila',id:'f'+id,ver:1,ts:Date.now()+1,del:false,data:{tipo:'pedido',rotulo:'Pedido nº '+num+' (cardápio)',por:'Cardápio digital',ped:{...ped,id},ts:Date.now()}},0);
  l.push(now);ipM.set(ip,l);
  return J(200,{ok:1,num,total:its.reduce((s,i)=>s+i.preco*i.qtd,0),tipo})};
// ---- pedido digital do açougue (reserva sem pagamento: paga na retirada; produtos por peso sem preço)
const reservaInfo=async st=>{
  const g=await doc(st,'config','geral'),c=(g&&g.data)||{},rv=c.reserva||{};
  const ids=(rv.ids||[]).slice(0,120);
  const ps=(await Promise.all(ids.map(id=>doc(st,'produtos',id)))).filter(x=>x&&x.data).map(x=>({...x.data,id:x.id}));
  return{loja:{nome:c.razao||'Açougue',logo:c.logo||'',fone:c.fone||'',endereco:c.endereco||''},ativo:rv.ativo!==false&&ids.length>0,
    titulo:rv.titulo||'Faça seu pedido',aviso:rv.aviso||'',retirada:rv.retirada||'',
    produtos:ps.map(p=>({id:p.id,nome:p.nome,unidade:p.unidade||'',cat:p.cat||'Outros',porKg:!!p.porKg,preco:p.porKg?0:(+p.preco||0),img:p.img||'',
      resta:Math.max(0,Math.floor(+p.resQtd||0))}))}};
const reservar=async(st,e,b)=>{
  const ip=(e.requestContext.http&&e.requestContext.http.sourceIp)||'?',now=Date.now(),l=(ipM.get(ip)||[]).filter(t=>now-t<600000);
  if(l.length>=6)return J(429,{erro:'Muitos pedidos seguidos deste aparelho. Espere alguns minutos.'});
  const v=await reservaInfo(st);if(!v.ativo)return J(409,{erro:'Os pedidos estão fechados agora.'});
  const nome=String(b.nome||'').trim().slice(0,60),fone=String(b.fone||'').replace(/\D/g,'').slice(0,13);
  if(nome.length<2)return J(400,{erro:'Escreva seu nome.'});if(fone.length<10)return J(400,{erro:'Escreva seu WhatsApp com DDD.'});
  const mp=new Map(v.produtos.map(p=>[p.id,p])),its=[];
  for(const x of (Array.isArray(b.itens)?b.itens:[]).slice(0,40)){const p=mp.get(String(x.id)),q=Math.floor(+x.qtd);
    if(!p||!(q>=1&&q<=50))return J(400,{erro:'Algum item saiu da lista. Atualize a página e tente de novo.'});
    const it=its.find(i=>i.pid===p.id);if(it)it.qtd+=q;else its.push({pid:p.id,nome:p.nome+(p.unidade?' '+p.unidade:''),porKg:p.porKg,preco:p.preco,qtd:q})}
  if(!its.length)return J(400,{erro:'Escolha pelo menos um item.'});
  // baixa a quantidade disponível de cada produto (com controle de versão); se faltar, devolve o que já baixou
  const feitos=[];
  const mudar=async(pid,dq)=>{for(let k=0;k<6;k++){const x=await st.get('produtos',pid);if(!x||x.del||!x.data)return false;const r=Math.floor(+x.data.resQtd||0);if(dq<0&&r+dq<0)return false;
    if(await st.put({col:'produtos',id:pid,ver:x.ver+1,ts:Date.now(),del:false,data:{...x.data,resQtd:r+dq}},x.ver))return true}return false};
  for(const it of its){if(await mudar(it.pid,-it.qtd))feitos.push(it);else{for(const f of feitos)await mudar(f.pid,f.qtd);
    return J(409,{erro:`Acabou: ${it.nome}. Diminua a quantidade ou escolha outro.`,acabou:it.pid})}}
  let num=0;
  for(let k=0;k<6&&!num;k++){const x=await st.get('estado','atual'),ed=(x&&!x.del&&x.data)||{},nd={...ed,seq:(+ed.seq||0)+1};
    if(await st.put({col:'estado',id:'atual',ver:(x?x.ver:0)+1,ts:Date.now(),del:false,data:nd},x?x.ver:0))num=nd.seq}
  const id='r-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const rs={num,nome,fone,retirada:String(b.retirada||'').trim().slice(0,80),obs:String(b.obs||'').trim().slice(0,200),itens:its,
    totalFixo:its.reduce((s,i)=>s+(i.porKg?0:i.preco*i.qtd),0),status:'nova',criado:new Date().toISOString()};
  await st.put({col:'reservas',id,ver:1,ts:Date.now(),del:false,data:rs},0);
  l.push(now);ipM.set(ip,l);
  return J(200,{ok:1,num,totalFixo:rs.totalFixo,temPeso:its.some(i=>i.porKg)})};
// ---- WhatsApp: robô padrão da GR. O app "GR Software" na Meta recebe as mensagens de todos os clientes;
// cada número do WhatsApp aponta para um cliente (cfg.numeros). Chaves (token e segredo do app) ficam só aqui na Amazon.
const WAV='v25.0',WAC=new Map(),WAID=new Map();
const waGl=base=>base('gr-global');
const waCfg=async base=>{const c=WAC.get('c');if(c&&Date.now()-c.t<30000)return c.v;let v=await waGl(base).privGet('wa|cfg');
  if(!v||!v.verify){v={...(v||{}),verify:CR.randomBytes(18).toString('base64url'),numeros:(v&&v.numeros)||{}};await waGl(base).privPut('wa|cfg',v)}
  WAC.set('c',{t:Date.now(),v});return v};
const waRaw=e=>e.body?(e.isBase64Encoded?Buffer.from(e.body,'base64'):Buffer.from(e.body,'utf8')):Buffer.alloc(0);
const waBRL=v=>'R$ '+(+v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const waEnviar=async(cfg,pid,msg)=>{try{const r=await fetch(`https://graph.facebook.com/${WAV}/${pid}/messages`,{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+cfg.token},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',...msg}),signal:AbortSignal.timeout(7000)});
  if(!r.ok)console.log('wa envio',r.status,(await r.text()).slice(0,400));return r.ok}catch(x){console.log('wa erro',String(x).slice(0,200));return false}};
const waLink=(cli,tipo)=>cli===LEGADO?'https://casasaravalli.grsoftware.com.br/':tipo==='acougue'?`https://acougue.grsoftware.com.br/reserva?c=${cli}`:`https://restaurante.grsoftware.com.br/cardapio?c=${cli}`;
const waTexto=(cfg,pid,to,body)=>waEnviar(cfg,pid,{to,type:'text',text:{preview_url:true,body:String(body).slice(0,4000)}});
const waResponder=async(base,cfg,pid,cli,de,texto,botao)=>{
  const st=base(cli),g=await doc(st,'config','geral'),c=(g&&g.data)||{},w=c.whatsapp||{};
  if(w.ativo===false)return;
  const a=await cliAtivo(cli);if(a&&!a.ativo)return;
  const tipo=(a&&a.tipo)||'restaurante',loja=c.razao||(tipo==='acougue'?'nosso açougue':'nosso restaurante'),link=waLink(cli,tipo),n=Date.now();
  const ct=(await st.privGet('wa|ct|'+de))||{};
  const t=String(texto||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(!botao){if(/card[aá]?pio|menu|pedir|pedido/.test(t))botao='cardapio';else if(/atendente|pessoa|humano|falar com/.test(t))botao='humano';else if(/horario|endereco|onde fica|aberto/.test(t))botao='info'}
  if(botao==='humano'){await st.privPut('wa|ct|'+de,{...ct,humano:n+2*3600e3});
    return waTexto(cfg,pid,de,w.humano||'Certo! 🙂 Já avisamos a equipe. Um atendente vai te responder por aqui em instantes.')}
  if(botao==='menu'){botao='';ct.humano=0}
  if(!botao&&ct.humano&&ct.humano>n)return;               // conversa está com um atendente: o robô fica quieto
  if(botao==='cardapio'){const v=await cardapio(st),ps=v.produtos.filter(p=>!p.esgotado);let s=`📋 *Cardápio — ${loja}*\n`;
    if(!v.aberto)s+='\n⚠️ Estamos fechados agora. Os pedidos abrem no horário de funcionamento.\n';
    const cats=[...new Set(ps.map(p=>p.cat))];
    for(const k of cats){const l=`\n*${k}*\n`+ps.filter(p=>p.cat===k).map(p=>`• ${p.nome}${p.unidade?' '+p.unidade:''} — ${waBRL(p.preco)}`).join('\n')+'\n';if(s.length+l.length>3300){s+='\n…e mais itens no link abaixo.\n';break}s+=l}
    s+=`\n🛵 Veja as fotos e faça seu pedido aqui:\n${link}`;
    await st.privPut('wa|ct|'+de,{...ct,menu:n,humano:0});return waTexto(cfg,pid,de,s)}
  if(botao==='info'){const l=[`📍 *${loja}*`];if(c.endereco)l.push('Endereço: '+c.endereco);if(w.horario)l.push('Horário: '+w.horario);if(c.fone)l.push('Telefone: '+c.fone);
    if(l.length===1)l.push('Responda "atendente" que a equipe te passa o horário e o endereço.');l.push('\nCardápio: '+link);
    await st.privPut('wa|ct|'+de,{...ct,menu:n,humano:0});return waTexto(cfg,pid,de,l.join('\n'))}
  if(ct.menu&&n-ct.menu<60e3)return;                       // não repete o menu a cada mensagem
  await st.privPut('wa|ct|'+de,{...ct,menu:n,humano:0});
  return waEnviar(cfg,pid,{to:de,type:'interactive',interactive:{type:'button',
    body:{text:String(w.boas||`Olá! 👋 Bem-vindo(a) ao ${loja}. Como podemos te ajudar?`).slice(0,1000)},footer:{text:'Toque numa opção'},
    action:{buttons:[{type:'reply',reply:{id:'cardapio',title:'Cardápio e pedido'}},{type:'reply',reply:{id:'info',title:'Horário e endereço'}},{type:'reply',reply:{id:'humano',title:'Falar com atendente'}}]}}})};
const waWebhook=async(base,e,h,q,m)=>{const cfg=await waCfg(base);
  if(m==='GET'){if(q['hub.mode']==='subscribe'&&q['hub.verify_token']&&q['hub.verify_token']===cfg.verify)return{statusCode:200,headers:{'content-type':'text/plain'},body:String(q['hub.challenge']||'')};return J(403,{ok:false})}
  if(!cfg.segredo||!cfg.token)return J(200,{ok:1});
  const raw=waRaw(e),sig=String(h['x-hub-signature-256']||''),esp='sha256='+CR.createHmac('sha256',cfg.segredo).update(raw).digest('hex');
  if(sig.length!==esp.length||!CR.timingSafeEqual(Buffer.from(sig),Buffer.from(esp))){console.log('wa assinatura recusada');return J(401,{ok:false})}
  let b;try{b=JSON.parse(raw.toString('utf8'))}catch(x){return J(400,{ok:false})}
  const tr=[],agora=Date.now();for(const [k,t] of WAID)if(agora-t>600e3)WAID.delete(k);
  for(const en of b.entry||[])for(const ch of en.changes||[]){const v=ch.value||{},pid=v.metadata&&v.metadata.phone_number_id;if(!pid)continue;
    const cli=(cfg.numeros||{})[pid]||cfg.padrao||LEGADO;
    for(const msg of v.messages||[]){if(!msg||!msg.from||WAID.has(msg.id))continue;WAID.set(msg.id,agora);
      let texto='',botao='';if(msg.type==='text')texto=(msg.text||{}).body;
      else if(msg.type==='interactive'){const r=msg.interactive.button_reply||msg.interactive.list_reply||{};botao=String(r.id||'')}
      else if(msg.type==='button')texto=(msg.button||{}).text;
      tr.push(waResponder(base,cfg,pid,cli,String(msg.from).replace(/\D/g,''),texto,botao).catch(x=>console.log('wa resp',String(x).slice(0,300))))}}
  await Promise.all(tr);return J(200,{ok:1})};
const WAORIG=new Set(['https://central.grsoftware.com.br','https://central.legislagov.com.br','https://teste.legislagov.com.br']);
const waCfgRota=async(base,e,h,m)=>{const o=h.origin||'',cors=WAORIG.has(o)?{'access-control-allow-origin':o,'access-control-allow-headers':'content-type,x-central','access-control-allow-methods':'GET,POST,OPTIONS',vary:'origin'}:{};
  const R=(s,b)=>({statusCode:s,headers:{'content-type':'application/json','cache-control':'no-store',...cors},body:JSON.stringify(b)});
  if(m==='OPTIONS')return{statusCode:204,headers:cors,body:''};
  const r=await post('rest/socio',{token:String(h['x-central']||'')}).catch(()=>({s:0,b:{}}));if(r.s!==200||!r.b.ok)return R(403,{ok:false,erro:'Entre na Central de novo.'});
  let cfg=await waCfg(base);
  if(m==='POST'){const b=corpo(e),n={...cfg,numeros:{...(cfg.numeros||{})}};
    if(b.segredo)n.segredo=String(b.segredo).trim().slice(0,120);if(b.token)n.token=String(b.token).trim().slice(0,800);
    if(b.padrao&&CLI_RE.test(b.padrao))n.padrao=b.padrao;
    if(b.numero&&/^\d{5,25}$/.test(b.numero)){if(b.cliente&&CLI_RE.test(b.cliente))n.numeros[b.numero]=b.cliente;else delete n.numeros[b.numero]}
    if(b.novoVerify)n.verify=CR.randomBytes(18).toString('base64url');
    await waGl(base).privPut('wa|cfg',n);WAC.delete('c');cfg=n}
  return R(200,{ok:true,webhook:'https://restaurante.grsoftware.com.br/api/whatsapp',verify:cfg.verify,temSegredo:!!cfg.segredo,temToken:!!cfg.token,numeros:cfg.numeros||{},padrao:cfg.padrao||LEGADO})};
const corpo=e=>{let b=e.body||'{}';if(e.isBase64Encoded)b=Buffer.from(b,'base64').toString();try{return JSON.parse(b)}catch(x){return{}}};
const mk=base=>async e=>{
  const m=e.requestContext.http.method,p=(e.rawPath||'').replace(/^\/api/,''),h=e.headers||{},t=h['x-lg-token'],q=e.queryStringParameters||{};
  if(p==='/ping')return J(200,{ok:1});
  if(p==='/whatsapp'&&(m==='GET'||m==='POST'))return waWebhook(base,e,h,q,m);
  if(p==='/wa-cfg')return waCfgRota(base,e,h,m);
  // e-mail (código de confirmação etc.): a Central só manda o número; o conteúdo vem da própria Central (uma vez só)
  if(p==='/_email'&&m==='POST'){const b=corpo(e),id=String(b.id||'');if(!/^[A-Za-z0-9_-]{16,40}$/.test(id))return J(400,{ok:false});
    const r=await post('rest/saida',{id});if(r.s!==200||!r.b.para)return J(404,{ok:false});
    try{const S=require('@aws-sdk/client-sesv2'),ses=new S.SESv2Client({region:'sa-east-1'});
      await ses.send(new S.SendEmailCommand({FromEmailAddress:r.b.de||'GR Software <nao-responda@grsoftware.com.br>',Destination:{ToAddresses:[String(r.b.para)]},
        Content:{Simple:{Subject:{Data:String(r.b.assunto||''),Charset:'UTF-8'},Body:{Text:{Data:String(r.b.texto||''),Charset:'UTF-8'}}}}}));
      return J(200,{ok:true})}catch(x){console.log('email',String(x).slice(0,300));return J(502,{ok:false})}}
  // cardápio digital público: ?c=cliente (sem c = o primeiro restaurante)
  const pubSt=()=>base(CLI_RE.test(q.c||'')?q.c:LEGADO);
  if(p==='/cardapio'&&m==='GET'){const v=await cardapio(pubSt());return J(200,{...v,produtos:v.produtos.map(({custo,...x})=>x)})}
  if(p==='/pedido'&&m==='POST')return pedido(pubSt(),e,corpo(e));
  if(p==='/reserva'&&m==='GET'){const v=await reservaInfo(pubSt());return J(200,v)}
  if(p==='/reserva'&&m==='POST')return reservar(pubSt(),e,corpo(e));
  if(p==='/qz-cert'&&m==='GET'){const x=await qzCert(base(LEGADO));return{statusCode:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600','content-disposition':q.baixar?'attachment; filename="gr-impressao.crt"':'inline'},body:x.cert}}
  if(p==='/garcons'&&m==='GET'){const gs=await garcons(pubSt());return J(200,{garcons:gs.map(x=>({id:x.id,nome:x.nome}))})}
  if(p==='/entrar-garcom'&&m==='POST'){const b=corpo(e),cli=CLI_RE.test(b.c||'')?b.c:LEGADO,st=base(cli),gid=String(b.id||''),pin=String(b.pin||'').replace(/\D/g,'');
    const fk='gfalha|'+gid,f=(await st.privGet(fk))||{n:0,ate:0},n=Date.now();
    if(f.ate>n)return J(429,{erro:'Muitas tentativas com PIN errado. Espere '+Math.ceil((f.ate-n)/60000)+' minuto(s) ou peça ao caixa para trocar o PIN.'});
    const x=(await garcons(st)).find(y=>y.id===gid);
    if(!x||String(x.pin||'')!==pin||pin.length<4){const k=(f.n||0)+1;await st.privPut(fk,{n:k>=5?0:k,ate:k>=5?n+15*60000:0});return J(401,{erro:k>=5?'PIN errado 5 vezes. Bloqueado por 15 minutos.':'PIN errado.'})}
    const a=await cliAtivo(cli);if(!a)return J(503,{erro:'Sem conexão com o servidor. Tente de novo.'});if(!a.ativo)return J(423,{erro:'Acesso suspenso. Fale com o responsável.'});
    await st.privPut(fk,{n:0,ate:0});
    return J(200,{ok:1,token:gTok({cli,gid,ph:pinH(cli,gid,pin),exp:n+30*86400000}),nome:x.nome,id:x.id,cliente:cli,tipo:a.tipo})}
  if(p==='/entrar'&&m==='POST'){const b=corpo(e);
    try{const r=await post('rest/entrar',{usuario:b.usuario,senha:b.senha,tipo:b.tipo==='acougue'?'acougue':'restaurante',dev:String(b.dev||'').slice(0,64),ip:String((e.headers||{})['x-forwarded-for']||'').split(',')[0].trim()||(e.requestContext.http&&e.requestContext.http.sourceIp)||'',ua:String(b.ua||(e.headers||{})['user-agent']||'').slice(0,300),codigo:String(b.codigo||'').replace(/\D/g,'').slice(0,6)});return J(r.s,r.b)}catch(x){return J(503,{erro:'Sem conexão com o servidor. Tente de novo em instantes.'})}}
  if(p==='/sair'&&m==='POST'){if(t){SES.delete(t);try{await post('rest/sair',{token:t})}catch(x){}}return J(200,{ok:1})}
  const ss=await sessao(t,base),v=ss.v;
  if(v===0)return J(401,{erro:'login'});if(v===2)return J(423,{erro:'suspenso'});if(v===3)return J(503,{erro:'central'});
  const st=base(ss.cli);
  if(p==='/qz-assinar'&&m==='POST'){const b=corpo(e),d=String(b.d||'');if(!d||d.length>20000)return J(400,{erro:'dados'});
    const x=await qzCert(base(LEGADO));return{statusCode:200,headers:{'content-type':'text/plain','cache-control':'no-store'},body:CR.sign('sha512',Buffer.from(d),x.chave).toString('base64')}}
  if(m==='GET'&&p==='/eu')return J(200,{cliente:ss.cli,tipo:ss.tipo,nome:ss.nome});
  if(m==='GET'&&p==='/sync'){
    const s=+(q.since||0),r=await st.since(s,1500);
    return J(200,{items:r.items,more:r.more,now:Date.now(),cliente:ss.cli,tipo:ss.tipo});
  }
  const r=p.match(/^\/doc\/([a-z]+)\/([^/]+)$/);
  if(r&&m==='PUT'&&ss.garcom&&!['mesas','fila','estado'].includes(r[1]))return J(403,{erro:'O app do garçom não altera isso.'});
  if(r&&m==='PUT'&&COLS.has(r[1])){
    const col=r[1],id=decodeURIComponent(r[2]);
    const b=corpo(e);
    const ver=+b.ver||0,del=b.data==null;
    const it={col,id,ver:ver+1,ts:Date.now(),del,data:del?null:b.data};
    if(await st.put(it,ver))return J(200,{ver:it.ver});
    return J(409,{item:await st.get(col,id)});
  }
  return J(404,{erro:'rota'});
};
const ddb=()=>{
  const D=require('@aws-sdk/client-dynamodb'),c=new D.DynamoDBClient({}),T=process.env.TABLE;
  return cli=>{const L=cli===LEGADO,pre=L?'':cli+'|',G=L?'a':'c|'+cli;
  const toIt=x=>({col:x.c.S,id:x.i.S,ver:+x.v.N,ts:+x.t.N,del:!!(x.x&&x.x.BOOL),data:x.d?JSON.parse(x.d.S):null});
  return{
    async put(it,ver){
      const Item={k:{S:pre+it.col+'/'+it.id},c:{S:it.col},i:{S:it.id},v:{N:''+it.ver},t:{N:''+it.ts},g:{S:G},x:{BOOL:it.del}};
      if(!it.del)Item.d={S:JSON.stringify(it.data)};
      const q={TableName:T,Item,ConditionExpression:ver?'v = :v':'attribute_not_exists(k)'};
      if(ver)q.ExpressionAttributeValues={':v':{N:''+ver}};
      try{await c.send(new D.PutItemCommand(q));return true}
      catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e}
    },
    async privGet(key){const r=await c.send(new D.GetItemCommand({TableName:T,Key:{k:{S:'priv|'+(cli)+'|'+key}},ConsistentRead:true}));return r.Item&&r.Item.d?JSON.parse(r.Item.d.S):null},
    async privPutNovo(key,o){try{await c.send(new D.PutItemCommand({TableName:T,Item:{k:{S:'priv|'+(cli)+'|'+key},d:{S:JSON.stringify(o)}},ConditionExpression:'attribute_not_exists(k)'}));return true}catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e}},
    async privPut(key,o){await c.send(new D.PutItemCommand({TableName:T,Item:{k:{S:'priv|'+(cli)+'|'+key},d:{S:JSON.stringify(o)}}}))},
    async get(col,id){
      const r=await c.send(new D.GetItemCommand({TableName:T,Key:{k:{S:pre+col+'/'+id}},ConsistentRead:true}));
      return r.Item?toIt(r.Item):null;
    },
    async since(ts,lim){
      const items=[];let K;
      do{const r=await c.send(new D.QueryCommand({TableName:T,IndexName:'g-t',KeyConditionExpression:'g = :g and t > :t',
          ExpressionAttributeValues:{':g':{S:G},':t':{N:''+ts}},ExclusiveStartKey:K}));
        items.push(...r.Items.map(toIt));K=r.LastEvaluatedKey}while(K&&items.length<lim);
      return{items,more:!!K};
    }
  ,cli}};
};
exports.mk=mk;
let h;exports.handler=e=>(h=h||mk(ddb()))(e);
