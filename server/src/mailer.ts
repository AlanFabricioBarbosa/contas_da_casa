export interface VerificationMail {
  to: string;
  name: string;
  code: string;
  kind?: 'register' | 'reset';
}

export type MailSender = (mail: VerificationMail) => Promise<void>;

/**
 * Envia o código de verificação por HTTP (compatível com o plano gratuito do Render):
 * 1) Gmail via Google Apps Script (MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET)
 * 2) Brevo API v3 (BREVO_API_KEY + BREVO_SENDER_EMAIL)
 * 3) Em modo local sem nenhum dos dois configurados, imprime o código no terminal.
 */
export async function sendVerificationMail({ to, name, code, kind = 'register' }: VerificationMail): Promise<void> {
  const isReset = kind === 'reset';
  const subject = isReset
    ? `Código para trocar sua senha: ${code} — Contas da Casa`
    : `Seu código de verificação: ${code} — Contas da Casa`;
  const actionText = isReset
    ? 'para criar uma nova senha no Contas da Casa'
    : 'para confirmar seu cadastro no Contas da Casa';
  const text = `Olá, ${name}!\n\nUse o código ${code} ${actionText}.\nEle vale por 10 minutos.\n\nSe você não pediu isso, ignore este e-mail.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="margin:0 0 12px;color:#0f766e">Contas da Casa</h2>
      <p>Olá, <strong>${escapeHtml(name)}</strong>!</p>
      <p>Digite o código abaixo ${actionText}:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px;text-align:center;color:#0f766e;margin:20px 0">${code}</p>
      <p style="font-size:13px;color:#6b7280">Este código vale por 10 minutos. Se você não pediu isso, pode ignorar este e-mail.</p>
    </div>
  `;

  const webhookUrl = process.env.MAIL_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: process.env.MAIL_WEBHOOK_SECRET?.trim() ?? '',
        to,
        subject,
        text,
        html,
      }),
    });
    const bodyText = await res.text().catch(() => '');
    let parsed: { ok?: boolean; error?: string } | null = null;
    try {
      parsed = JSON.parse(bodyText) as { ok?: boolean; error?: string };
    } catch {
      parsed = null;
    }
    if (!res.ok || !parsed?.ok) {
      console.error(`Apps Script mail error (${res.status}):`, bodyText.slice(0, 300));
      throw new Error('Não foi possível enviar o e-mail de verificação agora. Tente de novo em instantes.');
    }
    return;
  }

  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Contas da Casa';
  if (apiKey && senderEmail) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`Brevo error (${res.status}):`, detail);
      throw new Error('Não foi possível enviar o e-mail de verificação agora. Tente de novo em instantes.');
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Serviço de e-mail não configurado no servidor (MAIL_WEBHOOK_URL).');
  }
  console.log(`[Modo local] Código de verificação para ${to}: ${code}`);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
