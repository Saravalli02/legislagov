const COLS=new Set(['produtos','mesas','vendas','movimentos','fila','estado','config']);
const J=(c,b)=>({statusCode:c,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(b)});
const C=process.env.CENTRAL||'https://central.legislagov.com.br/api/central/';
const post=async(p,b)=>{const r=await fetch(C+p,{method:'POST',headers:{'content-type':'application/json','x-lg':'1'},body:JSON.stringify(b),signal:AbortSignal.timeout(4000)});return{s:r.status,b:await r.json().catch(()=>({}))}};
const SES=new Map();
const sessao=async t=>{if(!t)return 0;const c=SES.get(t),n=Date.now();if(c&&n-c.t<15000)return c.v;
  try{const r=await post('rest/sessao',{token:t});const v=r.s!==200?(c?c.v:3):!r.b.ok?0:r.b.ativo?1:2;if(SES.size>500)SES.clear();SES.set(t,{t:n,v});return v}
  catch(e){return c?c.v:3}};
const corpo=e=>{let b=e.body||'{}';if(e.isBase64Encoded)b=Buffer.from(b,'base64').toString();try{return JSON.parse(b)}catch(x){return{}}};
const mk=st=>async e=>{
  const m=e.requestContext.http.method,p=(e.rawPath||'').replace(/^\/api/,''),h=e.headers||{},t=h['x-lg-token'];
  if(p==='/ping')return J(200,{ok:1});
  if(p==='/entrar'&&m==='POST'){const b=corpo(e);
    try{const r=await post('rest/entrar',{usuario:b.usuario,senha:b.senha});return J(r.s,r.b)}catch(x){return J(503,{erro:'Sem conexão com a LegislaGov. Tente de novo em instantes.'})}}
  if(p==='/sair'&&m==='POST'){if(t){SES.delete(t);try{await post('rest/sair',{token:t})}catch(x){}}return J(200,{ok:1})}
  const v=await sessao(t);
  if(v===0)return J(401,{erro:'login'});if(v===2)return J(423,{erro:'suspenso'});if(v===3)return J(503,{erro:'central'});
  if(m==='GET'&&p==='/sync'){
    const s=+((e.queryStringParameters||{}).since||0),r=await st.since(s,1500);
    return J(200,{items:r.items,more:r.more,now:Date.now()});
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
  const toIt=x=>({col:x.c.S,id:x.i.S,ver:+x.v.N,ts:+x.t.N,del:!!(x.x&&x.x.BOOL),data:x.d?JSON.parse(x.d.S):null});
  return{
    async put(it,ver){
      const Item={k:{S:it.col+'/'+it.id},c:{S:it.col},i:{S:it.id},v:{N:''+it.ver},t:{N:''+it.ts},g:{S:'a'},x:{BOOL:it.del}};
      if(!it.del)Item.d={S:JSON.stringify(it.data)};
      const q={TableName:T,Item,ConditionExpression:ver?'v = :v':'attribute_not_exists(k)'};
      if(ver)q.ExpressionAttributeValues={':v':{N:''+ver}};
      try{await c.send(new D.PutItemCommand(q));return true}
      catch(e){if(e.name==='ConditionalCheckFailedException')return false;throw e}
    },
    async get(col,id){
      const r=await c.send(new D.GetItemCommand({TableName:T,Key:{k:{S:col+'/'+id}},ConsistentRead:true}));
      return r.Item?toIt(r.Item):null;
    },
    async since(ts,lim){
      const items=[];let K;
      do{const r=await c.send(new D.QueryCommand({TableName:T,IndexName:'g-t',KeyConditionExpression:'g = :g and t > :t',
          ExpressionAttributeValues:{':g':{S:'a'},':t':{N:''+ts}},ExclusiveStartKey:K}));
        items.push(...r.Items.map(toIt));K=r.LastEvaluatedKey}while(K&&items.length<lim);
      return{items,more:!!K};
    }
  };
};
exports.mk=mk;
let h;exports.handler=e=>(h=h||mk(ddb()))(e);
