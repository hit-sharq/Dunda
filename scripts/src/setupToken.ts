import {
  db,
  organizationsTable,
  setupTokensTable,
  staffTable,
  rolesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { generateSetupToken, hashToken } from "@workspace/db";


/**
 * Issues a single-use token that lets its bearer claim ownership of an
 * organization.
 *
 * The first owner cannot be invited, because inviting requires an owner to
 * already exist. The token is generated out of band, stored only as a digest,
 * and expires. "First sign-up becomes owner" was rejected as a race on a public
 * endpoint.
 */

const VALID_FOR_HOURS = 48;

async function main(): Promise<void> {
  const orgSlug = process.argv[2];
  const orgIdArg = process.argv[3];

  let org;
  if (orgIdArg) {
    org = (await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgIdArg)))[0];
  } else if (orgSlug) {
    org = (await db.select().from(organizationsTable).where(eq(organizationsTable.slug, orgSlug)))[0];
  } else {
    org = (await db.select().from(organizationsTable))[0];
  }

  if (!org) {
    console.error("No organization found. Pass a slug or id:");
    console.error("  pnpm db:setup-token <slug-or-id>");
    process.exit(1);
  }

  const [ownerRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.isOwner, true));
  if (!ownerRole) {
    console.error(`Organization "${org.name}" has no role marked as owner.`);
    process.exit(1);
  }

  const [claimedOwner] = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(
      and(
        eq(staffTable.organizationId, org.id),
        eq(staffTable.roleId, ownerRole.id),
      ),
    );

  const token = generateSetupToken();
  const expiresAt = new Date(Date.now() + VALID_FOR_HOURS * 60 * 60 * 1000);

  // Retire any outstanding token so only one code is ever live.
  await db.delete(setupTokensTable).where(eq(setupTokensTable.organizationId, org.id));

  await db.insert(setupTokensTable).values({
    id: `setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: org.id,
    tokenHash: hashToken(token),
    purpose: "CLAIM_OWNERSHIP",
    expiresAt,
  });

  console.log("");
  console.log(`  Organization : ${org.name} (${org.id})`);
  console.log(`  Owner role   : ${ownerRole.name}`);
  console.log(`  Setup token  : ${token}`);
  console.log(`  Expires      : ${expiresAt.toISOString()}`);
  console.log("");
  if (claimedOwner) {
    console.log(
      `  Note: ${claimedOwner.name} already holds this role. The token will move ownership to whoever redeems it.`,
    );
  }
  console.log("  This is the only time the token is shown. It is stored as a digest.");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Could not issue a setup token:", err);
    process.exit(1);
  });
