# Builds Luda's branded sign-in emails (Supabase Auth templates) into this folder.
# Run: python3 supabase/emails/build.py  → *.html + subjects.json. The deploy workflow applies them to Supabase.
# Email-safe: tables, inline styles, light background, no images or scripts (works in Gmail, Outlook, iPhone Mail).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

LOGO = 'https://useluda.com/email/logo-96.png'

def layout(preheader, title, intro, button=None, link=True, code=None, note='', after='', icon='🔐'):
    """One email: brand header with the real Luda logo, an icon badge, headline, text, one button, safety note, footer.
    Light design (survives Gmail's dark-mode inversion) + extra dark-mode styles for Apple Mail / iOS."""
    btn = ''
    if button:
        btn = f'''<tr><td align="center" style="padding:10px 36px 6px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="btn" style="border-radius:14px;background:#059669">
    <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:15px 34px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">{button} &rarr;</a>
  </td></tr></table>
</td></tr>'''
        if link:
            btn += '''<tr><td style="padding:14px 36px 0;font-size:12px;line-height:18px;color:#64748b" class="muted">Button not working? Copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:#047857;word-break:break-all">{{ .ConfirmationURL }}</a></td></tr>'''
    codeblock = ''
    if code:
        codeblock = '''<tr><td align="center" style="padding:6px 36px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="code" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;padding:16px 30px;font-size:34px;letter-spacing:10px;font-weight:800;color:#064e3b;font-family:Menlo,Consolas,'Courier New',monospace">{{ .Token }}</td></tr></table></td></tr>'''
    notehtml = f'''<tr><td style="padding:22px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="note" style="background:#f8fafc;border-radius:14px;padding:14px 16px;font-size:13px;line-height:20px;color:#475569">🛡️&nbsp; {note}</td></tr></table></td></tr>''' if note else ''
    afterhtml = f'<tr><td style="padding:12px 36px 0;font-size:15px;line-height:24px;color:#334155" class="body">{after}</td></tr>' if after else ''
    return f'''<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>{title}</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .bg {{ background:#0b1220 !important }} .card {{ background:#111a2b !important; border-color:#1f2a3d !important }}
    .h {{ color:#f1f5f9 !important }} .body {{ color:#cbd5e1 !important }} .muted {{ color:#94a3b8 !important }}
    .note {{ background:#0f2233 !important; color:#cbd5e1 !important }} .code {{ background:#06281f !important; color:#a7f3d0 !important; border-color:#065f46 !important }}
    .brand {{ color:#f1f5f9 !important }} a {{ color:#34d399 !important }}
  }}
  @media (max-width:520px) {{ .pad {{ padding-left:22px !important; padding-right:22px !important }} }}
</style></head>
<body style="margin:0;padding:0;background:#eef4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased" class="bg">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef4f1">{preheader}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#eef4f1"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
<tr><td style="padding:0 6px 18px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><img src="{LOGO}" width="44" height="44" alt="Luda" style="display:block;border:0;border-radius:12px"></td>
    <td style="padding-left:12px;vertical-align:middle;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#0f172a" class="brand">Luda</td>
  </tr></table>
</td></tr>
<tr><td class="card" style="background:#ffffff;border:1px solid #dfe9e4;border-radius:24px;overflow:hidden">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="height:120px;background:#059669;background-image:linear-gradient(135deg,#34d399 0%,#059669 55%,#064e3b 100%);text-align:center;vertical-align:middle">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="width:64px;height:64px;border-radius:32px;background:#ffffff;text-align:center;vertical-align:middle;font-size:30px;line-height:64px">{icon}</td></tr></table>
    </td></tr>
    <tr><td class="pad h" style="padding:30px 36px 6px;font-size:24px;line-height:32px;font-weight:800;color:#0f172a;letter-spacing:-0.3px">{title}</td></tr>
    <tr><td class="pad body" style="padding:8px 36px 18px;font-size:16px;line-height:26px;color:#334155">{intro}</td></tr>
    {btn}{codeblock}{afterhtml}{notehtml}
    <tr><td style="height:30px;font-size:0;line-height:0">&nbsp;</td></tr>
  </table>
</td></tr>
<tr><td style="padding:22px 18px 0;text-align:center;font-size:12px;line-height:19px;color:#64748b" class="muted">
  <b style="color:#334155" class="brand">Luda</b> &middot; money, help and student life in North Cyprus<br>
  <a href="https://useluda.com" style="color:#047857;text-decoration:none">useluda.com</a> &nbsp;&middot;&nbsp; Need help? <a href="mailto:support@useluda.com" style="color:#047857;text-decoration:none">support@useluda.com</a><br>
  <span style="color:#94a3b8">Luda will never ask for your PIN, password or sign-in code by email, phone or chat.</span>
</td></tr>
</table></td></tr></table>
</body></html>
'''

