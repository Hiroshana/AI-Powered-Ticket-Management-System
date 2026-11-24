// Prepares the test database: applies migrations, empties every table and seeds
// one ADMIN and one AGENT user. Run via `bun run db:test:prepare`, which sets
// NODE_ENV=test so Bun loads .env.test on top of .env.
// Refuses to run against anything that isn't a *_test database.

const url = process.env.DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";

if (process.env.NODE_ENV !== "test" || !dbName.endsWith("_test")) {
  console.error(
    `Refusing to prepare "${dbName || "(no DATABASE_URL)"}": NODE_ENV must be "test" ` +
      `and the database name must end in "_test" (see .env.test.example).`,
  );
  process.exit(1);
}

// 1. Create the database if needed and apply all migrations.
const migrate = Bun.spawnSync(["bun", "--bun", "prisma", "migrate", "deploy"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (migrate.exitCode !== 0) process.exit(migrate.exitCode ?? 1);

// Imported after migrating so the client connects to a database that exists.
const { prisma } = await import("../src/lib/prisma.ts");
const { createCredentialUser } = await import("../src/lib/users.ts");

// 2. Empty every table except Prisma's migration history.
const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
if (tables.length > 0) {
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

// 3. Seed the users E2E tests sign in with.
const users = [
  { role: "ADMIN", name: "Test Admin", email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  { role: "AGENT", name: "Test Agent", email: process.env.E2E_AGENT_EMAIL, password: process.env.E2E_AGENT_PASSWORD },
] as const;

for (const { role, name, email, password } of users) {
  if (!email || !password) {
    throw new Error(`E2E_${role}_EMAIL and E2E_${role}_PASSWORD must be set (see .env.test.example)`);
  }
  await createCredentialUser({ email, name, password, role });
}

console.log(`Test database "${dbName}" ready: ${tables.length} tables emptied, ${users.length} users seeded.`);
await prisma.$disconnect();
