# SES IAM for merchant domain verify

The `omer-ses-sender` user can send mail but needs identity permissions to verify customer domains (Easy DKIM).

Attach this inline policy (or equivalent) to `omer-ses-sender` in `eu-north-1`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OmerSesSend",
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    },
    {
      "Sid": "OmerSesIdentities",
      "Effect": "Allow",
      "Action": [
        "ses:CreateEmailIdentity",
        "ses:GetEmailIdentity",
        "ses:DeleteEmailIdentity",
        "ses:ListEmailIdentities"
      ],
      "Resource": "*"
    }
  ]
}
```

Until this is attached, Settings → **Omer (Amazon SES)** → Add domain will error. Merchants can still use **Your Resend** or **Your Postmark** with their own API keys.
