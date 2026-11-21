import { hashPin, randomSecret } from './crypto'

/**
 * Demo account system (stored on this device). In production this is a server:
 * hashed passwords (argon2/bcrypt), email verification and refresh tokens.
 */
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function passwordStrength(pw: string) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  const label = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong', 'Very strong'][score]
  return { score, label, ok: pw.length >= 8 && score >= 2 }
}

export async function makeAccount(email: string, username: string, password: string, stay: boolean) {
  const salt = randomSecret(8)
  return { email: email.trim().toLowerCase(), username: username.trim().toLowerCase(), passHash: await hashPin(password, salt), salt, stay }
}

export async function checkLogin(acc: { email: string; username: string; passHash: string; salt: string } | null, id: string, password: string) {
  if (!acc) return 'no_account'
  const who = id.trim().toLowerCase().replace(/^@/, '')
  if (who !== acc.email && who !== acc.username) return 'unknown_user'
  return (await hashPin(password, acc.salt)) === acc.passHash ? 'ok' : 'bad_password'
}
