import { ChannelType, PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import { AUTOMATION_CHOICES, CHANNEL_CHOICES } from '../features/administration.js';

const DONO_PERMISSIONS = PermissionsBitField.Flags.Administrator;

export const slashCommands = [
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
        .setDescription('Mostra os produtos disponíveis e os links para compra.'),
    new SlashCommandBuilder()
        .setName('comprar')
        .setDescription('Abre o canal do produto que você quer comprar.')
        .addStringOption(option => option
            .setName('produto')
            .setDescription('Escolha um produto.')
            .setRequired(true)
            .addChoices(
                { name: 'Premium', value: 'premium' },
                { name: 'Cargo Booster', value: 'cargo_booster' },
                { name: 'Booster Premium', value: 'booster_premium' }
            )),
    new SlashCommandBuilder()
        .setName('cadastrar-parceria')
        .setDescription('Cadastra uma parceria para divulgação no servidor.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS),
    new SlashCommandBuilder()
        .setName('anuncios-fivem')
        .setDescription('Gerencia os anúncios publicados no canal FiveM.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS),
    new SlashCommandBuilder()
        .setName('parcerias')
        .setDescription('Lista, cadastra, edita e remove parcerias.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Mostra o estado do bot e das integrações.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS),
    new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Consulta o registro de ações administrativas.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS)
        .addIntegerOption(option => option.setName('quantidade').setDescription('Quantidade de registros (1 a 30).').setMinValue(1).setMaxValue(30)),
    new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Baixa uma cópia dos dados administrativos do bot.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS),
    new SlashCommandBuilder()
        .setName('configurar')
        .setDescription('Configura canais e automações do bot.')
        .setDefaultMemberPermissions(DONO_PERMISSIONS)
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
