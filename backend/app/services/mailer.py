"""Outbound email.

Sends through Gmail's SMTP with an App Password when configured; otherwise logs
the message to the backend console so the whole verification flow still works in
development without any provider account.

Gmail setup:
  1. Google Account -> Security -> turn on 2-Step Verification (required).
  2. Security -> App passwords -> generate one for "Mail".
  3. In backend/.env:
       SMTP_HOST=smtp.gmail.com
       SMTP_PORT=587
       SMTP_USER=you@gmail.com
       SMTP_PASSWORD=<the 16-character app password, no spaces>
       SMTP_FROM=SmartCred <you@gmail.com>
Gmail caps this at roughly 500 recipients/day, which is ample for personal use.
"""
import logging
import smtplib
from email.message import EmailMessage

from ..config import settings

log = logging.getLogger("smartcred.mailer")


def send_email(to: str, subject: str, body: str) -> bool:
    """Return True if handed to an SMTP server, False if only logged."""
    if not settings.smtp_configured:
        log.warning(
            "SMTP not configured — email NOT sent.\n"
            "  To: %s\n  Subject: %s\n  %s", to, subject, body,
        )
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                server.ehlo()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        log.info("Sent email to %s (%s)", to, subject)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        # Never surface SMTP internals to the caller; the endpoint reports a
        # generic failure and the operator reads the reason here.
        log.error("Failed to send email to %s: %s", to, exc)
        return False


def send_otp_email(to: str, code: str) -> bool:
    minutes = max(1, settings.otp_ttl_seconds // 60)
    return send_email(
        to,
        "Your SmartCred verification code",
        f"Your SmartCred verification code is {code}.\n\n"
        f"It expires in {minutes} minutes. If you didn't request this, you can ignore this email.\n",
    )
