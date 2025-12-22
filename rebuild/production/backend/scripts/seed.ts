/**
 * Database Seeding Script
 * Creates sample test data for development environment
 * 
 * Usage: npm run seed
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // 1. Ensure default developer account exists (should be created by server.ts, but double-check)
  const adminUsername = process.env.ADMIN_USERNAME || '开发者账号';
  const adminEmail = process.env.ADMIN_EMAIL || 'dev@example.com';
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || '000000';

  const existingAdmin = await prisma.user.findFirst({ where: { username: adminUsername } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password: passwordHash,
        nickname: adminUsername,
        status: 'active',
      },
    });
    console.log(`✓ Default developer account created: ${adminUsername} / ${adminPassword}`);
  } else {
    console.log(`✓ Default developer account already exists: ${adminUsername}`);
  }

  // 2. Create sample test users
  const testUsers = [
    { username: 'testuser1', email: 'testuser1@example.com', password: 'Test1234!', nickname: 'Test User 1' },
    { username: 'testuser2', email: 'testuser2@example.com', password: 'Test1234!', nickname: 'Test User 2' },
    { username: 'testuser3', email: 'testuser3@example.com', password: 'Test1234!', nickname: 'Test User 3' },
    { username: 'demo_player', email: 'demo@example.com', password: 'demo123', nickname: 'Demo Player' },
  ];

  let createdUsers = 0;
  for (const userData of testUsers) {
    const existing = await prisma.user.findFirst({ where: { username: userData.username } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await prisma.user.create({
        data: {
          username: userData.username,
          email: userData.email,
          password: passwordHash,
          nickname: userData.nickname,
          status: 'active',
        },
      });
      createdUsers++;
    }
  }
  console.log(`✓ Created ${createdUsers} test users (${testUsers.length - createdUsers} already existed)`);

  // 3. Create sample rooms (if we have users)
  const allUsers = await prisma.user.findMany({ take: 5 });
  if (allUsers.length > 0) {
    const hostUser = allUsers[0];
    
    // Create a few sample rooms
    const sampleRooms = [
      { name: 'Welcome Room', maxPlayers: 4, status: 'waiting' as const },
      { name: 'Practice Room', maxPlayers: 6, status: 'waiting' as const },
      { name: 'Competitive Room', maxPlayers: 4, status: 'waiting' as const },
    ];

    let createdRooms = 0;
    for (const roomData of sampleRooms) {
      const existing = await prisma.room.findFirst({ 
        where: { name: roomData.name, creatorId: hostUser.id } 
      });
      
      if (!existing) {
        const room = await prisma.room.create({
          data: {
            name: roomData.name,
            maxPlayers: roomData.maxPlayers,
            currentPlayers: 1,
            status: roomData.status,
            creatorId: hostUser.id,
            hostId: hostUser.id,
          },
        });

        // Add host as player
        await prisma.roomPlayer.create({
          data: {
            roomId: room.id,
            userId: hostUser.id,
            role: 'host',
            status: 'joined',
            isHuman: true,
          },
        });

        createdRooms++;
      }
    }
    console.log(`✓ Created ${createdRooms} sample rooms (${sampleRooms.length - createdRooms} already existed)`);
  }

  console.log('\n✅ Database seeding completed!');
  console.log('\n📝 Test Accounts:');
  console.log('   Developer Account: developer / 000000');
  console.log('   Test User 1:       testuser1 / Test1234!');
  console.log('   Test User 2:       testuser2 / Test1234!');
  console.log('   Test User 3:       testuser3 / Test1234!');
  console.log('   Demo Player:       demo_player / demo123');
  console.log('\n🔑 Developer Code: wskfz (for admin panels)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

