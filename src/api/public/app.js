const byId = id => document.getElementById(id);
const state = { data: null, page: 'overview', methods: [], mercadoPago: null, commerce: null, roles: [], config: null };
const pageTitles = { overview: 'Visão geral', services: 'Serviços', automations: 'Automações', channels: 'Canais', config: 'Configuração', store: 'Loja', payments: 'Pagamentos' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function notice(message, error = false) {
  const element = byId('notice');
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
  if (message) window.setTimeout(() => { if (element.textContent === message) element.hidden = true; }, 6000);
}

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers ?? {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/painel/login') showLogin();
    throw new Error(data?.erro || `Falha HTTP ${response.status}`);
  }
  return data;
}

function showLogin(message = '') {
  byId('login').hidden = false;
  byId('app').hidden = true;
  byId('login-error').textContent = message;
  byId('password').value = '';
}

function showApp() {
  byId('login').hidden = true;
  byId('app').hidden = false;
}

function badge(text, kind = '') { return `<span class="badge ${kind}">${escapeHtml(text)}</span>`; }
function statusBadge(active, operational, configured = true) {
  if (!active) return badge('Inativo');
  if (!configured) return badge('Requer atenção', 'warn');
  return operational ? badge('Operante', 'ok') : badge('Ativo · requer atenção', 'warn');
}

function renderOverview(data) {
  const services = Object.entries(data.services);
  const healthy = services.filter(([, item]) => item.operational).length;
  const activeAutomations = data.automations.filter(item => item.active).length;
  const problematic = data.automations.filter(item => item.active && !item.ready);
  byId('content').innerHTML = `
    <div class="grid">
      <article class="card"><h2>Conexão Discord</h2><div class="metric">${data.bot.ready ? 'Online' : 'Offline'}</div>${badge(data.bot.ready ? `${data.bot.pingMs} ms` : 'Sem conexão', data.bot.ready ? 'ok' : 'bad')}<p class="detail">Tempo ligado: ${escapeHtml(formatUptime(data.bot.uptimeSeconds))}</p></article>
      <article class="card"><h2>Saúde dos serviços</h2><div class="metric">${healthy}/${services.length}</div><p class="detail">Serviços em condição operacional.</p></article>
      <article class="card"><h2>Automações</h2><div class="metric">${activeAutomations}/${data.automations.length}</div><p class="detail">Ativas no momento.</p></article>
      <article class="card"><h2>Pagamentos</h2><div class="metric">${data.payments.active} ativos</div><p class="detail">${data.payments.inactive} inativos · configuração protegida</p></article>
    </div>
    <div class="section-head"><h2>Serviços principais</h2></div>
    <div class="grid two">${services.map(([key, item]) => `<article class="card"><div class="status-line"><span class="status-icon">${item.operational ? '🟢' : item.active ? '🟠' : '⚪'}</span><div><h3>${escapeHtml(serviceName(key))}</h3>${statusBadge(item.active, item.operational, item.configured !== false)}<p class="detail">${escapeHtml(item.detail)}</p></div></div></article>`).join('')}</div>
    <div class="section-head"><h2>Precisa de atenção</h2></div>
    <div class="grid two">${problematic.length ? problematic.map(item => `<article class="card"><h3>${escapeHtml(item.label)}</h3>${badge('Ativa · não operante', 'warn')}<p class="detail">${escapeHtml(item.detail)}</p></article>`).join('') : '<div class="card"><p class="detail">Nenhuma automação ativa com dependências faltando.</p></div>'}</div>`;
}

function serviceName(key) { return ({ discord: 'Gateway Discord', api: 'API e painel web', gemini: 'Atendimento Gemini', ticketCreation: 'Criação de tickets' })[key] ?? key; }
function formatUptime(seconds) { const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60); return `${d}d ${h}h ${m}min`; }

