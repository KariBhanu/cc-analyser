"""Outbound SMS -- console stub.

Deliberately not wired to a provider. Sending transactional SMS to Indian numbers
requires DLT registration (TRAI mandate): the sender ID and message template must
be registered with a telecom operator before anything is delivered, which is
paperwork plus a per-message cost. Until that's done, codes are logged here and
the rest of the flow works unchanged.

To plug a provider in later, implement `send_sms` and nothing else changes:

    MSG91   POST https://control.msg91.com/api/v5/flow/
            headers {"authkey": ...}, json {"template_id", "recipients": [...]}
    Twilio  POST https://api.twilio.com/2010-04-01/Accounts/<sid>/Messages.json
            basic auth (sid, token), form {"To", "From", "Body"}

Both need the OTP template pre-registered under DLT for Indian destinations.
Add credentials to config.py alongside the SMTP ones and flip
`settings.sms_configured`.
"""
import logging

from ..config import settings

log = logging.getLogger("smartcred.sms")


def send_sms(to: str, body: str) -> bool:
    """Return True if handed to a provider, False if only logged."""
    log.warning("SMS provider not configured — message NOT sent.\n  To: %s\n  %s", to, body)
    return False


def send_otp_sms(to: str, code: str) -> bool:
    minutes = max(1, settings.otp_ttl_seconds // 60)
    return send_sms(to, f"{code} is your SmartCred verification code. Valid for {minutes} minutes.")
