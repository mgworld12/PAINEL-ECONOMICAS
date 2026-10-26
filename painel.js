(function () {
  try {
    if (localStorage.getItem('temaEscuro') === 'true') {
      document.body.classList.add('dark');
    }
  } catch (e) {}
  // Scriptonit só existe no ambiente interno: não é pedido no GitHub Pages (evita o 404)
  if (!location.hostname.endsWith('github.io')) {
    const scriptonit = document.createElement('script');
    scriptonit.src = '../system/Scriptonit.Engine.js';
    scriptonit.onload = function () {
      try {
        if (typeof ScriptonitInterface !== 'undefined') {
          new ScriptonitInterface().window.setTitle('Painel de Consultas Empresariais');
        }
      } catch (e) {
        console.warn('[Painel] ScriptonitInterface não disponível:', e.message);
      }
    };
    scriptonit.onerror = function () {};
    document.head.appendChild(scriptonit);
  }

  // ============================================================
  // SEÇÃO: UTILITÁRIOS GERAIS (toast, confirm, escapes)
  // ============================================================
  function limparCampos(ids) {
    ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }
  function escaparHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }
  function escaparHtmlPreservandoQuebras(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML.replace(/\n/g, '<br>');
  }
  const SERVIDOR_PADRAO = '';
  const TELEFONE_PADRAO = '';
  function mostrarToast(mensagem, tipo) {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) {
      alert(mensagem);
      return;
    }
    const icones = { sucesso: '✅', aviso: '⚠️', info: 'ℹ️' };
    const classeTipo = tipo === 'aviso' ? 'toast-aviso' : tipo === 'info' ? 'toast-info' : 'toast-sucesso';
    const toast = document.createElement('div');
    toast.className = 'toast ' + classeTipo;
    toast.innerHTML =
      '<span class="toast-icone">' + (icones[tipo] || icones.sucesso) + '</span><span class="toast-texto"></span>';
    toast.querySelector('.toast-texto').textContent = mensagem;
    wrap.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visivel'));
    const duracao = tipo === 'aviso' ? 6000 : 3200;
    setTimeout(() => {
      toast.classList.remove('toast-visivel');
      setTimeout(() => toast.remove(), 300);
    }, duracao);
  }
  function mostrarConfirm(mensagem, callbackSim) {
    const anterior = document.getElementById('modalConfirm');
    if (anterior) anterior.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modalConfirm';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:rgba(0,0,0,.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'animation:fadeInOverlay .15s ease',
    ].join(';');
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:10px;padding:28px 30px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.25);font-family:Segoe UI,Arial,sans-serif;"><p style="margin:0 0 20px;font-size:15px;color:#222;line-height:1.5;">' +
      escaparHtml(mensagem) +
      '</p><div style="display:flex;gap:10px;justify-content:flex-end;"><button id="modalConfirmNao" type="button" style="padding:8px 18px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;color:#444;font-size:14px;cursor:pointer;">Cancelar</button><button id="modalConfirmSim" type="button" style="padding:8px 18px;border:none;border-radius:6px;background:#c0392b;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Confirmar</button></div></div>';
    document.body.appendChild(overlay);
    const focoAnterior = document.activeElement;
    function fechar() {
      overlay.remove();
      document.removeEventListener('keydown', aoTeclarConfirm);
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    }
    function aoTeclarConfirm(e) {
      if (e.key === 'Escape') fechar();
    }
    document.addEventListener('keydown', aoTeclarConfirm);
    document.getElementById('modalConfirmNao').focus();
    document.getElementById('modalConfirmSim').addEventListener('click', function () {
      fechar();
      callbackSim();
    });
    document.getElementById('modalConfirmNao').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fechar();
    });
  }

  /* ===== CRONOGRAMA DAS PESQUISAS ECONÔMICAS ANUAIS ===== */
  const CRONOGRAMA_ANOS = ['2026', '2027', '2028', '2029', '2030'];
  const CRONOGRAMA_SENHA = 'ibge'; // senha para liberar a edição das datas — pode ser alterada aqui
  let cronogramaAnoAtual = '2026';
  let cronogramaDesbloqueado = false;


  // ============================================================
  // SEÇÃO: CRONOGRAMA DE PESQUISAS ECONÔMICAS ANUAIS
  // ============================================================
  function cronogramaChaveStorage(ano, campo) {
    return 'cronogramaEconomicas_' + ano + '_' + campo;
  }
  // As datas ficam na tabela "cronograma_datas" do Supabase (visíveis para todos).
  // O localStorage vira apenas cópia local, usada se o banco estiver indisponível.
  const CRONOGRAMA_TABELA = 'cronograma_datas';
  const cronogramaCache = {}; // 'ano|campo' -> valor vindo do banco
  let cronogramaBancoComDados = false;
  function cronogramaDb() {
    try {
      if (window.painelDb) return window.painelDb;
      if (window.supabase && window.supabase.createClient) {
        window.painelDb = window.supabase.createClient(
          'https://jvjfpxrknggeodjgamyu.supabase.co',
          'sb_publishable_yxHF_N1gjdGoHMEoM5GF2w_QVMzzMF0'
        );
        return window.painelDb;
      }
    } catch (e) {}
    return null;
  }
  function cronogramaLerLocal(ano, campo) {
    try { return localStorage.getItem(cronogramaChaveStorage(ano, campo)); } catch (e) { return null; }
  }
  function cronogramaGravarLocal(ano, campo, valor) {
    try { localStorage.setItem(cronogramaChaveStorage(ano, campo), valor); } catch (e) {}
  }
  function cronogramaObterValor(ano, campo) {
    const remoto = cronogramaCache[ano + '|' + campo];
    if (remoto) return remoto;
    // Enquanto o banco estiver vazio ou inacessível, mostra a cópia local (permite publicar as datas já existentes)
    if (!cronogramaBancoComDados) return cronogramaLerLocal(ano, campo) || 'xx/xx/xxxx';
    return 'xx/xx/xxxx';
  }
  async function cronogramaCarregarRemoto() {
    const db = cronogramaDb();
    if (!db) return false;
    try {
      const { data, error } = await db.from(CRONOGRAMA_TABELA).select('ano,campo,valor');
      if (error || !Array.isArray(data)) throw error || new Error('resposta inválida');
      data.forEach(function (l) {
        cronogramaCache[l.ano + '|' + l.campo] = l.valor;
        cronogramaGravarLocal(l.ano, l.campo, l.valor);
      });
      cronogramaBancoComDados = data.length > 0;
      return true;
    } catch (e) {
      console.warn('[Painel] Cronograma: não foi possível ler do banco:', e && e.message);
      return false;
    }
  }
  async function cronogramaSalvarRemoto(linhas) {
    const db = cronogramaDb();
    if (!db) throw new Error('Sem conexão com o banco de dados.');
    const agora = new Date().toISOString();
    const { error } = await db.from(CRONOGRAMA_TABELA).upsert(
      linhas.map(function (l) { return { ano: l.ano, campo: l.campo, valor: l.valor, atualizado_em: agora }; }),
      { onConflict: 'ano,campo' }
    );
    if (error) throw error;
    linhas.forEach(function (l) {
      cronogramaCache[l.ano + '|' + l.campo] = l.valor;
      cronogramaGravarLocal(l.ano, l.campo, l.valor);
    });
    cronogramaBancoComDados = true;
  }
  function cronogramaPedirSenha(aoConfirmar) {
    const anterior = document.getElementById('modalSenhaCrono');
    if (anterior) anterior.remove();
    const focoAnterior = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'modalSenhaCrono';
    overlay.className = 'modal-senha-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modalSenhaCronoTitulo');
    overlay.innerHTML =
      '<div class="modal-senha-caixa">' +
        '<p id="modalSenhaCronoTitulo">Digite a senha para editar as datas do cronograma:</p>' +
        '<input type="password" id="modalSenhaCronoInput" autocomplete="off" aria-label="Senha do cronograma">' +
        '<div class="modal-senha-erro" id="modalSenhaCronoErro" role="alert"></div>' +
        '<div class="modal-senha-acoes">' +
          '<button type="button" id="modalSenhaCronoCancelar">Cancelar</button>' +
          '<button type="button" id="modalSenhaCronoOk" class="modal-senha-ok">Liberar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#modalSenhaCronoInput');
    input.focus();
    function fechar() {
      overlay.remove();
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    }
    function confirmar() {
      if (input.value === CRONOGRAMA_SENHA) {
        fechar();
        aoConfirmar();
      } else {
        overlay.querySelector('#modalSenhaCronoErro').textContent = 'Senha incorreta.';
        input.select();
      }
    }
    overlay.querySelector('#modalSenhaCronoOk').addEventListener('click', confirmar);
    overlay.querySelector('#modalSenhaCronoCancelar').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fechar(); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); fechar(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
    });
  }
  function cronogramaFormatarData(input) {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,2})/, '$1/$2');
    input.value = v;
  }
  function cronogramaLinhaCampo(id, textoApos) {
    return '<div class="crono-linha">' +
      '<span class="crono-valor" id="crono-' + id + '" data-campo="' + id + '">' +
      escaparHtml(cronogramaObterValor(cronogramaAnoAtual, id)) + '</span>' +
      '<span class="crono-rotulo"> - ' + escaparHtml(textoApos) + '</span></div>';
  }
  function cronogramaLinhaDupla(id1, id2, prefixo, conector, textoApos) {
    let html = '<div class="crono-linha">';
    if (prefixo) html += '<span class="crono-sub">' + escaparHtml(prefixo) + '</span>';
    html += '<span class="crono-valor" id="crono-' + id1 + '" data-campo="' + id1 + '">' +
      escaparHtml(cronogramaObterValor(cronogramaAnoAtual, id1)) + '</span>';
    html += '<span class="crono-sub">' + escaparHtml(conector) + '</span>';
    html += '<span class="crono-valor" id="crono-' + id2 + '" data-campo="' + id2 + '">' +
      escaparHtml(cronogramaObterValor(cronogramaAnoAtual, id2)) + '</span>';
    html += '<span class="crono-rotulo"> - ' + escaparHtml(textoApos) + '</span></div>';
    return html;
  }
  function cronogramaConteudoHTML() {
    return ''
      + cronogramaLinhaCampo('inicioColeta1', 'Início da Coleta.')
      + cronogramaLinhaCampo('abordagens', 'Realização das Abordagens. (Para aquelas empresas em que não houve retorno, deve ser feita visita presencial.)')
      + cronogramaLinhaCampo('fimVisitas', 'Fazer e terminar as visitas presenciais.')
      + cronogramaLinhaCampo('prazoFac1213', 'Prazo para lançamento das FAC 12 e FAC 13.')
      + cronogramaLinhaDupla('cobrancaDe', 'cobrancaAte', 'De', 'a', 'Envio do Ofício de Cobrança. (Deve ser enviado por e-mail, manualmente no SIPEA, somente após 3° e-mail.)')
      + cronogramaLinhaCampo('prazoFacsGeral', 'Prazo final para registro de todas as FACs 2, 5, 6, 7, 9, 10, 11, 16, 17 e 18.')
      + cronogramaLinhaDupla('notifDe', 'notifAte', 'De', 'a', 'Envio de Notificação. (Não se pode notificar contadores / Deve ser entregue presencialmente.)')
      + cronogramaLinhaDupla('autoData1', 'autoData2', '', 'e', 'Envio automático pelo SIPEA da Notificação de Inadimplência às empresas não coletadas.')
      + cronogramaLinhaCampo('prazoFac20', 'Prazo final para registro de FAC 20 para todas as empresas em falta.')
      + cronogramaLinhaCampo('questionarios', 'Questionários serão considerados como recebidos.');
  }
  function cronogramaAtivarEdicao(overlay) {
    overlay.querySelectorAll('.crono-valor').forEach(function (span) {
      const campo = span.getAttribute('data-campo');
      const valorAtual = span.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'crono-input';
      input.placeholder = 'xx/xx/xxxx';
      input.maxLength = 10;
      input.value = valorAtual === 'xx/xx/xxxx' ? '' : valorAtual;
      input.setAttribute('data-campo', campo);
      input.id = 'crono-' + campo;
      input.addEventListener('input', function () {
        cronogramaFormatarData(input);
      });
      span.replaceWith(input);
    });
    if (!overlay.querySelector('#crono-btn-salvar')) {
      const btnSalvar = document.createElement('button');
      btnSalvar.type = 'button';
      btnSalvar.id = 'crono-btn-salvar';
      btnSalvar.className = 'crono-btn-salvar';
      btnSalvar.textContent = '💾 Salvar alterações';
      btnSalvar.addEventListener('click', async function () {
        const ano = cronogramaAnoAtual;
        const linhas = Array.from(overlay.querySelectorAll('.crono-input')).map(function (input) {
          return { ano: ano, campo: input.getAttribute('data-campo'), valor: input.value.trim() || 'xx/xx/xxxx' };
        });
        btnSalvar.disabled = true;
        btnSalvar.textContent = 'Salvando...';
        try {
          await cronogramaSalvarRemoto(linhas);
        } catch (e) {
          console.warn('[Painel] Cronograma: falha ao salvar:', e && e.message);
          mostrarToast('Não foi possível salvar as datas para todos os usuários. Verifique a conexão e o login e tente de novo.', 'aviso');
          btnSalvar.disabled = false;
          btnSalvar.textContent = '💾 Salvar alterações';
          return;
        }
        cronogramaDesbloqueado = false;
        mostrarToast('Datas do cronograma salvas para ' + ano + ' (visíveis para todos).', 'sucesso');
        btnSalvar.remove();
        const btnEditar = overlay.querySelector('#crono-btn-editar');
        if (btnEditar) { btnEditar.disabled = false; btnEditar.textContent = 'Editar datas'; }
        overlay.querySelector('#crono-corpo').innerHTML = cronogramaConteudoHTML();
      });
      const rodape = overlay.querySelector('.crono-rodape');
      rodape.insertBefore(btnSalvar, overlay.querySelector('#crono-btn-fechar'));
    }
    const editarBtn = overlay.querySelector('#crono-btn-editar');
    if (editarBtn) { editarBtn.textContent = 'Edição liberada'; editarBtn.disabled = true; }
  }
  function cronogramaEconomicas() {
    cronogramaDesbloqueado = false;
    const anterior = document.getElementById('modalCronograma');
    if (anterior) anterior.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modalCronograma';
    overlay.className = 'crono-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Cronograma das Pesquisas Econômicas Anuais');
    const focoAnterior = document.activeElement;
    overlay.innerHTML =
      '<div class="crono-caixa">' +
        '<div class="crono-cabecalho">' +
          '<div class="crono-titulo-grupo">' +
            '<h3 class="crono-titulo">Cronograma das Pesquisas Econômicas Anuais</h3>' +
            '<span class="crono-ano-caixa" id="crono-ano-caixa" title="Clique para alterar o ano" tabindex="0" role="button" aria-label="Clique para alterar o ano do cronograma"></span>' +
            '<select id="crono-select-ano" class="crono-select-ano" aria-label="Selecionar ano do cronograma" style="display:none;"></select>' +
          '</div>' +
        '</div>' +
        '<div id="crono-corpo" class="crono-corpo"></div>' +
        '<div class="crono-rodape">' +
          '<button type="button" id="crono-btn-editar" class="crono-btn-editar">Editar datas</button>' +
          '<button type="button" id="crono-btn-fechar" class="crono-btn-fechar">Fechar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const anoCaixa = overlay.querySelector('#crono-ano-caixa');
    const selectAno = overlay.querySelector('#crono-select-ano');
    CRONOGRAMA_ANOS.forEach(function (ano) {
      const opt = document.createElement('option');
      opt.value = ano;
      opt.textContent = ano;
      if (ano === cronogramaAnoAtual) opt.selected = true;
      selectAno.appendChild(opt);
    });

    function renderizarCorpo() {
      overlay.querySelector('#crono-corpo').innerHTML = cronogramaConteudoHTML();
      anoCaixa.textContent = cronogramaAnoAtual;
      if (cronogramaDesbloqueado) cronogramaAtivarEdicao(overlay);
    }
    renderizarCorpo();
    // Busca as datas compartilhadas; não redesenha se a pessoa já estiver editando
    cronogramaCarregarRemoto().then(function (ok) {
      if (!overlay.isConnected) return;
      if (!ok) mostrarToast('Não foi possível ler as datas compartilhadas; mostrando a cópia deste computador.', 'aviso');
      else if (!cronogramaDesbloqueado) renderizarCorpo();
    });

    function abrirSeletorAno() {
      anoCaixa.style.display = 'none';
      selectAno.style.display = '';
      selectAno.focus();
    }
    anoCaixa.addEventListener('click', abrirSeletorAno);
    anoCaixa.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirSeletorAno();
      }
    });
    function fecharSeletorAno() {
      selectAno.style.display = 'none';
      anoCaixa.style.display = '';
    }
    selectAno.addEventListener('change', function () {
      cronogramaAnoAtual = selectAno.value;
      renderizarCorpo();
      fecharSeletorAno();
    });
    selectAno.addEventListener('blur', function () {
      setTimeout(fecharSeletorAno, 150);
    });

    overlay.querySelector('#crono-btn-editar').addEventListener('click', function () {
      if (cronogramaDesbloqueado) return;
      cronogramaPedirSenha(function () {
        cronogramaDesbloqueado = true;
        mostrarToast('Edição liberada. Altere as datas e clique em Salvar.', 'sucesso');
        renderizarCorpo();
      });
    });

    function fechar() {
      overlay.remove();
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
    }
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fechar();
    });
    overlay.querySelector('#crono-btn-fechar').focus();
    overlay.querySelector('#crono-btn-fechar').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fechar();
    });
  }


  // ============================================================
  // SEÇÃO: TEMA E RELÓGIO DO PAINEL
  // ============================================================
  function alternarTema() {
    document.body.classList.toggle('dark');
    const btn = document.querySelector('.btn-tema');
    btn.innerHTML = document.body.classList.contains('dark') ? '☀️' : '🌙';
    localStorage.setItem('temaEscuro', document.body.classList.contains('dark'));
  }
  function inicializarBotaoTema() {
    const btn = document.querySelector('.btn-tema');
    if (btn) btn.innerHTML = document.body.classList.contains('dark') ? '☀️' : '🌙';
  }
  function atualizarRelogioPainel() {
    const el = document.getElementById('relogioPainel');
    if (!el) return;
    const agora = new Date();
    el.textContent = agora.toLocaleDateString('pt-BR') + ' - ' + agora.toLocaleTimeString('pt-BR');
  }

  // ============================================================
  // SEÇÃO: CNPJ — FORMATAÇÃO E UTILITÁRIOS BASE
  // ============================================================
  function formatarCNPJ(campo) {
    let valor = campo.value.replace(/\D/g, '').slice(0, 14);
    if (valor.length > 12) {
      valor = valor.replace(/^(\d{8})(\d{4})(\d{0,2})/, '$1/$2-$3');
    } else if (valor.length > 8) {
      valor = valor.replace(/^(\d{8})(\d+)/, '$1/$2');
    }
    campo.value = valor;
  }
  function formatarCNPJTexto(cnpj) {
    const valor = String(cnpj).replace(/\D/g, '');
    if (valor.length === 14) {
      return valor.slice(0, 8) + '/' + valor.slice(8, 12) + '-' + valor.slice(12);
    }
    return valor;
  }
  function obterCNPJ() {
    let cnpj = document.getElementById('cnpj').value.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      mostrarToast('Informe um CNPJ válido com 14 dígitos.', 'aviso');
      return null;
    }
    return cnpj;
  }
  function obterRaizCNPJ() {
    const cnpj = obterCNPJ();
    if (!cnpj) return null;
    return cnpj.substring(0, 8);
  }
  function abrir(url) {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      location.href = url;
    }
  }
  function fecharMenuConsultarCnpj() {
    const lista = document.getElementById('listaConsultarCnpj');
    const btn = document.getElementById('btnConsultarCnpj');
    if (lista) lista.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function alternarMenuConsultarCnpj(ev) {
    if (ev) ev.stopPropagation();
    const lista = document.getElementById('listaConsultarCnpj');
    const btn = document.getElementById('btnConsultarCnpj');
    if (!lista) return;
    const abrirMenu = lista.hidden;
    lista.hidden = !abrirMenu;
    btn.setAttribute('aria-expanded', abrirMenu ? 'true' : 'false');
    if (abrirMenu) {
      const primeiro = lista.querySelector('button');
      if (primeiro) primeiro.focus();
    }
  }
  function consultarTodosCnpj() {
    if (!obterCNPJ()) return;
    mostrarToast('Se o navegador bloquear alguma aba, permita pop-ups para este site.', 'aviso');
    [cnpjAberto, cnpja, cnpjcheck, cnpjbiz, econodata, raizlegal].forEach(function (fn) { fn(); });
  }
  document.addEventListener('click', function (e) {
    const lista = document.getElementById('listaConsultarCnpj');
    if (!lista || lista.hidden) return;
    const item = e.target.closest('#listaConsultarCnpj button[data-acao]');
    if (item) {
      const acao = item.getAttribute('data-acao');
      fecharMenuConsultarCnpj();
      if (acao === 'todos') consultarTodosCnpj();
      else if (acao === 'copiar') copiarCNPJ();
      else if (typeof window[acao] === 'function') window[acao]();
      return;
    }
    if (!e.target.closest('#menuConsultarCnpj')) fecharMenuConsultarCnpj();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const lista = document.getElementById('listaConsultarCnpj');
    if (lista && !lista.hidden) {
      fecharMenuConsultarCnpj();
      const btn = document.getElementById('btnConsultarCnpj');
      if (btn) btn.focus();
    }
  });
  function copiarCNPJ() {
    const valor = document.getElementById('cnpj').value.replace(/\D/g, '');
    if (!valor) {
      mostrarToast('Informe um CNPJ antes de copiar.', 'aviso');
      return;
    }
    const formatado = valor.length === 14 ? formatarCNPJTexto(valor) : valor;
    navigator.clipboard
      .writeText(formatado)
      .then(() => {
        mostrarToast('CNPJ copiado: ' + formatado, 'sucesso');
      })
      .catch(() => mostrarToast('Não foi possível copiar.', 'aviso'));
  }

  // ============================================================
  // SEÇÃO: CONSULTAS EM BASES EXTERNAS (Receita, Caixa, Sefaz...)
  // ============================================================
  function cnpja() {
    const cnpj = obterCNPJ();
    if (cnpj) abrir('https://cnpja.com/office/' + cnpj);
  }
  function cnpjcheck() {
    const raiz = obterRaizCNPJ();
    if (raiz) abrir('https://cnpjcheck.com.br/buscar?q=' + raiz);
  }
  function cnpjbiz() {
    const cnpj = obterCNPJ();
    if (cnpj) abrir('https://cnpj.biz/' + cnpj);
  }
  function econodata() {
    const cnpj = obterCNPJ();
    if (cnpj) abrir('https://www.econodata.com.br/consulta-empresa?searchWord=' + cnpj);
  }
  function raizlegal() {
    const cnpj = obterCNPJ();
    if (cnpj) abrir('https://raizlegal.com.br/empresa/' + cnpj);
  }
  function cnpjAberto() {
    const cnpj = obterCNPJ();
    if (cnpj) abrir('https://cnpjaberto.com.br/cnpj/' + cnpj);
  }
  function receita() {
    abrir('https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp');
  }
  function caixa() {
    abrir('https://consulta-crf.caixa.gov.br/');
  }
  function sintegra() {
    abrir('https://sucief-sincad-web.fazenda.rj.gov.br/sincad-web/index.jsf');
  }
  function whois() {
    let dominio = document.getElementById('site').value.trim();
    if (!dominio) {
      mostrarToast('Informe um domínio para consulta.', 'aviso');
      return;
    }
    dominio = dominio
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    abrir('https://registro.br/tecnologia/ferramentas/whois/?search=' + encodeURIComponent(dominio));
  }

  // ============================================================
  // SEÇÃO: DESTINOS DE ÓRGÃOS/ARQUIVOS + BOTÕES RESERVADOS
  // Botões "Coringa" do HTML (class="coringa-reservado") não têm função própria:
  // um único ouvinte de clique mostra o aviso. Quando um deles ganhar destino,
  // troque a classe por um onclick com a nova função.
  // ============================================================
  function coringaReservado() {
    mostrarToast('Botão reservado para uso futuro.', 'info');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.coringa-reservado')) coringaReservado();
  });
  function regularize() {
    abrir('https://www.regularize.pgfn.gov.br');
  }
  function devedorUniao() {
    abrir('https://www.dividaaberta.pgfn.gov.br/consultar-devedores');
  }
  function mapaAgencias() {
    abrir('https://www.google.com/maps/d/edit?mid=1yGEvkctxrJDCbj-d_GZ1LgaBwDw15o4&usp=sharing');
  }
  function correios() {
    abrir('https://rastreamento.correios.com.br/app/index.php');
  }
  function oficioCorreios() {
    abrir('https://smt.correios.com.br/smt/#/home');
  }
  function protocoloOcorrencias() {
    try {
      window.open('./protocolo.pdf');
    } catch (e) {
      location.href = './protocolo.pdf';
    }
  }

  // ============================================================
  // SEÇÃO: LINKS INTERNOS IBGE / ARQUIVOS COMPLEMENTARES
  // ============================================================
  function portalweb1() {
    abrir('https://portalweb.ibge.gov.br/');
  }
  function peegestor() {
    abrir('https://peegestor.ibge.gov.br');
  }
  function portalweb2() {
    abrir('https://portalweb2.ibge.gov.br/');
  }
  function emailIBGE() {
    abrir('https://outlook.cloud.microsoft/mail/');
  }
  function questionarios() {
    abrir('https://questionarios.ibge.gov.br/');
  }
  function driveIBGE() {
    abrir('https://drive.ibge.gov.br/login');
  }
  function pesquisaCNAE() {
    abrir('https://concla.ibge.gov.br/busca-online-cnae.html');
  }
  function certidaoIBGE() {
    abrir('https://www.ibge.gov.br/servicos-do-ibge/certidao');
  }
  function checklist() {
    try {
      window.open('./Checklist.pdf');
    } catch (e) {
      location.href = './Checklist.pdf';
    }
  }
  // Agências disponíveis para a Escala de Servidores.
  // Para incluir outra agência, basta acrescentar o nome na lista abaixo.
  const AGENCIAS_ESCALA = ['ABT', 'AJA'];

  // Cada agência tem a sua página: escalaABT.html, escalaAJA.html, escala<SIGLA>.html ...
  function abrirEscala(agencia) {
    const url = './escala' + agencia + '.html';
    try {
      window.open(url);
    } catch (e) {
      location.href = url;
    }
  }
  function escalaServidores() {
    const anterior = document.getElementById('modalEscolhaAgencia');
    if (anterior) anterior.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modalEscolhaAgencia';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:rgba(0,0,0,.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'animation:fadeInOverlay .15s ease',
    ].join(';');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Escolher a agência');
    overlay.innerHTML =
      '<div class="tg-caixa">' +
      '<p class="tg-titulo">Escala de Servidores: qual agência deseja abrir?</p>' +
      AGENCIAS_ESCALA.map(function (ag) {
        return '<button type="button" class="tg-opcao" data-agencia="' + ag + '">🏢 ' + ag + '</button>';
      }).join('') +
      '<div class="tg-rodape"><button id="modalEscolhaAgenciaCancelar" type="button" class="tg-cancelar">Cancelar</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    function fechar() {
      overlay.remove();
      document.removeEventListener('keydown', aoTeclar);
    }
    function aoTeclar(e) {
      if (e.key === 'Escape') fechar();
    }
    document.addEventListener('keydown', aoTeclar);
    overlay.querySelectorAll('[data-agencia]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const agencia = btn.getAttribute('data-agencia');
        fechar();
        abrirEscala(agencia);
      });
    });
    document.getElementById('modalEscolhaAgenciaCancelar').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fechar();
    });
    const primeiro = overlay.querySelector('.tg-opcao');
    if (primeiro) primeiro.focus();
  }
  function parecerAGU() {
    try {
      window.open('./parecer68.pdf');
    } catch (e) {
      location.href = './parecer68.pdf';
    }
  }
  function in2119RFB() {
    try {
      window.open('./IN_2119_RFB.pdf');
    } catch (e) {
      location.href = './IN_2119_RFB.pdf';
    }
  }

  // ============================================================
  // SEÇÃO: CAMPO DE PESQUISA CORINGA (RFB)
  // ============================================================
  function atualizarValorPesquisaCoringa() {
    const select = document.getElementById('campoPesquisaCoringa');
    const campoExibicao = document.getElementById('valorPesquisaCoringa');
    if (!select || !campoExibicao) return;
    const idCampo = select.value;
    const elementoOrigem = document.getElementById(idCampo);
    campoExibicao.value = elementoOrigem ? elementoOrigem.value.trim() : '';
  }
  function selecionarCampoPesquisaCoringa() {
    atualizarValorPesquisaCoringa();
  }
  function consultarBaseRFB() {
    const select = document.getElementById('campoPesquisaCoringa');
    const campoExibicao = document.getElementById('valorPesquisaCoringa');
    const idCampo = select ? select.value : 'fe-cnpj';
    const valor = campoExibicao ? campoExibicao.value.trim() : '';
    if (!valor) {
      mostrarToast('Consulte um CNPJ para habilitar a busca na Receita Federal.', 'aviso');
      return;
    }
    if (idCampo === 'fe-cnpj') {
      const digitos = valor.replace(/\D/g, '');
      if (digitos.length !== 14) {
        mostrarToast('CNPJ inválido para consulta.', 'aviso');
        return;
      }
      abrir('https://cnpjaberto.com.br/cnpj/' + digitos);
    } else {
      abrir('https://cnpjaberto.com.br/consulta-cnpj-por-nome?q=' + encodeURIComponent(valor));
    }
  }

  // ============================================================
  // SEÇÃO: VALIDAÇÃO DE CAMPOS
  // ============================================================
  function formatoCnpjValido(valor) {
    return valor.replace(/\D/g, '').length === 14;
  }
  function formatoTelefoneValido(valor) {
    return valor.split('/').every(function (parte) {
      const d = parte.replace(/\D/g, '');
      return d.length === 10 || d.length === 11;
    });
  }
  function formatoEmailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
  }
  function validarFormatoCampo(el, tipo) {
    if (!el) return;
    const valor = el.value.trim();
    if (!valor || valor === TEXTO_PENDENTE) {
      el.classList.remove('campo-formato-suspeito');
      el.removeAttribute('title');
      return;
    }
    let valido = true;
    let mensagem = '';
    if (tipo === 'cnpj') {
      valido = formatoCnpjValido(valor);
      mensagem = 'CNPJ incompleto: confira se os 14 números foram digitados.';
    } else if (tipo === 'telefone') {
      valido = formatoTelefoneValido(valor);
      mensagem = 'Telefone incompleto: confira DDD e número (separe múltiplos números com "/").';
    } else if (tipo === 'email') {
      valido = formatoEmailValido(valor);
      mensagem = 'E-mail inválido: confira se há "@" e domínio.';
    }
    el.classList.toggle('campo-formato-suspeito', !valido);
    el.title = valido ? '' : mensagem;
  }
  const TEXTO_PENDENTE = 'Pendente de atualização';
  const CAMPOS_CONTABILIDADE_PENDENTES = [
    'fe-contab-razao',
    'fe-contab-cnpj',
    'fe-contab-contato',
    'fe-contab-telefone',
    'fe-contab-email',
  ];
  function atualizarEstadoCampoPendente(el) {
    if (!el) return;
    const valor = el.value.trim();
    el.classList.toggle('campo-pendente', valor === '' || valor === TEXTO_PENDENTE);
  }
  function aplicarEstadoPendenteEmTodosOsCampos() {
    CAMPOS_CONTABILIDADE_PENDENTES.forEach((id) => {
      const el = document.getElementById(id);
      if (el) atualizarEstadoCampoPendente(el);
    });
  }

  // ============================================================
  // SEÇÃO: FICHA DA EMPRESA — preenchimento e limpeza
  // ============================================================
  function setField(id, value) {
    const el = document.getElementById(id);
    if (el) {
      if (CAMPOS_CONTABILIDADE_PENDENTES.includes(id)) {
        el.value = value || TEXTO_PENDENTE;
        atualizarEstadoCampoPendente(el);
      } else {
        el.value = value || '';
      }
    }
    atualizarValorPesquisaCoringa();
  }
  function limparFicha() {
    const ids = [
      'fe-razao-social',
      'fe-cnpj',
      'fe-logradouro',
      'fe-bairro',
      'fe-municipio',
      'fe-cep',
      'fe-contato',
      'fe-telefone',
      'fe-email',
      'fe-atividade',
      'fe-contab-razao',
      'fe-contab-cnpj',
      'fe-contab-contato',
      'fe-contab-telefone',
      'fe-contab-email',
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'fe-municipio') {
        el.value = 'RIO DE JANEIRO';
      } else if (CAMPOS_CONTABILIDADE_PENDENTES.includes(id)) {
        el.value = TEXTO_PENDENTE;
      } else {
        el.value = '';
      }
    });
    aplicarEstadoPendenteEmTodosOsCampos();
    document.getElementById('dadosEmpresa').innerHTML =
      '<div class="campo-dado">Clique em um CNPJ importado da planilha.</div>';
    const painelLimpo = document.getElementById('painelEmpresa');
    if (painelLimpo) painelLimpo.classList.remove('painel-status-coletada', 'painel-status-atraso', 'painel-status-abordagem', 'painel-status-abordada', 'painel-status-acordada', 'painel-status-renegociada', 'painel-status-cobrada', 'painel-status-notificada');
    const de = document.getElementById('dadosEmpresa');
    de.style.gridTemplateRows = '';
    de.style.gridAutoFlow = '';
    de.style.gridTemplateColumns = '';
    if (cnpjSelecionadoAtual) {
      if (estadoCNPJs[cnpjSelecionadoAtual] !== 'nao-localizado') {
        estadoCNPJs[cnpjSelecionadoAtual] = 'consultado';
      }
      cnpjSelecionadoAtual = null;
    }
    renderizarPaginaCNPJs();
  }
  function atualizarContabTipo() {
    const display = document.getElementById('fe-contab-tipo-display');
    if (!display) return;
    const contabCnpj = document.getElementById('fe-contab-cnpj')?.value || '';
    const cnpj = document.getElementById('fe-cnpj')?.value || '';
    const isTerceirizada =
      contabCnpj &&
      contabCnpj !== TEXTO_PENDENTE &&
      contabCnpj.replace(/\D/g, '') !== '' &&
      contabCnpj.replace(/\D/g, '') !== cnpj.replace(/\D/g, '');
    display.innerHTML = isTerceirizada
      ? '<strong>TERCEIRIZADA</strong>'
      : 'PRÓPRIA&nbsp;(&nbsp;&nbsp;&nbsp;&nbsp;)&nbsp;&nbsp;&nbsp;TERCEIRIZADA&nbsp;(&nbsp;&nbsp;&nbsp;&nbsp;)';
  }
  let dadosImportados = [];
  let todosCNPJsImportados = [];
  let listaCNPJsAtual = [];
  let estadoCNPJs = {};
  let cnpjSelecionadoAtual = null;
  let paginaAtualCNPJ = 1;
  const ITENS_POR_PAGINA_CNPJ = 200;

  // ============================================================
  // SEÇÃO: IMPORTAÇÃO DE PLANILHA E LISTAGEM/FILTRO DE CNPJs
  // ============================================================
  function salvarDadosImportados() {
    try {
      localStorage.setItem('dadosImportadosCNPJ', JSON.stringify(dadosImportados));
    } catch (e) {
      console.warn('[Painel] Não foi possível guardar a planilha no navegador:', e);
      mostrarToast('A planilha é grande demais para ficar guardada no navegador. Ela funciona agora, mas será preciso importá-la de novo ao recarregar a página.', 'aviso');
    }
  }
  function carregarDadosImportados() {
    try {
      const salvos = JSON.parse(localStorage.getItem('dadosImportadosCNPJ'));
      if (Array.isArray(salvos) && salvos.length) {
        dadosImportados = normalizarRegistrosPlanilha(salvos);
        exibirCNPJs(salvos);
      }
    } catch (e) {}
  }
  function limparPlanilhaImportada() {
    mostrarConfirm('Tem certeza que deseja limpar a planilha importada? Esta ação não pode ser desfeita.', function () {
      dadosImportados = [];
      todosCNPJsImportados = [];
      listaCNPJsAtual = [];
      estadoCNPJs = {};
      cnpjSelecionadoAtual = null;
      paginaAtualCNPJ = 1;
      try {
        localStorage.removeItem('dadosImportadosCNPJ');
      } catch (e) {}
      document.getElementById('listaCNPJs').innerHTML = '';
      const paginacao = document.getElementById('paginacaoCNPJs');
      if (paginacao) {
        paginacao.innerHTML = '';
        paginacao.style.display = 'none';
      }
      document.getElementById('listaPlanilha').style.display = 'none';
      document.getElementById('arquivoExcel').value = '';
      const titulo = document.getElementById('tituloListaCNPJs');
      if (titulo) {
        titulo.textContent = '';
        titulo.style.display = 'none';
      }
      resetarFiltroCNPJs();
      limparFicha();
      mostrarToast('Planilha removida com sucesso.', 'sucesso');
    });
  }
  function exibirCNPJs(registros) {
    const cnpjsValidos = [];
    registros.forEach((registro) => {
      const chaveCNPJ = Object.keys(registro).find(
        (chave) => chave.trim().toLowerCase() === 'cnpj',
      );
      if (!chaveCNPJ) return;
      const cnpj = String(registro[chaveCNPJ] || '').replace(/\D/g, '');
      if (cnpj.length !== 14) return;
      cnpjsValidos.push(cnpj);
    });
    todosCNPJsImportados = cnpjsValidos;
    listaCNPJsAtual = cnpjsValidos.slice();
    estadoCNPJs = {};
    cnpjSelecionadoAtual = null;
    paginaAtualCNPJ = 1;
    const titulo = document.getElementById('tituloListaCNPJs');
    if (titulo) {
      titulo.textContent = 'CNPJs encontrados (' + cnpjsValidos.length + ')';
      titulo.style.display = '';
    }
    document.getElementById('listaPlanilha').style.display = 'block';
    resetarFiltroCNPJs();
    renderizarPaginaCNPJs();
  }
  function resetarFiltroCNPJs() {
    const wrap = document.getElementById('filtroCnpjWrap');
    const tipoSel = document.getElementById('filtroTipoCNPJ');
    const valorSel = document.getElementById('filtroValorCNPJ');
    const contagem = document.getElementById('contagemFiltroCNPJ');
    const percentual = document.getElementById('percentualFiltroCNPJ');
    if (tipoSel) tipoSel.value = '';
    if (valorSel) {
      valorSel.innerHTML = '';
      valorSel.style.display = 'none';
    }
    ocultarStatusSecundarioCNPJ();
    if (contagem) contagem.textContent = '';
    if (percentual) {
      percentual.textContent = '';
      percentual.style.display = 'none';
    }
    if (wrap) wrap.style.display = todosCNPJsImportados.length ? 'flex' : 'none';
  }
  function onFiltroTipoCNPJChange() {
    const tipoSel = document.getElementById('filtroTipoCNPJ');
    const valorSel = document.getElementById('filtroValorCNPJ');
    const contagem = document.getElementById('contagemFiltroCNPJ');
    const percentual = document.getElementById('percentualFiltroCNPJ');
    const tipo = tipoSel ? tipoSel.value : '';
    if (!valorSel) return;
    valorSel.innerHTML = '';
    ocultarStatusSecundarioCNPJ();
    if (!tipo) {
      valorSel.style.display = 'none';
      if (contagem) contagem.textContent = '';
      if (percentual) {
        percentual.textContent = '';
        percentual.style.display = 'none';
      }
      listaCNPJsAtual = todosCNPJsImportados.slice();
      paginaAtualCNPJ = 1;
      renderizarPaginaCNPJs();
      return;
    }
    const opcoes =
      tipo === 'status'
        ? [
            'NADA FEITO',
            'ABORDAGEM EM ANDAMENTO',
            'ABORDADA',
            'ACORDADA',
            'EM ATRASO',
            'COLETADA',
            'FAC',
            'RENEGOCIADA',
            'COBRADA',
            'NOTIFICADA',
            'TODAS',
          ]
        : tipo === 'responsavel'
          ? obterResponsaveisAbordagemUnicos().concat(['TODAS'])
          : ['PAC', 'PAIC', 'PAS', 'PIA', 'TODAS'];
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = 'Selecione...';
    valorSel.appendChild(optPlaceholder);
    opcoes.forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      valorSel.appendChild(opt);
    });
    valorSel.value = '';
    valorSel.style.display = '';
    if (contagem) contagem.textContent = '';
    if (percentual) {
      percentual.textContent = '';
      percentual.style.display = 'none';
    }
    listaCNPJsAtual = todosCNPJsImportados.slice();
    paginaAtualCNPJ = 1;
    renderizarPaginaCNPJs();
  }
  // Lista de nomes únicos (sem repetir) da coluna "Responsável pela Abordagem" (.xlsx) /
  // "NomeResponsavelAbordagem" (.csv), já unificadas pela normalização da planilha, em ordem alfabética.
  function simplificarNomeColuna(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
  function obterResponsavelAbordagem(registro) {
    const aceitas = ['responsavelpelaabordagem', 'nomeresponsavelabordagem', 'responsavelabordagem'];
    for (const key of Object.keys(registro)) {
      if (aceitas.includes(simplificarNomeColuna(key))) {
        return String(registro[key] == null ? '' : registro[key]).trim();
      }
    }
    return null;
  }
  function obterResponsaveisAbordagemUnicos() {
    const vistos = new Set();
    const nomes = [];
    dadosImportados.forEach((registro) => {
      const nome = obterResponsavelAbordagem(registro);
      if (!nome) return;
      const chave = nome.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!chave || vistos.has(chave)) return;
      vistos.add(chave);
      nomes.push(nome.replace(/\s+/g, ' ').trim());
    });
    return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }
  function obterValorColunaExata(registro, nomeColuna) {
    for (const key of Object.keys(registro)) {
      if (key.trim().toLowerCase() === nomeColuna.trim().toLowerCase()) {
        return String(registro[key] || '').trim();
      }
    }
    return null;
  }
  function obterCNPJDeRegistro(registro) {
    const colunasCnpj = ['CNPJ', 'Cnpj', 'cnpj', 'Nº do CNPJ', 'Numero CNPJ', 'numero cnpj'];
    for (const col of colunasCnpj) {
      for (const key of Object.keys(registro)) {
        if (key.trim().toLowerCase() === col.toLowerCase()) {
          const v = String(registro[key] || '').replace(/\D/g, '');
          if (v.length === 14) return v;
        }
      }
    }
    return null;
  }
  function aplicarFiltroCNPJs() {
    const tipoSel = document.getElementById('filtroTipoCNPJ');
    const valorSel = document.getElementById('filtroValorCNPJ');
    const contagem = document.getElementById('contagemFiltroCNPJ');
    const percentual = document.getElementById('percentualFiltroCNPJ');
    const tipo = tipoSel ? tipoSel.value : '';
    const valor = valorSel ? valorSel.value : '';
    if (!tipo || !valor || valor === 'TODAS') {
      ocultarStatusSecundarioCNPJ();
      listaCNPJsAtual = todosCNPJsImportados.slice();
      paginaAtualCNPJ = 1;
      renderizarPaginaCNPJs();
      if (contagem) contagem.textContent = '';
      if (percentual) {
        percentual.textContent = '';
        percentual.style.display = 'none';
      }
      return;
    }
    const nomeColuna =
      tipo === 'status'
        ? 'Status da Empresa'
        : tipo === 'responsavel'
          ? 'Responsável pela Abordagem'
          : 'PESQUISA';
    const valorAlvo = valor.replace(/\s+/g, ' ').trim().toUpperCase();
    const cnpjsFiltrados = [];
    dadosImportados.forEach((registro) => {
      const valorColuna =
        tipo === 'responsavel'
          ? obterResponsavelAbordagem(registro)
          : obterValorColunaExata(registro, nomeColuna);
      if (valorColuna === null) return;
      if (valorColuna.replace(/\s+/g, ' ').trim().toUpperCase() === valorAlvo) {
        const cnpj = obterCNPJDeRegistro(registro);
        if (cnpj && todosCNPJsImportados.includes(cnpj) && !cnpjsFiltrados.includes(cnpj)) {
          cnpjsFiltrados.push(cnpj);
        }
      }
    });
    listaCNPJsAtual = cnpjsFiltrados;
    paginaAtualCNPJ = 1;
    renderizarPaginaCNPJs();
    atualizarContagemFiltroCNPJ(cnpjsFiltrados.length);
    if (tipo === 'responsavel') {
      baseFiltroResponsavelCNPJ = cnpjsFiltrados.slice();
      prepararStatusSecundarioCNPJ(cnpjsFiltrados);
    }
  }
  function atualizarContagemFiltroCNPJ(qtd) {
    const contagem = document.getElementById('contagemFiltroCNPJ');
    const percentual = document.getElementById('percentualFiltroCNPJ');
    if (contagem) {
      contagem.textContent = qtd + (qtd === 1 ? ' CNPJ filtrado' : ' CNPJs filtrados');
    }
    if (percentual) {
      if (todosCNPJsImportados.length) {
        const pct = (qtd / todosCNPJsImportados.length) * 100;
        const pctTexto = (Number.isInteger(pct) ? pct : pct.toFixed(1).replace(/\.0$/, '')) + '%';
        percentual.textContent = pctTexto;
        percentual.style.display = '';
      } else {
        percentual.textContent = '';
        percentual.style.display = 'none';
      }
    }
  }
  // ---- Segundo filtro (Status da Empresa) dentro de "RESP. ABORDAGEM" ----
  let baseFiltroResponsavelCNPJ = [];
  const SEM_STATUS_CNPJ = '__SEM_STATUS__';
  // Coluna "Status da Empresa" (.xlsx) / "StatusEmpresa" (.csv)
  function obterStatusEmpresaRegistro(registro) {
    const aceitas = ['statusdaempresa', 'statusempresa'];
    for (const key of Object.keys(registro)) {
      if (aceitas.includes(simplificarNomeColuna(key))) {
        return String(registro[key] == null ? '' : registro[key]).replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  }
  function ocultarStatusSecundarioCNPJ() {
    const sel = document.getElementById('filtroStatusSecCNPJ');
    baseFiltroResponsavelCNPJ = [];
    if (!sel) return;
    sel.innerHTML = '';
    sel.style.display = 'none';
  }
  function prepararStatusSecundarioCNPJ(cnpjsDoResponsavel) {
    const sel = document.getElementById('filtroStatusSecCNPJ');
    if (!sel) return;
    const conjunto = new Set(cnpjsDoResponsavel);
    const vistos = new Set();
    const status = [];
    let haSemStatus = false;
    dadosImportados.forEach((registro) => {
      const cnpj = obterCNPJDeRegistro(registro);
      if (!cnpj || !conjunto.has(cnpj)) return;
      const st = obterStatusEmpresaRegistro(registro);
      if (!st) {
        haSemStatus = true;
        return;
      }
      const chave = st.toUpperCase();
      if (vistos.has(chave)) return;
      vistos.add(chave);
      status.push(st);
    });
    status.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Todos os status';
    sel.appendChild(ph);
    status.forEach((st) => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      sel.appendChild(opt);
    });
    if (haSemStatus) {
      const opt = document.createElement('option');
      opt.value = SEM_STATUS_CNPJ;
      opt.textContent = '(SEM STATUS)';
      sel.appendChild(opt);
    }
    sel.value = '';
    sel.style.display = '';
  }
  function aplicarFiltroStatusSecundarioCNPJ() {
    const sel = document.getElementById('filtroStatusSecCNPJ');
    const valor = sel ? sel.value : '';
    if (!valor) {
      listaCNPJsAtual = baseFiltroResponsavelCNPJ.slice();
    } else {
      const conjunto = new Set(baseFiltroResponsavelCNPJ);
      const alvo = valor.toUpperCase();
      const filtrados = [];
      dadosImportados.forEach((registro) => {
        const cnpj = obterCNPJDeRegistro(registro);
        if (!cnpj || !conjunto.has(cnpj) || filtrados.includes(cnpj)) return;
        const st = obterStatusEmpresaRegistro(registro);
        const confere = valor === SEM_STATUS_CNPJ ? st === '' : st.toUpperCase() === alvo;
        if (confere) filtrados.push(cnpj);
      });
      listaCNPJsAtual = filtrados;
    }
    paginaAtualCNPJ = 1;
    renderizarPaginaCNPJs();
    atualizarContagemFiltroCNPJ(listaCNPJsAtual.length);
  }
  function totalPaginasCNPJ() {
    return Math.max(1, Math.ceil(listaCNPJsAtual.length / ITENS_POR_PAGINA_CNPJ));
  }
  function renderizarPaginaCNPJs() {
    const lista = document.getElementById('listaCNPJs');
    lista.innerHTML = '';
    const inicio = (paginaAtualCNPJ - 1) * ITENS_POR_PAGINA_CNPJ;
    const pagina = listaCNPJsAtual.slice(inicio, inicio + ITENS_POR_PAGINA_CNPJ);
    pagina.forEach((cnpj) => {
      const razao = obterRazaoSocialPorCNPJ(cnpj);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = formatarCNPJTexto(cnpj);
      btn.title = razao ? formatarCNPJTexto(cnpj) + '\n' + razao : formatarCNPJTexto(cnpj);
      btn.dataset.cnpj = cnpj;
      btn.dataset.razao = (razao || '').toLowerCase();
      if (cnpj === cnpjSelecionadoAtual) {
        btn.classList.add('selecionado');
      } else if (estadoCNPJs[cnpj] === 'nao-localizado') {
        btn.classList.add('nao-localizado');
      } else if (estadoCNPJs[cnpj] === 'consultado') {
        btn.classList.add('consultado');
      }
      btn.onclick = () => {
        selecionarCNPJDaLista(btn, cnpj);
      };
      li.appendChild(btn);
      lista.appendChild(li);
    });
    renderizarPaginacaoCNPJs();
  }
  function renderizarPaginacaoCNPJs() {
    const container = document.getElementById('paginacaoCNPJs');
    if (!container) return;
    const total = totalPaginasCNPJ();
    if (total <= 1 || !listaCNPJsAtual.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    let html =
      '<button type="button" class="btn-proxima-pagina" onclick="proximaPaginaCNPJ()"' +
      (paginaAtualCNPJ >= total ? ' disabled' : '') +
      '>Próxima</button>';
    html += '<span class="numeros-paginas">';
    for (let i = 1; i <= total; i++) {
      html +=
        '<button type="button" class="num-pagina' +
        (i === paginaAtualCNPJ ? ' pagina-atual' : '') +
        '" onclick="irParaPaginaCNPJ(' +
        i +
        ')">' +
        i +
        '</button>';
    }
    html += '</span>';
    container.innerHTML = html;
  }
  function irParaPaginaCNPJ(pagina) {
    const total = totalPaginasCNPJ();
    if (pagina < 1 || pagina > total || pagina === paginaAtualCNPJ) return;
    paginaAtualCNPJ = pagina;
    renderizarPaginaCNPJs();
  }
  function proximaPaginaCNPJ() {
    const total = totalPaginasCNPJ();
    if (paginaAtualCNPJ < total) {
      paginaAtualCNPJ++;
      renderizarPaginaCNPJs();
    }
  }
  function pesquisarCNPJRapido() {
    const campo = document.getElementById('cnpjBuscaRapida');
    const cnpj = campo.value.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      mostrarToast('Informe um CNPJ válido com 14 dígitos.', 'aviso');
      return;
    }
    const idx = listaCNPJsAtual.indexOf(cnpj);
    if (idx !== -1) {
      const paginaAlvo = Math.floor(idx / ITENS_POR_PAGINA_CNPJ) + 1;
      if (paginaAlvo !== paginaAtualCNPJ) {
        paginaAtualCNPJ = paginaAlvo;
        renderizarPaginaCNPJs();
      }
      const btnAlvo = document.querySelector('#listaCNPJs button[data-cnpj="' + cnpj + '"]');
      if (btnAlvo) {
        selecionarCNPJDaLista(btnAlvo, cnpj);
        btnAlvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else {
      document.getElementById('cnpj').value = formatarCNPJTexto(cnpj);
      mostrarDadosEmpresa(cnpj);
    }
    campo.value = '';
  }
  function obterRazaoSocialPorCNPJ(cnpj) {
    if (!dadosImportados.length) return '';
    const reg = dadosImportados.find((item) => {
      const colunasCnpj = ['CNPJ', 'Cnpj', 'cnpj', 'Nº do CNPJ', 'Numero CNPJ'];
      for (const col of colunasCnpj) {
        for (const key of Object.keys(item)) {
          if (key.trim().toLowerCase() === col.toLowerCase() && String(item[key] || '').replace(/\D/g, '') === cnpj)
            return true;
        }
      }
      return false;
    });
    if (!reg) return '';
    return obterValorFlex(reg, 'Razão Social', 'Razao Social', 'RAZAO SOCIAL', 'RAZÃO SOCIAL') || '';
  }
  function selecionarCNPJDaLista(btn, cnpj) {
    if (
      cnpjSelecionadoAtual &&
      cnpjSelecionadoAtual !== cnpj &&
      estadoCNPJs[cnpjSelecionadoAtual] !== 'nao-localizado'
    ) {
      estadoCNPJs[cnpjSelecionadoAtual] = 'consultado';
    }
    cnpjSelecionadoAtual = cnpj;
    delete estadoCNPJs[cnpj];
    renderizarPaginaCNPJs();
    document.getElementById('cnpj').value = formatarCNPJTexto(cnpj);
    mostrarDadosEmpresa(cnpj);
  }
  function obterValorFlex(registro, ...colunas) {
    for (const col of colunas) {
      for (const key of Object.keys(registro)) {
        if (key.trim().toLowerCase() === col.toLowerCase()) {
          const v = String(registro[key] || '').trim();
          if (v) return v;
        }
      }
    }
    return '';
  }
  function mostrarDadosEmpresa(cnpj) {
    const registro = dadosImportados.find((item) => {
      const cnpjColunas = ['CNPJ', 'Cnpj', 'cnpj', 'Nº do CNPJ', 'Numero CNPJ', 'numero cnpj'];
      for (const col of cnpjColunas) {
        for (const key of Object.keys(item)) {
          if (key.trim().toLowerCase() === col.toLowerCase()) {
            const v = String(item[key] || '').replace(/\D/g, '');
            if (v === cnpj) return true;
          }
        }
      }
      return false;
    });
    if (!registro) {
      document.getElementById('dadosEmpresa').innerHTML =
        '<div class="campo-dado" style="color:#7b0000;font-weight:bold;">Empresa não localizada.</div>';
      const painelNaoLoc = document.getElementById('painelEmpresa');
      if (painelNaoLoc) painelNaoLoc.classList.remove('painel-status-coletada', 'painel-status-atraso', 'painel-status-abordagem', 'painel-status-abordada', 'painel-status-acordada', 'painel-status-renegociada', 'painel-status-cobrada', 'painel-status-notificada');
      if (todosCNPJsImportados.includes(cnpj)) {
        estadoCNPJs[cnpj] = 'nao-localizado';
        if (cnpjSelecionadoAtual === cnpj) cnpjSelecionadoAtual = null;
        renderizarPaginaCNPJs();
      }
      adicionarAoHistorico(cnpj, '', false);
      return;
    }
    if (estadoCNPJs[cnpj] === 'nao-localizado') {
      delete estadoCNPJs[cnpj];
    }
    preencherFichaPlanilha(registro, cnpj);
    cnpjSelecionadoAtual = cnpj;
    renderizarPaginaCNPJs();
    const razaoHistorico =
      obterValorFlex(registro, 'Razão Social', 'Razao Social', 'RAZAO SOCIAL', 'RAZÃO SOCIAL') || '';
    adicionarAoHistorico(cnpj, razaoHistorico, true);
    const entradas = Object.entries(registro);
    const totalLinhas = entradas.length;
    const linhasPorColuna = 15;
    const numColunas = Math.ceil(totalLinhas / linhasPorColuna);
    let html = '';
    const MAPA_STATUS = {
      COLETADA: 'coletada',
      'EM ATRASO': 'atraso',
      'ABORDAGEM EM ANDAMENTO': 'abordagem',
      ABORDADA: 'abordada',
      ACORDADA: 'acordada',
      RENEGOCIADA: 'renegociada',
      COBRADA: 'cobrada',
      NOTIFICADA: 'notificada',
    };
    const TODAS_CLASSES_STATUS = Object.values(MAPA_STATUS).map((c) => 'painel-status-' + c);
    let statusAtivo = null;
    entradas.forEach(([campo, valor]) => {
      const campoNormalizado = campo.trim().toLowerCase();
      const ehCampoStatus = campoNormalizado === 'status' || campoNormalizado.includes('status');
      const valorNormalizado = String(valor).trim().toUpperCase();
      const classeStatus = ehCampoStatus ? MAPA_STATUS[valorNormalizado] : null;
      if (classeStatus) statusAtivo = classeStatus;
      let valorHtml = escaparHtml(valor);
      if (classeStatus) {
        valorHtml = '<span class="valor-status-' + classeStatus + '">' + escaparHtml(valor) + '</span>';
      }
      html += '<div class="campo-dado"><strong>' + escaparHtml(campo) + ':</strong> ' + valorHtml + '</div>';
    });
    const container = document.getElementById('dadosEmpresa');
    container.innerHTML = html;
    container.style.gridTemplateRows = 'repeat(' + linhasPorColuna + ', auto)';
    container.style.gridAutoFlow = 'column';
    container.style.gridTemplateColumns = 'repeat(' + numColunas + ', minmax(220px, 1fr))';
    const painel = document.getElementById('painelEmpresa');
    if (painel) {
      painel.classList.remove(...TODAS_CLASSES_STATUS);
      if (statusAtivo) painel.classList.add('painel-status-' + statusAtivo);
    }
  }
  function preencherFichaPlanilha(reg, cnpj) {
    limparFicha();
    setField('fe-cnpj', cnpj.substring(0, 8) + '/' + cnpj.substring(8, 12) + '-' + cnpj.substring(12, 14));
    setField('fe-razao-social', obterValorFlex(reg, 'Razão Social', 'Razao Social', 'RAZAO SOCIAL', 'RAZÃO SOCIAL'));
    setField('fe-logradouro', obterValorFlex(reg, 'Endereço da UC', 'Endereco da UC', 'ENDEREÇO DA UC', 'LOGRADOURO'));
    setField('fe-bairro', obterValorFlex(reg, 'Bairro da UC', 'BAIRRO DA UC', 'BAIRRO'));
    setField('fe-cep', obterValorFlex(reg, 'CEP da UC', 'CEP DA UC', 'CEP'));
    setField('fe-contato', obterValorFlex(reg, 'Nome do Contato', 'NOME DO CONTATO', 'CONTATO'));
    setField('fe-telefone', obterValorFlex(reg, 'Telefone do Contato', 'TELEFONE DO CONTATO', 'TELEFONE'));
    setField('fe-email', obterValorFlex(reg, 'E-mail do Contato', 'Email do Contato', 'E-MAIL DO CONTATO', 'EMAIL'));
    setField(
      'fe-atividade',
      obterValorFlex(
        reg,
        'CNAE',
        'Cnae',
        'cnae',
        'Atividade',
        'ATIVIDADE',
        'Atividade Principal',
        'ATIVIDADE PRINCIPAL',
        'Atividade Predominante',
        'ATIVIDADE PREDOMINANTE',
        'Descrição CNAE',
        'Descricao CNAE',
        'DESCRIÇÃO CNAE',
      ),
    );
    setField(
      'fe-contab-razao',
      obterValorFlex(
        reg,
        'Contador Tercerizado/GrupoEmpresarial',
        'Contador Terceirizado/GrupoEmpresarial',
        'Contador Tercerizado/Grupo Empresarial',
        'RAZÃO SOCIAL CONTABILIDADE',
      ),
    );
    setField(
      'fe-contab-cnpj',
      obterValorFlex(reg, 'Documento do Contador/Grupo', 'DOCUMENTO DO CONTADOR/GRUPO', 'CNPJ CONTABILIDADE'),
    );
    atualizarTextoMensagem();
    atualizarContabTipo();
  }
  // Normaliza planilhas (.xls, .xlsx ou .csv) para o mesmo padrão de colunas/valores
  const MAPA_COLUNAS_PLANILHA = {
    'cnpj': 'CNPJ', 'razaosocial': 'Razão Social', 'nomefantasia': 'Nome Fantasia', 'nomeagencia': 'Agência',
    'ufdauc': 'UF', 'municipiodauc': 'Municipio', 'localidadedauc': 'Localidade', 'poselecao': 'PO Sel.',
    'vipespecial': 'Vip Especial', 'empresanova': 'Empresa Nova', 'statusempresa': 'Status da Empresa',
    'enviapiaprod': 'Env. PIA Prod.', 'statusprd': 'Status PiaProduto', 'fac': 'FAC', 'statusfac': 'Status da FAC',
    'emailinvalido': 'E-mail Invalido', 'formaabordagem': 'Forma de Abordagem', 'comemail': 'Com e-mail?',
    'destinomaterial': 'Destino do Material', 'statusenvio': 'Status do Envio do E-mail',
    'nomeresponsavelabordagem': 'Responsável pela Abordagem',
    'nomeresponsavelacompanhamentocoleta': 'Responsável pelo acompanhamento da coleta',
    'dataabordagem': 'Data da Abordagem', 'dataentregamaterial': 'Data da Entrega',
    'diasprevisaodevolucao': 'Dias Prev. Dev.', 'dataprevisaodevolucao': 'Data Prev. Dev.',
    'datadevolucao': 'Data da Devolução', 'cnae': 'CNAE', 'cepuc': 'CEP da UC', 'bairrouc': 'Bairro da UC',
    'pesquisasconjunturais': 'Conjunturais', 'nomecontato': 'Nome do Contato',
    'telefonecontato': 'Telefone do Contato', 'emailcontato': 'E-mail do Contato',
    'documentocontador': 'Documento do Contador/Grupo',
    'nomeescritoriocontador': 'Contador Tercerizado/GrupoEmpresarial', 'endereco': 'Endereço da UC',
  };
  const COLUNAS_DATA_PLANILHA = ['Data da Abordagem', 'Data da Entrega', 'Data Prev. Dev.', 'Data da Devolução'];
  function normalizarValorDataPlanilha(valor) {
    if (typeof valor === 'number' && isFinite(valor)) {
      const d = new Date(Math.round((Math.floor(valor) - 25569) * 86400000));
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
    }
    const m = String(valor == null ? '' : valor).trim().match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
    return m ? m[1] : valor;
  }
  function normalizarRegistrosPlanilha(registros) {
    return registros.map((reg) => {
      const novo = {};
      Object.keys(reg).forEach((chave) => {
        const chaveSimples = chave.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const nome = MAPA_COLUNAS_PLANILHA[chaveSimples] || chave;
        let valor = reg[chave];
        if (nome === 'CNPJ') {
          const dig = String(valor == null ? '' : valor).replace(/\D/g, '');
          if (dig.length === 14) valor = dig.substring(0, 8) + '/' + dig.substring(8, 12) + '-' + dig.substring(12);
        } else if (nome === 'Agência') {
          valor = String(valor == null ? '' : valor).replace(/^[A-Za-z]{2}\d+\s*-\s*/, '');
        } else if (COLUNAS_DATA_PLANILHA.includes(nome)) {
          valor = normalizarValorDataPlanilha(valor);
        }
        if (!(nome in novo) || novo[nome] === '') novo[nome] = valor;
      });
      return novo;
    });
  }
  function importarPlanilha(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    if (typeof XLSX === 'undefined') {
      mostrarToast('Biblioteca de planilhas não carregada. Verifique sua conexão com a internet.', 'aviso');
      event.target.value = '';
      return;
    }
    const ehCsv = /\.csv$/i.test(arquivo.name);
    const leitor = new FileReader();
    leitor.onload = function (e) {
      try {
        const workbook = ehCsv
          ? XLSX.read(String(e.target.result).replace(/^\uFEFF/, ''), { type: 'string', raw: true })
          : XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const nomeAba = workbook.SheetNames[0];
        if (!nomeAba) throw new Error('A planilha não contém nenhuma aba.');
        const planilha = workbook.Sheets[nomeAba];
        const novosDados = normalizarRegistrosPlanilha(XLSX.utils.sheet_to_json(planilha, { defval: '' }));
        const possuiColunaCNPJ = novosDados.some((registro) =>
          Object.keys(registro).some((chave) => chave.trim().toLowerCase() === 'cnpj'),
        );
        if (!possuiColunaCNPJ) {
          mostrarToast('A planilha não possui uma coluna chamada "CNPJ".', 'aviso');
          event.target.value = '';
          return;
        }
        const possuiCNPJValido = novosDados.some((registro) => {
          const chaveCNPJ = Object.keys(registro).find((chave) => chave.trim().toLowerCase() === 'cnpj');
          return chaveCNPJ && String(registro[chaveCNPJ] || '').replace(/\D/g, '').length === 14;
        });
        if (!possuiCNPJValido) {
          mostrarToast('Nenhum CNPJ válido (14 dígitos) foi encontrado na coluna "CNPJ".', 'aviso');
          event.target.value = '';
          return;
        }
        const colunasReconhecidas = [
          'razão social',
          'razao social',
          'endereço da uc',
          'endereco da uc',
          'logradouro',
          'bairro da uc',
          'bairro',
          'cep da uc',
          'cep',
          'nome do contato',
          'contato',
          'telefone do contato',
          'telefone',
          'e-mail do contato',
          'email do contato',
          'email',
          'contador tercerizado/grupoempresarial',
          'contador terceirizado/grupoempresarial',
          'contador tercerizado/grupo empresarial',
          'razão social contabilidade',
          'documento do contador/grupo',
          'cnpj contabilidade',
        ];
        const possuiColunaReconhecida = novosDados.some((registro) =>
          Object.keys(registro).some((chave) => colunasReconhecidas.includes(chave.trim().toLowerCase())),
        );
        if (!possuiColunaReconhecida) {
          mostrarToast('CNPJs importados, mas nenhuma coluna de dados complementar foi reconhecida.', 'aviso');
        }
        dadosImportados = novosDados;
        salvarDadosImportados();
        exibirCNPJs(novosDados);
      } catch (erro) {
        mostrarToast('Não foi possível ler o arquivo como planilha. Verifique se não está corrompido.', 'aviso');
        console.error('Erro ao importar planilha:', erro);
      } finally {
        event.target.value = '';
      }
    };
    leitor.onerror = function () {
      mostrarToast('Ocorreu um erro ao tentar ler o arquivo.', 'aviso');
      event.target.value = '';
    };
    if (ehCsv) leitor.readAsText(arquivo, 'UTF-8');
    else leitor.readAsArrayBuffer(arquivo);
  }
  let tipoMensagemAtual = null;
  const MARCADOR_EMPRESA_INICIO = '\u0001EMP_INICIO\u0001';
  const MARCADOR_EMPRESA_FIM = '\u0001EMP_FIM\u0001';
  const MARCADOR_NEGRITO_INICIO = '\u0001NEG_INICIO\u0001';
  const MARCADOR_NEGRITO_FIM = '\u0001NEG_FIM\u0001';
  const MARCADOR_IBGE_INICIO = '\u0001IBGE_INICIO\u0001';
  const MARCADOR_IBGE_FIM = '\u0001IBGE_FIM\u0001';

  // ============================================================
  // SEÇÃO: MARCAÇÃO/DESTAQUE DE TEXTO NA FICHA
  // ============================================================
  function marcarIBGE(texto) {
    return MARCADOR_IBGE_INICIO + texto + MARCADOR_IBGE_FIM;
  }
  function marcarEmpresaDestaque(empresa) {
    return MARCADOR_EMPRESA_INICIO + empresa + MARCADOR_EMPRESA_FIM;
  }
  function marcarNegrito(texto) {
    return MARCADOR_NEGRITO_INICIO + texto + MARCADOR_NEGRITO_FIM;
  }
  function aplicarDestaqueEmpresaHtml(htmlEscapado) {
    return htmlEscapado
      .split(MARCADOR_EMPRESA_INICIO)
      .join('<strong style="background:#fff59d;padding:0 2px;">')
      .split(MARCADOR_EMPRESA_FIM)
      .join('</strong>')
      .split(MARCADOR_NEGRITO_INICIO)
      .join('<strong>')
      .split(MARCADOR_NEGRITO_FIM)
      .join('</strong>')
      .split(MARCADOR_IBGE_INICIO)
      .join('<strong style="color:#003a70;">')
      .split(MARCADOR_IBGE_FIM)
      .join('</strong>');
  }
  function removerMarcadoresEmpresa(texto) {
    return texto
      .split(MARCADOR_EMPRESA_INICIO)
      .join('*')
      .split(MARCADOR_EMPRESA_FIM)
      .join('*')
      .split(MARCADOR_NEGRITO_INICIO)
      .join('*')
      .split(MARCADOR_NEGRITO_FIM)
      .join('*')
      .split(MARCADOR_IBGE_INICIO)
      .join('')
      .split(MARCADOR_IBGE_FIM)
      .join('');
  }

  // ============================================================
  // SEÇÃO: GERAÇÃO DE TEXTOS (abordagem, renegociação, WhatsApp)
  // ============================================================
  function saudacaoHorario() {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'bom dia!';
    if (hora >= 12 && hora < 18) return 'boa tarde!';
    return 'boa noite!';
  }
  function valorCampo(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function obterEmpresaTexto() {
    const razao = valorCampo('fe-razao-social');
    const cnpj = valorCampo('fe-cnpj');
    if (!razao && !cnpj) return '[RAZÃO SOCIAL / CNPJ NÃO PREENCHIDOS]';
    if (razao && cnpj) return razao + ' (CNPJ: ' + cnpj + ')';
    return razao || cnpj;
  }
  function obterContatoTexto() {
    const contatoEmpresa = valorCampo('fe-contato');
    const contatoContab = valorCampo('fe-contab-contato');
    const nome = contatoEmpresa || contatoContab;
    return nome || '[NOME DO CONTATO NÃO PREENCHIDO]';
  }
  function formatarDataNumerica(valorISO) {
    const partes = valorISO.split('-');
    if (partes.length !== 3) return valorISO;
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }
  function montarTabelaFichaHtml(linhas) {
    const linhasHtml = linhas
      .map((l) => {
        const corLabel = l.destaque ? '#fde8d0' : '#dce9f5';
        const corField = l.destaque ? '#fde8d0' : '#eaf3fb';
        const estiloLabel = l.destaque ? 'font-style:italic;color:#00008B;' : 'color:#333;';
        const estiloValor = l.pendente ? 'color:#cc0000;font-weight:bold;' : l.negrito ? 'font-weight:bold;' : '';
        return (
          '<tr><td style="background:' +
          corLabel +
          ';' +
          estiloLabel +
          'font-weight:bold;text-align:right;padding:5px 10px;border:1px solid #b0cce8;font-size:12px;width:430px;white-space:nowrap;">' +
          (l.rotuloHtml || escaparHtml(l.rotulo)) +
          '</td><td style="background:' +
          corField +
          ';color:#222;' +
          estiloValor +
          'padding:4px 10px;border:1px solid #b0cce8;font-size:13px;width:100%;">' +
          (l.valor ? escaparHtml(l.valor) : '&nbsp;') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;width:100%;table-layout:fixed;">' +
      linhasHtml +
      '</table>'
    );
  }
  function montarTabelaFichaTexto(linhas) {
    const maiorRotulo = Math.max(...linhas.map((l) => l.rotulo.length));
    return linhas
      .map((l) => {
        const rotuloAlinhado = l.rotulo.padEnd(maiorRotulo + 2, ' ');
        return rotuloAlinhado + ' ' + (l.valor || '-');
      })
      .join('\n');
  }
  function gerarTextoAbordagem() {
    const empresa = obterEmpresaTexto();
    const contato = obterContatoTexto();
    const saudacao = saudacaoHorario();
    const razaoSocial = valorCampo('fe-razao-social');
    const cnpj = valorCampo('fe-cnpj');
    const logradouro = valorCampo('fe-logradouro');
    const bairro = valorCampo('fe-bairro');
    const municipio = valorCampo('fe-municipio');
    const cep = valorCampo('fe-cep');
    const contatoEmpresa = valorCampo('fe-contato');
    const telefoneEmpresa = valorCampo('fe-telefone');
    const emailEmpresa = valorCampo('fe-email');
    const atividade = valorCampo('fe-atividade');
    const contabRazao = valorCampo('fe-contab-razao');
    const contabCnpj = valorCampo('fe-contab-cnpj');
    const contabContato = valorCampo('fe-contab-contato');
    const contabTelefone = valorCampo('fe-contab-telefone');
    const contabEmail = valorCampo('fe-contab-email');
    const servidorEl = document.getElementById('msg-global-servidor');
    const telefoneEl = document.getElementById('msg-global-telefone');
    const servidor = servidorEl && servidorEl.value ? servidorEl.value : SERVIDOR_PADRAO;
    const telefoneServidor = telefoneEl && telefoneEl.value ? telefoneEl.value : TELEFONE_PADRAO;
    const antes =
      marcarIBGE('IBGE') +
      ' - Atualização dados 2026, Empresa ' +
      marcarEmpresaDestaque(empresa) +
      '.\n' +
      '\nPrezado(a) senhor(a) ' +
      marcarNegrito(contato) +
      ', ' +
      saudacao +
      '\n\n\n' +
      'O ' +
      marcarIBGE('IBGE') +
      ', responsável pela formulação dos índices econômicos do Brasil, faz anualmente uma seleção de empresas para responderem à pesquisa econômica anual, e este ano a Empresa ' +
      marcarEmpresaDestaque(empresa) +
      ' foi selecionada.\n\n' +
      'As pesquisas econômicas anuais do ' +
      marcarIBGE('IBGE') +
      ' consistem no levantamento detalhado de informações econômico-financeiras das empresas ativas no Brasil, tendo como objetivo principal traçar um panorama estrutural dos principais setores da economia, subsidiando o planejamento governamental e o cálculo do Produto Interno Bruto (PIB).\n' +
      'Para garantir a precisão dos questionários econômicos anuais, solicitamos a sua colaboração na conferência dos dados abaixo referentes à empresa e atualize qualquer informação que tenha sofrido alteração desde a última atualização. Caso não haja alterações, basta confirmar a veracidade dos dados informados.\n' +
      'Ressalta-se a importância de informar os dados da contabilidade para que o link da pesquisa seja direcionado para a empresa e para a contabilidade.';
    const ficha = [
      { rotulo: 'RAZÃO SOCIAL:', valor: razaoSocial, destaque: false },
      { rotulo: 'CNPJ:', valor: cnpj, destaque: false },
      { rotulo: 'LOGRADOURO:', valor: logradouro, destaque: false },
      { rotulo: 'BAIRRO:', valor: bairro, destaque: false },
      { rotulo: 'MUNICÍPIO:', valor: municipio, destaque: false },
      { rotulo: 'CEP:', valor: cep, destaque: false },
      { rotulo: 'CONTATO EMPRESA:', valor: contatoEmpresa, destaque: false },
      { rotulo: 'TELEFONE EMPRESA:', valor: telefoneEmpresa, destaque: false },
      { rotulo: 'E-MAIL EMPRESA:', valor: emailEmpresa, destaque: false },
      {
        rotulo: 'Atividade Predominante da Empresa (maior receita) em 2025?',
        rotuloHtml:
          'Atividade Predominante da Empresa (maior receita) em 2025<span style="color:#cc0000;font-weight:bold;">?</span>',
        valor: atividade,
        destaque: true,
      },
      {
        rotulo: 'A Empresa teve atividade em 2025?',
        rotuloHtml: 'A Empresa teve atividade em 2025<span style="color:#cc0000;font-weight:bold;">?</span>',
        valor: 'SIM\u00A0(\u00A0\u00A0\u00A0\u00A0)\u00A0\u00A0\u00A0NÃO\u00A0(\u00A0\u00A0\u00A0\u00A0)',
        destaque: true,
        negrito: true,
      },
      {
        rotulo: 'CONTABILIDADE PRÓPRIA OU TERCEIRIZADA?',
        valor:
          contabCnpj && contabCnpj !== TEXTO_PENDENTE && contabCnpj.replace(/\D/g, '') !== cnpj.replace(/\D/g, '')
            ? 'TERCEIRIZADA'
            : 'PRÓPRIA\u00A0(\u00A0\u00A0\u00A0\u00A0)\u00A0\u00A0\u00A0TERCEIRIZADA\u00A0(\u00A0\u00A0\u00A0\u00A0)',
        destaque: false,
        negrito: true,
      },
      {
        rotulo: 'RAZÃO SOCIAL CONTABILIDADE:',
        valor: contabRazao || TEXTO_PENDENTE,
        destaque: false,
        pendente: !contabRazao || contabRazao === TEXTO_PENDENTE,
      },
      {
        rotulo: 'CNPJ CONTABILIDADE:',
        valor: contabCnpj || TEXTO_PENDENTE,
        destaque: false,
        pendente: !contabCnpj || contabCnpj === TEXTO_PENDENTE,
      },
      {
        rotulo: 'CONTATO NA CONTABILIDADE:',
        valor: contabContato || TEXTO_PENDENTE,
        destaque: false,
        pendente: !contabContato || contabContato === TEXTO_PENDENTE,
      },
      {
        rotulo: 'TELEFONE DA CONTABILIDADE:',
        valor: contabTelefone || TEXTO_PENDENTE,
        destaque: false,
        pendente: !contabTelefone || contabTelefone === TEXTO_PENDENTE,
      },
      {
        rotulo: 'E-MAIL DA CONTABILIDADE:',
        valor: contabEmail || TEXTO_PENDENTE,
        destaque: false,
        pendente: !contabEmail || contabEmail === TEXTO_PENDENTE,
      },
    ];
    const depois =
      'A participação de sua empresa é fundamental para a qualidade dos levantamentos do ' +
      marcarIBGE('IBGE') +
      ', que servem de base para políticas públicas e decisões estratégicas.\n' +
      'Ressalta-se que o fornecimento dessas informações é obrigatório, em conformidade com o previsto na legislação vigente (LEI N° 5.534, DE 14 DE NOVEMBRO DE 1968) e que os dados fornecidos são protegidos por sigilo estatístico.\n\n' +
      'Agradecemos sinceramente sua atenção e colaboração.\n' +
      'Em caso de dúvidas, estamos à disposição.\n\n\n\n\n' +
      'Atenciosamente,\n' +
      servidor +
      '\n' +
      marcarIBGE('IBGE') +
      marcarNegrito(' - SES/RJ - Agência Jacarepaguá') +
      '\n' +
      'Avenida Ayrton Senna, 2001, Grupo B, Sala 48 - Jacarepaguá\n' +
      'Tel.:  ' +
      telefoneServidor +
      ' / (21) 96553-1115 / (21) 98396-2188\n' +
      marcarIBGE('IBGE') +
      ' - Nossa Missão: Retratar o Brasil com informações necessárias ao conhecimento de sua realidade e ao exercício da cidadania.\n' +
      'Site: http://www.ibge.gov.br             0800 721 8181';
    return { antes, ficha, depois };
  }
  function gerarTextoRenegociacao() {
    const empresa = obterEmpresaTexto();
    const contato = obterContatoTexto();
    const saudacao = saudacaoHorario();
    const data1 = document.getElementById('msg-data1');
    const data2 = document.getElementById('msg-data2');
    const dataTexto1 = data1 && data1.value ? formatarDataNumerica(data1.value) : '__/__/____';
    const dataTexto2 = data2 && data2.value ? formatarDataNumerica(data2.value) : '__/__/____';
    const servidorEl = document.getElementById('msg-global-servidor');
    const telefoneEl = document.getElementById('msg-global-telefone');
    const servidor = servidorEl && servidorEl.value ? servidorEl.value : SERVIDOR_PADRAO;
    const telefone = telefoneEl && telefoneEl.value ? telefoneEl.value : TELEFONE_PADRAO;
    return (
      'IBGE - RENEGOCIAÇÃO DE PRAZO para a entrega da Pesquisa Econômica Anual, empresa ' +
      marcarEmpresaDestaque(empresa) +
      '.\n' +
      '\nPrezado(a) senhor(a) ' +
      marcarNegrito(contato) +
      ', ' +
      saudacao +
      '\n\n\n' +
      'A empresa ' +
      marcarEmpresaDestaque(empresa) +
      ' encontra-se em ATRASO na entrega da Pesquisa Econômica Anual. Pedimos, por gentileza, que escolha uma das datas abaixo para que possamos prorrogar o prazo para entrega da pesquisa:\n' +
      'dia ' +
      marcarNegrito(dataTexto1) +
      '  (   )\n' +
      'dia ' +
      marcarNegrito(dataTexto2) +
      '  (   )\n\n\n\n\n' +
      'Atenciosamente,\n' +
      servidor +
      '\n' +
      'IBGE' +
      marcarNegrito(' - SES/RJ - Agência Jacarepaguá') +
      '\n' +
      'Avenida Ayrton Senna, 2001, Grupo B, Sala 48 - Jacarepaguá\n' +
      'Tel.:  ' +
      telefone +
      ' / (21) 96553-1115 / (21) 98396-2188'
    );
  }
  function gerarTextoWpp() {
    const empresa = obterEmpresaTexto();
    const contato = valorCampo('fe-contab-contato') || obterContatoTexto();
    const saudacao = saudacaoHorario();
    const servidorEl = document.getElementById('msg-global-servidor');
    const telefoneEl = document.getElementById('msg-global-telefone');
    const servidor = servidorEl && servidorEl.value ? servidorEl.value : SERVIDOR_PADRAO;
    const telefone = telefoneEl && telefoneEl.value ? telefoneEl.value : TELEFONE_PADRAO;
    return (
      'Prezado(a) senhor(a) *' +
      contato +
      '*, ' +
      saudacao +
      '\n' +
      '\nSou Agente de Pesquisa e Mapeamento do IBGE se esta contabilidade tem a empresa *' +
      empresa +
      '* como cliente?\n' +
      'Essa empresa foi selecionada para responder à Pesquisa Econômica Anual e necessitamos confirmar os dados da empresa.\n\n\n\n' +
      'Atenciosamente,\n' +
      servidor +
      '\n' +
      '*IBGE - SES/RJ - Agência Jacarepaguá*\n' +
      'Avenida Ayrton Senna, 2001, Grupo B, Sala 48 - Jacarepaguá\n' +
      'Tel.: ' +
      telefone +
      ' / (21) 96553-1115 / (21) 98396-2188'
    );
  }
  function gerarTextoWppEmpresa() {
    const empresa = obterEmpresaTexto();
    const contato = obterContatoTexto();
    const saudacao = saudacaoHorario();
    const emailEmpresa = valorCampo('fe-email');
    const servidorEl = document.getElementById('msg-global-servidor');
    const telefoneEl = document.getElementById('msg-global-telefone');
    const servidor = servidorEl && servidorEl.value ? servidorEl.value : SERVIDOR_PADRAO;
    const telefone = telefoneEl && telefoneEl.value ? telefoneEl.value : TELEFONE_PADRAO;
    return (
      'Prezado(a) senhor(a) *' +
      contato +
      '*, ' +
      saudacao +
      '\n' +
      '\nSou Agente de Pesquisa e Mapeamento do IBGE e estou entrando em contato por este canal de comunicação com a empresa devido às tentativas de ligação sem sucesso. O motivo do meu contato é para informar sobre o e-mail enviado à empresa, e-mail(s) da empresa *' +
      (emailEmpresa || '[E-MAIL EMPRESA]') +
      '*, ainda não respondido.\nPeço, por gentileza, que deem atenção ao e-mail do IBGE enviado à empresa, pois a empresa *' +
      empresa +
      '* foi selecionada para responder à Pesquisa Econômica Anual do IBGE.\n' +
      'No e-mail os senhores poderão obter melhor esclarecimento sobre a pesquisa, a devida lei e a veracidade deste contato.\n\n\n\n' +
      'Atenciosamente,\n' +
      servidor +
      '\n' +
      '*IBGE - SES/RJ - Agência Jacarepaguá*\n' +
      'Avenida Ayrton Senna, 2001, Grupo B, Sala 48 - Jacarepaguá\n' +
      'Tel.: ' +
      telefone +
      ' / (21) 96553-1115 / (21) 98396-2188'
    );
  }
  function selecionarTipoMensagem(tipo) {
    if (tipoMensagemAtual === tipo) {
      tipoMensagemAtual = null;
      document.querySelectorAll('.msg-botoes button').forEach((btn) => btn.classList.remove('ativo'));
      const ids = [
        'msg-datas-bloco',
        'msg-abordagem-campos',
        'msg-wpp-campos',
        'msg-wpp-empresa-campos',
        'msg-renegociacao-campos',
      ];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      const wrap = document.getElementById('msg-saida-wrap');
      if (wrap) wrap.classList.remove('visivel');
      return;
    }
    tipoMensagemAtual = tipo;
    document.querySelectorAll('.msg-botoes button').forEach((btn) => {
      btn.classList.toggle('ativo', btn.dataset.tipo === tipo);
    });
    const datasDiv = document.getElementById('msg-datas-bloco');
    if (datasDiv) datasDiv.style.display = tipo === 'RENEGOCIACAO' ? 'block' : 'none';
    const abordagemCamposDiv = document.getElementById('msg-abordagem-campos');
    if (abordagemCamposDiv) abordagemCamposDiv.style.display = tipo === 'ABORDAGEM' ? 'block' : 'none';
    const wppCamposDiv = document.getElementById('msg-wpp-campos');
    if (wppCamposDiv) wppCamposDiv.style.display = tipo === 'WPP' ? 'block' : 'none';
    const wppEmpresaCamposDiv = document.getElementById('msg-wpp-empresa-campos');
    if (wppEmpresaCamposDiv) wppEmpresaCamposDiv.style.display = tipo === 'WPP_EMPRESA' ? 'block' : 'none';
    const renegociacaoCamposDiv = document.getElementById('msg-renegociacao-campos');
    if (renegociacaoCamposDiv) renegociacaoCamposDiv.style.display = tipo === 'RENEGOCIACAO' ? 'block' : 'none';
    atualizarTextoMensagem();
    const wrap = document.getElementById('msg-saida-wrap');
    if (wrap) wrap.classList.add('visivel');
  }
  function atualizarTextoMensagem() {
    if (!tipoMensagemAtual) return;
    const saida = document.getElementById('msg-saida');
    if (!saida) return;
    if (tipoMensagemAtual === 'ABORDAGEM') {
      const partes = gerarTextoAbordagem();
      saida.classList.add('msg-saida-html');
      saida.innerHTML =
        aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(partes.antes)) +
        '<div class="msg-saida-tabela-wrap">' +
        montarTabelaFichaHtml(partes.ficha) +
        '</div>' +
        aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(partes.depois));
    } else if (tipoMensagemAtual === 'RENEGOCIACAO') {
      const texto = gerarTextoRenegociacao();
      saida.classList.add('msg-saida-html');
      saida.innerHTML = aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(texto));
    } else {
      let texto = '';
      if (tipoMensagemAtual === 'WPP') texto = gerarTextoWpp();
      else if (tipoMensagemAtual === 'WPP_EMPRESA') texto = gerarTextoWppEmpresa();
      saida.classList.remove('msg-saida-html');
      saida.textContent = texto;
    }
  }
  function copiarComFormatacao(html, textoPlano, nome) {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([textoPlano], { type: 'text/plain' }),
      });
      navigator.clipboard
        .write([item])
        .then(() => {
          mostrarToast(nome + ' copiada com formatação.', 'sucesso');
        })
        .catch(() => {
          navigator.clipboard.writeText(textoPlano);
          mostrarToast(nome + ' copiada (somente texto).', 'sucesso');
        });
    } else {
      navigator.clipboard.writeText(textoPlano);
      mostrarToast(nome + ' copiada (somente texto).', 'sucesso');
    }
  }
  function copiarFichaEmpresa() {
    const ficha = document.getElementById('fichaEmpresa');
    if (!ficha) {
      mostrarToast('Ficha não encontrada.', 'aviso');
      return;
    }
    const linhas = [];
    ficha.querySelectorAll('.form-row').forEach((row) => {
      const labelEl = row.querySelector('.form-label');
      if (!labelEl) return;
      let rotulo = labelEl.textContent.replace(/\s+/g, ' ').trim();
      rotulo = rotulo.replace(/\s*\?\s*$/, '?');
      let valor = '';
      let pendente = false;
      const radios = row.querySelectorAll('input[type="radio"]');
      const textInput = row.querySelector('input[type="text"]');
      const textoFixo = row.querySelector('.radio-group-texto');
      if (radios.length) {
        const marcado = row.querySelector('input[type="radio"]:checked');
        valor = marcado ? marcado.value : '';
      } else if (textInput) {
        valor = textInput.value || '';
        pendente = textInput.classList.contains('campo-pendente');
      } else if (textoFixo) {
        valor = textoFixo.textContent.replace(/\s+/g, ' ').trim();
      }
      const destaque = row.classList.contains('destaque-laranja');
      linhas.push({ rotulo, valor, destaque, pendente });
    });
    if (!linhas.length) {
      mostrarToast('Nenhum campo encontrado na ficha.', 'aviso');
      return;
    }
    const textoPlano = montarTabelaFichaTexto(linhas);
    const htmlCompleto = montarTabelaFichaHtml(linhas);
    copiarComFormatacao(htmlCompleto, textoPlano, 'Ficha');
  }
  function copiarMensagem() {
    const saida = document.getElementById('msg-saida');
    if (!saida || !saida.textContent.trim()) {
      mostrarToast('Selecione um tipo de mensagem primeiro.', 'aviso');
      return;
    }
    if (tipoMensagemAtual === 'ABORDAGEM') {
      const partes = gerarTextoAbordagem();
      const antesHtml = aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(partes.antes));
      const depoisHtml = aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(partes.depois));
      const tabelaHtml = montarTabelaFichaHtml(partes.ficha);
      const htmlCompleto =
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">' +
        antesHtml +
        '<div style="margin:14px 0;">' +
        tabelaHtml +
        '</div>' +
        depoisHtml +
        '</div>';
      const tabelaTexto = montarTabelaFichaTexto(partes.ficha);
      const antesTexto = removerMarcadoresEmpresa(partes.antes);
      const depoisTexto = removerMarcadoresEmpresa(partes.depois);
      const textoPlano = antesTexto + '\n' + tabelaTexto + '\n' + depoisTexto;
      copiarComFormatacao(htmlCompleto, textoPlano, 'Mensagem');
    } else if (tipoMensagemAtual === 'RENEGOCIACAO') {
      const textoBruto = gerarTextoRenegociacao();
      const htmlCompleto =
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">' +
        aplicarDestaqueEmpresaHtml(escaparHtmlPreservandoQuebras(textoBruto)) +
        '</div>';
      const textoPlano = removerMarcadoresEmpresa(textoBruto);
      copiarComFormatacao(htmlCompleto, textoPlano, 'Mensagem');
    } else {
      navigator.clipboard
        .writeText(saida.textContent)
        .then(() => mostrarToast('Mensagem copiada.', 'sucesso'))
        .catch(() => mostrarToast('Não foi possível copiar.', 'aviso'));
    }
  }

  // ============================================================
  // SEÇÃO: NOVOS DADOS ENCONTRADOS DA EMPRESA (formulário nd-*)
  // ============================================================
  var ND_SEP = { telefones: ' / ', emails: '; ', enderecos: ' / ', empresas: ' / ', cnpjs: ' - ', socios: ', ' };
  var ND_CAMPOS = {
    telefones: { input: 'nd-telefones', nome: 'Telefones' },
    emails: { input: 'nd-emails', nome: 'E-mails' },
    enderecos: { input: 'nd-enderecos', nome: 'Endereços' },
    empresas: { input: 'nd-outra-empresa', nome: 'Razão Social' },
    cnpjs: { input: 'nd-outra-cnpj', nome: 'CNPJ' },
    socios: { input: 'nd-socios', nome: 'Sócio(a)(s)' }
  };
  var ndDados = { telefones: [], emails: [], enderecos: [], empresas: [], cnpjs: [], socios: [], bairro: '', cep: '', uf: '' };
  var ND_RE_EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]{2,}$/;

  function ndSoDigitos(s) {
    return String(s || '').replace(/\D/g, '');
  }
  function ndFmtTelefone(v) {
    var d = ndSoDigitos(v);
    if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) d = d.slice(2); // +55 colado
    d = d.slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function ndFmtCNPJ(v) {
    var d = ndSoDigitos(v).slice(0, 14);
    if (d.length <= 8) return d;
    if (d.length <= 12) return d.slice(0, 8) + '/' + d.slice(8);
    return d.slice(0, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
  }
  function ndFmtCEP(v) {
    var d = ndSoDigitos(v).slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
  }
  // Máscara ao digitar/colar (oninput), mantendo o cursor na mesma posição (contada em dígitos)
  function ndMascara(input, tipo) {
    var fn = tipo === 'telefone' ? ndFmtTelefone : tipo === 'cnpj' ? ndFmtCNPJ : ndFmtCEP;
    var foco = document.activeElement === input;
    var antes = foco ? ndSoDigitos(input.value.slice(0, input.selectionStart)).length : 0;
    var novo = fn(input.value);
    if (novo === input.value) return;
    input.value = novo;
    if (!foco) return;
    var cont = 0, p = 0;
    while (p < novo.length && cont < antes) {
      if (/\d/.test(novo.charAt(p))) cont++;
      p++;
    }
    input.setSelectionRange(p, p);
  }
  function ndTecla(ev, chave) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ndIncluir(chave);
    }
  }

  function ndInterpretar(chave, bruto) {
    var itens = [], erro = '';
    if (chave === 'telefones') {
      var t = ndFmtTelefone(bruto), d = ndSoDigitos(t);
      if (d.length === 10 || d.length === 11) itens.push(t);
      else erro = 'Telefone incompleto. Use (##) ####-#### ou (##) #####-####.';
    } else if (chave === 'emails') {
      bruto.split(/[;,\s]+/).filter(Boolean).forEach(function (e) {
        if (ND_RE_EMAIL.test(e)) itens.push(e.toLowerCase());
        else if (!erro) erro = 'E-mail inválido: ' + e;
      });
    } else if (chave === 'cnpjs') {
      var c = ndFmtCNPJ(bruto);
      if (ndSoDigitos(c).length === 14) itens.push(c);
      else erro = 'CNPJ incompleto. Use ########/####-##.';
    } else {
      bruto.split(/[;\n]+/).forEach(function (p) {
        p = p.replace(/\s+/g, ' ').trim();
        if (p) itens.push(p);
      });
    }
    return { itens: itens, erro: erro };
  }
  function ndChaveUnica(chave, valor) {
    return chave === 'cnpjs' || chave === 'telefones' ? ndSoDigitos(valor) : valor.toLowerCase();
  }

  function ndTextoCampo(chave) {
    if (chave === 'bairro') {
      var p = [];
      if (ndDados.bairro) p.push('Bairro: ' + ndDados.bairro);
      if (ndDados.cep) p.push('CEP: ' + ndDados.cep);
      if (ndDados.uf) p.push('UF: ' + ndDados.uf);
      return p.join(', ');
    }
    return ndDados[chave].join(ND_SEP[chave]);
  }
  function ndMarcarCopiar(chave) {
    var btn = document.getElementById('nd-res-btn-' + chave);
    if (btn) btn.classList.toggle('nde-vazio', !ndTextoCampo(chave));
  }
  function ndRenderizar() {
    Object.keys(ND_CAMPOS).forEach(function (k) {
      var el = document.getElementById('nd-res-' + k);
      if (el) el.textContent = ndDados[k].join(ND_SEP[k]);
      ndMarcarCopiar(k);
    });
    document.getElementById('nd-res-bairro').textContent = ndDados.bairro;
    document.getElementById('nd-res-cep').textContent = ndDados.cep;
    document.getElementById('nd-res-uf').textContent = ndDados.uf;
    ndMarcarCopiar('bairro');
  }

  function ndIncluirBairro() {
    var bairroEl = document.getElementById('nd-bairro');
    var cepEl = document.getElementById('nd-cep');
    var ufEl = document.getElementById('nd-cidade');
    var bairro = bairroEl.value.replace(/\s+/g, ' ').trim();
    var cep = ndFmtCEP(cepEl.value);
    var uf = ufEl.value;
    if (!bairro && !cep && !uf) {
      mostrarToast('Preencha Bairro, CEP ou UF antes de incluir.', 'aviso');
      return;
    }
    if (cep && ndSoDigitos(cep).length !== 8) {
      mostrarToast('CEP incompleto. Use 00000-000.', 'aviso');
      cepEl.focus();
      return;
    }
    if (bairro) ndDados.bairro = bairro;
    if (cep) ndDados.cep = cep;
    if (uf) ndDados.uf = uf;
    bairroEl.value = '';
    cepEl.value = '';
    ufEl.value = '';
    ndRenderizar();
    bairroEl.focus();
  }
  function ndIncluir(chave) {
    if (chave === 'bairro') {
      ndIncluirBairro();
      return;
    }
    var input = document.getElementById(ND_CAMPOS[chave].input);
    var bruto = input.value.trim();
    if (!bruto) {
      mostrarToast('Preencha o campo antes de incluir.', 'aviso');
      input.focus();
      return;
    }
    var r = ndInterpretar(chave, bruto);
    if (r.erro || !r.itens.length) {
      mostrarToast(r.erro || 'Preencha o campo antes de incluir.', 'aviso');
      input.focus();
      return;
    }
    var existentes = ndDados[chave].map(function (v) { return ndChaveUnica(chave, v); });
    var novos = r.itens.filter(function (v) {
      var k = ndChaveUnica(chave, v);
      if (existentes.indexOf(k) !== -1) return false;
      existentes.push(k);
      return true;
    });
    if (!novos.length) {
      mostrarToast('Esse dado já foi incluído.', 'aviso');
      input.focus();
      return;
    }
    ndDados[chave] = ndDados[chave].concat(novos);
    input.value = '';
    ndRenderizar();
    input.focus();
  }

  // 1º clique: limpa o que está digitado. Com o campo já vazio, limpa (após confirmar) o que foi incluído.
  function ndLimpar(chave) {
    var ids = chave === 'bairro' ? ['nd-bairro', 'nd-cep', 'nd-cidade'] : [ND_CAMPOS[chave].input];
    var digitado = ids.some(function (id) { return document.getElementById(id).value; });
    if (digitado) {
      ids.forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById(ids[0]).focus();
      return;
    }
    if (!ndTextoCampo(chave)) return;
    mostrarConfirm('Deseja limpar os dados já incluídos neste campo?', function () {
      if (chave === 'bairro') ndDados.bairro = ndDados.cep = ndDados.uf = '';
      else ndDados[chave] = [];
      ndRenderizar();
      mostrarToast('Dados limpos.', 'info');
    });
  }

  function ndFallbackCopy(texto, rotulo) {
    var ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
    mostrarToast(ok ? rotulo + ' copiado!' : 'Não foi possível copiar.', ok ? 'sucesso' : 'aviso');
  }
  function ndCopiar(chave) {
    var texto = ndTextoCampo(chave);
    var rotulo = chave === 'bairro' ? 'Bairro/CEP/UF' : ND_CAMPOS[chave].nome;
    if (!texto) {
      mostrarToast('Nada para copiar em ' + rotulo + '.', 'aviso');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(texto)
        .then(function () {
          mostrarToast(rotulo + ' copiado!', 'sucesso');
        })
        .catch(function () {
          ndFallbackCopy(texto, rotulo);
        });
    } else {
      ndFallbackCopy(texto, rotulo);
    }
  }

  // Máscaras originais (também usadas na Ficha Empresa e no SIPEA)
  function ndFormatarCNPJ(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 14) v = v.slice(0, 14);
    if (v.length > 8) v = v.replace(/^(\d{8})(\d+)/, '$1/$2');
    if (v.length > 13) v = v.replace(/^(\d{8})\/(\d{4})(\d+)/, '$1/$2-$3');
    input.value = v;
  }
  function ndFormatarTelefone(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length <= 10) {
      v = v.replace(/^(\d{2})(\d)/, '($1) $2');
      v = v.replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    } else {
      v = v.replace(/^(\d{2})(\d)/, '($1) $2');
      v = v.replace(/(\d{5})(\d{1,4})$/, '$1-$2');
    }
    input.value = v;
  }
  function ndFormatarCEP(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
    v = v.replace(/^(\d{5})(\d)/, '$1-$2');
    input.value = v;
  }
  function formatarUmTelefone(v) {
    v = v.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 10) v = '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
    else if (v.length > 6) v = '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
    else if (v.length > 2) v = '(' + v.slice(0, 2) + ') ' + v.slice(2);
    else if (v.length > 0) v = '(' + v;
    return v;
  }
  function formatarTelefoneMultiplo(input) {
    const cursorNoFim = input.selectionEnd === input.value.length;
    const partes = input.value.split('/');
    const formatadas = partes.map(formatarUmTelefone);
    input.value = formatadas.join(' / ');
    if (cursorNoFim) {
      input.selectionStart = input.selectionEnd = input.value.length;
    }
  }

  // ============================================================
  // SEÇÃO: OFÍCIOS E ROTAS
  // ============================================================
  function oficioInadimplencia() {
    try {
      window.open('./OFICIO_INADIMPLENCIA.pdf');
    } catch (e) {
      location.href = './OFICIO_INADIMPLENCIA.pdf';
    }
  }

  // ============================================================
  // BOTÃO "ROTAS" (lista de links nomeados, salvos pelo usuário — quantidade livre)
  // Botão direito: gerenciar (nome + link) das rotas, com botão "Acrescentar rota"
  // Botão esquerdo: abre direto (1 rota) ou pergunta qual abrir (2+ rotas)
  // ============================================================
  const CHAVE_ROTAS_LISTA = 'rotasComplementaresLista';
  const CHAVE_ROTAS_LEGADA = 'linkRotasComplementares';

  function normalizarLinkRotas(valor) {
    let url = (valor || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  function obterRotasLista() {
    let lista = [];
    try {
      const bruto = localStorage.getItem(CHAVE_ROTAS_LISTA);
      if (bruto) lista = JSON.parse(bruto) || [];
    } catch (e) {
      lista = [];
    }
    if (!Array.isArray(lista)) lista = [];
    // Migração do formato antigo (link único, sem nome)
    if (lista.length === 0) {
      const legado = (localStorage.getItem(CHAVE_ROTAS_LEGADA) || '').trim();
      if (legado) {
        lista = [{ nome: 'Rota 1', link: legado }];
        salvarRotasLista(lista);
        localStorage.removeItem(CHAVE_ROTAS_LEGADA);
      }
    }
    return lista;
  }

  function salvarRotasLista(lista) {
    const validas = (lista || []).filter((r) => r && r.link);
    localStorage.setItem(CHAVE_ROTAS_LISTA, JSON.stringify(validas));
  }

  function rotasComplementares() {
    const lista = obterRotasLista();
    if (lista.length === 0) {
      abrirGerenciarRotas();
      return;
    }
    if (lista.length === 1) {
      abrir(lista[0].link);
      return;
    }
    abrirEscolhaRotas(lista);
  }

  function abrirEscolhaRotas(lista) {
    const anterior = document.getElementById('modalEscolhaRotas');
    if (anterior) anterior.remove();
    const overlay = document.createElement('div');
    overlay.id = 'modalEscolhaRotas';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:rgba(0,0,0,.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'animation:fadeInOverlay .15s ease',
    ].join(';');
    const botoesHtml = lista
      .map(
        (r, i) =>
          '<button type="button" data-rota-idx="' +
          i +
          '" style="width:100%;padding:12px 16px;margin-bottom:8px;border:1px solid #ccc;border-radius:6px;background:#f5f8fc;color:#222;font-size:14px;font-weight:600;cursor:pointer;text-align:left;">🔗 ' +
          escaparHtml(r.nome || 'Rota ' + (i + 1)) +
          '</button>'
      )
      .join('');
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:10px;padding:24px 26px;max-width:360px;width:90%;max-height:80vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,.25);font-family:Segoe UI,Arial,sans-serif;">' +
      '<p style="margin:0 0 14px;font-size:15px;color:#222;font-weight:700;">Qual rota deseja abrir?</p>' +
      '<div id="modalEscolhaRotasBotoes">' +
      botoesHtml +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:6px;">' +
      '<button id="modalEscolhaRotasCancelar" type="button" style="padding:7px 16px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;color:#444;font-size:13px;cursor:pointer;">Cancelar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    function fechar() {
      overlay.remove();
    }
    overlay.querySelectorAll('[data-rota-idx]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const idx = Number(btn.getAttribute('data-rota-idx'));
        fechar();
        const rota = lista[idx];
        if (rota && rota.link) abrir(rota.link);
      });
    });
    document.getElementById('modalEscolhaRotasCancelar').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fechar();
    });
  }

  function editarLinkRotas(event) {
    if (event) event.preventDefault();
    abrirGerenciarRotas();
    return false;
  }

  function abrirGerenciarRotas() {
    const anterior = document.getElementById('modalGerenciarRotas');
    if (anterior) anterior.remove();
    let linhas = obterRotasLista().map((r) => ({ nome: r.nome || '', link: r.link || '' }));
    if (linhas.length === 0) linhas.push({ nome: '', link: '' });

    const overlay = document.createElement('div');
    overlay.id = 'modalGerenciarRotas';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:99999',
      'background:rgba(0,0,0,.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'animation:fadeInOverlay .15s ease',
    ].join(';');
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:10px;padding:26px 28px;max-width:440px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.25);font-family:Segoe UI,Arial,sans-serif;max-height:88vh;overflow:auto;">' +
      '<p style="margin:0 0 16px;font-size:16px;color:#222;font-weight:700;">Gerenciar rotas</p>' +
      '<div id="modalGerenciarRotasLista"></div>' +
      '<button id="modalGerenciarRotasAcrescentar" type="button" style="width:100%;padding:9px 12px;margin:4px 0 18px;border:1px dashed #1a6fbf;border-radius:6px;background:#f0f6fc;color:#1a6fbf;font-size:13px;font-weight:700;cursor:pointer;">➕ Acrescentar rota</button>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
      '<button id="modalGerenciarRotasCancelar" type="button" style="padding:8px 18px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;color:#444;font-size:14px;cursor:pointer;">Cancelar</button>' +
      '<button id="modalGerenciarRotasSalvar" type="button" style="padding:8px 18px;border:none;border-radius:6px;background:#1a6fbf;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Salvar</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    const listaEl = document.getElementById('modalGerenciarRotasLista');

    function linhaHtml(idx, nome, link) {
      return (
        '<div class="linha-rota" data-linha="' +
        idx +
        '" style="margin-bottom:14px;padding:10px 12px;border:1px solid #e0e0e0;border-radius:8px;background:#fafbfc;position:relative;">' +
        '<button type="button" class="btn-remover-rota" data-linha="' +
        idx +
        '" title="Remover esta rota" style="position:absolute;top:8px;right:8px;border:none;background:transparent;color:#c0392b;font-size:15px;font-weight:700;cursor:pointer;line-height:1;padding:2px 4px;">✕</button>' +
        '<label style="display:block;font-size:12px;font-weight:700;color:#555;margin-bottom:4px;">Nome</label>' +
        '<input type="text" class="rota-nome" value="' +
        escaparHtml(nome) +
        '" placeholder="Ex.: Rota Centro" style="width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #ccc;border-radius:5px;font-size:13px;margin-bottom:8px;">' +
        '<label style="display:block;font-size:12px;font-weight:700;color:#555;margin-bottom:4px;">Link</label>' +
        '<input type="text" class="rota-link" value="' +
        escaparHtml(link) +
        '" placeholder="https://..." style="width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #ccc;border-radius:5px;font-size:13px;">' +
        '</div>'
      );
    }

    function renderizar() {
      listaEl.innerHTML = linhas.map((r, i) => linhaHtml(i, r.nome, r.link)).join('');
      listaEl.querySelectorAll('.btn-remover-rota').forEach((btn) => {
        btn.addEventListener('click', function () {
          const idx = Number(btn.getAttribute('data-linha'));
          capturarValoresDaTela();
          linhas.splice(idx, 1);
          if (linhas.length === 0) linhas.push({ nome: '', link: '' });
          renderizar();
        });
      });
    }

    function capturarValoresDaTela() {
      const blocos = listaEl.querySelectorAll('.linha-rota');
      blocos.forEach((bloco, i) => {
        const nomeInput = bloco.querySelector('.rota-nome');
        const linkInput = bloco.querySelector('.rota-link');
        if (linhas[i]) {
          linhas[i].nome = nomeInput ? nomeInput.value : linhas[i].nome;
          linhas[i].link = linkInput ? linkInput.value : linhas[i].link;
        }
      });
    }

    renderizar();

    function fechar() {
      overlay.remove();
    }
    document.getElementById('modalGerenciarRotasCancelar').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) fechar();
    });
    document.getElementById('modalGerenciarRotasAcrescentar').addEventListener('click', function () {
      capturarValoresDaTela();
      linhas.push({ nome: '', link: '' });
      renderizar();
      const ultimoInput = listaEl.querySelector('.linha-rota:last-child .rota-nome');
      if (ultimoInput) ultimoInput.focus();
    });
    document.getElementById('modalGerenciarRotasSalvar').addEventListener('click', function () {
      capturarValoresDaTela();
      const novaLista = [];
      linhas.forEach((r, i) => {
        const link = normalizarLinkRotas(r.link);
        if (link) novaLista.push({ nome: (r.nome || '').trim() || 'Rota ' + (novaLista.length + 1), link: link });
      });
      salvarRotasLista(novaLista);
      fechar();
      if (novaLista.length === 0) {
        mostrarToast('Nenhuma rota salva.', 'info');
      } else {
        mostrarToast('Rotas atualizadas!', 'sucesso');
      }
    });
  }
  // ============================================================
  // HISTÓRICO DA SESSÃO
  // ============================================================
  let historicoSessao = [];

  // ============================================================
  // SEÇÃO: HISTÓRICO DE CONSULTAS
  // ============================================================
  function adicionarAoHistorico(cnpj, razao, localizado) {
    const idx = historicoSessao.findIndex((h) => h.cnpj === cnpj);
    if (idx !== -1) historicoSessao.splice(idx, 1);
    historicoSessao.unshift({
      cnpj,
      razao,
      localizado,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    });
    if (historicoSessao.length > 30) historicoSessao.pop();
    renderizarHistorico();
  }
  function renderizarHistorico() {
    const painel = document.getElementById('painelHistorico');
    const lista = document.getElementById('listaHistorico');
    if (!painel || !lista) return;
    if (!historicoSessao.length) {
      painel.style.display = 'none';
      return;
    }
    painel.style.display = '';
    lista.innerHTML = '';
    historicoSessao.forEach((h) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      const cor = h.localizado ? '#0d2f6e' : '#7b0000';
      const bg = h.localizado ? '#cce4ff' : '#ffe5e5';
      const borda = h.localizado ? '#2e5e9e' : '#c0392b';
      btn.style.cssText =
        'padding:3px 8px;border:1px solid ' +
        borda +
        ';border-radius:4px;background:' +
        bg +
        ';color:' +
        cor +
        ';font-size:11px;font-weight:bold;cursor:pointer;font-family:monospace;white-space:nowrap;';
      btn.title =
        (h.razao || 'Razão social não localizada') + ' — ' + h.hora + (h.localizado ? '' : ' — Não localizado');
      btn.textContent = formatarCNPJTexto(h.cnpj);
      btn.onclick = () => {
        const idx = listaCNPJsAtual.indexOf(h.cnpj);
        if (idx !== -1) {
          const paginaAlvo = Math.floor(idx / ITENS_POR_PAGINA_CNPJ) + 1;
          if (paginaAlvo !== paginaAtualCNPJ) {
            paginaAtualCNPJ = paginaAlvo;
            renderizarPaginaCNPJs();
          }
        }
        const btnGrade = document.querySelector('#listaCNPJs button[data-cnpj="' + h.cnpj + '"]');
        if (btnGrade) {
          selecionarCNPJDaLista(btnGrade, h.cnpj);
          btnGrade.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
          document.getElementById('cnpj').value = formatarCNPJTexto(h.cnpj);
          mostrarDadosEmpresa(h.cnpj);
        }
      };
      li.appendChild(btn);
      lista.appendChild(li);
    });
  }
  function limparHistorico() {
    historicoSessao = [];
    renderizarHistorico();
    mostrarToast('Histórico limpo.', 'info');
  }

  document.addEventListener('DOMContentLoaded', function () {
    const elServidor = document.getElementById('msg-global-servidor');
    const elTelefone = document.getElementById('msg-global-telefone');
    if (elServidor && !elServidor.value) elServidor.value = SERVIDOR_PADRAO;
    if (elTelefone && !elTelefone.value) elTelefone.value = TELEFONE_PADRAO;
    inicializarBotaoTema();
    const idsCamposFicha = [
      'fe-razao-social',
      'fe-cnpj',
      'fe-telefone',
      'fe-email',
      'fe-cep',
      'fe-logradouro',
      'fe-municipio',
      'fe-contato',
    ];
    idsCamposFicha.forEach(function (id) {
      const campo = document.getElementById(id);
      if (campo) {
        campo.addEventListener('input', atualizarValorPesquisaCoringa);
      }
    });
    atualizarValorPesquisaCoringa();
    aplicarEstadoPendenteEmTodosOsCampos();
    carregarDadosImportados();
    atualizarRelogioPainel();
    setInterval(atualizarRelogioPainel, 1000);
    document.addEventListener('keydown', function (e) {
      if (
        e.target &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')
      )
        return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const botoesVisiveis = Array.from(
        document.querySelectorAll(
          '#listaCNPJs li:not([style*="display: none"]) button, #listaCNPJs li:not([style*="display:none"]) button',
        ),
      );
      if (!botoesVisiveis.length) return;
      e.preventDefault();
      const atual = document.querySelector('#listaCNPJs button.selecionado');
      let idxAtual = atual ? botoesVisiveis.indexOf(atual) : -1;
      let idxNovo = e.key === 'ArrowDown' ? idxAtual + 1 : idxAtual - 1;
      if (idxNovo < 0) idxNovo = 0;
      if (idxNovo >= botoesVisiveis.length) idxNovo = botoesVisiveis.length - 1;
      const btnAlvo = botoesVisiveis[idxNovo];
      if (btnAlvo && btnAlvo !== atual) {
        selecionarCNPJDaLista(btnAlvo, btnAlvo.dataset.cnpj);
        btnAlvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  });
  let sipeaDados = {
    ligacoes: [],
    emails: [],
    whatsapp: [],
    rais: [],
    caixa: [],
    empresa: [],
    internet: [],
    visitas: { 1: [], 2: [], 3: [], 4: [] },
  };


  // ============================================================
  // SEÇÃO: SIPEA — formatação e preenchimento dos campos da conversa
  // ============================================================
  function sipeaSomenteNumeros(input, maxLen) {
    let v = input.value.replace(/\D/g, '');
    if (maxLen && v.length > maxLen) v = v.slice(0, maxLen);
    input.value = v;
  }

  function sipeaLowercase(input) {
    const inicioSel = input.selectionStart,
      fimSel = input.selectionEnd;
    input.value = input.value.toLowerCase();
    try {
      input.setSelectionRange(inicioSel, fimSel);
    } catch (e) {}
  }

  function sipeaFormatarAnos(input) {
    let digitos = input.value.replace(/\D/g, '');
    if (digitos.length > 16) digitos = digitos.slice(0, 16);
    const partes = [];
    for (let i = 0; i < digitos.length; i += 4) {
      partes.push(digitos.slice(i, i + 4));
    }
    input.value = partes.join('/ ');
  }

  function sipeaFormatarEmail(input) {
    const inicioSel = input.selectionStart,
      fimSel = input.selectionEnd;
    let v = input.value.toLowerCase();
    v = v.replace(/,/g, ';');
    v = v.replace(/\s*;\s*/g, '; ');
    input.value = v;
    try {
      input.setSelectionRange(inicioSel, fimSel);
    } catch (e) {}
  }

  function sipeaFormatarData(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length >= 5) v = v.replace(/^(\d{2})(\d{2})(\d{1,4})$/, '$1/$2/$3');
    else if (v.length >= 3) v = v.replace(/^(\d{2})(\d{1,2})$/, '$1/$2');
    input.value = v;
  }

  function sipeaToggleWppResposta(sel) {
    const wrap = document.getElementById('sipea-wpp-resposta-wrap');
    wrap.style.display = sel.value === 'obtive a resposta:' ? 'inline-flex' : 'none';
  }

  function sipeaToggleLigacaoContato(sel) {
    const wrap = document.getElementById('sipea-lig-contato-wrap');
    const campo = document.getElementById('sipea-lig-contato');
    if (sel.value === 'Consegui contato') {
      wrap.style.display = 'inline-flex';
      if (!campo.value.trim()) campo.value = 'Falei com ';
    } else {
      wrap.style.display = 'none';
    }
  }

  function sipeaToggleEmpresaAnos(sel) {
    document.getElementById('sipea-empresa-anos-wrap').style.display = sel.value === 'SIM' ? 'flex' : 'none';
  }

  function sipeaToggleEmpresaTipo(sel) {
    document.getElementById('sipea-empresa-fac-wrap').style.display = sel.value === 'FAC' ? 'inline-flex' : 'none';
    document.getElementById('sipea-empresa-data-wrap').style.display =
      sel.value === 'COLETADA' ? 'inline-flex' : 'none';
  }

  function sipeaIncluirLigacao() {
    const tel = document.getElementById('sipea-lig-telefone').value.trim();
    const status = document.getElementById('sipea-lig-status').value;
    if (!tel) {
      mostrarToast('Informe o telefone antes de incluir.', 'aviso');
      return;
    }
    let texto = tel + ' – ' + status;
    if (status === 'Consegui contato') {
      const tipoContato = document.getElementById('sipea-lig-tipo-contato').value;
      const contato = document.getElementById('sipea-lig-contato').value.trim();
      const prefixoTipo = tipoContato ? tipoContato + ' – ' : '';
      texto = contato ? tel + ' – ' + prefixoTipo + contato : tel + ' – ' + prefixoTipo + 'Consegui contato';
    }
    sipeaDados.ligacoes.push(texto);
    document.getElementById('sipea-lig-telefone').value = '';
    sipeaAtualizarObs();
    mostrarToast('Ligação incluída em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirEmail() {
    const email = document.getElementById('sipea-email-valor').value.trim().toLowerCase().replace(/;\s*$/, '');
    const status = document.getElementById('sipea-email-status').value;
    if (!email) {
      mostrarToast('Informe o e-mail antes de incluir.', 'aviso');
      return;
    }
    sipeaDados.emails.push(email + ' – ' + status);
    document.getElementById('sipea-email-valor').value = '';
    sipeaAtualizarObs();
    mostrarToast('E-mail incluído em OBS SIPEA.', 'sucesso');
  }

  function sipeaLimparLigacao() {
    limparCampos(['sipea-lig-telefone']);
    document.getElementById('sipea-lig-status').selectedIndex = 0;
    document.getElementById('sipea-lig-tipo-contato').selectedIndex = 0;
    document.getElementById('sipea-lig-contato').value = 'Falei com ';
    document.getElementById('sipea-lig-contato-wrap').style.display = 'none';
  }

  function sipeaLimparEmail() {
    limparCampos(['sipea-email-valor']);
    document.getElementById('sipea-email-status').selectedIndex = 0;
  }

  function sipeaIncluirWhatsapp() {
    const tel = document.getElementById('sipea-wpp-telefone').value.trim();
    const status = document.getElementById('sipea-wpp-status').value;
    if (!tel) {
      mostrarToast('Informe o número antes de incluir.', 'aviso');
      return;
    }
    let texto = tel + ' – ' + status;
    if (status === 'obtive a resposta:') {
      const resposta = document.getElementById('sipea-wpp-resposta').value.trim();
      if (resposta) texto += ' ' + resposta;
    }
    sipeaDados.whatsapp.push(texto);
    document.getElementById('sipea-wpp-telefone').value = '';
    document.getElementById('sipea-wpp-resposta').value = '';
    sipeaAtualizarObs();
    mostrarToast('WhatsApp incluído em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirRais() {
    const ano = document.getElementById('sipea-rais-ano').value.trim();
    const po = document.getElementById('sipea-rais-po').value.trim();
    const sal = document.getElementById('sipea-rais-salarios').value;
    const tel = document.getElementById('sipea-rais-telefone').value.trim();
    const email = document.getElementById('sipea-rais-email').value.trim().toLowerCase();
    const end = document.getElementById('sipea-rais-endereco').value.trim();
    if (!ano && !po && !tel && !email && !end) {
      mostrarToast('Preencha ao menos um campo do RAIS antes de incluir.', 'aviso');
      return;
    }
    const partes = [];
    if (ano) partes.push('Ano: ' + ano);
    if (po) partes.push('PO: ' + po);
    if (sal) partes.push(sal);
    if (tel) partes.push('Telefone: ' + tel);
    if (email) partes.push('e-mail: ' + email);
    if (end) partes.push('Endereço: ' + end);
    sipeaDados.rais.push(partes.join(' | '));
    limparCampos(['sipea-rais-ano', 'sipea-rais-po', 'sipea-rais-telefone', 'sipea-rais-email', 'sipea-rais-endereco']);
    sipeaAtualizarObs();
    mostrarToast('RAIS incluído em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirCaixa() {
    const end = document.getElementById('sipea-caixa-endereco').value.trim();
    if (!end) {
      mostrarToast('Informe o endereço antes de incluir.', 'aviso');
      return;
    }
    sipeaDados.caixa.push(end);
    document.getElementById('sipea-caixa-endereco').value = '';
    sipeaAtualizarObs();
    mostrarToast('Consulta Caixa incluída em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirEmpresa() {
    const selecionada = document.getElementById('sipea-empresa-selecionada').value;
    if (!selecionada) {
      mostrarToast('Selecione uma opção antes de incluir.', 'aviso');
      return;
    }
    let texto = selecionada;
    if (selecionada === 'SIM') {
      const anos = document.getElementById('sipea-empresa-anos').value.trim();
      const tipo = document.getElementById('sipea-empresa-tipo').value;
      if (anos) texto += ' – anos: ' + anos;
      if (tipo === 'FAC') {
        const fac = document.getElementById('sipea-empresa-fac').value;
        texto += ' – FAC ' + fac;
      } else if (tipo === 'COLETADA') {
        const data = document.getElementById('sipea-empresa-data').value.trim();
        if (data) texto += ' – Coletada em ' + data;
      }
    }
    sipeaDados.empresa.push(texto);
    document.getElementById('sipea-empresa-anos').value = '';
    document.getElementById('sipea-empresa-data').value = '';
    sipeaAtualizarObs();
    mostrarToast('Consulta Empresa incluída em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirInternet() {
    const texto = document.getElementById('sipea-internet-texto').value.trim();
    if (!texto) {
      mostrarToast('Preencha o campo antes de incluir.', 'aviso');
      return;
    }
    sipeaDados.internet.push(texto);
    document.getElementById('sipea-internet-texto').value = '';
    sipeaAtualizarObs();
    mostrarToast('Consulta Internet incluída em OBS SIPEA.', 'sucesso');
  }

  function sipeaIncluirVisita() {
    const num = document.getElementById('sipea-visita-num').value;
    const end = document.getElementById('sipea-visita-endereco').value.trim();
    const data = document.getElementById('sipea-visita-data').value.trim();
    const obs = document.getElementById('sipea-visita-obs').value.trim();
    if (!end || !data) {
      mostrarToast('Informe o endereço e a data da visita antes de incluir.', 'aviso');
      return;
    }
    let texto = 'Visita presencial à empresa no endereço ' + end + ', na data ' + data + '.';
    if (obs) texto += ' ' + obs;
    sipeaDados.visitas[num].push(texto);
    document.getElementById('sipea-visita-endereco').value = '';
    document.getElementById('sipea-visita-data').value = '';
    document.getElementById('sipea-visita-obs').value = '';
    sipeaAtualizarObs();
    mostrarToast('Visita presencial incluída em OBS SIPEA.', 'sucesso');
  }

  function sipeaLimparWhatsapp() {
    limparCampos(['sipea-wpp-telefone', 'sipea-wpp-resposta']);
    document.getElementById('sipea-wpp-status').selectedIndex = 0;
    document.getElementById('sipea-wpp-resposta-wrap').style.display = 'none';
  }

  function sipeaLimparRais() {
    limparCampos(['sipea-rais-ano', 'sipea-rais-po', 'sipea-rais-telefone', 'sipea-rais-email', 'sipea-rais-endereco']);
    document.getElementById('sipea-rais-salarios').selectedIndex = 0;
  }

  function sipeaLimparCaixa() {
    limparCampos(['sipea-caixa-endereco']);
  }

  function sipeaLimparEmpresa() {
    document.getElementById('sipea-empresa-selecionada').selectedIndex = 0;
    limparCampos(['sipea-empresa-anos', 'sipea-empresa-data']);
    document.getElementById('sipea-empresa-tipo').selectedIndex = 0;
    document.getElementById('sipea-empresa-fac').selectedIndex = 0;
    document.getElementById('sipea-empresa-anos-wrap').style.display = 'none';
    document.getElementById('sipea-empresa-fac-wrap').style.display = 'none';
    document.getElementById('sipea-empresa-data-wrap').style.display = 'none';
  }

  function sipeaLimparInternet() {
    limparCampos(['sipea-internet-texto']);
  }

  function sipeaLimparVisita() {
    document.getElementById('sipea-visita-num').selectedIndex = 0;
    limparCampos(['sipea-visita-endereco', 'sipea-visita-data', 'sipea-visita-obs']);
  }

  function sipeaAtualizarObs() {
    const linhas = [];
    const addLinha = function (rotulo, valores, separador, chaveCopiar) {
      if (valores && valores.length)
        linhas.push({ rotulo: rotulo, valor: valores.join(separador || '\n'), chaveCopiar: chaveCopiar || null });
    };
    addLinha('Telefones:', sipeaDados.ligacoes, ' / ', 'ligacoes');
    addLinha('e-mail:', sipeaDados.emails, ' / ', 'emails');
    addLinha('Wpp.:', sipeaDados.whatsapp, ' / ', 'whatsapp');
    addLinha('RAIS:', sipeaDados.rais, ' / ', 'rais');
    addLinha('Consulta Caixa – endereço:', sipeaDados.caixa, ' / ', 'caixa');
    addLinha('Consulta Empresa:', sipeaDados.empresa, ' / ', 'empresa');
    addLinha('Consulta Internet:', sipeaDados.internet, undefined, 'internet');
    const rotulosVisita = { 1: 'VISITA 1:', 2: 'VISITA 2:', 3: 'VISITA 3:', 4: 'VISITA 4:' };
    [1, 2, 3, 4].forEach(function (n) {
      addLinha(rotulosVisita[n], sipeaDados.visitas[n], undefined, 'visitas.' + n);
    });
    const container = document.getElementById('sipeaObsSaida');
    if (!linhas.length) {
      container.innerHTML = '<div class="sipea-obs-vazio">Nenhuma observação incluída ainda.</div>';
      return;
    }
    container.innerHTML = linhas
      .map(function (l) {
        const botaoCopiar = l.chaveCopiar
          ? '<button type="button" class="sipea-obs-btn-copiar" onclick="sipeaCopiarCampo(\'' +
            l.chaveCopiar +
            '\',\'' +
            escaparHtml(l.rotulo.replace(/:$/, '')) +
            '\')">Copiar</button>'
          : '';
        return (
          '<div class="sipea-obs-linha"><span class="sipea-obs-rotulo">' +
          escaparHtml(l.rotulo) +
          '</span><span class="sipea-obs-valor">' +
          escaparHtmlPreservandoQuebras(l.valor) +
          '</span>' +
          botaoCopiar +
          '</div>'
        );
      })
      .join('');
  }

  function sipeaAtualizar() {
    sipeaAtualizarObs();
    mostrarToast('OBS SIPEA atualizado.', 'info');
  }

  function sipeaMontarTextoCompleto() {
    const partes = [];
    const addTexto = function (rotulo, valores) {
      if (valores && valores.length) partes.push(rotulo + ' ' + valores.join(' / '));
    };
    addTexto('Telefones:', sipeaDados.ligacoes);
    addTexto('e-mail:', sipeaDados.emails);
    addTexto('Wpp.:', sipeaDados.whatsapp);
    addTexto('RAIS:', sipeaDados.rais);
    addTexto('Consulta Caixa – endereço:', sipeaDados.caixa);
    addTexto('Consulta Empresa:', sipeaDados.empresa);
    addTexto('Consulta Internet:', sipeaDados.internet);
    const rotulosVisita = { 1: 'VISITA 1:', 2: 'VISITA 2:', 3: 'VISITA 3:', 4: 'VISITA 4:' };
    [1, 2, 3, 4].forEach(function (n) {
      addTexto(rotulosVisita[n], sipeaDados.visitas[n]);
    });
    const livre = document.getElementById('sipeaTextoLivre').value.trim();
    let texto = partes.join('\n');
    if (livre) texto += (texto ? '\n\n' : '') + livre;
    return texto;
  }

  function sipeaCopiar() {
    const texto = sipeaMontarTextoCompleto();
    if (!texto.trim()) {
      mostrarToast('Nada para copiar ainda.', 'aviso');
      return;
    }
    navigator.clipboard
      .writeText(texto)
      .then(function () {
        mostrarToast('OBS SIPEA copiado.', 'sucesso');
      })
      .catch(function () {
        mostrarToast('Não foi possível copiar.', 'aviso');
      });
  }

  function sipeaCopiarCampo(chave, rotulo) {
    let valores;
    if (chave.indexOf('.') !== -1) {
      const partes = chave.split('.');
      valores = sipeaDados[partes[0]] && sipeaDados[partes[0]][partes[1]];
    } else {
      valores = sipeaDados[chave];
    }
    if (!valores || !valores.length) {
      mostrarToast('Nada para copiar em ' + rotulo + '.', 'aviso');
      return;
    }
    const texto = valores.join(' / ');
    navigator.clipboard
      .writeText(texto)
      .then(function () {
        mostrarToast(rotulo + ' copiado.', 'sucesso');
      })
      .catch(function () {
        mostrarToast('Não foi possível copiar.', 'aviso');
      });
  }

  function sipeaLimparTudo() {
    mostrarConfirm(
      'Tem certeza que deseja limpar todas as observações do SIPEA? Esta ação não pode ser desfeita.',
      function () {
        sipeaDados = {
          ligacoes: [],
          emails: [],
          whatsapp: [],
          rais: [],
          caixa: [],
          empresa: [],
          internet: [],
          visitas: { 1: [], 2: [], 3: [], 4: [] },
        };
        document.getElementById('sipeaTextoLivre').value = '';
        sipeaLimparLigacao();
        sipeaLimparEmail();
        sipeaLimparWhatsapp();
        sipeaLimparRais();
        sipeaLimparCaixa();
        sipeaLimparEmpresa();
        sipeaLimparInternet();
        sipeaLimparVisita();
        sipeaAtualizarObs();
        mostrarToast('OBS SIPEA limpo.', 'sucesso');
      },
    );
  }

  console.log('✅ Painel de Consultas Empresariais carregado com sucesso!');

  // Expõe no escopo global apenas as funções chamadas pelos atributos inline do HTML (onclick/oninput/onchange/onblur).
  // Todo o restante (variáveis de estado, helpers internos) permanece isolado dentro deste IIFE.

  // ============================================================
  // SEÇÃO: EXPOSIÇÃO DE FUNÇÕES PARA OS onclick DO HTML
  // (necessário pois todo o código está dentro de uma IIFE)
  // ============================================================
  const Painel = {
    alternarTema: alternarTema,
    atualizarContabTipo: atualizarContabTipo,
    atualizarEstadoCampoPendente: atualizarEstadoCampoPendente,
    atualizarTextoMensagem: atualizarTextoMensagem,
    caixa: caixa,
    checklist: checklist,
    cnpja: cnpja,
    cnpjbiz: cnpjbiz,
    cnpjcheck: cnpjcheck,
    cnpjAberto: cnpjAberto,
    copiarCNPJ: copiarCNPJ,
    copiarFichaEmpresa: copiarFichaEmpresa,
    copiarMensagem: copiarMensagem,
    consultarBaseRFB: consultarBaseRFB,
    certidaoIBGE: certidaoIBGE,
    mapaAgencias: mapaAgencias,
    correios: correios,
    oficioCorreios: oficioCorreios,
    cronogramaEconomicas: cronogramaEconomicas,
    escalaServidores: escalaServidores,
    protocoloOcorrencias: protocoloOcorrencias,
    devedorUniao: devedorUniao,
    driveIBGE: driveIBGE,
    econodata: econodata,
    emailIBGE: emailIBGE,
    formatarCNPJ: formatarCNPJ,
    formatarTelefoneMultiplo: formatarTelefoneMultiplo,
    oficioInadimplencia: oficioInadimplencia,
    in2119RFB: in2119RFB,
    importarPlanilha: importarPlanilha,
    irParaPaginaCNPJ: irParaPaginaCNPJ,
    limparFicha: limparFicha,
    limparHistorico: limparHistorico,
    limparPlanilhaImportada: limparPlanilhaImportada,
    mostrarConfirm: mostrarConfirm,
    mostrarToast: mostrarToast,
    onFiltroTipoCNPJChange: onFiltroTipoCNPJChange,
    aplicarFiltroCNPJs: aplicarFiltroCNPJs,
    aplicarFiltroStatusSecundarioCNPJ: aplicarFiltroStatusSecundarioCNPJ,
    ndFormatarCEP: ndFormatarCEP,
    ndFormatarCNPJ: ndFormatarCNPJ,
    ndFormatarTelefone: ndFormatarTelefone,
    ndMascara: ndMascara,
    ndTecla: ndTecla,
    ndIncluir: ndIncluir,
    ndLimpar: ndLimpar,
    ndCopiar: ndCopiar,
    parecerAGU: parecerAGU,
    pesquisaCNAE: pesquisaCNAE,
    pesquisarCNPJRapido: pesquisarCNPJRapido,
    portalweb1: portalweb1,
    portalweb2: portalweb2,
    proximaPaginaCNPJ: proximaPaginaCNPJ,
    questionarios: questionarios,
    raizlegal: raizlegal,
    receita: receita,
    regularize: regularize,
    rotasComplementares: rotasComplementares,
    editarLinkRotas: editarLinkRotas,
    selecionarCampoPesquisaCoringa: selecionarCampoPesquisaCoringa,
    selecionarTipoMensagem: selecionarTipoMensagem,
    sintegra: sintegra,
    sipeaAtualizar: sipeaAtualizar,
    sipeaCopiar: sipeaCopiar,
    sipeaCopiarCampo: sipeaCopiarCampo,
    sipeaFormatarAnos: sipeaFormatarAnos,
    sipeaFormatarData: sipeaFormatarData,
    sipeaFormatarEmail: sipeaFormatarEmail,
    sipeaIncluirCaixa: sipeaIncluirCaixa,
    sipeaIncluirEmail: sipeaIncluirEmail,
    sipeaIncluirEmpresa: sipeaIncluirEmpresa,
    sipeaIncluirInternet: sipeaIncluirInternet,
    sipeaIncluirLigacao: sipeaIncluirLigacao,
    sipeaIncluirRais: sipeaIncluirRais,
    sipeaIncluirVisita: sipeaIncluirVisita,
    sipeaIncluirWhatsapp: sipeaIncluirWhatsapp,
    sipeaLimparCaixa: sipeaLimparCaixa,
    sipeaLimparEmail: sipeaLimparEmail,
    sipeaLimparEmpresa: sipeaLimparEmpresa,
    sipeaLimparInternet: sipeaLimparInternet,
    sipeaLimparLigacao: sipeaLimparLigacao,
    sipeaLimparRais: sipeaLimparRais,
    sipeaLimparTudo: sipeaLimparTudo,
    sipeaLimparVisita: sipeaLimparVisita,
    sipeaLimparWhatsapp: sipeaLimparWhatsapp,
    sipeaLowercase: sipeaLowercase,
    sipeaSomenteNumeros: sipeaSomenteNumeros,
    sipeaToggleEmpresaAnos: sipeaToggleEmpresaAnos,
    sipeaToggleEmpresaTipo: sipeaToggleEmpresaTipo,
    sipeaToggleLigacaoContato: sipeaToggleLigacaoContato,
    sipeaToggleWppResposta: sipeaToggleWppResposta,
    validarFormatoCampo: validarFormatoCampo,
    whois: whois,
    alternarMenuConsultarCnpj: alternarMenuConsultarCnpj,
  };
  window.Painel = Painel;
  Object.assign(window, Painel);
})();
