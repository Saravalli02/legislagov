import json,subprocess,os,sys,math
from PIL import Image,ImageDraw,ImageFont,ImageFilter
W,H,FPS=1920,1080,30
F='/usr/share/fonts/opentype/inter/'
fB=lambda s:ImageFont.truetype(F+'Inter-Bold.otf',s);fM=lambda s:ImageFont.truetype(F+'Inter-Medium.otf',s);fS=lambda s:ImageFont.truetype(F+'Inter-SemiBold.otf',s)
BB=json.load(open('/tmp/aula/bbox.json'))
LOGO=Image.open('/home/claude/legislagov/apps/gr/gr-emblema.webp').convert('RGBA')
AULA=sys.argv[1] if len(sys.argv)>1 else 'r1'
CFG=json.load(open(f'/tmp/aula/{AULA}.json'))
ease=lambda x:0.5-0.5*math.cos(math.pi*max(0,min(1,x)))
def wrap(d,t,font,mx):
    out=[];l=''
    for w in t.split():
        x=(l+' '+w).strip()
        if d.textlength(x,font=font)<=mx:l=x
        else:out.append(l);l=w
    out.append(l);return out
def enc(name,frames,dur):
    tmp=f'/tmp/aula/out/{name}.tmp.mp4'
    p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',tmp],stdin=subprocess.PIPE)
    n=int(dur*FPS)
    for i in range(n):p.stdin.write(frames(i/FPS,dur).tobytes())
    p.stdin.close();assert p.wait()==0;os.replace(tmp,f'/tmp/aula/out/{name}.mp4')
def fade(im,t,dur,fi=.35,fo=.35):
    a=min(1,t/fi if fi else 1,(dur-t)/fo if fo else 1)
    return im if a>=1 else Image.blend(Image.new('RGB',(W,H),(0,0,0)),im,max(0,a))
def fundo():
    bg=Image.new('RGB',(W,H),(6,8,12));d=ImageDraw.Draw(bg)
    glow=Image.new('RGB',(W,H),(0,0,0));g=ImageDraw.Draw(glow);g.ellipse((W/2-700,-500,W/2+700,500),fill=(20,60,140));glow=glow.filter(ImageFilter.GaussianBlur(160))
    return Image.blend(bg,glow,.55)
BG=fundo()
def cartao(titulo,sub,extra=''):
    def fr(t,dur):
        im=BG.copy();d=ImageDraw.Draw(im);a=ease(t/0.9)
        lg=LOGO.resize((int(220*(0.9+0.1*a)),)*2) if LOGO.width==LOGO.height else LOGO.resize((int(220*LOGO.width/LOGO.height),220))
        im.paste(lg,((W-lg.width)//2,int(250-30*(1-a))),lg)
        y=520
        for txt,font,col in [(titulo,fB(84),(237,237,237)),(sub,fM(44),(25,227,208)),(extra,fM(34),(154,154,163))]:
            if not txt:continue
            w=d.textlength(txt,font=font);d.text(((W-w)/2,y+20*(1-a)),txt,font=font,fill=col);y+=font.size+34
        return fade(im,t,dur,.5,.5)
    return fr
def cena(img,box,txt,passo,total,zoom_alvo):
    base=Image.open(img).convert('RGB')
    cx,cy=(box[0]+box[2]/2,box[1]+box[3]/2) if zoom_alvo else (W/2,H/2)
    def fr(t,dur):
        z=1+0.05*ease(t/dur)
        sw,sh=W/z,H/z;x0=min(max(cx-sw/2,0),W-sw);y0=min(max(cy-sh/2,0),H-sh)
        im=base.crop((int(x0),int(y0),int(x0+sw),int(y0+sh))).resize((W,H),Image.BICUBIC)
        # destaque
        a=ease((t-.5)/.6)
        if a>0:
            bx=[(box[0]-x0)*z,(box[1]-y0)*z,(box[0]+box[2]-x0)*z,(box[1]+box[3]-y0)*z]
            pad=10;bx=[bx[0]-pad,bx[1]-pad,bx[2]+pad,bx[3]+pad]
            dim=Image.new('RGBA',(W,H),(0,0,0,int(110*a)));m=ImageDraw.Draw(dim);m.rounded_rectangle(bx,22,fill=(0,0,0,0))
            im=im.convert('RGBA');im.alpha_composite(dim)
            pul=0.5+0.5*math.sin(t*4)
            ov=Image.new('RGBA',(W,H));o=ImageDraw.Draw(ov);o.rounded_rectangle(bx,22,outline=(25,227,208,int(255*a)),width=int(5+2*pul))
            gl=ov.resize((W//4,H//4)).filter(ImageFilter.GaussianBlur(3)).resize((W,H));im.alpha_composite(gl);im.alpha_composite(ov);im=im.convert('RGB')
        # legenda
        d=ImageDraw.Draw(im,'RGBA');font=fS(40);ls=wrap(d,txt,font,1500)
        bh=60+len(ls)*54;y=H-bh-40
        d.rounded_rectangle((150,y,W-150,H-40),28,fill=(8,10,16,228))
        d.rounded_rectangle((180,y+30,180+92,y+30+48),24,fill=(25,227,208,255));c=f'{passo}/{total}';fc=fB(28);d.text((180+46-d.textlength(c,font=fc)/2,y+38),c,font=fc,fill=(4,20,18))
        for k,l in enumerate(ls):d.text((300,y+28+k*54),l,font=font,fill=(240,240,242))
        return fade(im,t,dur,.3,.3)
    return fr
os.makedirs('/tmp/aula/out',exist_ok=True)
so=sys.argv[2:]  # renderizar só algumas
lista=[]
def faz(nome,fr,dur):
    lista.append(nome)
    if not so or nome in so:enc(nome,fr,dur)
faz(f'{AULA}-00',cartao(CFG['sistema'],CFG['titulo'],CFG.get('sub','')),4.5)
cs=CFG['cenas']
for i,c in enumerate(cs,1):
    dur=max(5.5,len(c['txt'].split())*0.42+1.2)
    faz(f'{AULA}-{i:02d}',cena(f"/tmp/aula/{c['img']}.jpg",BB[c['img']],c['txt'],i,len(cs),c.get('zoom',False)),dur)
faz(f'{AULA}-99',cartao(CFG['fim'],CFG['fim2'],'Siga @grsoftwareBR no Instagram'),5)
open(f'/tmp/aula/out/{AULA}.txt','w').write(''.join(f"file '{n}.mp4'\n" for n in lista))
