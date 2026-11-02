// Seed manual untuk development: `npm run seed`.
// Logika aslinya ada di src/lib/bootstrap.ts (dipakai juga oleh server saat produksi).
import { prisma } from "../src/prisma.js";
import { seedDefaults } from "../src/lib/bootstrap.js";

seedDefaults()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
