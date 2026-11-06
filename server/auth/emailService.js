'use strict'

const crypto = require('crypto')

/**
 * HARPIA Universe - Email Service & Verification Dispatcher
 * 
 * Envia emails com código OTP de 6 dígitos formatados com tema Sci-Fi.
 * Suporta Resend API (3000 emails/mês grátis com 1 chave) ou fallback com registo em log.
 */

/**
 * Gera código numérico seguro de 6 dígitos
 */
function generateOtpCode() {
  return crypto.randomInt(100000, 999999).toString()
}

/**
 * Envia o email com o código OTP de 6 dígitos para o utilizador
 * @param {string} toEmail 
 * @param {string} username 
 * @param {string} code 
 * @returns {Promise<{ sent: boolean, mode: string, error?: string }>}
 */
async function sendVerificationEmail(toEmail, username, code) {
  const resendApiKey = process.env.RESEND_API_KEY
  const senderEmail = process.env.EMAIL_FROM || 'HARPIA Universe <onboarding@resend.dev>'

  const subject = `[HARPIA Universe] Código de Verificação do Piloto: ${code}`
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #030a14; color: #e6f7ff; margin: 0; padding: 24px; }
        .card { max-width: 500px; margin: 0 auto; background: #061526; border: 1px solid rgba(0,240,255,0.3); border-radius: 8px; padding: 32px; box-shadow: 0 0 30px rgba(0,240,255,0.15); }
        .header { text-align: center; border-bottom: 1px solid rgba(0,240,255,0.2); padding-bottom: 16px; margin-bottom: 24px; }
        .title { color: #00f0ff; font-size: 22px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
        .subtitle { color: #78a6c8; font-size: 13px; margin-top: 6px; }
        .greeting { font-size: 15px; color: #d0e8f8; line-height: 1.5; }
        .code-container { text-align: center; margin: 30px 0; }
        .code-box { display: inline-block; background: rgba(0,240,255,0.08); border: 2px solid #00f0ff; color: #00f0ff; font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 12px 28px; border-radius: 6px; }
        .footer { font-size: 12px; color: #5a7b96; text-align: center; margin-top: 28px; border-top: 1px solid rgba(0,240,255,0.1); padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="title">HARPIA UNIVERSE</h1>
          <div class="subtitle">Comando Central de Alistamento de Pilotos</div>
        </div>
        <p class="greeting">Olá, futuro piloto <strong>${username}</strong>!</p>
        <p class="greeting">Para ativares a tua conta e receberes a tua primeira nave no hangar de HARPIA PRIME, introduz o seguinte código de segurança de 6 dígitos no jogo:</p>
        
        <div class="code-container">
          <div class="code-box">${code}</div>
        </div>
        
        <p class="greeting" style="font-size: 13px; color: #8cb0cc;">Este código expira dentro de <strong>15 minutos</strong>. Se não solicitaste a criação desta conta, podes ignorar esta mensagem com total segurança.</p>
        
        <div class="footer">
          © HARPIA Universe — MMORPG Espacial de Ficção Científica
        </div>
      </div>
    </body>
    </html>
  `

  // Se a chave da Resend estiver configurada no Hostless
  if (resendApiKey) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${resendApiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [toEmail],
          subject: subject,
          html: htmlContent
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)
      const data = await response.json()

      if (response.ok) {
        console.log(`[EMAIL] Código de verificação enviado com sucesso via Resend para: ${toEmail}`)
        return { sent: true, mode: 'resend', id: data.id }
      } else {
        console.warn('[EMAIL] Resend retornou erro:', data)
      }
    } catch (err) {
      console.error('[EMAIL] Erro de ligação com a Resend:', err.message)
    }
  }

  // Fallback seguro: regista nos logs do servidor (Hostless Logs)
  console.log('===========================================================')
  console.log(`[EMAIL-VERIFY] Piloto: ${username} | Email: ${toEmail}`)
  console.log(`[EMAIL-VERIFY] CÓDIGO DE VERIFICAÇÃO (OTP): >>> ${code} <<<`)
  console.log('===========================================================')

  return { sent: true, mode: 'log_fallback' }
}

module.exports = {
  generateOtpCode,
  sendVerificationEmail
}