function renderServices(data) {
  byId('content').innerHTML = `<div class="grid two">${Object.entries(data.services).map(([key, item]) => `<article class="card"><p class="eyebrow">SERVIÇO</p><h2>${escapeHtml(serviceName(key))}</h2>${statusBadge(item.active, item.operational, item.configured !== false)}<p class="detail">${escapeHtml(item.detail)}</p>${key === 'api' ? `<p class="detail">Porta atual: ${escapeHtml(item.port)}</p>` : ''}${key === 'discord' ? `<p class="detail">Bot: ${escapeHtml(data.bot.tag)} · memória: ${data.bot.memoryMb} MB</p>` : ''}</article>`).join('')}</div>
    <div class="section-head"><h2>Recursos locais</h2></div><div class="grid two"><article class="card"><h3>Wallpapers</h3>${badge(data.assets.wallpaper.exists ? 'Arquivo pronto' : 'Arquivo ausente', data.assets.wallpaper.exists ? 'ok' : 'warn')}<p class="detail">Próximo arquivo: dia ${data.assets.wallpaper.nextDay}</p></article><article class="card"><h3>Armazéns</h3>${badge(data.assets.stock.ctzFiles && data.assets.stock.boostersFiles ? 'Arquivos encontrados' : 'Arquivos ausentes', data.assets.stock.ctzFiles && data.assets.stock.boostersFiles ? 'ok' : 'warn')}<p class="detail">CTZ #${data.assets.stock.ctzItem}: ${data.assets.stock.ctzFiles} arquivo(s) · Boosters #${data.assets.stock.boostersItem}: ${data.assets.stock.boostersFiles} arquivo(s)</p></article></div>`;
}

