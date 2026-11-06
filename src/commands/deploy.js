import { REST, Routes } from 'discord.js';
import { client } from '../client.js';
import { GUILD_ID, TOKEN } from '../config/constants.js';
import { getSlashCommands } from './definitions.js';

export async function registrarComandos() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
        Routes.applicationGuildCommands(client.application.id, GUILD_ID),
        { body: getSlashCommands() }
    );
    console.log('Comandos de barra registrados no servidor.');
}
