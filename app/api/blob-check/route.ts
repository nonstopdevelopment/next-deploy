import { createHash, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BlobConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  region: string;
  secretAccessKey: string;
};

const SERVICE = "s3";
const EMPTY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export async function GET(request: NextRequest) {
  const config = getBlobConfig();

  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error: "Managed Blob storage is not configured for this deployment",
        requiredEnv: [
          "NERDO_BLOB_BUCKET",
          "NERDO_BLOB_ENDPOINT",
          "NERDO_BLOB_REGION",
          "NERDO_BLOB_ACCESS_KEY_ID",
          "NERDO_BLOB_SECRET_ACCESS_KEY",
        ],
      },
      { status: 500 },
    );
  }

  const key =
    request.nextUrl.searchParams.get("key") || "nerdohost/blob-check.json";
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(
    {
      ok: true,
      message: "Nerdo.host managed Blob storage can write and read objects.",
      bucket: config.bucket,
      key,
      createdAt,
    },
    null,
    2,
  );

  try {
    const putResult = await signedS3Request({
      body: payload,
      config,
      contentType: "application/json",
      key,
      method: "PUT",
    });

    if (!putResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          action: "write",
          status: putResult.status,
          error: await putResult.text(),
        },
        { status: 502 },
      );
    }

    const getResult = await signedS3Request({
      config,
      key,
      method: "GET",
    });

    if (!getResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          action: "read",
          status: getResult.status,
          error: await getResult.text(),
        },
        { status: 502 },
      );
    }

    const readBack = await getResult.text();

    return NextResponse.json({
      ok: true,
      blob: "connected",
      bucket: config.bucket,
      endpoint: config.endpoint,
      region: config.region,
      key,
      bytesWritten: Buffer.byteLength(payload),
      bytesRead: Buffer.byteLength(readBack),
      contentMatches: readBack === payload,
      writtenAt: createdAt,
      readBack: JSON.parse(readBack) as unknown,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Blob check failed",
      },
      { status: 500 },
    );
  }
}

function getBlobConfig(): BlobConfig | null {
  const bucket = process.env.NERDO_BLOB_BUCKET || process.env.S3_BUCKET;
  const endpoint =
    process.env.NERDO_BLOB_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
  const region =
    process.env.NERDO_BLOB_REGION || process.env.AWS_REGION || "nerdo-host-tampa";
  const accessKeyId =
    process.env.NERDO_BLOB_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.NERDO_BLOB_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY;
  const forcePathStyle = process.env.NERDO_BLOB_FORCE_PATH_STYLE !== "0";

  if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    forcePathStyle,
    region,
    secretAccessKey,
  };
}

async function signedS3Request({
  body = "",
  config,
  contentType,
  key,
  method,
}: {
  body?: string;
  config: BlobConfig;
  contentType?: string;
  key: string;
  method: "GET" | "PUT";
}): Promise<Response> {
  const url = objectUrl(config, key);
  const payloadHash = method === "GET" ? EMPTY_HASH : sha256(body);
  const timestamp = new Date();
  const amzDate = toAmzDate(timestamp);
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (contentType) {
    headers["content-type"] = contentType;
  }

  const authorization = signRequest({
    config,
    dateStamp,
    headers,
    method,
    payloadHash,
    path: url.pathname,
  });

  return fetch(url, {
    body: method === "GET" ? undefined : body,
    headers: {
      ...headers,
      authorization,
    },
    method,
  });
}

function objectUrl(config: BlobConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  const segments = config.forcePathStyle
    ? [config.bucket, ...key.split("/")]
    : key.split("/");

  endpoint.pathname = `/${segments.map(encodeUriSegment).join("/")}`;

  if (!config.forcePathStyle) {
    endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  }

  return endpoint;
}

function signRequest({
  config,
  dateStamp,
  headers,
  method,
  path,
  payloadHash,
}: {
  config: BlobConfig;
  dateStamp: string;
  headers: Record<string, string>;
  method: string;
  path: string;
  payloadHash: string;
}): string {
  const signedHeaders = Object.keys(headers)
    .map((header) => header.toLowerCase())
    .sort()
    .join(";");
  const canonicalHeaders = Object.entries(headers)
    .map(([header, value]) => [header.toLowerCase(), value.trim()] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([header, value]) => `${header}:${value}\n`)
    .join("");
  const credentialScope = `${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    headers["x-amz-date"],
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signingKey = getSigningKey(config.secretAccessKey, dateStamp, config.region);
  const signature = hmac(signingKey, stringToSign, "hex");

  return [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);

  return hmac(serviceKey, "aws4_request");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(
  key: string | Buffer,
  value: string,
  encoding?: "hex",
): Buffer | string {
  const digest = createHmac("sha256", key).update(value).digest();

  return encoding === "hex" ? digest.toString("hex") : digest;
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeUriSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
