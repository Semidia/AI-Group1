/**
 * Script to delete developer admin account
 * Usage: tsx scripts/delete-admin.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Deleting developer admin account...\n');

  const adminUsername = process.env.ADMIN_USERNAME || '开发者账号';
  const adminEmail = process.env.ADMIN_EMAIL || 'dev@example.com';

  // Find the admin account
  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { username: adminUsername },
        { email: adminEmail },
      ],
    },
  });

  if (!admin) {
    console.log('⚠️  Developer admin account not found.');
    console.log(`   Searched for username: ${adminUsername}`);
    console.log(`   Searched for email: ${adminEmail}`);
    return;
  }

  console.log(`Found admin account:`);
  console.log(`   ID: ${admin.id}`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Status: ${admin.status}`);
  console.log('');

  // Delete the admin account
  await prisma.user.delete({
    where: { id: admin.id },
  });

  console.log('✅ Developer admin account deleted successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('   1. Restart the backend server');
  console.log('   2. The server will automatically create a new admin account');
  console.log(`   3. Username: ${adminUsername}`);
  console.log('   4. Password: 000000');
}

main()
  .catch((e) => {
    console.error('❌ Failed to delete admin account:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });




