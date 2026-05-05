import { randomUUID } from "node:crypto";
import net from "node:net";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RedisConfig = {
  database: number;
  host: string;
  password: string;
  port: number;
  username: string;
};

type RedisValue = string | number | null | RedisValue[];

export async function GET() {
  const config = getRedisConfig();

  if (!config) {
    return NextResponse.json(
      {
        ok: false,
        error: "REDIS_URL is not configured",
      },
      { status: 500 },
    );
  }

  const key = `nerdohost:redis-check:${randomUUID()}`;
  const writtenAt = new Date().toISOString();
  const payload = JSON.stringify({
    ok: true,
    message: "Nerdo.host managed Redis can write and read keys.",
    key,
    writtenAt,
  });

  try {
    const ping = await redisCommand(config, ["PING"]);
    const set = await redisCommand(config, ["SET", key, payload, "EX", "60"]);
    const readBack = await redisCommand(config, ["GET", key]);
    const deleted = await redisCommand(config, ["DEL", key]);

    return NextResponse.json({
      ok: true,
      redis: "connected",
      host: config.host,
      port: config.port,
      database: config.database,
      ping,
      set,
      key,
      contentMatches: readBack === payload,
      bytesWritten: Buffer.byteLength(payload),
      bytesRead: typeof readBack === "string" ? Buffer.byteLength(readBack) : 0,
      deleted,
      writtenAt,
      readBack: typeof readBack === "string" ? JSON.parse(readBack) : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Redis check failed",
      },
      { status: 500 },
    );
  }
}

function getRedisConfig(): RedisConfig | null {
  const redisUrl = process.env.REDIS_URL || process.env.NERDO_MANAGED_REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  const parsed = new URL(redisUrl);
  const database = Number.parseInt(parsed.pathname.replace("/", "") || "0", 10);

  return {
    database: Number.isFinite(database) ? database : 0,
    host: parsed.hostname,
    password: decodeURIComponent(parsed.password || ""),
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: decodeURIComponent(parsed.username || ""),
  };
}

async function redisCommand(config: RedisConfig, command: string[]) {
  const commands = [
    ...(config.password
      ? [
          config.username
            ? ["AUTH", config.username, config.password]
            : ["AUTH", config.password],
        ]
      : []),
    ...(config.database > 0 ? [["SELECT", String(config.database)]] : []),
    command,
  ];

  const responses = await redisRoundTrip(config, commands);

  return responses.at(-1);
}

function redisRoundTrip(
  config: RedisConfig,
  commands: string[][],
): Promise<RedisValue[]> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: config.host,
      port: config.port,
    });
    const responses: RedisValue[] = [];
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(responses);
      }
    };

    socket.setTimeout(5_000, () => {
      finish(new Error("Redis check timed out"));
    });

    socket.on("connect", () => {
      socket.write(commands.map(encodeRedisCommand).join(""));
    });

    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        while (responses.length < commands.length) {
          const parsed = parseRedisValue(buffer);

          if (!parsed) {
            return;
          }

          responses.push(parsed.value);
          buffer = buffer.subarray(parsed.bytes);
        }

        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Redis parse failed"));
      }
    });

    socket.on("error", (error) => {
      finish(error);
    });
  });
}

function encodeRedisCommand(parts: string[]) {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function parseRedisValue(buffer: Buffer):
  | {
      bytes: number;
      value: RedisValue;
    }
  | null {
  const type = String.fromCharCode(buffer[0]);

  if (!type) {
    return null;
  }

  if (type === "+" || type === "-" || type === ":") {
    const line = readLine(buffer, 1);

    if (!line) {
      return null;
    }

    if (type === "-") {
      throw new Error(`Redis error: ${line.value}`);
    }

    return {
      bytes: line.bytes,
      value: type === ":" ? Number.parseInt(line.value, 10) : line.value,
    };
  }

  if (type === "$") {
    const line = readLine(buffer, 1);

    if (!line) {
      return null;
    }

    const length = Number.parseInt(line.value, 10);

    if (length === -1) {
      return {
        bytes: line.bytes,
        value: null,
      };
    }

    const end = line.bytes + length;

    if (buffer.length < end + 2) {
      return null;
    }

    return {
      bytes: end + 2,
      value: buffer.subarray(line.bytes, end).toString("utf8"),
    };
  }

  if (type === "*") {
    const line = readLine(buffer, 1);

    if (!line) {
      return null;
    }

    const count = Number.parseInt(line.value, 10);
    const values: RedisValue[] = [];
    let offset = line.bytes;

    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisValue(buffer.subarray(offset));

      if (!parsed) {
        return null;
      }

      values.push(parsed.value);
      offset += parsed.bytes;
    }

    return {
      bytes: offset,
      value: values,
    };
  }

  throw new Error(`Unsupported Redis response type: ${type}`);
}

function readLine(buffer: Buffer, offset: number) {
  const end = buffer.indexOf("\r\n", offset);

  if (end === -1) {
    return null;
  }

  return {
    bytes: end + 2,
    value: buffer.subarray(offset, end).toString("utf8"),
  };
}
