import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { ApiError } from "@/lib/errors.server";

export interface PesapalCredentials {
  consumerKey: string;
  consumerSecret: string;
}

function encryptionKey(): Buffer {
  const value = process.env.PESAPAL_CREDENTIALS_ENCRYPTION_KEY?.trim();
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);
  if (key.length !== 32) {
    throw new ApiError(
      503,
      "Club payment credentials cannot be stored until the server encryption key is configured.",
      { code: "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED" },
    );
  }
  return key;
}

export function encryptPesapalCredentials(credentials: PesapalCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptPesapalCredentials(encrypted: string): PesapalCredentials {
  const [version, encodedIv, encodedTag, encodedCiphertext] = encrypted.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new ApiError(500, "Stored club payment credentials are unreadable.", {
      code: "CLUB_PAYMENT_CREDENTIALS_INVALID",
    });
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<PesapalCredentials>;
    if (!parsed.consumerKey || !parsed.consumerSecret) throw new Error("Invalid credential payload");
    return { consumerKey: parsed.consumerKey, consumerSecret: parsed.consumerSecret };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "Stored club payment credentials could not be decrypted.", {
      code: "CLUB_PAYMENT_CREDENTIALS_INVALID",
    });
  }
}

export function pesapalCredentialFingerprint(credentials: PesapalCredentials): string {
  return createHash("sha256")
    .update(credentials.consumerKey)
    .update("\0")
    .update(credentials.consumerSecret)
    .digest("hex");
}

export async function getOrganizationPesapalCredentials(
  organizationId: string,
): Promise<PesapalCredentials> {
  const settings = await prisma.dunda_organization_settings.findUnique({
    where: { organization_id: organizationId },
    select: { pesapal_credentials_encrypted: true },
  });
  if (!settings?.pesapal_credentials_encrypted) {
    throw new ApiError(
      503,
      "This club has not connected its Pesapal merchant account.",
      { code: "CLUB_PAYMENT_PROVIDER_NOT_CONFIGURED" },
    );
  }
  return decryptPesapalCredentials(settings.pesapal_credentials_encrypted);
}