const COLS=new Set(['produtos','mesas','vendas','movimentos','fila','estado','config']);
const J=(c,b)=>({statusCode:c,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(b)});
const C=process.env.CENTRAL||'https://central.legislagov.com.br/api/central/';
const post=async(p,b)=>{const r=await fetch(C+p,{method:'POST',headers:{'content-type':'application/json','x-lg':'1'},body:JSON.stringify(b),signal:AbortSignal.timeout(4000)});return{s:r.status,b:await r.json().catch(()=>({}))}};
// Base única do comércio (restaurante e açougue): cada cliente da Central tem os próprios dados.
// O primeiro cliente (restaurante-1, Casa Saravalli) continua nas chaves antigas; os outros usam "cliente|coleção/id".
const LEGADO='restaurante-1',CLI_RE=/^[a-z0-9-]{1,60}$/;
const SES=new Map();
const sessao=async t=>{if(!t)return{v:0};const c=SES.get(t),n=Date.now();if(c&&n-c.t<15000)return c.s;
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
const corpo=e=>{let b=e.body||'{}';if(e.isBase64Encoded)b=Buffer.from(b,'base64').toString();try{return JSON.parse(b)}catch(x){return{}}};
const mk=base=>async e=>{
  const m=e.requestContext.http.method,p=(e.rawPath||'').replace(/^\/api/,''),h=e.headers||{},t=h['x-lg-token'],q=e.queryStringParameters||{};
  if(p==='/ping')return J(200,{ok:1});
  // cardápio digital público: ?c=cliente (sem c = o primeiro restaurante)
  const pubSt=()=>base(CLI_RE.test(q.c||'')?q.c:LEGADO);
  if(p==='/cardapio'&&m==='GET'){const v=await cardapio(pubSt());return J(200,{...v,produtos:v.produtos.map(({custo,...x})=>x)})}
  if(p==='/pedido'&&m==='POST')return pedido(pubSt(),e,corpo(e));
  if(p==='/entrar'&&m==='POST'){const b=corpo(e);
    try{const r=await post('rest/entrar',{usuario:b.usuario,senha:b.senha,tipo:b.tipo==='acougue'?'acougue':'restaurante'});return J(r.s,r.b)}catch(x){return J(503,{erro:'Sem conexão com a LegislaGov. Tente de novo em instantes.'})}}
  if(p==='/sair'&&m==='POST'){if(t){SES.delete(t);try{await post('rest/sair',{token:t})}catch(x){}}return J(200,{ok:1})}
  const ss=await sessao(t),v=ss.v;
  if(v===0)return J(401,{erro:'login'});if(v===2)return J(423,{erro:'suspenso'});if(v===3)return J(503,{erro:'central'});
  const st=base(ss.cli);
  if(m==='GET'&&p==='/eu')return J(200,{cliente:ss.cli,tipo:ss.tipo,nome:ss.nome});
  if(m==='GET'&&p==='/sync'){
    const s=+(q.since||0),r=await st.since(s,1500);
    return J(200,{items:r.items,more:r.more,now:Date.now(),cliente:ss.cli,tipo:ss.tipo});
  }
  const r=p.match(/^\/doc\/([a-z]+)\/([^/]+)$/);
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
