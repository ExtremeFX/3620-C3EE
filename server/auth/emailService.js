'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const nodemailer = require('nodemailer')

// Simple fallback .env parser for local dev
try {
  const envPath = path.join(__dirname, '..', '..', '.env')
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8')
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim()
        const val = trimmed.slice(idx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    })
  }
} catch (_) {}

/**
 * HARPIA Universe - Email Service & Verification Dispatcher
 *
 * Envia emails com código OTP de 6 dígitos formatados com tema Sci-Fi.
 * Suporta:
 * 1. Gmail SMTP (porta 587 STARTTLS) — envia para qualquer email no mundo
 * 2. Resend API
 * 3. Log Fallback seguro
 */

let cachedTransporter = null

function getTransporter() {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER || 'harpiauniverse@gmail.com'
  const pass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '')

  if (!user || !pass) return null

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false, // STARTTLS
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    })
  }
  return cachedTransporter
}

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
  const senderEmail = process.env.EMAIL_FROM || 'HARPIA Universe <harpiauniverse@gmail.com>'
  const subject = `[HARPIA Universe] Pilot Verification Access Code: ${code}`
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
          <div class="subtitle">Central Command — Pilot Enlistment</div>
        </div>
        <p class="greeting">Greetings, Commander <strong>${username}</strong>!</p>
        <p class="greeting">To activate your flight credentials and claim your starter ship in the HARPIA BASE hangar, enter the following 6-digit access code into the game terminal:</p>
        
        <div class="code-container">
          <div class="code-box">${code}</div>
        </div>
        
        <p class="greeting" style="font-size: 13px; color: #8cb0cc;">This security clearance code expires in <strong>15 minutes</strong>. If you did not request this transmission, you can safely disregard it.</p>
        
        <div class="footer">
          © HARPIA Universe — Sci-Fi Space MMORPG
        </div>
      </div>
    </body>
    </html>
  `

  // 1. Prioridade: Gmail / SMTP (entrega universal para qualquer caixa de correio)
  const transporter = getTransporter()
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: senderEmail,
        to: toEmail,
        subject: subject,
        html: htmlContent
      })
      console.log(`[EMAIL] Código OTP enviado com sucesso via Gmail SMTP para: ${toEmail} (msgId: ${info.messageId})`)
      return { sent: true, mode: 'smtp', id: info.messageId }
    } catch (err) {
      console.error('[EMAIL] Falha no envio via Gmail SMTP:', err.message)
    }
  }

  // 2. Fallback: Resend API (se estiver configurado)
  const resendApiKey = process.env.RESEND_API_KEY
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
        console.log(`[EMAIL] Código de verificação enviado via Resend para: ${toEmail}`)
        return { sent: true, mode: 'resend', id: data.id }
      }
    } catch (err) {
      console.error('[EMAIL] Erro de ligação com a Resend:', err.message)
    }
  }

  // 3. Fallback final: Log no servidor
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
