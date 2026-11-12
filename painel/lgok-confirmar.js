/* =====================================================================
   LegislaGov — CONFIRMAR ANTES DE PUBLICAR OU ENVIAR
   Tudo o que vai para o site, para outra pessoa ou não tem volta passa
   antes por uma pergunta: "Tem certeza? Conferiu se está tudo certo?".
   - lgConfirmar({ titulo, texto, itens, ok, perigo }) → Promise<boolean>
     (janela própria, por cima de qualquer outra; itens = caixas que a
     pessoa precisa marcar antes de confirmar)
   - lgtUI.confirmar passa a usar esta janela (com o botão certo)
   - os botões listados em REGRAS pedem confirmação sozinhos
   ===================================================================== */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const CONFERIR = 'Confira o texto, os dados e os anexos antes de confirmar.';

  /* ---------------- a janela ---------------- */
  let fila = Promise.resolve();
  function lgConfirmar(o) {
    o = typeof o === 'string' ? { texto: o } : (o || {});
    const p = fila.then(() => new Promise(fim => abrir(o, fim)));
    fila = p.catch(() => { });
    return p;
  }
  function abrir(o, fim) {
    const antes = document.activeElement;
    const el = document.createElement('div'); el.id = 'lgok';
    const itens = o.itens || [];
    el.innerHTML = `<div class="lgok-fundo"></div><div class="lgok-caixa" role="alertdialog" aria-modal="true" aria-labelledby="lgok-t" aria-describedby="lgok-x">
      <div class="lgok-ic ${o.perigo ? 'perigo' : ''}" aria-hidden="true">${o.perigo ? '!' : '?'}</div>
      <h2 id="lgok-t">${esc(o.titulo || 'Tem certeza?')}</h2>
      ${o.item ? `<p class="lgok-item">${esc(o.item)}</p>` : ''}
      <p id="lgok-x">${esc(o.texto || '')}</p>
      ${o.conferir === false ? '' : `<p class="lgok-conf">${esc(o.conferir || CONFERIR)}</p>`}
      ${itens.length ? `<div class="lgok-itens">${itens.map((t, i) => `<label><input type="checkbox" data-i="${i}"> ${esc(t)}</label>`).join('')}</div>` : ''}
      <div class="lgok-bts"><button type="button" class="lgok-nao">${esc(o.cancelar || 'Voltar e conferir')}</button><button type="button" class="lgok-sim ${o.perigo ? 'perigo' : ''}" ${itens.length ? 'disabled' : ''}>${esc(o.ok || 'Sim, confirmar')}</button></div></div>`;
    document.body.appendChild(el);
    const sim = el.querySelector('.lgok-sim'), nao = el.querySelector('.lgok-nao');
    const caixas = [...el.querySelectorAll('.lgok-itens input')];
    caixas.forEach(c => c.onchange = () => { sim.disabled = !caixas.every(x => x.checked); });
    const fechar = r => { document.removeEventListener('keydown', tecla, true); el.remove(); try { antes && antes.focus && antes.focus(); } catch (e) { } fim(r); };
    function tecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(false); }
      if (e.key === 'Tab') { const f = [...el.querySelectorAll('button:not([disabled]),input')]; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    }
    document.addEventListener('keydown', tecla, true);
    nao.onclick = () => fechar(false); el.querySelector('.lgok-fundo').onclick = () => fechar(false);
    sim.onclick = () => fechar(true);
    setTimeout(() => (caixas[0] || sim).focus(), 20);
  }
  window.lgConfirmar = lgConfirmar;

  /* ---------------- o nome do que está sendo publicado ---------------- */
  function nomeDoItem(b) {
    const f = b.closest('form') || b.closest('.lgt-form');
    if (f) for (const n of ['titulo', 'ementa', 'assunto', 'nome']) { const c = f.querySelector(`[name="${n}"]`); if (c && c.value && c.value.trim()) return c.value.trim().slice(0, 140); }
    const h = (b.closest('tr') || b.closest('article') || {}).querySelector?.('b, h4');
    return h ? h.textContent.trim().slice(0, 140) : '';
  }

  /* ---------------- o que pede confirmação ---------------- */
  const SITE = 'Depois de confirmado, aparece no site da Câmara para qualquer pessoa.';
  // por função chamada no botão (vale para botões de lista e de janela)
  const POR_FUNCAO = [
    [/^lgtAlternar\(/, b => /despublicar/.test(norm(b.textContent))
      ? { titulo: 'Tirar este documento do site?', texto: 'Ele deixa de aparecer no Portal da Transparência até ser publicado de novo.', ok: 'Sim, tirar do site', conferir: false }
      : { titulo: 'Publicar no Portal da Transparência?', texto: SITE, ok: 'Sim, publicar' }],
    [/^lgfxRelPublicar\(/, () => ({ titulo: 'Publicar o relatório mensal?', texto: 'O relatório vai para o Portal da Transparência. ' + SITE, ok: 'Sim, publicar' })],
    [/^lgfxYt\(.*'falaAprovada',\s*true/, () => ({ titulo: 'Publicar o resumo da sessão no site?', texto: 'O resumo do que foi falado aparece junto do vídeo, no site. Leia o texto antes: ele foi feito pela inteligência artificial.', ok: 'Sim, publicar' })],
    [/^lgplAtaPublicar\(/, () => ({ titulo: 'Assinar e publicar a ata?', texto: 'Depois da assinatura, a ata vai para o Portal da Transparência e para o site.', ok: 'Sim, assinar e publicar' })],
    [/^lgplAtaAprovada\(/, () => ({ titulo: 'Marcar a ata como aprovada?', texto: 'Ela será publicada no Portal da Transparência como aprovada em sessão.', ok: 'Sim, marcar como aprovada' })],
    [/^lgplProclamar\(/, () => ({ titulo: 'Encerrar a votação e proclamar o resultado?', texto: 'Quem ainda não votou não poderá mais votar. O resultado vai para o telão, para a ata, para a matéria e para o site.', ok: 'Sim, proclamar' })],
    [/^lgplVotar\(/, b => ({ titulo: `Confirmar o seu voto: ${b.textContent.trim().toUpperCase()}?`, texto: 'O voto é nominal: aparece no telão, na ata e no site.', ok: 'Confirmar voto', conferir: false })],
    [/^lgvrAssinarRascunho\(/, () => ({ titulo: 'Assinar e protocolar esta propositura?', texto: 'Depois de protocolada, ela recebe número, vai para o despacho do Presidente e aparece no site. Confira o texto, a ementa e os coautores.', ok: 'Sim, assinar e protocolar', conferir: false })],
    // painel administrativo (telas originais)
    [/^enviarProtocolo\(/, () => ({ titulo: 'Assinar e enviar à Câmara?', texto: 'O documento recebe protocolo e segue para a Câmara.', ok: 'Sim, enviar' })],
    [/^reenviarProtocolo\(/, () => ({ titulo: 'Reenviar à Câmara?', texto: 'A matéria corrigida volta para a Câmara.', ok: 'Sim, reenviar' })],
    [/^devolverProtocolo\(/, () => ({ titulo: 'Confirmar a devolução?', texto: 'A matéria volta para quem enviou, com a sua observação.', ok: 'Sim, devolver' })],
    [/^(lg24ParecerJuridico|anexarParecer)\(/, () => ({ titulo: 'Registrar o parecer e enviar?', texto: 'O parecer fica na matéria e ela segue para a próxima etapa.', ok: 'Sim, registrar' })],
    [/^lgv9Save\('registrado'\)/, () => ({ titulo: 'Registrar o protocolo?', texto: 'O documento recebe número de protocolo e segue para o próximo responsável.', ok: 'Sim, registrar' })],
    [/^criarExpediente\(/, () => ({ titulo: 'Registrar e enviar o expediente?', texto: 'O expediente recebe número e é enviado ao destinatário.', ok: 'Sim, enviar' })],
    [/^lgvrExcluirRascunho\(/, () => ({ titulo: 'Excluir este rascunho?', texto: 'O texto será apagado e não dá para recuperar.', ok: 'Sim, excluir', perigo: true, conferir: false })],
  ];
  // pelo texto do botão final (enviar formulário / rodapé de janela)
  const POR_TEXTO = [
    [/^publicar notícia$/, () => ({ titulo: 'Publicar esta notícia?', texto: SITE, ok: 'Sim, publicar' })],
    [/^publicar$/, () => ({ titulo: 'Publicar agora?', texto: SITE, ok: 'Sim, publicar' })],
    [/^publicar (no portal da|na) transparência$/, () => ({ titulo: 'Publicar no Portal da Transparência?', texto: SITE, ok: 'Sim, publicar' })],
    [/^despachar$/, () => ({ titulo: 'Confirmar o despacho?', texto: 'A matéria segue para o destino escolhido e quem recebe é avisado.', ok: 'Sim, despachar' })],
    [/^registrar sanção$/, () => ({ titulo: 'Registrar a sanção?', texto: 'A lei passa a constar como sancionada, com número, publicação e vigência, e aparece no site.', ok: 'Sim, registrar' })],
    [/^registrar veto/, () => ({ titulo: 'Registrar o veto?', texto: 'O veto é registrado e a matéria entra na pauta para apreciação.', ok: 'Sim, registrar' })],
    [/^assinar e promulgar$/, () => ({ titulo: 'Assinar e promulgar a lei?', texto: 'Depois da assinatura, a lei é publicada e aparece no site.', ok: 'Sim, continuar' })],
    [/^gerar pdf e assinar$/, () => ({ titulo: 'Gerar o documento e assinar?', texto: 'O número é reservado e o ato fica registrado depois da assinatura.', ok: 'Sim, continuar' })],
    [/^assinar e enviar/, () => ({ titulo: 'Assinar e enviar?', texto: 'Depois da assinatura, o documento segue e os destinatários são avisados.', ok: 'Sim, continuar' })],
    [/^(enviar|registrar) resposta$/, () => ({ titulo: 'Enviar a resposta?', texto: 'A resposta fica registrada e quem perguntou pode ver na consulta do protocolo.', ok: 'Sim, enviar' })],
    [/^registrar parecer/, () => ({ titulo: 'Registrar o parecer e enviar?', texto: 'O parecer fica na matéria e ela segue para a próxima etapa.', ok: 'Sim, registrar' })],
    [/^(encerrar votação e )?proclamar (o )?resultado$/, () => ({ titulo: 'Proclamar o resultado?', texto: 'O resultado vai para a matéria, para a ata e para o site.', ok: 'Sim, proclamar' })],
    [/^registrar votação$/, () => ({ titulo: 'Registrar a votação?', texto: 'O resultado fica registrado na matéria.', ok: 'Sim, registrar' })],
    [/^protocolar matéria$|^registrar documento \/ protocolo$|^registrar e enviar$/, () => ({ titulo: 'Protocolar agora?', texto: 'O documento recebe número de protocolo e segue para o próximo responsável.', ok: 'Sim, protocolar' })],
    [/^devolver para correção$/, () => ({ titulo: 'Devolver para correção?', texto: 'A matéria volta para quem enviou, com a sua observação.', ok: 'Sim, devolver' })],
    [/^assinar em lote/, () => ({ titulo: 'Assinar todos os documentos da lista?', texto: 'Cada documento será aberto para assinatura, um depois do outro.', ok: 'Sim, começar', conferir: false })],
  ];
  // telas que alteram o site na hora (Publicação de matérias)
  const SALVAR_SITE = /^salvar( (mesa|composição|endereços|alterações))?$/;
  const telaDoSite = b => !!b.closest('.view.lgsc') || (!!b.closest('#lgt-modal') && [...document.querySelectorAll('section.view.lgsc')].some(v => v.style.display !== 'none'));

  function regra(b) {
    if (b.disabled || b.closest('#lgok') || b.id === 'lgt-sim') return null;
    const oc = (b.getAttribute('onclick') || '').replace(/^event\.stopPropagation\(\);\s*/, '');
    for (const [re, f] of POR_FUNCAO) if (re.test(oc)) return f(b);
    if (b.classList.contains('lgt-mini') || b.classList.contains('lgok-livre')) return null;   // botões de lista que só abrem uma janela
    const t = norm(b.textContent);
    const final = b.type === 'submit' || !!b.closest('.lgt-modal-rod') || b.id === 'lgt-previa-pub';
    if (!final) return null;
    const form = b.type === 'submit' && b.form;
    if (form && !form.checkValidity()) return null;   // faltou campo obrigatório: o próprio formulário avisa primeiro
    if (form && form.elements.publicado && form.elements.publicado.type === 'checkbox' && !form.elements.publicado.checked) return null;   // guardado sem publicar
    for (const [re, f] of POR_TEXTO) if (re.test(t)) return f(b);
    if (SALVAR_SITE.test(t) && telaDoSite(b)) return { titulo: 'Salvar e mostrar no site?', texto: 'A mudança aparece no site da Câmara na hora.', ok: 'Sim, salvar' };
    return null;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.__lgokPassa) { b.__lgokPassa = false; return; }
    const r = regra(b); if (!r) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (!r.item) { const n = nomeDoItem(b); if (n) r.item = n; }
    lgConfirmar(r).then(ok => { if (ok && b.isConnected) { b.__lgokPassa = true; b.click(); } });
  }, true);

  /* lgtUI.confirmar: mesma janela, com o botão certo (antes dizia sempre "Excluir") */
  function ajustarUI() {
    const U = window.lgtUI; if (!U || U.__lgok) return; U.__lgok = true;
    U.confirmar = (msg, sim, rotulo) => {
      const perigo = /^(excluir|remover|recusar|apagar|tirar|cancelar)/i.test(String(msg).trim());
      lgConfirmar({ titulo: perigo ? 'Tem certeza?' : 'Confirmar', texto: msg, ok: rotulo || (perigo ? 'Sim, ' + String(msg).trim().split(/\s/)[0].toLowerCase() : 'Sim, confirmar'), perigo, conferir: perigo ? 'Esta ação não pode ser desfeita.' : undefined })
        .then(ok => { if (!ok) return; try { U.fecharModal(); } catch (e) { } sim(); });
    };
  }
  ajustarUI(); document.addEventListener('DOMContentLoaded', ajustarUI); const t = setInterval(() => { ajustarUI(); if (window.lgtUI && window.lgtUI.__lgok) clearInterval(t); }, 500);

  const css = document.createElement('style'); css.textContent = `
  #lgok{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}
  .lgok-fundo{position:absolute;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(2px)}
  .lgok-caixa{position:relative;width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--lg28-panel,#15171c);color:var(--lg28-ink,#f3f4f6);border:1px solid var(--lg28-stroke,#2c3038);border-radius:16px;padding:22px 22px 18px;box-shadow:0 30px 80px rgba(0,0,0,.5);font:14px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}
  .lgok-ic{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:800 20px system-ui;background:rgba(226,170,28,.16);color:#e2aa1c;margin-bottom:12px}
  .lgok-ic.perigo{background:rgba(229,72,77,.16);color:#ff6b70}
  #lgok h2{margin:0 0 6px;font-size:18px;line-height:1.3}
  #lgok p{margin:0 0 8px;color:var(--lg28-muted,#a6abb3)}
  #lgok .lgok-item{color:var(--lg28-ink,#f3f4f6);font-weight:600;padding:8px 10px;border-radius:9px;background:var(--lg28-inset,rgba(255,255,255,.04));border:1px solid var(--lg28-stroke,#2c3038)}
  #lgok .lgok-conf{font-weight:600;color:var(--lg28-ink,#f3f4f6)}
  .lgok-itens{display:flex;flex-direction:column;gap:8px;margin:10px 0 4px}
  .lgok-itens label{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;cursor:pointer}
  .lgok-itens input{margin-top:3px;width:17px;height:17px;accent-color:#e2aa1c;flex:0 0 auto}
  .lgok-bts{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
  .lgok-bts button{min-height:42px;padding:0 16px;border-radius:10px;font:600 14px system-ui,sans-serif;cursor:pointer;border:1px solid var(--lg28-stroke,#3a3f48);background:transparent;color:var(--lg28-ink,#f3f4f6)}
  .lgok-bts .lgok-sim{background:#e2aa1c;border-color:#e2aa1c;color:#111}
  .lgok-bts .lgok-sim.perigo{background:#e5484d;border-color:#e5484d;color:#fff}
  .lgok-bts .lgok-sim:disabled{opacity:.45;cursor:not-allowed}
  .lgok-bts button:focus-visible,.lgok-itens input:focus-visible{outline:2px solid #e2aa1c;outline-offset:2px}
  @media(max-width:520px){.lgok-bts button{flex:1}}`;
  document.head.appendChild(css);
})();
