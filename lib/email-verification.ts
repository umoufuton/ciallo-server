import crypto from "node:crypto";

const EMAIL_CODE_TTL_SECONDS = 10 * 60;

type ResendSendResponse = {
  id?: string;
  error?: { message?: string };
};

type TencentSesSendEmailResponse = {
  Response?: {
    Error?: {
      Code?: string;
      Message?: string;
    };
    RequestId?: string;
  };
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmailAddress(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false as const, reason: "email is required" };
  if (normalized.length > 254) return { ok: false as const, reason: "email is too long" };

  // Pragmatic validation (keeps backend dependency-free).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false as const, reason: "invalid email format" };
  }

  return { ok: true as const, normalized };
}

export function createEmailVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function getEmailCodeExpiresAtIso() {
  return new Date(Date.now() + EMAIL_CODE_TTL_SECONDS * 1000).toISOString();
}

export function getEmailCodeTtlSeconds() {
  return EMAIL_CODE_TTL_SECONDS;
}

export async function dispatchVerificationEmail(params: {
  toEmail: string;
  username: string;
  code: string;
}) {
  const provider = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (provider === "tencent_ses") {
    await sendByTencentSes(params);
    return { delivered: true as const, provider: "tencent_ses" as const };
  }

  if (provider === "resend") {
    await sendByResend(params);
    return { delivered: true as const, provider: "resend" as const };
  }

  // Safe fallback for environments without a configured provider.
  console.log(
    `[email-verification:fallback] username=${params.username} email=${params.toEmail} code=${params.code}`,
  );
  return { delivered: false as const, provider: "log" as const };
}

async function sendByResend(params: { toEmail: string; username: string; code: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }

  const subject = process.env.EMAIL_VERIFY_SUBJECT?.trim() || "Your verification code";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
      <p>Hello ${escapeHtml(params.username)},</p>
      <p>Your verification code is:</p>
      <p style="font-size:24px;letter-spacing:4px;font-weight:700">${params.code}</p>
      <p>This code expires in 10 minutes.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.toEmail],
      subject,
      html,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`resend send failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text) as ResendSendResponse;
  if (payload.error?.message) {
    throw new Error(`resend send failed: ${payload.error.message}`);
  }
}

async function sendByTencentSes(params: { toEmail: string; username: string; code: string }) {
  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();
  const region = process.env.TENCENT_SES_REGION?.trim() || "ap-guangzhou";
  const from = process.env.EMAIL_FROM?.trim();
  const endpoint = process.env.TENCENT_SES_ENDPOINT?.trim() || "https://ses.tencentcloudapi.com/";

  if (!secretId) throw new Error("TENCENT_SECRET_ID is not set");
  if (!secretKey) throw new Error("TENCENT_SECRET_KEY is not set");
  if (!from) throw new Error("EMAIL_FROM is not set");

  const action = "SendEmail";
  const service = "ses";
  const host = "ses.tencentcloudapi.com";
  const version = "2020-10-02";
  const algorithm = "TC3-HMAC-SHA256";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const subject = process.env.EMAIL_VERIFY_SUBJECT?.trim() || "Your verification code";
  const templateIdRaw = process.env.TENCENT_SES_TEMPLATE_ID?.trim();
  const templateId = templateIdRaw ? Number.parseInt(templateIdRaw, 10) : NaN;
  const useTemplate = Number.isFinite(templateId) && templateId > 0;

  const payload = useTemplate
    ? {
        FromEmailAddress: from,
        Destination: [params.toEmail],
        Subject: subject,
        Template: {
          TemplateID: templateId,
          // Tencent SES expects a JSON string. Template variable names should match
          // the template placeholders configured in Tencent console.
          TemplateData: JSON.stringify({
            code: params.code,
            username: params.username,
          }),
        },
      }
    : {
        FromEmailAddress: from,
        Destination: [params.toEmail],
        Subject: subject,
        Simple: {
          Html: Buffer.from(
            `<p>Hello ${escapeHtml(params.username)},</p><p>Your verification code is <strong style="font-size:20px;letter-spacing:3px">${params.code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
            "utf8",
          ).toString("base64"),
          Text: Buffer.from(
            `Hello ${params.username}, your verification code is ${params.code}. This code expires in 10 minutes.`,
            "utf8",
          ).toString("base64"),
        },
      };

  const body = JSON.stringify(payload);
  const hashedRequestPayload = sha256Hex(body);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256Hex(secretSigning, stringToSign);

  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Region": region,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Language": "en-US",
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`tencent ses send failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }

  const json = JSON.parse(text) as TencentSesSendEmailResponse;
  const err = json?.Response?.Error;
  if (err?.Code || err?.Message) {
    throw new Error(`tencent ses send failed: ${err.Code ?? "UnknownError"} ${err.Message ?? ""}`.trim());
  }
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256(key: string | Buffer, msg: string) {
  return crypto.createHmac("sha256", key).update(msg, "utf8").digest();
}

function hmacSha256Hex(key: string | Buffer, msg: string) {
  return crypto.createHmac("sha256", key).update(msg, "utf8").digest("hex");
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
