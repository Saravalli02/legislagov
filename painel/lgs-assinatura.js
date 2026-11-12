/* =====================================================================
   LegislaGov — ASSINATURA DE DOCUMENTOS (baixar PDF → assinar → devolver)
   1) O sistema gera o PDF do documento (com código de verificação).
   2) A pessoa assina no assinador oficial e gratuito do gov.br (assinador.iti.br)
      ou com certificado digital ICP-Brasil (em nuvem ou token).
   3) Devolve o PDF assinado; o sistema confere se é o mesmo documento, se tem
      assinatura digital e de quem é o certificado. Validação oficial: validar.iti.gov.br
   Lei 14.063/2020: gov.br = assinatura avançada; ICP-Brasil = qualificada
   (obrigatória nos atos assinados por chefes de Poder, art. 5º § 2º, I).
   ===================================================================== */
(function () {
  const W = { H: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], B: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556] };
  const UI = () => window.lgtUI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const ic = n => (window.lgv31Icon ? lgv31Icon(n) : '');
  const ASSINADOR = 'https://assinador.iti.br/';
  const VALIDADOR = 'https://validar.iti.gov.br/';
  const PDF_PREFIX = 'lgs_pdf_';

  /* ---------------- PDF simples (texto, A4, Helvetica, acentos WinAnsi) ---------------- */
  const ESPECIAIS = { '–': 150, '—': 151, '“': 147, '”': 148, '‘': 145, '’': 146, '•': 149, '…': 133, '€': 128, ' ': 32 };
  function cod(ch) { const c = ch.charCodeAt(0); if (ESPECIAIS[ch] != null) return ESPECIAIS[ch]; if (c >= 32 && c < 127) return c; if (c >= 160 && c <= 255) return c; return 63; }
  const largura = (txt, f, tam) => [...txt].reduce((s, ch) => s + (W[f][cod(ch) - 32] || 556), 0) * tam / 1000;
  const lit = txt => '(' + [...txt].map(ch => { const c = cod(ch); if (c === 40 || c === 41 || c === 92) return '\\' + String.fromCharCode(c); if (c > 126) return '\\' + c.toString(8).padStart(3, '0'); return String.fromCharCode(c); }).join('') + ')';
  function quebrar(txt, f, tam, max) {
    const linhas = []; String(txt || '').split(/\r?\n/).forEach(par => {
      if (!par.trim()) { linhas.push(''); return; }
      let atual = ''; par.split(/\s+/).forEach(pal => { const t = atual ? atual + ' ' + pal : pal; if (largura(t, f, tam) <= max || !atual) atual = t; else { linhas.push(atual); atual = pal; } });
      if (atual) linhas.push(atual);
    }); return linhas;
  }
  /* blocos: [{t:'texto', f:'H'|'B', tam, alin:'esq'|'centro'|'dir', recuo, antes, depois}] */
  function gerarPDF({ titulo, blocos, codigo, rodape }) {
    const PW = 595.28, PH = 841.89, M = 62, LARG = PW - 2 * M, paginas = []; let ops = [], y = PH - M;
    const novaPag = () => { if (ops.length) paginas.push(ops); ops = []; y = PH - M; };
    blocos.forEach(b => {
      const tam = b.tam || 11, f = b.f || 'H', lh = tam * (b.lh || 1.45), rec = b.recuo || 0; y -= (b.antes || 0);
      if (b.linha) { if (y < M + 20) novaPag(); ops.push(`0.6 w ${M} ${y.toFixed(2)} m ${PW - M} ${y.toFixed(2)} l S`); y -= (b.depois || 8); return; }
      quebrar(b.t, f, tam, LARG - rec).forEach(l => {
        if (y - lh < M + 26) novaPag(); y -= lh; if (!l) return;
        const lw = largura(l, f, tam); const x = b.alin === 'centro' ? (PW - lw) / 2 : b.alin === 'dir' ? PW - M - lw : M + rec;
        ops.push(`BT /${f === 'B' ? 'F2' : 'F1'} ${tam} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${lit(l)} Tj ET`);
      }); y -= (b.depois || 0);
    });
    novaPag();
    const n = paginas.length, objs = [];
    // 1 catálogo, 2 páginas, 3-4 fontes, 5 info, depois pares (página, conteúdo)
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => (6 + i * 2) + ' 0 R').join(' ')}] /Count ${n} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const d = new Date(), p2 = v => String(v).padStart(2, '0');
    objs[5] = `<< /Title ${lit(titulo)} /Subject ${lit('Código de verificação ' + codigo)} /Keywords ${lit('LGV:' + codigo)} /Producer (LegislaGov) /Creator (LegislaGov - Camara Municipal de Neves Paulista) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`;
    paginas.forEach((pg, i) => {
      const pe = (rodape || '') + `  ·  Código de verificação: ${codigo}  ·  Página ${i + 1} de ${n}`;
      const fx = (PW - largura(pe, 'H', 7.5)) / 2;
      const conteudo = pg.join('\n') + `\n0.85 g BT /F1 7.5 Tf ${fx.toFixed(2)} 34 Td ${lit(pe)} Tj ET 0 g`;
      objs[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`;
      objs[7 + i * 2] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
    });
    let s = '%PDF-1.7\n%âãÏÓ\n'; const off = [];
    for (let i = 1; i < objs.length; i++) { off[i] = s.length; s += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xref = s.length; s += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    s += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255; return out;
  }

  /* documento oficial padrão da Câmara */
  function documentoCamara({ tipo, numero, ementa, texto, justificativa, local, signatarios, codigo }) {
    const b = [
      { t: 'CÂMARA MUNICIPAL DE NEVES PAULISTA', f: 'B', tam: 13, alin: 'centro' },
      { t: 'Estado de São Paulo', tam: 9.5, alin: 'centro', depois: 6 }, { linha: true, depois: 18 },
      { t: (tipo + (numero ? ' Nº ' + numero : '')).toUpperCase(), f: 'B', tam: 12.5, alin: 'centro', depois: 14 },
    ];
    if (ementa) b.push({ t: ementa, tam: 10.5, recuo: 220, depois: 14 });
    if (texto) b.push({ t: texto, tam: 11, depois: 8 });
    if (justificativa) b.push({ t: 'JUSTIFICATIVA', f: 'B', tam: 11, antes: 10, depois: 4 }, { t: justificativa, tam: 11, depois: 8 });
    b.push({ t: local || ('Neves Paulista, ' + new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) + '.'), tam: 11, alin: 'dir', antes: 16, depois: 30 });
    (signatarios || []).forEach(s => b.push({ t: '________________________________________', alin: 'centro', tam: 10, antes: 18 }, { t: s.nome, f: 'B', alin: 'centro', tam: 10.5 }, { t: s.cargo || '', alin: 'centro', tam: 9.5 }));
    b.push({ t: 'Assinatura digital: este documento deve ser assinado eletronicamente (gov.br ou certificado ICP-Brasil). A assinatura no papel não é necessária.', tam: 8, antes: 26 });
    return gerarPDF({ titulo: (tipo + (numero ? ' ' + numero : '')), blocos: b, codigo, rodape: 'LegislaGov · Câmara Municipal de Neves Paulista' });
  }

  /* ---------------- leitura do PDF devolvido ---------------- */
  async function sha256(bytes) { try { const h = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { let h = 0; for (let i = 0; i < bytes.length; i += 7) h = (h * 31 + bytes[i]) >>> 0; return 'x' + h.toString(16); } }
  const latin = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return s; };
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  function nomesDoCertificado(hex) {
    const b = new Uint8Array(hex.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
    const cns = [];
    for (let i = 0; i < b.length - 6; i++) {
      if (b[i] === 6 && b[i + 1] === 3 && b[i + 2] === 0x55 && b[i + 3] === 4 && b[i + 4] === 3) {
        const tag = b[i + 5]; let len = b[i + 6], ini = i + 7;
        if (len & 0x80) { const nb = len & 0x7f; len = 0; for (let k = 0; k < nb; k++) len = (len << 8) | b[ini + k]; ini += nb; }
        if (len > 0 && len < 300 && [0x0c, 0x13, 0x14, 0x16, 0x1e].includes(tag)) {
          const sub = b.subarray(ini, ini + len); let txt;
          if (tag === 0x1e) { txt = ''; for (let k = 0; k + 1 < sub.length; k += 2) txt += String.fromCharCode((sub[k] << 8) | sub[k + 1]); }
          else { try { txt = new TextDecoder(tag === 0x0c ? 'utf-8' : 'latin1').decode(sub); } catch (e) { txt = latin(sub); } }
          if (txt && !cns.includes(txt)) cns.push(txt);
        }
      }
    }
    return cns;
  }
  async function conferir(bytes, esperado) {
    const r = { pdf: false, assinaturas: 0, original: false, codigo: false, signatarios: [], emissores: [], tipo: '', hash: await sha256(bytes) };
    const s = latin(bytes); r.pdf = s.startsWith('%PDF');
    if (!r.pdf) return r;
    const conts = [...s.matchAll(/\/ByteRange\s*\[[^\]]*\][\s\S]{0,4000}?\/Contents\s*<([0-9A-Fa-f\s]+)>|\/Contents\s*<([0-9A-Fa-f\s]{200,})>[\s\S]{0,4000}?\/ByteRange/g)];
    const hexes = conts.map(m => (m[1] || m[2] || '').replace(/\s+/g, '').replace(/(00)+$/, '')).filter(h => h.length > 200 && !(h.length % 2));
    r.assinaturas = hexes.length;
    const ehAC = cn => /^(AC |AUTORIDADE CERTIFICADORA)/i.test(cn) || /\bAC\b.*(RAIZ|FINAL|INTERMEDI)/i.test(cn);
    r.porAssinatura = hexes.map(hex => { const cns = nomesDoCertificado(hex); return { signatarios: cns.filter(c => !ehAC(c)), emissores: cns.filter(ehAC) }; });
    r.porAssinatura.forEach(a => { a.signatarios.forEach(n => r.signatarios.includes(n) || r.signatarios.push(n)); a.emissores.forEach(n => r.emissores.includes(n) || r.emissores.push(n)); });
    if (esperado) {
      if (esperado.tamanho && bytes.length >= esperado.tamanho) r.original = (await sha256(bytes.subarray(0, esperado.tamanho))) === esperado.hash;
      r.codigo = !!esperado.codigo && s.includes(esperado.codigo);
    }
    // a assinatura que interessa é a da pessoa que está assinando agora (ou a última do arquivo)
    const minha = [...r.porAssinatura].reverse().find(a => esperado && esperado.pessoa && confereNome(a.signatarios, esperado.pessoa)) || r.porAssinatura[r.porAssinatura.length - 1];
    r.emissorDaPessoa = minha ? (minha.emissores[0] || '') : '';
    r.signatariosDaPessoa = minha ? minha.signatarios : [];
    const gov = /GOVERNO FEDERAL/i.test(semAcento(minha ? minha.emissores.join(' ') : ''));
    r.tipo = !r.assinaturas ? '' : gov ? 'gov.br — assinatura avançada' : (minha && minha.emissores.length) ? 'Certificado ICP-Brasil — assinatura qualificada' : 'Assinatura digital (emissor não identificado)';
    r.qualificada = !!r.assinaturas && !gov && !!(minha && minha.emissores.length);
    return r;
  }
  function confereNome(nomes, pessoa) {
    const alvo = semAcento(pessoa).split(/\s+/).filter(p => p.length > 2 && !['DOS', 'DAS', 'DES'].includes(p));
    return nomes.some(n => { const N = semAcento(n); return alvo.length && alvo.filter(p => N.includes(p)).length >= Math.min(2, alvo.length); });
  }

  /* ---------------- guardar/baixar PDFs ---------------- */
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); };
  const deB64 = t => { const s = atob(t); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  function guardarPDF(id, bytes) { try { localStorage.setItem(PDF_PREFIX + id, b64(bytes)); return true; } catch (e) { return false; } }
  function lerPDF(id) { try { const t = localStorage.getItem(PDF_PREFIX + id); return t ? deB64(t) : null; } catch (e) { return null; } }
  function tipoDe(bytes) { return bytes[0] === 0xFF && bytes[1] === 0xD8 ? ['image/jpeg', '.jpg'] : bytes[0] === 0x89 && bytes[1] === 0x50 ? ['image/png', '.png'] : ['application/pdf', '.pdf']; }
  function baixar(bytes, nome) { const [mime, ext] = tipoDe(bytes); if (ext !== '.pdf') nome = String(nome).replace(/\.pdf$/i, '') + ext; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: mime })); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  window.lgsBaixarPDF = (id, nome) => { const b = lerPDF(id); if (!b) return UI().aviso('PDF não encontrado neste navegador.', 'erro'); baixar(b, nome || id + '.pdf'); };
  window.lgsTemPDF = id => { try { return !!localStorage.getItem(PDF_PREFIX + id); } catch (e) { return false; } };

  /* ---------------- janela de assinatura ----------------
     op = { titulo, arquivo, docId, gerar():Uint8Array, base?: Uint8Array (PDF já assinado por outros), signatario:{nome,completo}, qualificada?:bool, simular?:bool }
     aoAssinar(assinatura) */
  async function assinar(op, aoAssinar) {
    const chave = op.chave || op.docId; const pend = chave && manuais().find(x => (x.chave || x.docId) === chave && x.status === 'pendente');
    if (pend) return verPendente(pend);
    // ação nomeada (pode ser refeita por outra pessoa, ao autorizar) ou função comum
    const fazer = op.acao ? (ass => executar(op.acao, ass, {})) : aoAssinar;
    const codigo = 'LGV-' + (op.docId || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-10) + '-' + Date.now().toString(36).toUpperCase().slice(-5);
    const pdf = op.base || op.gerar(codigo);
    const esperado = { tamanho: pdf.length, hash: await sha256(pdf), codigo: op.base ? '' : codigo, pessoa: (op.signatario.completo || op.signatario.nome) };
    const nomePessoa = op.signatario.completo || op.signatario.nome;
    UI().abrirModal(`<div class="lgt-form lgs"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Assinar documento</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgs-c">
        <div class="lgs-doc">${ic('editor')}<div><b>${esc(op.titulo)}</b><small>Assinante: ${esc(nomePessoa)}${op.qualificada ? ' · ato do Presidente: exige certificado ICP-Brasil' : ''}</small></div></div>
        <ol class="lgs-passos">
          <li><span class="lgs-n">1</span><div><b>Baixe o PDF</b><small>${op.base ? 'Este PDF já tem a(s) assinatura(s) anterior(es); a sua será somada.' : 'O documento tem um código de verificação próprio.'}</small><button type="button" class="lgt-btn" id="lgs-baixar">${ic('externo')} Baixar ${esc(op.arquivo)}</button></div></li>
          <li><span class="lgs-n">2</span><div><b>Assine</b><small>${op.qualificada ? 'Use o seu <b>certificado digital ICP-Brasil</b> (em nuvem, como BirdID, VIDaaS, SafeID ou SerproID, ou em token). Enquanto o certificado não chega, o gov.br é aceito com aviso.' : 'No assinador gratuito do gov.br: entre com sua conta (nível prata ou ouro), envie o PDF, posicione a assinatura e baixe o arquivo assinado. Também vale certificado ICP-Brasil.'}</small><a class="lgt-btn" id="lgs-ir" href="${ASSINADOR}" target="_blank" rel="noopener">${ic('assinar')} Abrir o assinador gov.br</a></div></li>
          <li><span class="lgs-n">3</span><div><b>Envie o PDF assinado</b><small>O sistema confere se é o mesmo documento e se a assinatura é sua.</small><label class="lgs-up"><input type="file" id="lgs-arq" accept="application/pdf,.pdf"><span>${ic('materias')} Escolher o PDF assinado</span></label></div></li>
        </ol>
        <div id="lgs-res" aria-live="polite"></div>
        <button type="button" class="lgs-mao-bt" id="lgs-mao-bt" aria-expanded="false" aria-controls="lgs-mao">Não consegue assinar pelo gov.br ou com certificado? <b>Assinar à mão</b></button>
        <div class="lgs-mao" id="lgs-mao" hidden>
          <p class="lgs-mao-av">Use só quando a assinatura digital não for possível. O documento fica marcado como <b>assinado à mão</b> e <b>não segue direto</b>: o <b>Presidente</b> ou a <b>Procuradoria</b> confere a digitalização e autoriza. Até lá ele fica pendente e não aparece no site. O original em papel deve ficar arquivado na Câmara.</p>
          <ol class="lgs-passos">
            <li><span class="lgs-n">1</span><div><b>Imprima e assine à mão</b><small>Baixe o PDF do passo 1 acima, imprima e assine com caneta.</small></div></li>
            <li><span class="lgs-n">2</span><div><b>Envie a digitalização</b><small>PDF escaneado ou foto nítida da página assinada (PDF, JPG ou PNG, até 8 MB).</small><label class="lgs-up"><input type="file" id="lgs-mao-arq" accept="application/pdf,.pdf,image/jpeg,image/png"><span>${ic('materias')} Escolher o arquivo</span></label><small id="lgs-mao-nome"></small></div></li>
            <li><span class="lgs-n">3</span><div><b>Por que não foi possível assinar digitalmente?</b>
              <select id="lgs-mao-motivo" class="lgt-input"><option value="">Escolha o motivo…</option><option>gov.br fora do ar ou com erro</option><option>Conta gov.br sem nível prata ou ouro</option><option>Sem certificado digital ou token</option><option>Sem internet ou celular no momento</option><option>Outro motivo</option></select>
              <input type="text" id="lgs-mao-det" class="lgt-input" maxlength="200" placeholder="Detalhe (opcional)"></div></li>
          </ol>
          <label class="lgs-confirma"><input type="checkbox" id="lgs-mao-conf"> Declaro que ${esc(nomePessoa)} assinou este documento à mão e que o original em papel será entregue à Câmara.</label>
          <div class="lgs-mao-rod"><button type="button" class="lgt-btn primario" id="lgs-mao-ok" disabled>Enviar para autorização</button></div>
        </div>
      </div>
      <p class="lgt-erro" role="alert"></p>
      <div class="lgt-modal-rod lgs-rod">${op.simular ? '<button type="button" class="lgt-btn" id="lgs-sim" title="Somente para testes do administrador">Simular (teste)</button>' : ''}<button type="button" class="lgt-btn" onclick="lgtFechar()">Cancelar</button><button type="button" class="lgt-btn primario" id="lgs-ok" disabled>Concluir assinatura</button></div></div>`);
    $('#lgs-baixar').onclick = () => baixar(pdf, op.arquivo);
    let resultado = null, arquivo = null;
    $('#lgs-arq').onchange = async e => {
      const f = e.target.files[0]; $('.lgs .lgt-erro').textContent = ''; $('#lgs-ok').disabled = true; resultado = null; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { $('.lgs .lgt-erro').textContent = 'Arquivo maior que 8 MB.'; return; }
      arquivo = new Uint8Array(await f.arrayBuffer()); const r = await conferir(arquivo, esperado); resultado = r;
      const nomeOk = confereNome(r.signatarios, nomePessoa);
      const linha = (ok, txt, aviso) => `<li class="${ok ? 'ok' : aviso ? 'av' : 'er'}"><i>${ok ? '✓' : aviso ? '!' : '✕'}</i><span>${txt}</span></li>`;
      const mesmo = r.original || r.codigo;
      $('#lgs-res').innerHTML = `<ul class="lgs-conf">
        ${linha(r.pdf, r.pdf ? 'Arquivo PDF válido' : 'O arquivo não é um PDF')}
        ${r.pdf ? linha(r.assinaturas > 0, r.assinaturas ? `${r.assinaturas} assinatura(s) digital(is) encontrada(s)` : 'Nenhuma assinatura digital encontrada. Assine no gov.br e envie o arquivo baixado de lá.') : ''}
        ${r.assinaturas ? linha(mesmo, mesmo ? 'É o mesmo documento gerado pelo sistema' : 'Este PDF não é o documento gerado aqui (baixe o PDF do passo 1 e assine esse)') : ''}
        ${r.signatarios.length ? linha(nomeOk, `Assinado por: <b>${esc(r.signatarios.join(', '))}</b>${nomeOk ? '' : ` (esperado: ${esc(nomePessoa)})`}`, true) : r.assinaturas ? linha(false, 'Não foi possível ler o nome no certificado', true) : ''}
        ${r.tipo ? linha(!(op.qualificada && !r.qualificada), `${esc(r.tipo)}${r.emissorDaPessoa ? ' · emitido por ' + esc(r.emissorDaPessoa) : ''}${op.qualificada && !r.qualificada ? ' — atos do Presidente exigem ICP-Brasil (Lei 14.063, art. 5º § 2º, I); aceito provisoriamente' : ''}`, true) : ''}
      </ul>${r.assinaturas && mesmo && !nomeOk ? `<label class="lgs-confirma"><input type="checkbox" id="lgs-conf-nome"> Confirmo que este arquivo foi assinado por ${esc(nomePessoa)}</label>` : ''}
      <p class="lgs-val">Validação oficial completa (cadeia do certificado e integridade): <a href="${VALIDADOR}" target="_blank" rel="noopener">validar.iti.gov.br</a></p>`;
      const pode = () => r.pdf && r.assinaturas > 0 && mesmo && (nomeOk || $('#lgs-conf-nome')?.checked);
      $('#lgs-ok').disabled = !pode(); $('#lgs-conf-nome') && ($('#lgs-conf-nome').onchange = () => { $('#lgs-ok').disabled = !pode(); });
    };
    $('#lgs-ok').onclick = () => {
      if (!resultado || !arquivo) return; const r = resultado;
      const guardado = guardarPDF(op.docId, arquivo);
      const ass = { vereadorId: op.signatario.id, nome: nomePessoa, data: new Date().toISOString(), hash: r.hash, metodo: r.tipo, certificado: (r.signatariosDaPessoa && r.signatariosDaPessoa.length ? r.signatariosDaPessoa : r.signatarios).join(', '), emissor: r.emissorDaPessoa || '', qualificada: !!r.qualificada, conferencia: { mesmoDocumento: true, nomeConfere: confereNome(r.signatarios, nomePessoa), assinaturasNoArquivo: r.assinaturas }, arquivo: { nome: op.arquivo.replace(/\.pdf$/i, '') + '-assinado.pdf', bytes: arquivo.length, guardado }, por: (UI().usuario() || {}).nome || '' };
      UI().fecharModal(); if (!guardado) UI().aviso('Assinatura registrada, mas o PDF não coube no armazenamento do navegador.', 'erro');
      fazer(ass);
    };
    /* assinatura à mão (documento em papel digitalizado) */
    let maoArq = null;
    const maoPode = () => !!maoArq && !!$('#lgs-mao-motivo').value && $('#lgs-mao-conf').checked;
    const maoAtual = () => { $('#lgs-mao-ok').disabled = !maoPode(); };
    $('#lgs-mao-bt').onclick = () => { const box = $('#lgs-mao'); box.hidden = !box.hidden; $('#lgs-mao-bt').setAttribute('aria-expanded', String(!box.hidden)); if (!box.hidden) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    $('#lgs-mao-arq').onchange = async e => {
      const f = e.target.files[0]; maoArq = null; $('.lgs .lgt-erro').textContent = ''; $('#lgs-mao-nome').textContent = '';
      if (f) { if (f.size > 8 * 1024 * 1024) $('.lgs .lgt-erro').textContent = 'Arquivo maior que 8 MB.'; else { maoArq = new Uint8Array(await f.arrayBuffer()); $('#lgs-mao-nome').textContent = 'Arquivo: ' + f.name; } }
      maoAtual();
    };
    $('#lgs-mao-motivo').onchange = maoAtual; $('#lgs-mao-conf').onchange = maoAtual;
    $('#lgs-mao-ok').onclick = async () => {
      if (!maoPode()) return;
      const motivo = $('#lgs-mao-motivo').value + ($('#lgs-mao-det').value.trim() ? ' — ' + $('#lgs-mao-det').value.trim() : '');
      const arqMao = op.acao ? chave + '-mao' : op.docId;   // com autorização: a digitalização fica à parte até ser aprovada
      const guardado = guardarPDF(arqMao, maoArq);
      const ext = tipoDe(maoArq)[1];
      const ass = { vereadorId: op.signatario.id, nome: nomePessoa, data: new Date().toISOString(), hash: await sha256(maoArq), metodo: 'Assinado à mão (documento em papel digitalizado)', manual: true, motivo, certificado: '', emissor: '', qualificada: false, conferencia: { manual: true }, arquivo: { nome: op.arquivo.replace(/\.pdf$/i, '') + '-assinado-a-mao' + ext, bytes: maoArq.length, guardado }, por: (UI().usuario() || {}).nome || '' };
      UI().fecharModal(); if (!guardado) UI().aviso('A digitalização não coube no armazenamento. Tente um arquivo menor.', 'erro');
      if (op.acao) {
        const r = avisarManual({ titulo: op.titulo, nome: nomePessoa, vid: op.signatario.id, motivo, docId: op.docId, chave, arq: arqMao, por: ass.por, porLogin: loginAtual(), acao: op.acao, ass, status: 'pendente' });
        try { const h = acaoDe(op.acao); h && h.pendente && h.pendente(op.acao.args || {}, r); } catch (e) { }
        UI().aviso('Assinatura à mão enviada. O documento só segue (e só aparece no site) depois que o Presidente ou a Procuradoria conferir e autorizar.', 'ok');
      } else {
        avisarManual({ titulo: op.titulo, nome: nomePessoa, vid: op.signatario.id, motivo, docId: op.docId, por: ass.por, status: 'registrada' });
        fazer(ass);
        UI().aviso('Assinatura à mão registrada. O Presidente e a Procuradoria foram avisados.', 'ok');
      }
    };
    if (op.simular) $('#lgs-sim').onclick = async () => {
      const ass = { vereadorId: op.signatario.id, nome: nomePessoa, data: new Date().toISOString(), hash: esperado.hash, metodo: 'Simulação (teste do administrador)', certificado: '', emissor: '', qualificada: false, simulada: true, conferencia: {}, arquivo: { nome: op.arquivo, bytes: pdf.length, guardado: guardarPDF(op.docId, pdf) }, por: (UI().usuario() || {}).nome || '' };
      UI().fecharModal(); fazer(ass);
    };
  }

  const MANUAIS = 'lgs_manuais_v1';
  function manuais() { try { return JSON.parse(localStorage.getItem(MANUAIS) || '[]'); } catch (e) { return []; } }
  function gravarManuais(l) { try { localStorage.setItem(MANUAIS, JSON.stringify(l.slice(0, 300))); } catch (e) { } try { window.lgavAtualizar && lgavAtualizar(); } catch (e) { } }
  function avisarManual(r) {
    const l = manuais(); const x = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), data: new Date().toISOString(), ...r };
    l.unshift(x); gravarManuais(l);
    try { registrarLog && registrarLog('Assinatura à mão', `${r.nome} — ${r.titulo} (${r.motivo})${r.status === 'pendente' ? ' · aguardando autorização' : ''}`); } catch (e) { }
    return x;
  }
  const loginAtual = () => { const u = UI() && UI().usuario ? UI().usuario() : null; return u ? String(u.usuario || u.login || u.nome || '').toLowerCase() : ''; };

  /* ações que podem ser refeitas ao autorizar: registradas pelos módulos em window.LG_ACOES */
  const acaoDe = a => (window.LG_ACOES || {})[a && a.nome];
  function executar(acao, ass, ctx) {
    const h = acaoDe(acao); if (!h) throw new Error('Ação desconhecida: ' + (acao && acao.nome));
    return (h.fazer || h)(acao.args || {}, ass, ctx || {});
  }
  window.lgsExecutar = executar;

  /* quem pode autorizar: Presidente, Procuradoria ou administrador — nunca quem assinou (salvo o administrador) */
  function podeAutorizar(x) {
    const u = UI() && UI().usuario ? UI().usuario() : null; if (!u) return [false, 'Entre no sistema.'];
    const perfil = window.lgPerfil ? lgPerfil(u) : '';
    const pres = !!(window.lgEhPresidente && lgEhPresidente(u));
    if (!(perfil === 'adm' || perfil === 'procurador' || pres)) return [false, 'Só o Presidente ou a Procuradoria autorizam.'];
    const v = window.lgVereadorDoUsuario ? lgVereadorDoUsuario(u) : null;
    if (perfil !== 'adm' && ((v && v.id === x.vid) || (x.porLogin && x.porLogin === loginAtual()))) return [false, 'Quem assinou não autoriza a própria assinatura.'];
    return [true, ''];
  }
  const quando = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // sino de avisos
  window.lgsPendencias = function () {
    const out = [], agora = Date.now();
    manuais().forEach(x => {
      const idade = agora - new Date(x.decididaEm || x.data).getTime();
      if (x.status === 'pendente') {
        out.push({ dest: ['pres', 'perfil:procurador'], chave: 'mao:' + x.id, urgente: true, titulo: `Autorizar assinatura à mão: ${x.titulo}`,
          texto: `${x.nome} assinou à mão (${x.motivo}). Confira a digitalização e autorize ou recuse. Até lá, nada segue nem aparece no site.`, acao: `lgsVerManuais('${x.id}')`, area: '' });
        if (x.vid) out.push({ dest: ['v:' + x.vid], chave: 'maoesp:' + x.id, titulo: `Aguardando autorização: ${x.titulo}`,
          texto: 'Sua assinatura à mão está com o Presidente e a Procuradoria para conferência. O documento segue assim que for autorizado.', acao: `lgsVerManuais('${x.id}')`, area: 'vereador', info: true });
      } else if (x.status === 'recusada' && x.vid && idade < 30 * 864e5) {
        out.push({ dest: ['v:' + x.vid], chave: 'maorec:' + x.id, urgente: true, titulo: `Assinatura à mão recusada: ${x.titulo}`,
          texto: `Motivo: ${x.recusa ? x.recusa.motivo : ''}. Corrija e assine de novo.`, acao: `lgsVerManuais('${x.id}')`, area: 'vereador' });
      } else if (x.status === 'autorizada' && x.vid && idade < 7 * 864e5) {
        out.push({ dest: ['v:' + x.vid], chave: 'maoaut:' + x.id, titulo: `Autorizado: ${x.titulo}`, texto: `Sua assinatura à mão foi conferida por ${x.autorizacao ? x.autorizacao.por : ''}. O documento seguiu.`, acao: `lgsVerManuais('${x.id}')`, area: 'vereador', info: true });
      } else if (x.status === 'registrada' && idade < 30 * 864e5) {
        out.push({ dest: ['pres', 'perfil:procurador'], chave: 'mao:' + x.id, titulo: `Documento assinado à mão: ${x.titulo}`, texto: `${x.nome} não assinou digitalmente. Motivo: ${x.motivo}. Confira o original em papel.`, acao: `lgsVerManuais('${x.id}')`, area: '' });
      }
    });
    return out;
  };

  const ROT = { pendente: ['Aguardando autorização', 'av'], autorizada: ['Autorizada', 'ok'], recusada: ['Recusada', 'er'], registrada: ['Registrada', 'av'] };
  function cartao(x, destaque) {
    const [pode] = podeAutorizar(x); const [rot, cls] = ROT[x.status] || ROT.registrada;
    const arqX = x.arq || x.docId; const temArq = window.lgsTemPDF && lgsTemPDF(arqX);
    return `<li class="lgs-item ${destaque ? 'foco' : ''}" id="lgs-it-${esc(x.id)}"><div class="lgs-item-cab"><b>${esc(x.titulo)}</b><span class="lgs-st ${cls}">${rot}</span></div>
      <small>Assinado à mão por <b>${esc(x.nome)}</b> em ${quando(x.data)}${x.por && x.por !== x.nome ? ' · enviado por ' + esc(x.por) : ''}</small>
      <small>Motivo: ${esc(x.motivo)}</small>
      ${x.status === 'autorizada' && x.autorizacao ? `<small>Autorizada por <b>${esc(x.autorizacao.por)}</b> em ${quando(x.autorizacao.data)}</small>` : ''}
      ${x.status === 'recusada' && x.recusa ? `<small class="lgs-rec">Recusada por <b>${esc(x.recusa.por)}</b> em ${quando(x.recusa.data)}: ${esc(x.recusa.motivo)}</small>` : ''}
      <div class="lgs-item-ac">${temArq ? `<button type="button" class="lgt-btn" onclick="lgsBaixarPDF('${esc(arqX)}','${esc(x.docId)}-assinado-a-mao.pdf')">${ic('externo')} Ver a digitalização</button>` : ''}
      ${x.status === 'pendente' && pode ? `<button type="button" class="lgt-btn perigo" onclick="lgsRecusar('${esc(x.id)}')">Recusar</button><button type="button" class="lgt-btn primario" onclick="lgsAutorizar('${esc(x.id)}')">Conferi, autorizar</button>` : ''}</div></li>`;
  }
  window.lgsVerManuais = function (foco) {
    const l = manuais(); const pend = l.filter(x => x.status === 'pendente'), resto = l.filter(x => x.status !== 'pendente').slice(0, 25);
    UI().abrirModal(`<div class="lgt-form lgs"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Assinaturas à mão</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgs-c"><p class="lgs-mao-av">Documento assinado à mão só segue depois que o <b>Presidente</b> ou a <b>Procuradoria</b> confere a digitalização e autoriza. Confira se é o mesmo documento, se a assinatura é da pessoa e se o original em papel foi entregue.</p>
      <h3 class="lgs-h">Aguardando autorização (${pend.length})</h3>${pend.length ? `<ul class="lgs-lista">${pend.map(x => cartao(x, x.id === foco)).join('')}</ul>` : '<p class="lgs-vazio">Nada aguardando.</p>'}
      ${resto.length ? `<h3 class="lgs-h">Anteriores</h3><ul class="lgs-lista">${resto.map(x => cartao(x, x.id === foco)).join('')}</ul>` : ''}</div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Fechar</button></div></div>`);
    if (foco) setTimeout(() => { const el = document.getElementById('lgs-it-' + foco); el && el.scrollIntoView({ block: 'nearest' }); }, 60);
  };
  function verPendente(x) {
    UI().abrirModal(`<div class="lgt-form lgs"><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Aguardando autorização</h2><button type="button" class="lgt-x" onclick="lgtFechar()" aria-label="Fechar">×</button></div>
      <div class="lgs-c"><p class="lgs-mao-av">Este documento já foi assinado à mão e está com o Presidente e a Procuradoria para conferência. Ele segue sozinho assim que for autorizado.</p><ul class="lgs-lista">${cartao(x, true)}</ul></div>
      <div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgtFechar()">Fechar</button></div></div>`);
  }
  window.lgsAutorizar = async function (id) {
    const l = manuais(); const x = l.find(y => y.id === id); if (!x || x.status !== 'pendente') return UI().aviso('Esta assinatura já foi decidida.', 'erro');
    const [pode, porque] = podeAutorizar(x); if (!pode) return UI().aviso(porque, 'erro');
    const ok = window.lgConfirmar ? await lgConfirmar({ titulo: 'Autorizar a assinatura à mão?', texto: `“${x.titulo}”, assinado à mão por ${x.nome}. Depois de autorizado, o documento segue o andamento normal e pode aparecer no site.`, itens: ['Abri a digitalização e é o mesmo documento', 'A assinatura é de quem consta', 'O original em papel será arquivado na Câmara'], ok: 'Autorizar' }) : true;
    if (!ok) return;
    const u = UI().usuario() || {}; const aut = { por: u.nome || '', login: loginAtual(), data: new Date().toISOString() };
    try { executar(x.acao, { ...x.ass, autorizacao: aut }, { autorizacao: true, registro: x }); if (x.arq && x.arq !== x.docId && !lgsTemPDF(x.docId)) { const b = lerPDF(x.arq); b && guardarPDF(x.docId, b); } }
    catch (e) { console.error(e); return UI().aviso('Não foi possível concluir: ' + (e.message || e) + '. A assinatura continua pendente.', 'erro'); }
    const l2 = manuais(); const y = l2.find(z => z.id === id) || x; Object.assign(y, { status: 'autorizada', autorizacao: aut, decididaEm: aut.data }); gravarManuais(l2);
    try { registrarLog && registrarLog('Assinatura à mão autorizada', `${x.titulo} — ${x.nome}`); } catch (e) { }
    UI().aviso('Autorizado. O documento seguiu e ' + x.nome + ' foi avisado(a).', 'ok'); lgsVerManuais(id);
  };
  window.lgsRecusar = function (id) {
    const x = manuais().find(y => y.id === id); if (!x || x.status !== 'pendente') return;
    const [pode, porque] = podeAutorizar(x); if (!pode) return UI().aviso(porque, 'erro');
    UI().abrirModal(`<form class="lgt-form lgs" novalidate><div class="lgt-modal-cab"><h2 id="lgt-modal-t">Recusar assinatura à mão</h2><button type="button" class="lgt-x" onclick="lgsVerManuais('${esc(id)}')" aria-label="Voltar">×</button></div>
      <div class="lgs-c"><p class="lgs-mao-av">“${esc(x.titulo)}” — ${esc(x.nome)}. Nada é publicado; quem assinou recebe o motivo e pode assinar de novo.</p>
      <label class="lgs-campo"><span>Motivo da recusa *</span><textarea name="mot" rows="3" class="lgt-input" maxlength="300" placeholder="Ex.: a digitalização está ilegível; a página assinada não é a do documento"></textarea></label></div>
      <p class="lgt-erro" role="alert"></p><div class="lgt-modal-rod"><button type="button" class="lgt-btn" onclick="lgsVerManuais('${esc(id)}')">Voltar</button><button type="submit" class="lgt-btn perigo">Recusar</button></div></form>`);
    const f = $('#lgt-modal form');
    f.onsubmit = e => { e.preventDefault(); const mot = f.mot.value.trim(); if (!mot) { f.querySelector('.lgt-erro').textContent = 'Escreva o motivo para quem assinou saber o que corrigir.'; return; }
      const l = manuais(); const y = l.find(z => z.id === id); const u = UI().usuario() || {}; const rec = { por: u.nome || '', login: loginAtual(), data: new Date().toISOString(), motivo: mot };
      Object.assign(y, { status: 'recusada', recusa: rec, decididaEm: rec.data }); gravarManuais(l);
      try { const h = acaoDe(y.acao); h && h.liberar && h.liberar(y.acao.args || {}, y); } catch (e2) { }
      try { registrarLog && registrarLog('Assinatura à mão recusada', `${y.titulo} — ${mot}`); } catch (e2) { }
      UI().aviso('Recusada. ' + y.nome + ' foi avisado(a) com o motivo.'); lgsVerManuais(id); };
  };
  window.lgsManuais = manuais;
  window.lgsPendenteDe = chave => manuais().find(x => (x.chave || x.docId) === chave && x.status === 'pendente') || null;

  window.lgsAssinar = assinar;
  window.lgsDocumento = documentoCamara;
  window.lgsGerarPDF = gerarPDF;
  window.lgsConferir = conferir;
  window.lgsLerPDF = lerPDF;

  const css = document.createElement('style'); css.id = 'lgs-style'; css.textContent = `
  .lgs-c{padding:12px 22px}
  .lgs-doc{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset)}
  .lgs-doc b{display:block;font-size:14px}.lgs-doc small{color:var(--lg28-muted);font-size:12.5px}
  .lgs-passos{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
  .lgs-passos li{display:flex;gap:12px;align-items:flex-start}
  .lgs-n{flex:0 0 28px;height:28px;border-radius:50%;background:#e2aa1c;color:#111;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:13px}
  .lgs-passos li > div{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
  .lgs-passos b{font-size:14px}.lgs-passos small{color:var(--lg28-muted);font-size:12.5px;line-height:1.5}
  .lgs-passos .lgt-btn{text-decoration:none}
  .lgs-up{display:inline-flex;position:relative;cursor:pointer}
  .lgs-up input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
  .lgs-up span{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:9px;border:1px dashed var(--lg28-muted);color:var(--lg28-ink);font-weight:600;font-size:13.5px}
  .lgs-up:focus-within span{outline:2px solid #e2aa1c;outline-offset:2px}
  .lgs-conf{list-style:none;margin:14px 0 0;padding:12px 14px;border-radius:10px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);display:flex;flex-direction:column;gap:7px}
  .lgs-conf li{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45}
  .lgs-conf i{flex:0 0 20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;font-size:12px;color:#fff;background:#2fbf71}
  .lgs-conf li.av i{background:#e2aa1c;color:#111}.lgs-conf li.er i{background:#e5484d}
  .lgs-confirma{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;font-weight:600}
  .lgs-val{font-size:12px;color:var(--lg28-muted);margin:10px 0 0}.lgs-val a{color:inherit}
  .lgs-rod{flex-wrap:wrap}
  .lgs-mao-bt{all:unset;cursor:pointer;display:block;margin:16px 0 0;font-size:13px;color:var(--lg28-muted)}
  .lgs-mao-bt b{color:var(--lg28-ink);text-decoration:underline;text-underline-offset:3px}
  .lgs-mao-bt:focus-visible{outline:2px solid #e2aa1c;outline-offset:3px;border-radius:4px}
  .lgs-mao{margin-top:12px;padding:14px;border-radius:12px;border:1px solid #e2aa1c;background:rgba(226,170,28,.06)}
  .lgs-mao-av{margin:0;font-size:13px;line-height:1.5}
  .lgs-mao .lgt-input{width:100%;margin-top:6px}
  .lgs-mao-rod{display:flex;justify-content:flex-end;margin-top:12px}
  .lgs-h{font-size:14px;margin:16px 0 8px}
  .lgs-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
  .lgs-item{padding:12px 14px;border-radius:12px;border:1px solid var(--lg28-stroke);background:var(--lg28-inset);display:flex;flex-direction:column;gap:4px}
  .lgs-item.foco{border-color:#e2aa1c;box-shadow:0 0 0 1px #e2aa1c}
  .lgs-item-cab{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}.lgs-item-cab b{font-size:14px}
  .lgs-item small{font-size:12.5px;color:var(--lg28-muted);line-height:1.5}.lgs-item small b{color:var(--lg28-ink)}
  .lgs-rec{color:#ff8a8f!important}
  .lgs-st{flex:0 0 auto;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:rgba(226,170,28,.15);color:#e2aa1c}
  .lgs-st.ok{background:rgba(47,191,113,.15);color:#2fbf71}.lgs-st.er{background:rgba(229,72,77,.15);color:#ff8a8f}
  .lgs-item-ac{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.lgs-item-ac:empty{display:none}
  .lgs-vazio{font-size:13px;color:var(--lg28-muted)}
  .lgs-campo{display:flex;flex-direction:column;gap:6px;margin-top:12px;font-size:13px;font-weight:600}
  @media(max-width:600px){.lgs-c{padding:12px 16px}.lgs-item-ac .lgt-btn{flex:1}}`;
  document.head.appendChild(css);
})();
