# Builds Luda's branded sign-in emails (Supabase Auth templates) into this folder.
# Run: python3 supabase/emails/build.py  → *.html + subjects.json. The deploy workflow applies them to Supabase.
# Email-safe: tables, inline styles, light background, no images or scripts (works in Gmail, Outlook, iPhone Mail).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

def layout(preheader, title, intro, button=None, link=True, code=None, note='', after=''):
    btn = ''
    if button:
        btn = f'''<tr><td align="center" style="padding:8px 32px 8px">
  <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;background:#10b981;color:#06281f;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:14px">{button}</a>
</td></tr>'''
        if link:
            btn += '''<tr><td style="padding:8px 32px 0;font-size:12px;line-height:18px;color:#64748b">Button not working? Copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:#059669;word-break:break-all">{{ .ConfirmationURL }}</a></td></tr>'''
    codeblock = ''
    if code:
        codeblock = '''<tr><td align="center" style="padding:8px 32px 8px"><div style="display:inline-block;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:14px 28px;font-size:32px;letter-spacing:8px;font-weight:800;color:#064e3b;font-family:Menlo,Consolas,monospace">{{ .Token }}</div></td></tr>'''
    notehtml = f'<tr><td style="padding:20px 32px 0;font-size:13px;line-height:20px;color:#64748b">{note}</td></tr>' if note else ''
    afterhtml = f'<tr><td style="padding:12px 32px 0;font-size:15px;line-height:24px;color:#334155">{after}</td></tr>' if after else ''
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;color:#f1f5f4">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:4px 8px 16px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="width:40px;height:40px;background:#10b981;border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:800;color:#ffffff">L</td>
    <td style="padding-left:10px;font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">Luda</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;padding:0 0 28px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:6px;background:#10b981;border-radius:20px 20px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:28px 32px 6px;font-size:22px;line-height:30px;font-weight:800;color:#0f172a">{title}</td></tr>
    <tr><td style="padding:6px 32px 16px;font-size:15px;line-height:24px;color:#334155">{intro}</td></tr>
    {btn}{codeblock}{afterhtml}{notehtml}
  </table>
</td></tr>
<tr><td style="padding:18px 16px 0;font-size:12px;line-height:18px;color:#64748b;text-align:center">
  Luda · money, help and student life in North Cyprus<br>
  <a href="https://useluda.com" style="color:#059669;text-decoration:none">useluda.com</a> · Need help? <a href="mailto:support@useluda.com" style="color:#059669;text-decoration:none">support@useluda.com</a><br>
  <span style="color:#94a3b8">Luda will never ask for your PIN, password or sign-in code by email, phone or chat.</span>
</td></tr>
</table></td></tr></table>
</body></html>
'''

T = {
 'confirmation': ('Confirm your Luda account', layout('One tap to finish creating your Luda account.', 'Welcome to Luda 👋🏾', 'Thanks for joining. Confirm your email address to finish creating your account.', 'Confirm my email', note="Didn't sign up for Luda? You can ignore this email; no account will be created.")),
 'recovery': ('Reset your Luda password', layout('Choose a new password for your Luda account.', 'Reset your password', 'We received a request to reset the password for your Luda account. Tap the button to choose a new one. The link works once and expires soon.', 'Choose a new password', note="Didn't ask for this? Ignore this email: your password stays the same. For your safety, withdrawals and sending money pause for 24 hours after a password reset.")),
 'magic_link': ('Your Luda sign-in link', layout('Tap to sign in to Luda.', 'Sign in to Luda', 'Tap the button to sign in. The link works once and expires soon.', 'Sign in', note="Didn't try to sign in? Ignore this email. Someone may have typed your email by mistake.")),
 'email_change': ('Confirm your new email for Luda', layout('Confirm the new email address for your Luda account.', 'Confirm your new email', 'You asked to change the email on your Luda account from <b>{{ .Email }}</b> to <b>{{ .NewEmail }}</b>. Tap the button to confirm.', 'Confirm new email', note="Didn't ask for this? Don't tap the button, and contact the Luda team at support@useluda.com.")),
 'invite': ("You're invited to Luda", layout("You've been invited to join Luda.", "You're invited to Luda", "You've been invited to join Luda: wallet, P2P exchange, bills, bus tickets and help from people nearby in North Cyprus. Tap the button to accept.", 'Accept invitation')),
 'reauthentication': ('{{ .Token }} is your Luda code', layout('Your Luda verification code.', 'Your verification code', 'Use this code to confirm it\'s you. It expires in a few minutes.', code=True, note="Never share this code with anyone, not even someone who says they're from Luda.")),
 'password_changed_notification': ('Your Luda password was changed', layout('Your Luda password was just changed.', 'Your password was changed', 'The password for your Luda account (<b>{{ .Email }}</b>) was just changed.', note="If this was you, there's nothing to do. If it wasn't, open Luda → Security → Freeze my account right away, and contact support@useluda.com.")),
 'email_changed_notification': ('Your Luda email was changed', layout('The email on your Luda account was changed.', 'Your email was changed', 'The email for your Luda account was changed from <b>{{ .OldEmail }}</b> to <b>{{ .Email }}</b>.', note="If this wasn't you, contact support@useluda.com right away.")),
}
subjects = {}
for k, (subj, html) in T.items():
    open(os.path.join(HERE, f'{k}.html'), 'w').write(html)
    subjects[k] = subj
json.dump(subjects, open(os.path.join(HERE, 'subjects.json'), 'w'), indent=1, ensure_ascii=False)
print('built', len(T), 'templates')
