import { client } from '../client.js';
import { handleRestrictedAnnouncementMessage } from '../features/announcementModeration.js';

client.on('messageCreate', message => {
    void handleRestrictedAnnouncementMessage(message).catch(error => {
        console.error('[anti-spam-anuncios] Falha inesperada na moderação:', error.message);
    });
});