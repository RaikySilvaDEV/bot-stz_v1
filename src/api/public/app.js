const byId = id => document.getElementById(id);
const pageFromStorage = localStorage.getItem('bot-dashboard-page');
const validPages = new Set(['overview', 'services', 'automations', 'channels', 'announcements', 'config', 'store', 'payments', 'payouts', 'assistant']);
const state = { data: null, page: validPages.has(pageFromStorage) ? pageFromStorage : 'overview', methods: [], mercadoPago: null, commerce: null, payouts: null, announcements: [], assistantMessages: [], roles: [], config: null, managedChannels: [], pageError: '' };
const pageTitles = { overview: 'Visão geral', services: 'Serviços', automations: 'Automações', channels: 'Canais', announcements: 'Avisos', config: 'Configuração', store: 'Loja', payments: 'Pagamentos', payouts: 'Repasses', assistant: 'Assistente' };
const pageDescriptions = {
  overview: 'Acompanhe o estado do bot e encontre rapidamente o que precisa de atenção.',
  services: 'Veja se as conexões, integrações e recursos locais estão prontos.',
  automations: 'Ative ou pause cada rotina e confira suas dependências.',
  channels: 'Crie, renomeie, mova e organize canais do servidor; confira também as permissões do bot.',
  announcements: 'Crie, publique, edite e remova avisos no canal FiveM.',
  config: 'Ajuste os canais, horários, fuso e menções automáticas.',
  store: 'Organize a vitrine, os produtos, os pedidos e as avaliações.',
  payments: 'Configure as formas de pagamento e as credenciais do Mercado Pago.',
  payouts: 'Configure a comissão do sócio, calcule valores e acompanhe os repasses Pix.',
  assistant: 'Tire dúvidas e receba orientação sobre a configuração do bot.'
};
const pageIcons = { overview: 'layout-dashboard', services: 'activity', automations: 'bot', channels: 'hash', announcements: 'megaphone', config: 'settings-2', store: 'store', payments: 'credit-card', payouts: 'wallet-cards', assistant: 'sparkles' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const allowedIcons = new Set(['layout-dashboard', 'activity', 'bot', 'hash', 'megaphone', 'settings-2', 'store', 'credit-card', 'sparkles', 'search', 'refresh-cw', 'log-out', 'check', 'x', 'plus', 'arrow-up-right', 'chart-no-axes-combined', 'package-open', 'ticket-check', 'shopping-bag', 'clock-3', 'shield-check', 'users', 'arrow-right', 'send', 'messages-square', 'circle-question-mark', 'file-text', 'image', 'wallet-cards', 'external-link', 'circle-check']);
function icon(name, className = '') {
  if (!allowedIcons.has(name)) return '';
  return `<span class="icon-mask icon-${escapeHtml(name)} ${escapeHtml(className)}" aria-hidden="true"></span>`;
}
let noticeTimer;

function notice(message, error = false) {
  const element = byId('notice');
  byId('notice-message').textContent = message;
  byId('notice-icon').classList.toggle('icon-x', error);
  byId('notice-icon').classList.toggle('icon-circle-check', !error);
  element.hidden = !message;
  element.classList.toggle('error', error);
  window.clearTimeout(noticeTimer);
  if (message) noticeTimer = window.setTimeout(() => { element.hidden = true; }, 6500);
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
  const problematicAutomations = data.automations.filter(item => item.active && !item.ready);
  const problematicServices = services.filter(([, item]) => item.active && !item.operational);
  const ping = Number.isFinite(data.bot.pingMs) && data.bot.pingMs >= 0 ? `${Math.round(data.bot.pingMs)} ms` : 'Aguardando medida';
  const allHealthy = healthy === services.length && problematicAutomations.length === 0 && problematicServices.length === 0;
  const orders = state.commerce?.orders ?? [];
  byId('content').innerHTML = `
    <section class="overview-banner"><div><p class="eyebrow">RESUMO DO SERVIDOR</p><h2>${allHealthy ? 'Seu bot está em ordem' : 'Confira os itens que precisam de atenção'}</h2><p>${escapeHtml(data.server.name)} · ${Number(data.server.members).toLocaleString('pt-BR')} membros · atualizado às ${escapeHtml(new Date(data.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</p></div><div class="overview-actions"><button class="secondary jump-page" data-target="services" type="button">Ver serviços</button><button class="primary jump-page" data-target="store" type="button">Abrir loja</button></div></section>
    <div class="grid overview-grid">
      <article class="card overview-metric"><div class="overview-metric-label">Conexão Discord ${icon('activity', 'metric-icon')}</div><div class="metric">${data.bot.ready ? 'Online' : 'Offline'}</div>${badge(data.bot.ready ? ping : 'Sem conexão', data.bot.ready ? 'ok' : 'bad')}<p class="detail">Ativo há ${escapeHtml(formatUptime(data.bot.uptimeSeconds))}</p></article>
      <article class="card overview-metric"><div class="overview-metric-label">Serviços operantes ${icon('shield-check', 'metric-icon')}</div><div class="metric">${healthy}<span class="metric-total">/${services.length}</span></div>${badge(healthy === services.length ? 'Tudo certo' : 'Requer atenção', healthy === services.length ? 'ok' : 'warn')}<p class="detail">Conexões e recursos principais.</p></article>
      <article class="card overview-metric"><div class="overview-metric-label">Automações ativas ${icon('bot', 'metric-icon')}</div><div class="metric">${activeAutomations}<span class="metric-total">/${data.automations.length}</span></div><p class="detail">Rotinas habilitadas no servidor.</p></article>
      <article class="card overview-metric"><div class="overview-metric-label">Métodos de pagamento ${icon('credit-card', 'metric-icon')}</div><div class="metric">${data.payments.active}</div><p class="detail">${data.payments.inactive} inativos · dados sensíveis protegidos.</p><button class="text-action jump-page" data-target="payments" type="button">Configurar pagamentos ${icon('arrow-up-right')}</button></article>
    </div>
    <div class="overview-lower-grid">
      <section class="card health-card"><div class="section-head"><div><h2>Vendas nos últimos 7 dias</h2><p class="detail">Soma dos pedidos com pagamento confirmado.</p></div>${badge(`${orders.filter(order => order.paidAt).length} pagos`, 'ok')}</div>${renderSalesChart(orders)}</section>
      <section class="card"><div class="section-head"><div><h2>Acesso rápido</h2><p class="detail">Atalhos para as tarefas mais usadas.</p></div></div><div class="quick-actions-list"><button class="quick-action jump-page" data-target="store" type="button">${icon('store')}Editar produtos</button><button class="quick-action jump-page" data-target="payments" type="button">${icon('credit-card')}Pagamentos</button><button class="quick-action jump-page" data-target="automations" type="button">${icon('bot')}Automações</button></div></section>
    </div>
    <div class="section-head"><div><h2>Saúde dos serviços</h2><p class="detail">Estado das conexões e recursos que sustentam o bot.</p></div><button class="ghost jump-page" data-target="services" type="button">Detalhes dos serviços →</button></div>
    <div class="grid two">${services.map(([key, item]) => `<article class="card"><div class="status-line"><span class="status-icon ${item.operational ? 'is-ok' : item.active ? 'is-warn' : ''}" aria-hidden="true"></span><div><h3>${escapeHtml(serviceName(key))}</h3>${statusBadge(item.active, item.operational, item.configured !== false)}<p class="detail">${escapeHtml(item.detail)}</p></div></div></article>`).join('')}</div>
    <div class="section-head"><div><h2>Precisa de atenção</h2><p class="detail">Itens habilitados que ainda dependem de configuração.</p></div><button class="ghost jump-page" data-target="automations" type="button">Revisar automações →</button></div>
    <div class="grid two">${problematicServices.map(([key, item]) => `<article class="card attention-card"><h3>${escapeHtml(serviceName(key))}</h3>${badge('Serviço requer atenção', 'warn')}<p class="detail">${escapeHtml(item.detail)}</p></article>`).join('')}${problematicAutomations.map(item => `<article class="card attention-card"><h3>${escapeHtml(item.label)}</h3>${badge('Ativa · requer atenção', 'warn')}<p class="detail">${escapeHtml(item.detail)}</p></article>`).join('')}${!problematicServices.length && !problematicAutomations.length ? '<div class="card"><p class="detail">Nenhum serviço ou automação ativa com dependências pendentes.</p></div>' : ''}</div>`;
}

function renderSalesChart(orders) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index));
    return { date, label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '').slice(0, 3), cents: 0 };
  });
  for (const order of orders) {
    if (!order.paidAt || !Number.isFinite(order.amountCents)) continue;
    const paid = new Date(order.paidAt); paid.setHours(0, 0, 0, 0);
    const point = days.find(day => day.date.getTime() === paid.getTime());
    if (point) point.cents += order.amountCents;
  }
  const max = Math.max(...days.map(day => day.cents));
  if (!max) return '<div class="chart-empty">As vendas confirmadas dos últimos sete dias aparecerão aqui.</div>';
  const points = days.map((day, index) => ({ ...day, x: 30 + index * 106, y: 127 - (day.cents / max) * 94 }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const area = `30,135 ${line} 666,135`;
  return `<svg class="health-chart" viewBox="0 0 696 160" role="img" aria-label="Gráfico de faturamento dos últimos sete dias">${[30, 65, 100, 135].map(y => `<line class="chart-grid" x1="24" y1="${y}" x2="672" y2="${y}" />`).join('')}<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6867e7" stop-opacity=".22"/><stop offset="100%" stop-color="#6867e7" stop-opacity="0"/></linearGradient></defs><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>${points.map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeHtml(point.label)}: ${escapeHtml(money(point.cents))}</title></circle><text class="chart-label" x="${point.x}" y="153">${escapeHtml(point.label)}</text>`).join('')}</svg>`;
}

function openAnnouncementDialog(announcement = null) {
  const form = byId('announcement-form');
  form.dataset.id = announcement?.id ?? '';
  byId('announcement-dialog-title').textContent = announcement ? 'Editar aviso' : 'Novo aviso';
  byId('announcement-title').value = announcement?.titulo ?? '';
  byId('announcement-text').value = announcement?.texto ?? '';
  byId('announcement-image').value = announcement?.imageUrl ?? '';
  byId('announcement-image-preview').hidden = !announcement?.imageUrl;
  if (announcement?.imageUrl) byId('announcement-image-preview').src = announcement.imageUrl;
  byId('announcement-error').textContent = '';
  byId('save-announcement').innerHTML = announcement ? 'Salvar alterações' : `${icon('megaphone')} Publicar aviso`;
  byId('announcement-dialog').showModal();
  byId('announcement-title').focus();
}

function renderAnnouncements() {
  const channel = state.data.channels.find(item => item.key === 'fivemAnnouncements');
  byId('content').innerHTML = `<section class="announcement-intro"><div class="announcement-intro-icon">${icon('megaphone')}</div><div><h2>Avisos do servidor</h2><p>Gerencie o que aparece em <strong>${escapeHtml(channel?.name ? `#${channel.name}` : 'canal FiveM configurado')}</strong>. Ao salvar, o Discord é atualizado junto com o registro local.</p></div><button class="primary" id="new-announcement" type="button">${icon('plus')} Novo aviso</button></section>
    <div class="section-head"><div><h2>Avisos publicados</h2><p class="detail">${state.announcements.length} aviso(s) no catálogo.</p></div><label class="announcement-search-wrap">${icon('search')}<input id="announcement-search" type="search" placeholder="Buscar aviso…" aria-label="Buscar avisos"></label></div>
    <div id="announcement-list" class="announcement-list">${state.announcements.length ? state.announcements.map(item => `<article class="card announcement-card" data-search-row><div class="announcement-main"><div class="announcement-card-icon">${icon('file-text')}</div><div class="announcement-copy"><div class="announcement-card-heading"><h3>${escapeHtml(item.titulo)}</h3>${badge(item.imageUrl ? 'Com imagem' : 'Publicado', 'ok')}</div><p>${escapeHtml(item.texto)}</p>${item.imageUrl ? `<img class="announcement-card-image" src="${escapeHtml(item.imageUrl)}" alt="Prévia do aviso ${escapeHtml(item.titulo)}" loading="lazy">` : ''}<small>Atualizado em ${escapeHtml(new Date(item.updatedAt ?? item.createdAt).toLocaleString('pt-BR'))}</small></div></div><div class="announcement-actions"><button class="tiny edit-announcement" data-id="${escapeHtml(item.id)}" type="button">${icon('file-text')} Editar</button><button class="tiny danger delete-announcement" data-id="${escapeHtml(item.id)}" type="button">${icon('x')} Remover</button></div></article>`).join('') : `<div class="empty-state"><div class="empty-state-icon">${icon('megaphone')}</div><h3>Nenhum aviso cadastrado</h3><p>Crie seu primeiro aviso para publicar uma mensagem no canal FiveM.</p><button class="primary" id="new-announcement-empty" type="button">${icon('plus')} Criar primeiro aviso</button></div>`}</div><p id="announcement-empty-search" class="empty" hidden>Nenhum aviso corresponde à busca.</p>`;
  byId('new-announcement')?.addEventListener('click', () => openAnnouncementDialog());
  byId('new-announcement-empty')?.addEventListener('click', () => openAnnouncementDialog());
  byId('announcement-search')?.addEventListener('input', event => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase('pt-BR');
    const cards = [...document.querySelectorAll('#announcement-list [data-search-row]')];
    const visible = cards.filter(card => { const show = card.textContent.toLocaleLowerCase('pt-BR').includes(query); card.hidden = !show; return show; }).length;
    byId('announcement-empty-search').hidden = visible > 0 || !query;
  });
  document.querySelectorAll('.edit-announcement').forEach(button => button.addEventListener('click', () => openAnnouncementDialog(state.announcements.find(item => item.id === button.dataset.id))));
  document.querySelectorAll('.delete-announcement').forEach(button => button.addEventListener('click', async () => {
    const announcement = state.announcements.find(item => item.id === button.dataset.id);
    if (!announcement || !window.confirm(`Remover “${announcement.titulo}” também do canal do Discord?`)) return;
    button.disabled = true;
    try {
      const result = await request(`/api/painel/announcements/${encodeURIComponent(announcement.id)}`, { method: 'DELETE' });
      state.announcements = result.announcements; renderAnnouncements(); notice('Aviso removido do painel e do Discord.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  }));
}

function renderAssistant() {
  const assistant = state.data.services.aiAssistant;
  const isReady = Boolean(assistant?.ready);
  const messages = state.assistantMessages.map(message => `<article class="assistant-message ${message.role === 'user' ? 'from-user' : message.role === 'error' ? 'from-error' : 'from-assistant'}"><span class="assistant-avatar">${message.role === 'user' ? icon('users') : icon('sparkles')}</span><div><div class="assistant-speaker">${message.role === 'user' ? 'Você' : message.role === 'error' ? 'Não foi possível responder' : 'Assistente STZ'}</div><p>${escapeHtml(message.text)}</p></div></article>`).join('');
  byId('content').innerHTML = `<section class="assistant-shell"><header class="assistant-header"><div class="assistant-avatar large">${icon('sparkles')}</div><div><p class="eyebrow">ASSISTENTE LOCAL DO PAINEL</p><h2>Como posso ajudar?</h2><p>${escapeHtml(assistant?.detail ?? 'Configure o Ollama local no computador do bot.')}</p></div>${badge(isReady ? `Ollama · ${assistant.model}` : 'Modelo local indisponível', isReady ? 'ok' : 'warn')}</header><div class="assistant-suggestions"><span>EXPERIMENTE</span><button type="button" data-prompt="Como cadastro, edito e removo um aviso?">${icon('megaphone')} Gerenciar avisos</button><button type="button" data-prompt="Como configuro um produto e a entrega automática?">${icon('store')} Configurar a loja</button><button type="button" data-prompt="Quais etapas faltam para ativar o Mercado Pago?">${icon('credit-card')} Pagamentos</button></div><div id="assistant-transcript" class="assistant-transcript">${messages || `<div class="assistant-welcome"><div class="assistant-welcome-icon">${icon('messages-square')}</div><h3>Seu apoio dentro do painel</h3><p>Faça uma pergunta sobre configurações, canais, avisos, produtos ou automações. A resposta considera apenas um resumo do estado atual.</p><span>${icon('shield-check')} O modelo roda no mesmo computador do bot; mensagens não são enviadas a uma API externa.</span></div>`}</div><form id="assistant-form" class="assistant-composer"><textarea id="assistant-input" maxlength="1200" rows="2" placeholder="Escreva sua pergunta…" aria-label="Pergunte à assistente" ${isReady ? '' : 'disabled'}></textarea><button class="primary" type="submit" ${isReady ? '' : 'disabled'}>${icon('send')} Enviar</button></form><p class="assistant-disclosure">A IA usa o Ollama e o modelo ${escapeHtml(assistant?.model ?? 'qwen2.5:3b')} instalado localmente no computador que executa o bot. Não inclui tokens, senhas nem chaves Pix nas perguntas do assistente.</p></section>`;
  byId('assistant-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = byId('assistant-input'); const message = input.value.trim();
    if (!message) return;
    input.value = ''; state.assistantMessages.push({ role: 'user', text: message });
    renderAssistant(); byId('assistant-input').focus();
    const transcript = byId('assistant-transcript');
    transcript.insertAdjacentHTML('beforeend', `<article class="assistant-message from-assistant assistant-pending"><span class="assistant-avatar">${icon('sparkles')}</span><div><div class="assistant-speaker">Assistente STZ</div><p><span class="typing-dots" aria-label="Pensando"><i></i><i></i><i></i></span></p></div></article>`);
    transcript.scrollTop = transcript.scrollHeight;
    byId('assistant-form').querySelector('button').disabled = true;
    try {
      const result = await request('/api/painel/assistant', { method: 'POST', body: JSON.stringify({ message }) });
      state.assistantMessages.push({ role: 'assistant', text: result.answer });
    } catch (error) { state.assistantMessages.push({ role: 'error', text: error.message }); }
    renderAssistant();
    byId('assistant-transcript').scrollTop = byId('assistant-transcript').scrollHeight;
    byId('assistant-input').focus();
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    if (!isReady) return;
    byId('assistant-input').value = button.dataset.prompt;
    byId('assistant-form').requestSubmit();
  }));
  byId('assistant-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); byId('assistant-form').requestSubmit(); }
  });
  if (messages) byId('assistant-transcript').scrollTop = byId('assistant-transcript').scrollHeight;
}

function serviceName(key) { return ({ discord: 'Gateway Discord', api: 'API e painel web', aiAssistant: 'Autoatendimento local (Ollama)', ticketCreation: 'Criação de tickets' })[key] ?? key; }
function formatUptime(seconds) { const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60); return `${d}d ${h}h ${m}min`; }

function renderServices(data) {
  byId('content').innerHTML = `<div class="grid two">${Object.entries(data.services).map(([key, item]) => `<article class="card"><div class="section-head"><div><p class="eyebrow">SERVIÇO</p><h2>${escapeHtml(serviceName(key))}</h2></div>${statusBadge(item.active, item.operational, item.configured !== false)}</div><p class="detail">${escapeHtml(item.detail)}</p>${key === 'api' ? `<p class="detail">Porta atual: ${escapeHtml(item.port)}</p>` : ''}${key === 'discord' ? `<p class="detail">Bot: ${escapeHtml(data.bot.tag)} · memória: ${data.bot.memoryMb} MB</p>` : ''}</article>`).join('')}</div>
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
  const channels = state.managedChannels;
  const categories = channels.filter(channel => channel.type === 4);
  const typeNames = { 0: 'Texto', 2: 'Voz', 4: 'Categoria', 5: 'Anúncios' };
  const channelRows = channels.map(channel => `<tr data-channel-row><td><strong>${channel.type === 4 ? '▰ ' : '#'}${escapeHtml(channel.name)}</strong><div class="detail">${escapeHtml(typeNames[channel.type] ?? 'Canal')} · ${channel.parentId ? `em ${escapeHtml(categories.find(item => item.id === channel.parentId)?.name ?? 'categoria')}` : 'sem categoria'} · posição ${channel.position}</div></td><td><code>${escapeHtml(channel.id)}</code></td><td><button class="tiny edit-channel" data-id="${escapeHtml(channel.id)}" type="button">${icon('file-text')} Editar / mover</button> <button class="tiny danger delete-channel" data-id="${escapeHtml(channel.id)}" type="button">${icon('x')} Excluir</button></td></tr>`).join('');
  byId('content').innerHTML = `<section class="card"><div class="section-head"><div><h2>Gerenciar canais do servidor</h2><p class="detail">Crie categorias, texto, anúncios e voz. Renomeie, mova entre categorias e ajuste a posição.</p></div><button class="primary" id="new-channel" type="button">${icon('plus')} Novo canal</button></div><label class="table-search-label" for="channel-search">Filtrar canais</label><input id="channel-search" class="table-search" type="search" placeholder="Buscar por nome ou categoria…"><div class="table-wrap table-wrap-inner"><table><thead><tr><th>Canal</th><th>ID</th><th>Ações</th></tr></thead><tbody>${channelRows || '<tr><td colspan="3">Nenhum canal gerenciável encontrado.</td></tr>'}</tbody></table></div><p class="detail">O bot precisa da permissão <strong>Gerenciar canais</strong>. A exclusão é permanente e solicita confirmação.</p></section>
    <section class="card"><div class="section-head"><div><h2>Canais usados pelas funções do bot</h2><p class="detail">Estado e permissões atuais dos destinos configurados.</p></div><span class="badge">${data.channels.length} destinos</span></div><div class="table-wrap table-wrap-inner"><table><thead><tr><th>Função</th><th>Canal configurado</th><th>Permissões</th><th>Estado</th></tr></thead><tbody>${data.channels.map(channel => `<tr><td><strong>${escapeHtml(channel.label)}</strong></td><td>${escapeHtml(channel.name ?? 'Não configurado')}</td><td>${channel.canView ? 'Leitura' : 'Sem leitura'} · ${channel.canSend ? 'Envio' : 'Sem envio'}</td><td>${channel.operational ? badge('Operante', 'ok') : channel.found ? badge('Permissão ausente', 'warn') : badge('Não encontrado', 'bad')}</td></tr>`).join('')}</tbody></table></div></section>`;
  byId('new-channel').addEventListener('click', () => openChannelDialog());
  document.querySelectorAll('.edit-channel').forEach(button => button.addEventListener('click', () => openChannelDialog(channels.find(channel => channel.id === button.dataset.id))));
  document.querySelectorAll('.delete-channel').forEach(button => button.addEventListener('click', async () => {
    const channel = channels.find(item => item.id === button.dataset.id);
    if (!channel || !window.confirm(`Excluir permanentemente #${channel.name}?`)) return;
    button.disabled = true;
    try { await request(`/api/painel/channels/${encodeURIComponent(channel.id)}`, { method: 'DELETE' }); state.managedChannels = (await request('/api/painel/channels')).channels; renderChannels(data); notice(`Canal #${channel.name} excluído.`); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  byId('channel-search').addEventListener('input', event => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase('pt-BR');
    document.querySelectorAll('[data-channel-row]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase('pt-BR').includes(query); });
  });
}

function openChannelDialog(channel = null) {
  const form = byId('channel-form');
  const categories = state.managedChannels.filter(item => item.type === 4 && item.id !== channel?.id);
  form.dataset.id = channel?.id ?? '';
  byId('channel-dialog-title').textContent = channel ? 'Editar ou mover canal' : 'Criar canal';
  byId('channel-name').value = channel?.name ?? '';
  byId('channel-type').value = channel ? ({ 0: 'text', 2: 'voice', 4: 'category', 5: 'announcement' })[channel.type] : 'text';
  byId('channel-type').disabled = Boolean(channel);
  byId('channel-topic').value = channel?.topic ?? '';
  byId('channel-topic').disabled = channel?.type === 4 || channel?.type === 2;
  byId('channel-parent').innerHTML = `<option value="">Sem categoria</option>${categories.map(item => `<option value="${escapeHtml(item.id)}" ${channel?.parentId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`;
  byId('channel-parent').disabled = channel?.type === 4;
  byId('channel-position').value = channel?.position ?? 0;
  byId('channel-error').textContent = '';
  byId('channel-dialog').showModal();
  byId('channel-name').focus();
}

function renderConfig() {
  const config = state.config;
  if (!config) { byId('content').innerHTML = '<div class="card">Carregando configurações…</div>'; return; }
  const channelLabels = Object.fromEntries((state.data.channels ?? []).map(channel => [channel.key, channel.label]));
  const ticketPanels = config.ticketPanels;
  const supportOptionsText = ticketPanels.support.options.map(option => [option.label, option.description ?? '', option.value, option.emoji ?? ''].join(' | ')).join('\n');
  const collectTicketPanels = form => ({
    support: { title: form.elements.supportTitle.value, description: form.elements.supportDescription.value, placeholder: form.elements.supportPlaceholder.value, options: form.elements.supportOptions.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const [label, description, value, emoji] = line.split('|').map(item => item.trim()); return { label, description, value, emoji }; }) },
    purchase: { title: form.elements.purchaseTitle.value, description: form.elements.purchaseDescription.value },
    maintenance: { title: form.elements.maintenanceTitle.value, message: form.elements.maintenanceMessage.value }
  });
  const selectFor = (key, id) => {
    const category = ['supportCategory', 'purchaseCategory'].includes(key);
    const options = config.availableChannels.filter(channel => category ? channel.type === 'category' : channel.type === 'text');
    return `<div class="config-channel"><label>${escapeHtml(channelLabels[key] ?? key)}</label><select name="channel:${escapeHtml(key)}"><option value="">Desativado</option>${options.map(channel => `<option value="${escapeHtml(channel.id)}" ${id === channel.id ? 'selected' : ''}>#${escapeHtml(channel.name)}</option>`).join('')}</select></div>`;
  };
  byId('content').innerHTML = `<form id="config-form">
    <div class="section-head"><div><h2>Rotinas e fuso horário</h2><p class="detail">As alterações valem para os próximos ciclos do bot.</p></div></div>
    <section class="card"><div class="form-grid three"><div><label for="config-timezone">Fuso IANA</label><input id="config-timezone" name="timezone" value="${escapeHtml(config.timezone)}" placeholder="America/Sao_Paulo" required></div><div><label for="config-hours">Horários dos avisos</label><input id="config-hours" name="hours" value="${config.announcementHours.join(', ')}" placeholder="9, 15, 21" required><p class="detail">Horas inteiras de 0 a 23, separadas por vírgula.</p></div><div class="toggle-card"><label for="config-mentions">Permitir @everyone automático</label><input id="config-mentions" name="mentions" type="checkbox" ${config.everyoneMentions ? 'checked' : ''}><p class="detail">Controla menções enviadas pelas rotinas automáticas.</p></div></div></section>
    <div class="section-head"><div><h2>Canais do servidor</h2><p class="detail">Escolha um canal compatível ou selecione “Desativado”.</p></div></div>
    <section class="card config-channels">${Object.entries(config.channels).map(([key, id]) => selectFor(key, id)).join('')}</section>
    <div class="section-head"><div><h2>Painéis de tickets</h2><p class="detail">Compras e atendimento usam painéis separados; configure aqui os textos e as opções do menu.</p></div></div>
    <section class="card"><div class="form-grid two">
      <div><label for="support-title">Título do painel de suporte</label><input id="support-title" name="supportTitle" maxlength="100" value="${escapeHtml(ticketPanels.support.title)}" required></div>
      <div><label for="support-placeholder">Texto do menu de suporte</label><input id="support-placeholder" name="supportPlaceholder" maxlength="150" value="${escapeHtml(ticketPanels.support.placeholder)}" required></div>
      <div class="full"><label for="support-description">Descrição do painel de suporte</label><textarea id="support-description" name="supportDescription" maxlength="1000" rows="3" required>${escapeHtml(ticketPanels.support.description)}</textarea></div>
      <div class="full"><label for="support-options">Opções do menu (uma por linha: Nome | Descrição | código | emoji)</label><textarea id="support-options" name="supportOptions" rows="6" required>${escapeHtml(supportOptionsText)}</textarea><p class="detail">Máximo de 25 opções. Exemplo: Suporte técnico | Ajuda com erros | tecnico | 🛠️</p></div>
      <div><label for="purchase-title">Título do painel de compras</label><input id="purchase-title" name="purchaseTitle" maxlength="100" value="${escapeHtml(ticketPanels.purchase.title)}" required></div>
      <div class="full"><label for="purchase-description">Descrição do painel de compras</label><textarea id="purchase-description" name="purchaseDescription" maxlength="1000" rows="3" required>${escapeHtml(ticketPanels.purchase.description)}</textarea></div>
    </div></section>
    <div class="section-head"><div><h2>Aviso de manutenção</h2><p class="detail">Edite o texto e publique no canal de avisos configurado.</p></div></div>
    <section class="card"><div class="form-grid two"><div><label for="maintenance-title">Título do aviso</label><input id="maintenance-title" name="maintenanceTitle" maxlength="100" value="${escapeHtml(ticketPanels.maintenance.title)}" required></div><div class="full"><label for="maintenance-message">Mensagem</label><textarea id="maintenance-message" name="maintenanceMessage" maxlength="1000" rows="3" required>${escapeHtml(ticketPanels.maintenance.message)}</textarea></div></div><button class="primary" id="announce-maintenance" type="button">Publicar aviso de manutenção</button></section>
    <div class="section-head"><button class="primary" type="submit">Salvar configurações</button><button class="secondary" id="publish-ticket-panels" type="button">Atualizar painéis no Discord</button></div>
  </form>`;
  byId('config-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const hoursRaw = form.elements.hours.value.split(',').map(value => value.trim()).filter(Boolean);
    if (!hoursRaw.length || hoursRaw.some(value => !/^\d{1,2}$/.test(value))) return notice('Informe horários como 9, 15, 21.', true);
    const channels = Object.fromEntries([...form.querySelectorAll('[name^="channel:"]')].map(select => [select.name.slice(8), select.value || null]));
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const ticketPanels = collectTicketPanels(form);
      await request('/api/painel/config', { method: 'PUT', body: JSON.stringify({ timezone: form.elements.timezone.value.trim(), announcementHours: hoursRaw.map(Number), everyoneMentions: form.elements.mentions.checked, channels, ticketPanels }) });
      const [status, updated] = await Promise.all([request('/api/painel/status'), request('/api/painel/config')]);
      state.data = status; state.config = updated;
      render(); notice('Configurações gerais salvas.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  });
  byId('publish-ticket-panels').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const form = byId('config-form');
      const ticketPanels = collectTicketPanels(form);
      const channels = Object.fromEntries([...form.querySelectorAll('[name^="channel:"]')].map(select => [select.name.slice(8), select.value || null]));
      await request('/api/painel/config', { method: 'PUT', body: JSON.stringify({ ticketPanels, channels }) });
      await request('/api/painel/tickets/publish', { method: 'POST', body: '{}' });
      state.config = await request('/api/painel/config');
      render(); notice('Painéis de suporte e compras publicados/atualizados no Discord.');
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
  byId('announce-maintenance').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const form = byId('config-form');
      const ticketPanels = collectTicketPanels(form);
      const channels = Object.fromEntries([...form.querySelectorAll('[name^="channel:"]')].map(select => [select.name.slice(8), select.value || null]));
      await request('/api/painel/config', { method: 'PUT', body: JSON.stringify({ ticketPanels: { maintenance: ticketPanels.maintenance }, channels }) });
      const result = await request('/api/painel/maintenance/announce', { method: 'POST', body: '{}' });
      const channel = config.availableChannels.find(item => item.id === config.channels.supportNotices);
      notice(`Aviso publicado em #${channel?.name ?? 'avisos'}.`);
    } catch (error) { notice(error.message, true); }
    finally { button.disabled = false; }
  });
}

function money(cents) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100); }
function fromMoney(value) { return Math.round(Number(String(value).replace(',', '.')) * 100); }