function renderAutomations(data) {
  byId('content').innerHTML = `<div class="grid two">${data.automations.map(item => `<article class="card"><div class="section-head"><h2>${escapeHtml(item.label)}</h2>${statusBadge(item.active, item.operational)}</div><p class="detail">${escapeHtml(item.detail)}</p><button class="${item.active ? 'secondary' : 'primary'} automation-toggle" data-key="${escapeHtml(item.key)}" data-active="${item.active}">${item.active ? 'Pausar automação' : 'Ativar automação'}</button></article>`).join('')}</div>`;
  document.querySelectorAll('.automation-toggle').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await request(`/api/painel/automations/${encodeURIComponent(button.dataset.key)}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active !== 'true' }) }); await refresh(); notice('Estado da automação atualizado.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
}

function renderChannels(data) {
  byId('content').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Canal</th><th>Configuração</th><th>Permissão do bot</th><th>Estado</th></tr></thead><tbody>${data.channels.map(channel => `<tr><td><strong>${escapeHtml(channel.label)}</strong><div class="detail">${escapeHtml(channel.name ?? '—')}</div></td><td>${channel.id ? `<code>${escapeHtml(channel.id)}</code>` : 'Não configurado'}</td><td>${channel.canView ? 'Ver' : 'Sem leitura'} · ${channel.canSend ? 'Enviar' : 'Sem envio'}</td><td>${channel.operational ? badge('Operante', 'ok') : channel.found ? badge('Permissão ausente', 'warn') : badge('Não encontrado', 'bad')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderConfig() {
  const config = state.config;
  if (!config) { byId('content').innerHTML = '<div class="card">Carregando configurações…</div>'; return; }
  const channelLabels = Object.fromEntries((state.data.channels ?? []).map(channel => [channel.key, channel.label]));
  const selectFor = (key, id) => {
    const category = key === 'supportCategory';
    const options = config.availableChannels.filter(channel => category ? channel.type === 'category' : channel.type === 'text');
    return `<div class="config-channel"><label>${escapeHtml(channelLabels[key] ?? key)}</label><select name="channel:${escapeHtml(key)}"><option value="">Desativado</option>${options.map(channel => `<option value="${escapeHtml(channel.id)}" ${id === channel.id ? 'selected' : ''}>#${escapeHtml(channel.name)}</option>`).join('')}</select></div>`;
  };
  byId('content').innerHTML = `<form id="config-form">
    <div class="section-head"><div><h2>Rotinas e fuso horário</h2><p class="detail">As alterações valem para os próximos ciclos do bot.</p></div></div>
    <section class="card"><div class="form-grid three"><div><label for="config-timezone">Fuso IANA</label><input id="config-timezone" name="timezone" value="${escapeHtml(config.timezone)}" placeholder="America/Sao_Paulo" required></div><div><label for="config-hours">Horários dos avisos</label><input id="config-hours" name="hours" value="${config.announcementHours.join(', ')}" placeholder="9, 15, 21" required><p class="detail">Horas inteiras de 0 a 23, separadas por vírgula.</p></div><div class="toggle-card"><label for="config-mentions">Permitir @everyone automático</label><input id="config-mentions" name="mentions" type="checkbox" ${config.everyoneMentions ? 'checked' : ''}><p class="detail">Controla menções enviadas pelas rotinas automáticas.</p></div></div></section>
    <div class="section-head"><div><h2>Canais do servidor</h2><p class="detail">Escolha um canal compatível ou selecione “Desativado”.</p></div></div>
    <section class="card config-channels">${Object.entries(config.channels).map(([key, id]) => selectFor(key, id)).join('')}</section>
    <div class="section-head"><button class="primary" type="submit">Salvar configurações</button></div>
  </form>`;
  byId('config-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const hoursRaw = form.elements.hours.value.split(',').map(value => value.trim()).filter(Boolean);
    if (!hoursRaw.length || hoursRaw.some(value => !/^\d{1,2}$/.test(value))) return notice('Informe horários como 9, 15, 21.', true);
    const channels = Object.fromEntries([...form.querySelectorAll('[name^="channel:"]')].map(select => [select.name.slice(8), select.value || null]));
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await request('/api/painel/config', { method: 'PUT', body: JSON.stringify({ timezone: form.elements.timezone.value.trim(), announcementHours: hoursRaw.map(Number), everyoneMentions: form.elements.mentions.checked, channels }) });
      const [status, updated] = await Promise.all([request('/api/painel/status'), request('/api/painel/config')]);
      state.data = status; state.config = updated;
      render(); notice('Configurações gerais salvas.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  });
}

function money(cents) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100); }
function fromMoney(value) { return Math.round(Number(String(value).replace(',', '.')) * 100); }

function renderStore() {
  const data = state.commerce;
  if (!data) { byId('content').innerHTML = '<div class="card">Carregando configurações da loja…</div>'; return; }
  const storeAutomations = state.data.automations.filter(item => item.key.startsWith('store_'));
  const pending = data.orders.filter(order => ['pending', 'awaiting_manual_confirmation'].includes(order.status));
  const paid = data.orders.filter(order => order.paidAt);
  const revenue = paid.reduce((sum, order) => sum + order.amountCents, 0);
  const currentStoreChannel = data.storefront.channelId || state.config?.channels?.purchaseStatus || '';
  byId('content').innerHTML = `
    <div class="grid">
      <article class="card"><h2>Pedidos pagos</h2><div class="metric">${paid.length}</div><p class="detail">No histórico carregado.</p></article>
      <article class="card"><h2>Aguardando pagamento</h2><div class="metric">${pending.length}</div><p class="detail">Pedidos que ainda precisam de conferência.</p></article>
      <article class="card"><h2>Faturamento registrado</h2><div class="metric small">${escapeHtml(money(revenue))}</div><p class="detail">Soma dos pedidos com pagamento confirmado.</p></article>
      <article class="card"><h2>Mercado Pago</h2>${badge(data.mercadoPagoReady ? 'Credenciais prontas' : 'Configuração pendente', data.mercadoPagoReady ? 'ok' : 'warn')}<p class="detail">Access Token e assinatura continuam protegidos no arquivo .env do servidor.</p></article>
    </div>
    <div class="section-head"><div><h2>Automações comerciais</h2><p class="detail">As novas automações começam desligadas.</p></div></div>
    <div class="grid two">${storeAutomations.map(item => `<article class="card"><div class="section-head"><h2>${escapeHtml(item.label.replace('Loja · ', ''))}</h2>${statusBadge(item.active, item.operational)}</div><p class="detail">${escapeHtml(item.detail)}</p><button class="${item.active ? 'secondary' : 'primary'} store-automation-toggle" data-key="${escapeHtml(item.key)}" data-active="${item.active}">${item.active ? 'Pausar' : 'Ativar'}</button></article>`).join('')}</div>
    <div class="section-head"><div><h2>Vitrine do Discord</h2><p class="detail">Escolha onde os produtos aparecerão e publique ou atualize os cards.</p></div></div>
    <form id="storefront-form" class="card storefront-form"><div><label for="storefront-channel">Canal da loja</label><select id="storefront-channel" required><option value="">Escolha um canal de texto</option>${(state.config?.availableChannels ?? []).filter(channel => channel.type === 'text').map(channel => `<option value="${escapeHtml(channel.id)}" ${currentStoreChannel === channel.id ? 'selected' : ''}>#${escapeHtml(channel.name)}</option>`).join('')}</select></div><button class="primary" type="submit">Publicar / atualizar vitrine</button></form>
    <div class="section-head"><div><h2>Produtos</h2><p class="detail">Crie, edite, pause ou remova produtos. A vitrine e os comandos atualizam junto com o catálogo.</p></div><button id="add-product" class="primary">＋ Novo produto</button></div>
    <div class="grid two store-products">${data.products.map(product => `<article class="card product-editor">
      <img class="product-preview" src="${escapeHtml(product.image || '')}" alt="Imagem de ${escapeHtml(product.name)}" ${product.image ? '' : 'hidden'}>
      <div class="product-top"><div><p class="eyebrow">${product.active ? 'PRODUTO ATIVO' : 'PRODUTO PAUSADO'}</p><h2>${escapeHtml(product.name)}</h2></div>${badge(product.stock === null ? 'Estoque ilimitado' : `${product.stock} em estoque`, product.active ? 'ok' : 'warn')}</div>
      <div class="table-actions product-actions"><button class="tiny toggle-product ${product.active ? '' : 'success'}" data-value="${escapeHtml(product.value)}" data-active="${product.active}">${product.active ? 'Pausar venda' : 'Reativar venda'}</button><button class="tiny danger delete-product" data-value="${escapeHtml(product.value)}">Remover</button><span class="detail">ID: ${escapeHtml(product.value)}</span></div>
      <form class="product-form" data-value="${escapeHtml(product.value)}">
        <div class="form-grid two"><div><label>Nome do produto</label><input name="name" value="${escapeHtml(product.name)}" maxlength="80" required></div><div><label>Nome do cargo exibido</label><input name="roleName" value="${escapeHtml(product.roleName)}" maxlength="100" required></div></div>
        <label>Descrição da vitrine</label><textarea name="description" maxlength="1000" rows="3" required>${escapeHtml(product.description)}</textarea>
        <div class="form-grid three"><div><label>Cargo a entregar</label><select name="roleId" required><option value="" disabled ${product.roleId ? '' : 'selected'}>Selecione o cargo</option>${product.roleId && !state.roles.some(role => role.id === product.roleId) ? `<option value="${escapeHtml(product.roleId)}" selected>Cargo ${escapeHtml(product.roleId)} (verifique hierarquia)</option>` : ''}${state.roles.map(role => `<option value="${escapeHtml(role.id)}" ${product.roleId === role.id ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}</select></div><div><label>Validade (dias)</label><input name="durationDays" type="number" min="1" max="3650" value="${product.durationDays}" required></div><div><label>Estoque (vazio = ∞)</label><input name="stock" type="number" min="0" max="100000" value="${product.stock ?? ''}" placeholder="∞"></div></div>
        <div class="form-grid two"><div><label>Preço promocional (R$)</label><input name="price" type="number" min="0.01" max="999999.99" step="0.01" value="${(product.priceCents / 100).toFixed(2)}" required></div><div><label>Preço original (R$)</label><input name="originalPrice" type="number" min="0.01" max="999999.99" step="0.01" value="${(product.originalPriceCents / 100).toFixed(2)}" required></div></div>
        <label>Imagem ou GIF (URL HTTPS; vazio restaura imagem incluída)</label><input name="customImageUrl" type="url" maxlength="500" value="${escapeHtml(product.customImageUrl)}" placeholder="https://…">
        <label>Instruções privadas após a compra</label><textarea name="deliveryMessage" maxlength="1500" rows="2">${escapeHtml(product.deliveryMessage)}</textarea>
        <label>Link de entrega (opcional, HTTPS)</label><input name="deliveryLink" type="url" maxlength="500" value="${escapeHtml(product.deliveryLink)}" placeholder="https://…">
        <button class="primary wide" type="submit">Salvar ${escapeHtml(product.name)}</button>
      </form>
    </article>`).join('')}</div>
    <div class="section-head"><div><h2>Cupons</h2><p class="detail">Cadastrar um cupom não liga a aplicação automática.</p></div><button id="add-coupon" class="primary">Criar cupom</button></div>
    <div class="table-wrap"><table><thead><tr><th>Código</th><th>Desconto</th><th>Usos</th><th>Validade</th><th>Ações</th></tr></thead><tbody>${data.coupons.length ? data.coupons.map(coupon => `<tr><td><strong>${escapeHtml(coupon.code)}</strong></td><td>${coupon.percent}%</td><td>${coupon.uses}/${coupon.maxUses}</td><td>${coupon.expiresAt ? escapeHtml(new Date(coupon.expiresAt).toLocaleString('pt-BR')) : 'Sem vencimento'}</td><td><button class="tiny danger remove-coupon" data-code="${escapeHtml(coupon.code)}">Remover</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhum cupom cadastrado.</td></tr>'}</tbody></table></div>
    <div class="section-head"><h2>Pedidos recentes</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Estado</th><th>Ações</th></tr></thead><tbody>${data.orders.length ? data.orders.map(order => `<tr><td><code>${escapeHtml(order.id.slice(0, 8))}</code><div class="detail">${escapeHtml(new Date(order.createdAt).toLocaleString('pt-BR'))}</div></td><td><code>${escapeHtml(order.buyerId)}</code></td><td>${escapeHtml(order.productName)}</td><td>${escapeHtml(money(order.amountCents))}</td><td>${badge(escapeHtml(order.status), order.paidAt ? 'ok' : 'warn')}${order.deliveryError ? `<p class="detail">${escapeHtml(order.deliveryError)}</p>` : ''}</td><td>${!order.paidAt ? `<button class="tiny success approve-order" data-id="${escapeHtml(order.id)}">Confirmar pagamento</button>` : order.status === 'paid_waiting_delivery' ? `<button class="tiny success deliver-order" data-id="${escapeHtml(order.id)}">Tentar entrega</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum pedido registrado.</td></tr>'}</tbody></table></div>
    <div class="section-head"><h2>Avaliações recentes</h2></div><div class="grid two">${data.feedback.length ? data.feedback.slice(0, 10).map(item => `<article class="card"><h3>${'⭐'.repeat(item.rating)} ${item.rating}/5</h3><p class="detail">${escapeHtml(item.comment || 'Sem comentário')}</p><p class="detail">${escapeHtml(new Date(item.createdAt).toLocaleString('pt-BR'))}</p></article>`).join('') : '<article class="card"><p class="detail">Ainda não há avaliações.</p></article>'}</div>`;

  document.querySelectorAll('.store-automation-toggle').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await request(`/api/painel/automations/${encodeURIComponent(button.dataset.key)}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active !== 'true' }) }); await refresh(); notice('Automação comercial atualizada.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  byId('storefront-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const result = await request('/api/painel/commerce/storefront', { method: 'PUT', body: JSON.stringify({ channelId: byId('storefront-channel').value }) });
      state.commerce = result.commerce; notice(`Vitrine publicada em #${result.channel.name}.`);
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
  document.querySelectorAll('.product-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const payload = Object.fromEntries(fields.entries());
    payload.durationDays = Number(payload.durationDays);
    payload.priceCents = fromMoney(payload.price);
    payload.originalPriceCents = fromMoney(payload.originalPrice);
    payload.stock = payload.stock === '' ? null : Number(payload.stock);
    payload.roleId = payload.roleId || null;
    delete payload.price;
    delete payload.originalPrice;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try { state.commerce = await request(`/api/painel/commerce/products/${encodeURIComponent(form.dataset.value)}`, { method: 'PUT', body: JSON.stringify(payload) }); renderStore(); notice('Produto salvo. A vitrine do Discord também foi atualizada se já estava publicada.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('.toggle-product').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { state.commerce = await request(`/api/painel/commerce/products/${encodeURIComponent(button.dataset.value)}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active !== 'true' }) }); renderStore(); notice('Disponibilidade do produto atualizada.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('.delete-product').forEach(button => button.addEventListener('click', async () => {
    const product = data.products.find(item => item.value === button.dataset.value);
    if (!product || !window.confirm(`Remover ${product.name} da vitrine? Produtos com pedidos antigos serão arquivados para preservar o histórico.`)) return;
    button.disabled = true;
    try {
      const result = await request(`/api/painel/commerce/products/${encodeURIComponent(product.value)}`, { method: 'DELETE' });
      state.commerce = result;
      renderStore();
      notice(result.removal === 'archived' ? 'Produto arquivado; os pedidos antigos foram preservados.' : 'Produto removido do catálogo.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  byId('add-product').addEventListener('click', () => {
    byId('product-error').textContent = '';
    byId('new-product-role').innerHTML = '<option value="" disabled selected>Selecione o cargo a entregar</option>' + state.roles.map(role => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`).join('');
    byId('product-dialog').showModal();
  });
  byId('add-coupon').addEventListener('click', () => { byId('coupon-error').textContent = ''; byId('coupon-dialog').showModal(); });
  document.querySelectorAll('.remove-coupon').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm(`Remover o cupom ${button.dataset.code}?`)) return;
    try { state.commerce = await request(`/api/painel/commerce/coupons/${encodeURIComponent(button.dataset.code)}`, { method: 'DELETE' }); renderStore(); notice('Cupom removido.'); }
    catch (error) { notice(error.message, true); }
  }));
  document.querySelectorAll('.approve-order').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Confirma que este pedido foi pago? Essa ação registra o pagamento e pode executar a entrega que estiver configurada.')) return;
    button.disabled = true;
    try { const result = await request(`/api/painel/commerce/orders/${encodeURIComponent(button.dataset.id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) }); state.commerce = result.commerce; renderStore(); notice('Pedido confirmado.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('.deliver-order').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { const result = await request(`/api/painel/commerce/orders/${encodeURIComponent(button.dataset.id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'deliver' }) }); state.commerce = result.commerce; renderStore(); notice('Tentativa de entrega concluída.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
}

function renderPayments(data) {
  const mp = state.mercadoPago ?? {};
  byId('content').innerHTML = `<section class="card payment-provider-card"><div class="section-head"><div><p class="eyebrow">CHECKOUT PRO</p><h2>Mercado Pago</h2></div>${badge(mp.ready ? 'Credenciais e webhook prontos' : 'Configuração pendente', mp.ready ? 'ok' : 'warn')}</div>
    <p class="detail">As credenciais ficam no arquivo <code>.env</code> do bot e nunca são exibidas aqui. Use primeiro o Access Token de teste. A automação de venda continua ${mp.automationActive ? 'ativa' : 'desativada'} até você ativá-la.</p>
    <form id="mercado-pago-form"><div class="form-grid two">
      <div><label for="mp-access-token">Access Token (servidor)</label><input id="mp-access-token" type="password" autocomplete="new-password" placeholder="${mp.accessTokenConfigured ? 'Configurado; vazio mantém o atual' : 'Cole o Access Token de teste'}"></div>
      <div><label for="mp-webhook-secret">Assinatura secreta do webhook</label><input id="mp-webhook-secret" type="password" autocomplete="new-password" placeholder="${mp.webhookSecretConfigured ? 'Configurada; vazio mantém a atual' : 'Cole a chave secreta do webhook'}"></div>
    </div><label for="mp-webhook-url">URL pública HTTPS do webhook</label><input id="mp-webhook-url" type="url" maxlength="500" value="${escapeHtml(mp.webhookUrl ?? '')}" placeholder="https://seu-dominio/api/webhooks/mercado-pago">
    <div class="form-grid three"><label class="toggle-card"><input id="mp-clear-token" type="checkbox"> Remover Access Token salvo</label><label class="toggle-card"><input id="mp-clear-secret" type="checkbox"> Remover segredo salvo</label><label class="toggle-card"><input id="mp-clear-url" type="checkbox"> Remover URL salva</label></div>
    <p class="detail">A URL precisa encaminhar para <code>/api/webhooks/mercado-pago</code>. Use um endereço HTTPS estável; o túnel local precisa estar aberto para receber confirmações.</p>
    <button id="save-mp-settings" class="primary" type="submit">Salvar configuração do Mercado Pago</button></form></section>
    <div class="grid two"><article class="card"><h2>Métodos ativos</h2><div class="metric">${data.payments.active}</div><p class="detail">Visíveis na lista de pagamentos.</p></article><article class="card"><h2>Métodos inativos</h2><div class="metric">${data.payments.inactive}</div><p class="detail">Mantidos cadastrados; podem ser reativados.</p></article></div>
    <div class="section-head"><h2>Métodos cadastrados</h2><button id="add-method" class="primary">Adicionar método</button></div>
    <div class="table-wrap"><table><thead><tr><th>Método</th><th>Tipo</th><th>Estado</th><th>Configuração</th><th>Ações</th></tr></thead><tbody>${state.methods.length ? state.methods.map(method => `<tr><td><strong>${escapeHtml(method.name)}</strong></td><td>${method.type === 'pix_manual' ? 'Pix manual' : 'Link de pagamento'}</td><td>${method.active ? badge('Ativo', 'ok') : badge('Inativo')}</td><td>${method.type === 'pix_manual' ? (method.pixKeyConfigured ? 'Chave configurada' : 'Sem chave') : (method.url ? 'Link configurado' : 'Sem link')}</td><td><div class="table-actions"><button class="tiny edit-method" data-id="${escapeHtml(method.id)}">Editar</button><button class="tiny toggle-method ${method.active ? '' : 'success'}" data-id="${escapeHtml(method.id)}" data-active="${method.active}">${method.active ? 'Desativar' : 'Ativar'}</button><button class="tiny danger delete-method" data-id="${escapeHtml(method.id)}">Remover</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhum método cadastrado.</td></tr>'}</tbody></table></div>
    <p class="detail">Canal público: ${data.payments.publicChannelId ? `<code>${escapeHtml(data.payments.publicChannelId)}</code>` : 'não criado'} · chaves Pix e credenciais não são mostradas na lista.</p>`;
  byId('mercado-pago-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = byId('save-mp-settings'); button.disabled = true;
    try {
      state.mercadoPago = await request('/api/painel/payments/mercado-pago', { method: 'PUT', body: JSON.stringify({
        accessToken: byId('mp-access-token').value.trim(), webhookSecret: byId('mp-webhook-secret').value.trim(),
        webhookUrl: byId('mp-webhook-url').value.trim(), clearAccessToken: byId('mp-clear-token').checked,
        clearWebhookSecret: byId('mp-clear-secret').checked, clearWebhookUrl: byId('mp-clear-url').checked
      }) });
      await refresh(); notice('Configuração Mercado Pago salva no .env do bot.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  });
  byId('add-method').addEventListener('click', () => openMethodDialog());
  document.querySelectorAll('.edit-method').forEach(button => button.addEventListener('click', () => openMethodDialog(state.methods.find(method => method.id === button.dataset.id))));
  document.querySelectorAll('.toggle-method').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { await request(`/api/painel/payments/${encodeURIComponent(button.dataset.id)}`, { method: 'PATCH', body: JSON.stringify({ active: button.dataset.active !== 'true' }) }); await refresh(); notice('Método atualizado.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('.delete-method').forEach(button => button.addEventListener('click', async () => {
    const method = state.methods.find(item => item.id === button.dataset.id);
    if (!method || !window.confirm(`Remover o método ${method.name}?`)) return;
    try { await request(`/api/painel/payments/${encodeURIComponent(method.id)}`, { method: 'DELETE' }); await refresh(); notice('Método removido.'); }
    catch (error) { notice(error.message, true); }
  }));
}

function render() {
  if (!state.data) return;
  byId('page-title').textContent = pageTitles[state.page];
  byId('server-name').textContent = `${state.data.server.name} · ${state.data.server.members} membros`;
  byId('connection-label').textContent = state.data.bot.ready ? 'Bot conectado' : 'Bot desconectado';
  byId('footer-port').textContent = state.data.services.api.port ? `API local: porta ${state.data.services.api.port}.` : '';
  byId('last-updated').textContent = `Atualizado ${new Date(state.data.generatedAt).toLocaleTimeString('pt-BR')}`;
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === state.page));
  ({ overview: renderOverview, services: renderServices, automations: renderAutomations, channels: renderChannels,
    config: renderConfig, store: renderStore, payments: renderPayments })[state.page](state.data);
}

async function refresh() {
  const data = await request('/api/painel/status');
  state.data = data;
  if (state.page === 'payments') {
    const [paymentData, mercadoPago] = await Promise.all([
      request('/api/painel/payments'), request('/api/painel/payments/mercado-pago')
    ]);
    state.methods = paymentData.methods; state.mercadoPago = mercadoPago;
  }
  if (state.page === 'store') {
    const [commerce, roles, config] = await Promise.all([request('/api/painel/commerce'), request('/api/painel/roles'), request('/api/painel/config')]);
    state.commerce = commerce;
    state.roles = roles.roles;
    state.config = config;
  }
  if (state.page === 'config') state.config = await request('/api/painel/config');
  showApp();
  render();
}

function openMethodDialog(method = null) {
  const form = byId('method-form');
  form.dataset.id = method?.id ?? '';
  byId('method-dialog-title').textContent = method ? 'Editar método' : 'Novo método';
  byId('method-type').disabled = Boolean(method);
  byId('method-type').value = method?.type ?? 'pix_manual';
  byId('method-name').value = method?.name ?? '';
  byId('pix-key').value = '';
  byId('pix-key').placeholder = method?.pixKeyConfigured ? 'Chave protegida; deixe vazio para manter' : 'Informe a chave Pix';
  byId('pix-key').type = 'password';
  byId('pix-key-type').value = method?.pixKeyType ?? 'auto';
  byId('receiver-name').value = method?.receiverName ?? '';
  byId('receiver-city').value = method?.city ?? '';
  byId('payment-url').value = method?.url ?? '';
  byId('method-instructions').value = method?.instructions ?? '';
  byId('method-error').textContent = '';
  updateMethodFields();
  byId('method-dialog').showModal();
}

function updateMethodFields() {
  const pix = byId('method-type').value === 'pix_manual';
  byId('pix-fields').hidden = !pix;
  byId('link-fields').hidden = pix;
  byId('pix-key').required = pix && !byId('method-form').dataset.id;
  byId('receiver-name').required = pix;
  byId('receiver-city').required = pix;
  byId('payment-url').required = !pix;
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', async () => {
  state.page = button.dataset.page;
  try {
    if (state.page === 'payments') {
      const [data, mercadoPago] = await Promise.all([request('/api/painel/payments'), request('/api/painel/payments/mercado-pago')]);
      state.methods = data.methods; state.mercadoPago = mercadoPago;
    }
    if (state.page === 'store') {
      const [commerce, roles, config] = await Promise.all([request('/api/painel/commerce'), request('/api/painel/roles'), request('/api/painel/config')]);
      state.commerce = commerce; state.roles = roles.roles; state.config = config;
    }
    if (state.page === 'config') state.config = await request('/api/painel/config');
    render();
  }
  catch (error) { notice(error.message, true); }
}));
byId('refresh').addEventListener('click', async () => { try { await refresh(); notice('Dados atualizados.'); } catch (error) { notice(error.message, true); } });
byId('method-type').addEventListener('change', updateMethodFields);
byId('close-dialog').addEventListener('click', () => byId('method-dialog').close());
byId('cancel-dialog').addEventListener('click', () => byId('method-dialog').close());
byId('close-coupon').addEventListener('click', () => byId('coupon-dialog').close());
byId('cancel-coupon').addEventListener('click', () => byId('coupon-dialog').close());
byId('close-product').addEventListener('click', () => byId('product-dialog').close());
byId('cancel-product').addEventListener('click', () => byId('product-dialog').close());
byId('product-form').addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    name: byId('new-product-name').value.trim(), value: byId('new-product-value').value.trim().toLowerCase(),
    description: byId('new-product-description').value.trim(), roleName: byId('new-product-role-name').value.trim(),
    roleId: byId('new-product-role').value || null, durationDays: Number(byId('new-product-days').value),
    priceCents: fromMoney(byId('new-product-price').value), originalPriceCents: fromMoney(byId('new-product-original').value),
    imageUrl: byId('new-product-image').value.trim()
  };
  const button = byId('save-product'); button.disabled = true; byId('product-error').textContent = '';
  try {
    state.commerce = await request('/api/painel/commerce/products', { method: 'POST', body: JSON.stringify(payload) });
    byId('product-dialog').close(); byId('product-form').reset(); renderStore(); notice('Produto criado e sincronizado com a loja.');
  } catch (error) { byId('product-error').textContent = error.message; }
  finally { button.disabled = false; }
});
byId('coupon-form').addEventListener('submit', async event => {
  event.preventDefault();
  const hours = Number(byId('coupon-hours').value);
  const payload = {
    code: byId('coupon-code').value.trim(), percent: Number(byId('coupon-percent').value),
    maxUses: Number(byId('coupon-uses').value),
    expiresAt: hours ? new Date(Date.now() + hours * 3600000).toISOString() : null
  };
  const button = byId('save-coupon'); button.disabled = true;
  try {
    state.commerce = await request('/api/painel/commerce/coupons', { method: 'POST', body: JSON.stringify(payload) });
    byId('coupon-dialog').close(); byId('coupon-form').reset(); renderStore(); notice('Cupom cadastrado.');
  } catch (error) { byId('coupon-error').textContent = error.message; }
  finally { button.disabled = false; }
});

byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const password = byId('password').value;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try { await request('/api/painel/login', { method: 'POST', body: JSON.stringify({ password }) }); byId('password').value = ''; await refresh(); }
  catch (error) { showLogin(error.message); }
  finally { button.disabled = false; }
});
byId('logout').addEventListener('click', async () => { try { await request('/api/painel/logout', { method: 'POST', body: '{}' }); } finally { showLogin(); } });

byId('method-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const type = byId('method-type').value;
  const payload = { type, name: byId('method-name').value.trim(), instructions: byId('method-instructions').value.trim() };
  if (type === 'pix_manual') Object.assign(payload, { pixKey: byId('pix-key').value.trim(), pixKeyType: byId('pix-key-type').value, receiverName: byId('receiver-name').value.trim(), city: byId('receiver-city').value.trim() });
  else payload.url = byId('payment-url').value.trim();
  const button = byId('save-method');
  button.disabled = true;
  try {
    const methodId = form.dataset.id;
    await request(methodId ? `/api/painel/payments/${encodeURIComponent(methodId)}` : '/api/painel/payments', { method: methodId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    byId('method-dialog').close();
    state.page = 'payments';
    await refresh();
    notice(methodId ? 'Método editado.' : 'Método cadastrado.');
  } catch (error) { byId('method-error').textContent = error.message; }
  finally { button.disabled = false; }
});

const accessTicket = new URLSearchParams(window.location.hash.slice(1)).get('access');
if (accessTicket) {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    await request('/api/painel/login-ticket', { method: 'POST', body: JSON.stringify({ ticket: accessTicket }) });
    await refresh();
  } catch (error) { showLogin(error.message); }
} else {
  try { await refresh(); } catch { showLogin(); }
}
