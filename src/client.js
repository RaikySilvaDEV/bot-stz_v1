import { Client, GatewayIntentBits } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
export const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
export const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
	rest: { timeout: 120_000 }
});
