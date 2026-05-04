import { NextResponse } from "next/server";
import { Client } from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "DATABASE_URL is not configured",
      },
      { status: 500 },
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();

    const result = await client.query<{
      checked_at: string;
      database_name: string;
      database_user: string;
    }>(
      "select now() as checked_at, current_database() as database_name, current_user as database_user",
    );

    return NextResponse.json({
      ok: true,
      database: "connected",
      databaseName: result.rows[0]?.database_name,
      databaseUser: result.rows[0]?.database_user,
      checkedAt: result.rows[0]?.checked_at,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database check failed",
      },
      { status: 500 },
    );
  } finally {
    await client.end().catch(() => {});
  }
}