T = {
 'confirmation': ('Confirm your Luda account', layout('One tap to finish creating your Luda account.', 'Welcome to Luda 👋🏾', 'Thanks for joining. Confirm your email address to finish creating your account.', 'Confirm my email', note="Didn't sign up for Luda? You can ignore this email; no account will be created.", icon='👋🏾')),
 'recovery': ('Reset your Luda password', layout('Choose a new password for your Luda account.', 'Reset your password', 'We received a request to reset the password for your Luda account. Tap the button to choose a new one. The link works once and expires soon.', 'Choose a new password', note="Didn't ask for this? Ignore this email: your password stays the same. For your safety, withdrawals and sending money pause for 24 hours after a password reset.", icon='🔑')),
 'magic_link': ('Your Luda sign-in link', layout('Tap to sign in to Luda.', 'Sign in to Luda', 'Tap the button to sign in. The link works once and expires soon.', 'Sign in', note="Didn't try to sign in? Ignore this email. Someone may have typed your email by mistake.", icon='✨')),
 'email_change': ('Confirm your new email for Luda', layout('Confirm the new email address for your Luda account.', 'Confirm your new email', 'You asked to change the email on your Luda account from <b>{{ .Email }}</b> to <b>{{ .NewEmail }}</b>. Tap the button to confirm.', 'Confirm new email', note="Didn't ask for this? Don't tap the button, and contact the Luda team at support@useluda.com.", icon='✉️')),
 'invite': ("You're invited to Luda", layout("You've been invited to join Luda.", "You're invited to Luda", "You've been invited to join Luda: bus tickets, bills and rent paid for you, phone top-ups and help from people nearby in North Cyprus. Tap the button to accept.", 'Accept invitation', icon='🎉')),
 'reauthentication': ('{{ .Token }} is your Luda code', layout('Your Luda verification code.', 'Your verification code', 'Use this code to confirm it\'s you. It expires in a few minutes.', code=True, note="Never share this code with anyone, not even someone who says they're from Luda.", icon='🔢')),
 'password_changed_notification': ('Your Luda password was changed', layout('Your Luda password was just changed.', 'Your password was changed', 'The password for your Luda account (<b>{{ .Email }}</b>) was just changed.', note="If this was you, there's nothing to do. If it wasn't, open Luda → Security → Freeze my account right away, and contact support@useluda.com.", icon='🔐')),
 'email_changed_notification': ('Your Luda email was changed', layout('The email on your Luda account was changed.', 'Your email was changed', 'The email for your Luda account was changed from <b>{{ .OldEmail }}</b> to <b>{{ .Email }}</b>.', note="If this wasn't you, contact support@useluda.com right away.", icon='📬')),
}
subjects = {}
for k, (subj, html) in T.items():
    open(os.path.join(HERE, f'{k}.html'), 'w').write(html)
    subjects[k] = subj
json.dump(subjects, open(os.path.join(HERE, 'subjects.json'), 'w'), indent=1, ensure_ascii=False)
print('built', len(T), 'templates')