function bindTableSearch(inputId, emptyId) {
  const input = byId(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const query = input.value.trim().toLocaleLowerCase('pt-BR');
    const rows = [...input.closest('.store-section-content, section').querySelectorAll('[data-search-row]')];
    let visible = 0;
    for (const row of rows) {
      const match = row.textContent.toLocaleLowerCase('pt-BR').includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    }
    const empty = byId(emptyId);
    if (empty) empty.hidden = visible > 0 || !query;
  });
}

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
    <details class="store-section"><summary><span>Automações comerciais</span><span class="badge">${storeAutomations.filter(item => item.active).length} ativas de ${storeAutomations.length}</span></summary><div class="store-section-content"><p class="detail section-note">Cada rotina pode ser ligada separadamente. Confira os requisitos antes de ativar.</p><div class="grid two">${storeAutomations.map(item => `<article class="card"><div class="section-head"><h2>${escapeHtml(item.label.replace('Loja · ', ''))}</h2>${statusBadge(item.active, item.operational)}</div><p class="detail">${escapeHtml(item.detail)}</p><button class="${item.active ? 'secondary' : 'primary'} store-automation-toggle" data-key="${escapeHtml(item.key)}" data-active="${item.active}">${item.active ? 'Pausar' : 'Ativar'}</button></article>`).join('')}</div></div></details>
    <div class="section-head"><div><h2>Vitrine do Discord</h2><p class="detail">Escolha onde os produtos aparecerão e publique ou atualize os cards.</p></div></div>
    <form id="storefront-form" class="card storefront-form"><div><label for="storefront-channel">Canal da loja</label><select id="storefront-channel" required><option value="">Escolha um canal de texto</option>${(state.config?.availableChannels ?? []).filter(channel => channel.type === 'text').map(channel => `<option value="${escapeHtml(channel.id)}" ${currentStoreChannel === channel.id ? 'selected' : ''}>#${escapeHtml(channel.name)}</option>`).join('')}</select></div><button class="primary" type="submit">Publicar / atualizar vitrine</button></form>
    <details class="store-section"><summary><span>Produtos</span><span class="badge">${data.products.filter(product => product.active).length} publicados · ${data.products.length} cadastrados</span></summary><div class="store-section-content"><div class="section-head"><div><p class="detail">Edite os dados do produto; salve para sincronizar com a vitrine publicada.</p></div><button id="add-product" class="primary">＋ Novo produto</button></div><div class="grid two store-products">${data.products.map(product => `<article class="card product-editor">
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
    </article>`).join('')}</div></div></details>
    <details class="store-section"><summary><span>Cupons</span><span class="badge">${data.coupons.length} cadastrados</span></summary><div class="store-section-content"><div class="section-head"><p class="detail">Cadastrar cupom não ativa automaticamente a aplicação de descontos.</p><button id="add-coupon" class="primary">＋ Criar cupom</button></div><div class="table-wrap"><table><thead><tr><th>Código</th><th>Desconto</th><th>Usos</th><th>Validade</th><th>Ações</th></tr></thead><tbody>${data.coupons.length ? data.coupons.map(coupon => `<tr><td><strong>${escapeHtml(coupon.code)}</strong></td><td>${coupon.percent}%</td><td>${coupon.uses}/${coupon.maxUses}</td><td>${coupon.expiresAt ? escapeHtml(new Date(coupon.expiresAt).toLocaleString('pt-BR')) : 'Sem vencimento'}</td><td><button class="tiny danger remove-coupon" data-code="${escapeHtml(coupon.code)}">Remover</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhum cupom cadastrado.</td></tr>'}</tbody></table></div></div></details>
    <details class="store-section"><summary><span>Pedidos recentes</span><span class="badge">${data.orders.length} no histórico</span></summary><div class="store-section-content"><label class="table-search-label" for="order-search">Buscar pedido</label><input id="order-search" class="table-search" type="search" placeholder="ID, cliente ou produto…"><div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Estado</th><th>Ações</th></tr></thead><tbody>${data.orders.length ? data.orders.map(order => `<tr data-search-row><td><code>${escapeHtml(order.id.slice(0, 8))}</code><div class="detail">${escapeHtml(new Date(order.createdAt).toLocaleString('pt-BR'))}</div></td><td><code>${escapeHtml(order.buyerId)}</code></td><td>${escapeHtml(order.productName)}</td><td>${escapeHtml(money(order.amountCents))}</td><td>${badge(escapeHtml(order.status), order.paidAt ? 'ok' : 'warn')}${order.deliveryError ? `<p class="detail">${escapeHtml(order.deliveryError)}</p>` : ''}</td><td>${!order.paidAt ? `<button class="tiny success approve-order" data-id="${escapeHtml(order.id)}">Confirmar pagamento</button>` : order.status === 'paid_waiting_delivery' ? `<button class="tiny success deliver-order" data-id="${escapeHtml(order.id)}">Tentar entrega</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum pedido registrado.</td></tr>'}</tbody></table><p id="order-empty" class="empty" hidden>Nenhum pedido corresponde a essa busca.</p></div></div></details>
    <details class="store-section"><summary><span>Avaliações recentes</span><span class="badge">${data.feedback.length} recebidas</span></summary><div class="store-section-content"><div class="grid two">${data.feedback.length ? data.feedback.slice(0, 10).map(item => `<article class="card"><h3>${'⭐'.repeat(item.rating)} ${item.rating}/5</h3><p class="detail">${escapeHtml(item.comment || 'Sem comentário')}</p><p class="detail">${escapeHtml(new Date(item.createdAt).toLocaleString('pt-BR'))}</p></article>`).join('') : '<article class="card"><p class="detail">Ainda não há avaliações.</p></article>'}</div></div></details>`;

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
  bindTableSearch('order-search', 'order-empty');
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

function renderPayouts() {
  const data = state.payouts ?? { settings: {}, calculation: {}, payouts: [] };
  const settings = data.settings;
  const calculation = data.calculation;
  const automation = state.data.automations.find(item => item.key === 'store_partnerPayouts');
  const checks = [
    ['Chave Pix protegida', settings.recipientConfigured && settings.encryptionReady],
    ['Credencial de Payouts', settings.accessTokenReady],
    ['Webhook HTTPS', settings.webhookReady],
    [settings.testMode ? 'Modo de teste selecionado' : 'Assinatura de produção', settings.testMode || settings.privateSigningKeyReady]
  ];
  const statusLabel = { prepared: 'Preparado', submitting: 'Enviando', unknown: 'Aguardando confirmação', pending: 'Em processamento', credited: 'Creditado', rejected: 'Rejeitado' };
  byId('content').innerHTML = `
    <section class="card payment-provider-card"><div class="section-head"><div><p class="eyebrow">REPASSE PIX</p><h2>Comissão do sócio</h2></div>${badge(settings.enabled ? 'Automação ativa' : 'Automação pausada', settings.enabled ? 'ok' : 'warn')}</div>
      <p class="detail">A divisão é feita sobre o valor líquido realmente recebido após as taxas do Mercado Pago. As taxas são calculadas pelos dados de liquidação do pagamento; vendas antigas sem esses dados ficam fora do repasse. Preparar um repasse não movimenta dinheiro; o botão de envio pede confirmação explícita.</p>
      <p class="detail">Modo: <strong>${settings.testMode ? 'Teste' : 'Produção'}</strong> · Destino Pix: <strong>${settings.recipientConfigured ? escapeHtml(settings.recipientMasked) : 'não cadastrado'}</strong> · ${automation?.operational ? 'Configuração pronta para uso.' : 'Confira os requisitos antes de ativar.'}</p>
      <button id="toggle-payout-automation" class="${settings.enabled ? 'secondary' : 'primary'}" ${!settings.enabled && !automation?.ready ? 'disabled' : ''}>${settings.enabled ? 'Pausar repasses' : 'Ativar repasses'}</button>
      <div class="grid two">${checks.map(([label, ready]) => `<div class="status-row">${badge(ready ? 'Pronto' : 'Pendente', ready ? 'ok' : 'warn')}<span>${escapeHtml(label)}</span></div>`).join('')}</div>
    </section>
    <div class="grid two">
      <section class="card"><h2>Regra e destinatário</h2><form id="partner-payout-form"><label for="payout-share">Percentual por venda paga</label><div class="input-suffix"><input id="payout-share" type="number" min="0.01" max="100" step="0.01" value="${Number(settings.sharePercent ?? 0).toFixed(2)}" required><span>%</span></div>
        <label for="payout-pix-type">Tipo da chave Pix</label><select id="payout-pix-type"><option value="email" ${settings.pixType === 'email' ? 'selected' : ''}>E-mail</option><option value="phone" ${settings.pixType === 'phone' ? 'selected' : ''}>Telefone</option><option value="cpf" ${settings.pixType === 'cpf' ? 'selected' : ''}>CPF</option><option value="cnpj" ${settings.pixType === 'cnpj' ? 'selected' : ''}>CNPJ</option><option value="random" ${settings.pixType === 'random' ? 'selected' : ''}>Aleatória</option></select>
        <label for="payout-pix-key">Chave Pix do sócio</label><input id="payout-pix-key" type="password" autocomplete="new-password" maxlength="100" placeholder="${settings.recipientConfigured ? 'Protegida; vazio mantém a atual' : 'Digite a chave Pix'}" ${settings.recipientConfigured ? '' : 'required'}>
        <p class="detail">A chave é cifrada antes de salvar e não aparece novamente. Atualize a chave no formulário se o destino mudar.</p>
        <button class="primary" type="submit">Salvar regra e destinatário</button></form>
      </section>
      <section class="card"><h2>Conexão do Mercado Pago</h2><form id="payout-secrets-form"><label for="payout-access-token">Access Token da aplicação Payouts</label><input id="payout-access-token" type="password" autocomplete="new-password" placeholder="${settings.accessTokenReady ? 'Configurado; vazio mantém o atual' : 'Credencial de teste para começar'}">
        <label class="toggle-card" for="payout-test-mode"><input id="payout-test-mode" type="checkbox" ${settings.testMode ? 'checked' : ''}> Usar modo de teste</label>
        <label for="payout-test-max">Limite total por rascunho no modo de teste (R$)</label><input id="payout-test-max" type="number" min="1" max="100000" step="0.01" value="${(Number(settings.testMaxCents ?? 1000) / 100).toFixed(2)}"><p class="detail">Esse limite vale somente para chamadas de teste com X-test-token. Em produção, configure a chave de assinatura abaixo.</p>
        <label for="payout-private-key-path">Caminho do arquivo da chave privada Ed25519</label><input id="payout-private-key-path" type="text" maxlength="1000" placeholder="${settings.privateSigningKeyReady ? 'Configurado; vazio mantém o atual' : 'Obrigatório somente em produção'}">
        <p class="detail">Para produção, gere um par Ed25519. Cadastre a chave pública com a equipe de Integrações do Mercado Pago e informe aqui o caminho absoluto da chave privada. Ela deve permanecer fora do projeto.</p>
        <button class="primary" type="submit">Salvar conexão</button></form>
      </section>
    </div>
    <div class="grid two"><article class="card"><h2>Valor bruto elegível</h2><div class="metric">${money(calculation.grossCents ?? 0)}</div></article><article class="card"><h2>Taxas do Mercado Pago</h2><div class="metric">${money(calculation.feesCents ?? 0)}</div></article><article class="card"><h2>Líquido recebido</h2><div class="metric">${money(calculation.netCents ?? 0)}</div><p class="detail">Base para a divisão após as taxas.</p></article><article class="card"><h2>Repasse do sócio · ${Number(settings.sharePercent ?? 0).toFixed(2)}%</h2><div class="metric">${money(calculation.partnerShareCents ?? calculation.totalCents ?? 0)}</div><p class="detail">${calculation.orderCount ?? 0} pedidos elegíveis.</p></article><article class="card"><h2>Sua parte líquida</h2><div class="metric">${money(calculation.ownerShareCents ?? 0)}</div><p class="detail">Saldo líquido restante depois do repasse do sócio.</p></article></div>
    ${(calculation.missingNetAmountCount ?? 0) ? `<section class="card"><p class="detail">${calculation.missingNetAmountCount} venda(s) antiga(s) não têm o líquido/taxas registrados e foram excluídas do cálculo. Os próximos pagamentos aprovados serão registrados com os dados de liquidação recebidos do Mercado Pago.</p></section>` : ''}
    <section class="card"><div class="section-head"><div><h2>Preparar um repasse</h2><p class="detail">O valor calculado será reservado contra pedidos já incluídos em outros repasses.</p></div><button id="create-payout-draft" class="primary" ${!calculation.orderCount || !settings.recipientConfigured ? 'disabled' : ''}>Preparar repasse</button></div>
      <p class="detail">Antes de enviar, confirme o valor, a chave Pix mascarada e o modo de execução. O Mercado Pago pode deixar a transferência pendente; só marcamos como creditada após consultar o estado final.</p>
    </section>
    <div class="section-head"><h2>Histórico de repasses</h2><button id="refresh-payouts" class="secondary">Atualizar estados</button></div>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Pedidos</th><th>Valor</th><th>Modo</th><th>Estado</th><th>Ação</th></tr></thead><tbody>${data.payouts.length ? data.payouts.map(payout => `<tr><td>${escapeHtml(new Date(payout.createdAt).toLocaleString('pt-BR'))}<div class="detail"><code>${escapeHtml(payout.id.slice(0, 8))}</code></div></td><td>${payout.orderCount}</td><td>${money(payout.totalCents)}</td><td>${payout.testMode ? 'Teste' : 'Produção'}</td><td>${badge(statusLabel[payout.status] ?? payout.status, payout.status === 'credited' ? 'ok' : payout.status === 'rejected' ? 'warn' : '')}${payout.providerStatus ? `<div class="detail">${escapeHtml(payout.providerStatus)}${payout.providerStatusDetail ? ` · ${escapeHtml(payout.providerStatusDetail)}` : ''}</div>` : ''}${payout.lastError ? `<div class="detail">${escapeHtml(payout.lastError)}</div>` : ''}</td><td>${['prepared', 'unknown'].includes(payout.status) ? `<button class="tiny success send-payout" data-id="${escapeHtml(payout.id)}">${payout.status === 'unknown' ? 'Repetir com mesma chave' : 'Enviar'}</button>` : ['pending', 'submitting'].includes(payout.status) ? `<button class="tiny reconcile-payout" data-id="${escapeHtml(payout.id)}">Consultar</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum repasse registrado.</td></tr>'}</tbody></table></div>`;
  byId('partner-payout-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const result = await request('/api/painel/payouts/settings', { method: 'PUT', body: JSON.stringify({ sharePercent: Number(byId('payout-share').value), pixType: byId('payout-pix-type').value, pixKey: byId('payout-pix-key').value }) });
      state.payouts = result.payouts; await refresh(); notice('Regra e chave Pix protegida salvas.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  });
  byId('toggle-payout-automation').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { await request('/api/painel/automations/partnerPayouts', { method: 'PATCH', body: JSON.stringify({ active: !settings.enabled }) }); await refresh(); notice(`Automação de repasses ${settings.enabled ? 'pausada' : 'ativada'}.`); }
    catch (error) { notice(error.message, true); event.currentTarget.disabled = false; }
  });
  byId('payout-secrets-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await request('/api/painel/payouts/secrets', { method: 'PUT', body: JSON.stringify({ accessToken: byId('payout-access-token').value.trim(), testMode: byId('payout-test-mode').checked, testMaxCents: Math.round(Number(byId('payout-test-max').value) * 100), privateKeyPath: byId('payout-private-key-path').value.trim() }) });
      await refresh(); notice('Conexão Payouts salva no .env local.');
    } catch (error) { notice(error.message, true); button.disabled = false; }
  });
  byId('create-payout-draft').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { const result = await request('/api/painel/payouts/drafts', { method: 'POST', body: '{}' }); state.payouts = result.payouts; await refresh(); notice('Repasse preparado. Revise o histórico antes do envio.'); }
    catch (error) { notice(error.message, true); event.currentTarget.disabled = false; }
  });
  document.querySelectorAll('.send-payout').forEach(button => button.addEventListener('click', async () => {
    const payout = data.payouts.find(item => item.id === button.dataset.id);
    if (!payout || !window.confirm(`Confirma enviar ${money(payout.totalCents)} ao destino Pix ${settings.recipientMasked} em modo ${payout.testMode ? 'TESTE' : 'PRODUÇÃO'}?`)) return;
    button.disabled = true;
    try { const result = await request(`/api/painel/payouts/${encodeURIComponent(payout.id)}/send`, { method: 'POST', body: '{}' }); state.payouts = result.payouts; await refresh(); notice('Solicitação enviada; aguardando confirmação do Mercado Pago.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  document.querySelectorAll('.reconcile-payout').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try { const result = await request(`/api/painel/payouts/${encodeURIComponent(button.dataset.id)}/reconcile`, { method: 'POST', body: '{}' }); state.payouts = result.payouts; await refresh(); notice('Estado consultado no Mercado Pago.'); }
    catch (error) { notice(error.message, true); button.disabled = false; }
  }));
  byId('refresh-payouts').addEventListener('click', async () => {
    try {
      const pending = data.payouts.filter(item => ['pending', 'submitting'].includes(item.status));
      for (const payout of pending) await request(`/api/painel/payouts/${encodeURIComponent(payout.id)}/reconcile`, { method: 'POST', body: '{}' });
      state.payouts = await request('/api/painel/payouts'); renderPayouts(); notice('Estados de repasse atualizados.');
    } catch (error) { notice(error.message, true); }
  });
}

function render() {
  if (!state.data) return;
  byId('page-title').textContent = pageTitles[state.page];
  byId('server-name').textContent = pageDescriptions[state.page];
  byId('page-eyebrow').textContent = `${state.data.server.name} · ${Number(state.data.server.members).toLocaleString('pt-BR')} membros`;
  byId('connection-label').textContent = state.data.bot.ready ? 'Bot conectado' : 'Bot desconectado';
  document.querySelector('.live-dot')?.classList.toggle('is-online', state.data.bot.ready);
  document.querySelector('.live-dot')?.classList.toggle('is-offline', !state.data.bot.ready);
  byId('footer-port').textContent = state.data.services.api.port ? `API local: porta ${state.data.services.api.port}.` : '';
  byId('last-updated').textContent = `Atualizado ${new Date(state.data.generatedAt).toLocaleTimeString('pt-BR')}`;
  document.querySelectorAll('.nav-item').forEach(button => {
    const active = button.dataset.page === state.page;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  byId('content').setAttribute('aria-busy', 'false');
  if (state.pageError) {
    byId('content').innerHTML = `<section class="card"><div class="section-head"><div><h2>Esta seção não carregou</h2><p class="detail">${escapeHtml(state.pageError)}</p></div></div><p class="detail">A Central continua disponível. Tente atualizar esta seção ou escolha outra opção no menu.</p><button class="primary" id="retry-page" type="button">${icon('refresh-cw')} Tentar novamente</button></section>`;
    return;
  }
  ({ overview: renderOverview, services: renderServices, automations: renderAutomations, channels: renderChannels,
    announcements: renderAnnouncements, config: renderConfig, store: renderStore, payments: renderPayments,
    payouts: renderPayouts, assistant: renderAssistant })[state.page](state.data);
}

async function refresh() {
  byId('content').setAttribute('aria-busy', 'true');
  const data = await request('/api/painel/status');
  state.data = data;
  state.pageError = '';
  try { await loadPageData(state.page); }
  catch (error) { state.pageError = error.message; }
  showApp();
  render();
  if (state.pageError) notice(`Não foi possível carregar “${pageTitles[state.page]}”: ${state.pageError}`, true);
}

async function loadPageData(page) {
  if (page === 'overview') state.commerce = await request('/api/painel/commerce');
  if (page === 'announcements') state.announcements = (await request('/api/painel/announcements')).announcements;
  if (page === 'channels') state.managedChannels = (await request('/api/painel/channels')).channels;
  if (page === 'payments') {
    const [paymentData, mercadoPago] = await Promise.all([request('/api/painel/payments'), request('/api/painel/payments/mercado-pago')]);
    state.methods = paymentData.methods; state.mercadoPago = mercadoPago;
  }
  if (page === 'store') {
    const [commerce, roles, config] = await Promise.all([request('/api/painel/commerce'), request('/api/painel/roles'), request('/api/painel/config')]);
    state.commerce = commerce; state.roles = roles.roles; state.config = config;
  }
  if (page === 'config') state.config = await request('/api/painel/config');
  if (page === 'payouts') state.payouts = await request('/api/painel/payouts');
}

async function navigateToPage(page) {
  if (!validPages.has(page)) return;
  state.page = page;
  localStorage.setItem('bot-dashboard-page', page);
  byId('content').setAttribute('aria-busy', 'true');
  try {
    state.pageError = '';
    await loadPageData(page);
  } catch (error) {
    state.pageError = error.message;
  }
  render();
  if (state.pageError) {
    notice(`Não foi possível carregar “${pageTitles[page]}”: ${state.pageError}`, true);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
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

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigateToPage(button.dataset.page)));
byId('content').addEventListener('click', event => {
  if (event.target.closest('#retry-page')) { void refresh(); return; }
  const target = event.target.closest('[data-target]')?.dataset.target;
  if (target) void navigateToPage(target);
});
byId('refresh').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true; button.classList.add('is-loading');
  try { await refresh(); notice('Dados atualizados.'); }
  catch (error) { notice(error.message, true); }
  finally { button.disabled = false; button.classList.remove('is-loading'); }
});
byId('notice-close').addEventListener('click', () => { window.clearTimeout(noticeTimer); byId('notice').hidden = true; });

function renderQuickResults(query = '') {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const pages = [...document.querySelectorAll('.nav-item')].filter(button => `${button.dataset.label} ${pageDescriptions[button.dataset.page]}`.toLocaleLowerCase('pt-BR').includes(normalized));
  byId('quick-results').innerHTML = pages.length ? pages.map((button, index) => `<button class="quick-result" role="option" aria-selected="false" data-quick-page="${escapeHtml(button.dataset.page)}" type="button">${icon(pageIcons[button.dataset.page], 'quick-result-icon')}<span>${escapeHtml(button.dataset.label)}</span>${index === 0 ? '<kbd>Enter</kbd>' : ''}</button>`).join('') : '<p class="empty">Nenhuma seção encontrada.</p>';
  document.querySelectorAll('[data-quick-page]').forEach(button => button.addEventListener('click', () => {
    byId('quick-dialog').close();
    void navigateToPage(button.dataset.quickPage);
  }));
}

function openQuickNavigation() {
  renderQuickResults('');
  byId('quick-dialog').showModal();
  byId('quick-search').value = '';
  byId('quick-search').focus();
}

byId('quick-open').addEventListener('click', openQuickNavigation);
byId('quick-search').addEventListener('input', event => renderQuickResults(event.currentTarget.value));
byId('quick-search').addEventListener('keydown', event => {
  const options = [...byId('quick-results').querySelectorAll('[data-quick-page]')];
  const index = options.indexOf(document.activeElement);
  if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); options[(index + 1) % options.length].focus(); }
  if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); options[(index <= 0 ? options.length : index) - 1].focus(); }
  if (event.key === 'Enter' && options.length) { event.preventDefault(); options[0].click(); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!byId('quick-dialog').open) openQuickNavigation(); }
});
byId('announcement-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget; const id = form.dataset.id;
  const payload = { titulo: byId('announcement-title').value.trim(), texto: byId('announcement-text').value.trim(), imageUrl: byId('announcement-image').value.trim() || null };
  const button = byId('save-announcement'); button.disabled = true; byId('announcement-error').textContent = '';
  try {
    const result = await request(id ? `/api/painel/announcements/${encodeURIComponent(id)}` : '/api/painel/announcements', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    state.announcements = result.announcements;
    byId('announcement-dialog').close(); renderAnnouncements();
    notice(id ? 'Aviso atualizado no Discord.' : 'Aviso publicado no Discord.');
  } catch (error) { byId('announcement-error').textContent = error.message; }
  finally { button.disabled = false; }
});
byId('close-announcement').addEventListener('click', () => byId('announcement-dialog').close());
byId('cancel-announcement').addEventListener('click', () => byId('announcement-dialog').close());
byId('announcement-image').addEventListener('input', event => {
  const preview = byId('announcement-image-preview');
  const value = event.currentTarget.value.trim();
  preview.hidden = !value;
  if (value) preview.src = value;
});
byId('close-channel').addEventListener('click', () => byId('channel-dialog').close());
byId('cancel-channel').addEventListener('click', () => byId('channel-dialog').close());
byId('channel-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const channelId = form.dataset.id;
  const payload = { name: byId('channel-name').value.trim(), type: byId('channel-type').value,
    topic: byId('channel-topic').value.trim(), parentId: byId('channel-parent').value || null,
    position: Number(byId('channel-position').value) };
  const button = byId('save-channel'); button.disabled = true;
  try {
    const result = await request(channelId ? `/api/painel/channels/${encodeURIComponent(channelId)}` : '/api/painel/channels', {
      method: channelId ? 'PATCH' : 'POST', body: JSON.stringify(payload)
    });
    state.managedChannels = (await request('/api/painel/channels')).channels;
    byId('channel-dialog').close(); renderChannels(state.data);
    notice(channelId ? 'Canal atualizado.' : `Canal #${result.channel.name} criado.`);
  } catch (error) { byId('channel-error').textContent = error.message; }
  finally { button.disabled = false; }
});
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
