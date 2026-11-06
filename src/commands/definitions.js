import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { AUTOMATION_CHOICES, CHANNEL_CHOICES } from '../features/administration.js';
import { COMMERCE_AUTOMATION_LABELS } from '../repositories/commerceRepository.js';
import { getCommerceProducts } from '../repositories/commerceRepository.js';

export function getSlashCommands() {
const PRODUCTS = getCommerceProducts({ includeInactive: false });
return [
    new SlashCommandBuilder()
        .setName('ajuda')
        .setDescription('Mostra os comandos e recursos do bot.'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Mostra a latência do bot.'),
    new SlashCommandBuilder()
        .setName('teste')
        .setDescription('Verifica se o bot está respondendo neste servidor.'),
    new SlashCommandBuilder()
        .setName('vendas')
        .setDescription('Mostra a vitrine com imagens e botões para adicionar produtos ao carrinho.'),
    new SlashCommandBuilder()
        .setName('comprar')
        .setDescription('Abre o carrinho interativo para comprar um produto.'),
    new SlashCommandBuilder()
        .setName('pagamentos')
        .setDescription('Abre o painel interativo para gerenciar formas de pagamento.')
        .addSubcommand(sub => sub.setName('teste').setDescription('Gera Pix real de R$ 0,10 e entrega o cargo de teste após confirmação.')),
    new SlashCommandBuilder()
        .setName('loja')
        .setDescription('Configura automações comerciais; as novas rotinas começam desligadas.')
        .addSubcommand(sub => sub.setName('status').setDescription('Mostra automações, cargos e estoque configurados.'))
        .addSubcommand(sub => sub.setName('publicar').setDescription('Publica ou atualiza a vitrine com imagens e botões de compra.'))
        .addSubcommand(sub => sub.setName('automacao').setDescription('Configura uma automação da loja sem ativar as demais.')
            .addStringOption(option => option.setName('tipo').setDescription('Automação').setRequired(true)
                .addChoices(...Object.entries(COMMERCE_AUTOMATION_LABELS).map(([value, name]) => ({ name, value }))))
            .addBooleanOption(option => option.setName('ativa').setDescription('Estado desejado').setRequired(true)))
        .addSubcommand(sub => sub.setName('cargo').setDescription('Vincula o cargo que será entregue após confirmação de pagamento.')
            .addStringOption(option => option.setName('produto').setDescription('Produto').setRequired(true)
                .addChoices(...PRODUCTS.map(product => ({ name: product.name, value: product.value }))))
            .addRoleOption(option => option.setName('cargo').setDescription('Cargo associado ao produto').setRequired(true)))
        .addSubcommand(sub => sub.setName('instrucoes').setDescription('Salva a mensagem privada que será enviada na entrega digital.')
            .addStringOption(option => option.setName('produto').setDescription('Produto').setRequired(true)
                .addChoices(...PRODUCTS.map(product => ({ name: product.name, value: product.value }))))
            .addStringOption(option => option.setName('texto').setDescription('Instruções de acesso (máximo 1500 caracteres)').setRequired(true).setMaxLength(1500)))
        .addSubcommand(sub => sub.setName('imagem').setDescription('Define a imagem ou GIF exibido no card do produto.')
            .addStringOption(option => option.setName('produto').setDescription('Produto').setRequired(true)
                .addChoices(...PRODUCTS.map(product => ({ name: product.name, value: product.value }))))
            .addStringOption(option => option.setName('url').setDescription('Link HTTPS direto da imagem ou GIF').setRequired(true).setMaxLength(500)))
        .addSubcommand(sub => sub.setName('link-entrega').setDescription('Define um link HTTPS para arquivo ou conteúdo do produto.')
            .addStringOption(option => option.setName('produto').setDescription('Produto').setRequired(true)
                .addChoices(...PRODUCTS.map(product => ({ name: product.name, value: product.value }))))
            .addStringOption(option => option.setName('url').setDescription('Link privado ou de download').setRequired(true).setMaxLength(500)))
        .addSubcommand(sub => sub.setName('estoque').setDescription('Define o estoque; use zero para ilimitado.')
            .addStringOption(option => option.setName('produto').setDescription('Produto').setRequired(true)
                .addChoices(...PRODUCTS.map(product => ({ name: product.name, value: product.value }))))
            .addIntegerOption(option => option.setName('quantidade').setDescription('Unidades; zero significa ilimitado').setMinValue(0).setMaxValue(100000).setRequired(true)))
        .addSubcommand(sub => sub.setName('cupom-criar').setDescription('Cria cupom; só aplica desconto quando automação de cupons for ativada.')
            .addStringOption(option => option.setName('codigo').setDescription('Código de 3 a 24 caracteres').setRequired(true).setMaxLength(24))
            .addIntegerOption(option => option.setName('desconto').setDescription('Desconto percentual (1 a 90)').setRequired(true).setMinValue(1).setMaxValue(90))
            .addIntegerOption(option => option.setName('usos').setDescription('Número máximo de usos').setRequired(true).setMinValue(1).setMaxValue(100000))
            .addIntegerOption(option => option.setName('validade-horas').setDescription('Validade em horas (opcional)').setMinValue(1).setMaxValue(8760)))
        .addSubcommand(sub => sub.setName('cupom-remover').setDescription('Remove um cupom pelo código.')
            .addStringOption(option => option.setName('codigo').setDescription('Código do cupom').setRequired(true).setMaxLength(24)))
        .addSubcommand(sub => sub.setName('relatorio').setDescription('Mostra pedidos, pendências e faturamento registrado.'))
        .addSubcommand(sub => sub.setName('feedbacks').setDescription('Mostra as avaliações recentes dos compradores.')),
    new SlashCommandBuilder()
        .setName('pedido')
        .setDescription('Ações administrativas de pedidos da loja.')
        .addSubcommand(sub => sub.setName('aprovar').setDescription('Marca manualmente um pedido como pago e tenta entregar o produto.')
            .addStringOption(option => option.setName('id').setDescription('ID completo ou primeiros 8 caracteres do pedido').setRequired(true).setMinLength(8).setMaxLength(36)))
        .addSubcommand(sub => sub.setName('entregar').setDescription('Tenta novamente liberar o cargo de um pedido já pago.')
            .addStringOption(option => option.setName('id').setDescription('ID completo ou primeiros 8 caracteres do pedido').setRequired(true).setMinLength(8).setMaxLength(36))),
    new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Cria ou atualiza o painel privado de saúde e controle do bot.'),
    new SlashCommandBuilder()
        .setName('cadastrar-parceria')
        .setDescription('Cadastra uma parceria para divulgação no servidor.'),
    new SlashCommandBuilder()
        .setName('anuncios-fivem')
        .setDescription('Gerencia os anúncios publicados no canal FiveM.'),
    new SlashCommandBuilder()
        .setName('parcerias')
        .setDescription('Lista, cadastra, edita e remove parcerias.'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Mostra o estado do bot e das integrações.'),
    new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Consulta o registro de ações administrativas.')
        .addIntegerOption(option => option.setName('quantidade').setDescription('Quantidade de registros (1 a 30).').setMinValue(1).setMaxValue(30)),
    new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Baixa uma cópia dos dados administrativos do bot.'),
    new SlashCommandBuilder()
        .setName('configurar')
        .setDescription('Configura canais e automações do bot.')
        .addSubcommand(subcommand => subcommand.setName('ver').setDescription('Mostra as configurações atuais.'))
        .addSubcommand(subcommand => subcommand
            .setName('canal').setDescription('Define um canal ou categoria do bot.')
            .addStringOption(option => option.setName('tipo').setDescription('Qual canal configurar.').setRequired(true).addChoices(...CHANNEL_CHOICES))
            .addChannelOption(option => option.setName('canal').setDescription('Canal ou categoria.').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory)))
        .addSubcommand(subcommand => subcommand
            .setName('automacao').setDescription('Liga ou pausa uma automação.')
            .addStringOption(option => option.setName('tipo').setDescription('Automação.').setRequired(true).addChoices(...AUTOMATION_CHOICES))
            .addBooleanOption(option => option.setName('ativa').setDescription('Ativar agora?').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('mencoes').setDescription('Liga ou desliga menções @everyone automáticas.')
            .addBooleanOption(option => option.setName('ativa').setDescription('Ativar menções?').setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('horarios').setDescription('Define os horários dos avisos automáticos.')
            .addStringOption(option => option.setName('horas').setDescription('Horas separadas por vírgula, no fuso configurado.').setRequired(true).setMaxLength(50)))
        .addSubcommand(subcommand => subcommand
            .setName('fuso').setDescription('Define o fuso horário usado nos agendamentos.')
            .addStringOption(option => option.setName('zona').setDescription('Fuso IANA, por exemplo America/Sao_Paulo.').setRequired(true).setMaxLength(80)))
        .addSubcommand(subcommand => subcommand
            .setName('auditoria').setDescription('Liga ou desliga o envio dos registros em um canal.')
            .addBooleanOption(option => option.setName('ativa').setDescription('Enviar logs para um canal?').setRequired(true))
            .addChannelOption(option => option.setName('canal').setDescription('Canal privado de logs.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
].map(command => command.toJSON());
}
