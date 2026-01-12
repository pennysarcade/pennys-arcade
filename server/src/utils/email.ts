import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_EMAIL = 'Penny\'s Arcade <noreply@pennysarcade.games>'

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function sendVerificationEmail(
  email: string,
  username: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.error('[EMAIL] RESEND_API_KEY not configured - skipping email send')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    console.log(`[EMAIL] Attempting to send verification email to ${email}`)
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Verify your Penny\'s Arcade account',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #ff00ff; text-align: center;">Welcome to Penny's Arcade!</h1>
          <p style="font-size: 16px; color: #333;">Hi ${username},</p>
          <p style="font-size: 16px; color: #333;">Thanks for signing up! Please enter this verification code to complete your registration:</p>
          <div style="background: #1a1a2e; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 36px; font-weight: bold; color: #00ffff; letter-spacing: 8px;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
          <p style="font-size: 14px; color: #666;">If you didn't create an account, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #999; text-align: center;">Penny's Arcade - Play games, have fun!</p>
        </div>
      `,
    })

    if (error) {
      console.error('[EMAIL] Resend API error:', JSON.stringify(error))
      return { success: false, error: error.message }
    }

    console.log(`[EMAIL] Verification code sent to ${email}, id: ${data?.id}`)
    return { success: true }
  } catch (err) {
    console.error('[EMAIL] Exception sending verification email:', err)
    return { success: false, error: 'Failed to send email' }
  }
}
