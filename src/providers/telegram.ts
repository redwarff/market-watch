import type { Notifier } from './types';

export class TelegramNotifier implements Notifier {
  private get token(): string {
    return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  private get chatId(): string {
    return (process.env.TELEGRAM_CHAT_ID || '').trim();
  }

  get configured(): boolean {
    return Boolean(this.token && this.chatId);
  }

  async send(text: string): Promise<string | null> {
    if (!this.configured) throw new Error('Telegram is not configured.');
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      cache: 'no-store',
    });
    const body = (await response.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!response.ok || !body.ok) throw new Error(body.description || `Telegram ${response.status}.`);
    return body.result?.message_id != null ? String(body.result.message_id) : null;
  }
}
