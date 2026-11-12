/* LegislaGov — instalar o app no celular (Android/Chrome) */
(function () {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { }));
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let pedido = null;
  const css = document.createElement('style'); css.textContent = `
  .lgapp-bt{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:12px;padding:11px 14px;border-radius:10px;border:1px solid #2c2f34;background:#141517;color:#f3f4f6;font:600 14px system-ui,sans-serif;cursor:pointer}
  .lgapp-bt img{width:22px;height:22px;border-radius:6px}
  #lgapp-faixa{position:fixed;left:12px;right:12px;bottom:12px;z-index:99990;display:flex;align-items:center;gap:12px;background:#0d0e10;border:1px solid #2a2c31;border-radius:14px;padding:12px;color:#f3f4f6;font:14px/1.35 system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.5)}
  #lgapp-faixa img{width:40px;height:40px;border-radius:10px}#lgapp-faixa div{flex:1}#lgapp-faixa small{display:block;color:#9a9fa6}
  #lgapp-faixa .sim{background:#f2f3f5;color:#0b0c0e;border:0;border-radius:9px;padding:9px 12px;font-weight:600}
  #lgapp-faixa .nao{background:none;border:0;color:#9a9fa6;font-size:20px;padding:0 4px}`;
  document.head.appendChild(css);
  async function instalar() { if (!pedido) return; pedido.prompt(); const r = await pedido.userChoice; pedido = null; limpar(); if (r && r.outcome === 'accepted') try { localStorage.setItem('lgapp_instalado', '1'); } catch (e) { } }
  function limpar() { document.querySelectorAll('.lgapp-bt,#lgapp-faixa').forEach(e => e.remove()); }
  function mostrar() {
    if (!pedido || instalado()) return;
    const card = document.querySelector('#auth-screen .auth-card form#login-form');
    if (card && !document.querySelector('.lgapp-bt')) { card.insertAdjacentHTML('afterend', '<button type="button" class="lgapp-bt"><img src="app/app-192.png" alt="">Instalar o app no celular</button>'); document.querySelector('.lgapp-bt').onclick = instalar; }
    let dispensado = ''; try { dispensado = localStorage.getItem('lgapp_dispensado'); } catch (e) { }
    if (!dispensado && !document.getElementById('lgapp-faixa') && /Android/i.test(navigator.userAgent)) {
      document.body.insertAdjacentHTML('beforeend', '<div id="lgapp-faixa" role="dialog" aria-label="Instalar o app"><img src="app/app-192.png" alt=""><div><b>Instale o app LegislaGov</b><small>Abra o painel direto pela tela inicial do celular.</small></div><button class="sim" type="button">Instalar</button><button class="nao" type="button" aria-label="Agora não">×</button></div>');
      const f = document.getElementById('lgapp-faixa'); f.querySelector('.sim').onclick = instalar;
      f.querySelector('.nao').onclick = () => { f.remove(); try { localStorage.setItem('lgapp_dispensado', '1'); } catch (e) { } };
    }
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e; mostrar(); });
  addEventListener('appinstalled', limpar);
})();
