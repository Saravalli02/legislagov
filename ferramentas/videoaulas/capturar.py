from playwright.sync_api import sync_playwright
import json
exec(open('/home/claude/legislagov/ferramentas/videoaulas/dados_exemplo.py').read().split('with sync_playwright()')[0])  # seed(), R
CENAS=[  # nome, ação, seletor a destacar
 ('caixa',"go('mesas');abaCaixa('caixa')",'nav'),
 ('abas',"go('mesas');abaCaixa('caixa')",'.sabs'),
 ('mesas',"go('mesas');abaCaixa('mesas')",'.mesas-wrap'),
 ('produtos',"go('produtos')",'nav [data-v=produtos]'),
 ('estoque',"go('estoque')",'nav [data-v=estoque]'),
 ('historico',"go('historico')",'nav [data-v=historico]'),
 ('relatorios',"go('relatorios')",'nav [data-v=relatorios]'),
 ('cardapio',"go('cardapio')",'nav [data-v=cardapio]'),
 ('config',"go('config')",'nav [data-v=config]'),
]
with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  pg=b.new_page(viewport={'width':1280,'height':720},device_scale_factor=1.5);errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
  pg.goto('http://localhost:8765/index.html');pg.wait_for_timeout(1500);pg.evaluate(seed('Restaurante da Praça',R));pg.evaluate("()=>{Object.values(S.vendas).forEach((v,i)=>{v.mesa=String(i%12+1);v.rotulo='Mesa '+v.mesa})}");pg.wait_for_timeout(300)
  pg.evaluate("()=>{[[2,[0,1,9,9]],[4,[3,10]],[5,[5,6,11,11]],[8,[4,9]],[11,[7,11,11,11]],[12,[2,8,9]]].forEach(([n,l])=>l.forEach(i=>lancarEm(String(n),'p'+i)))}")
  pg.add_style_tag(content='#toast,#alerta{display:none!important}')
  out={}
  for nome,acao,sel in CENAS:
    pg.evaluate("()=>{"+acao+"}");pg.wait_for_timeout(600)
    bb=pg.evaluate(f"()=>{{const e=document.querySelector('{sel}');if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,Math.min(r.height,720-r.y)]}}")
    pg.screenshot(path=f'/tmp/aula/{nome}.jpg',type='jpeg',quality=92);out[nome]=[round(v*1.5) for v in bb] if bb else None
  json.dump(out,open('/tmp/aula/bbox.json','w'));print(out,errs)
