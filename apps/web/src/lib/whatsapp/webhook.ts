/**
 * Tipos e defaults do webhook WhatsApp (Uazapi).
 *
 * Mantido fora dos arquivos `"use server"` porque módulos server-only
 * só podem exportar funções `async`. Constantes/types vão aqui pra
 * serem usados por client e server.
 */

export type WhatsappWebhook = {
  id?: string;
  url: string;
  enabled: boolean;
  events: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
  addUrlTypesMessages?: boolean;
};

/** Config padrão Groner — webhook que aponta pra n8n da Groner. */
export const GRONER_WEBHOOK_DEFAULT: WhatsappWebhook = {
  url: "https://webhooks.gronercrm.com.br/webhook/aiuazapi",
  enabled: true,
  events: ["messages"],
  excludeMessages: ["wasSentByApi", "fromMeYes", "isGroupYes"],
  addUrlEvents: false,
  addUrlTypesMessages: false,
};
