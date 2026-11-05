import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';

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
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
].map(command => command.toJSON());
