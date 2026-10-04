import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", marketplaceName: "Mmarakeng", defaultCommission: 10, currency: "LSL" },
  });

  const adminPassword = await bcrypt.hash("Admin123!", 12);
  await prisma.user.upsert({
    where: { email: "admin@marketplace.test" },
    update: {},
    create: {
      name: "Platform Admin",
      email: "admin@marketplace.test",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });

  const customerPassword = await bcrypt.hash("Customer123!", 12);
  await prisma.user.upsert({
    where: { email: "customer@marketplace.test" },
    update: {},
    create: {
      name: "Test Customer",
      email: "customer@marketplace.test",
      passwordHash: customerPassword,
      role: "CUSTOMER",
      cart: { create: {} },
    },
  });

  const vendorPassword = await bcrypt.hash("Vendor123!", 12);
  const vendorUser = await prisma.user.upsert({
    where: { email: "vendor@marketplace.test" },
    update: {},
    create: {
      name: "Test Vendor",
      email: "vendor@marketplace.test",
      passwordHash: vendorPassword,
      role: "VENDOR",
      vendorProfile: {
        create: {
          storeName: "Demo Store",
          storeSlug: "demo-store",
          storeDescription: "A seeded demo vendor, pre-approved for local testing.",
          status: "APPROVED",
          isVerified: true,
          acceptsManualPayment: true,
          bankName: "Demo Bank",
          bankAccountName: "Demo Store (Pty) Ltd",
          bankAccountNumber: "1234567890",
          mpesaMerchantNumber: "174379",
          ecocashMerchantNumber: "0771234567",
          wallet: { create: {} },
        },
      },
    },
    include: { vendorProfile: true },
  });

  const electronics = await prisma.category.upsert({
    where: { slug: "electronics" },
    update: {},
    create: { name: "Electronics", slug: "electronics" },
  });

  await prisma.category.upsert({
    where: { slug: "phones" },
    update: {},
    create: { name: "Phones", slug: "phones", parentId: electronics.id },
  });

  const clothing = await prisma.category.upsert({
    where: { slug: "clothing" },
    update: {},
    create: { name: "Clothing", slug: "clothing" },
  });

  // A wider spread of top-level categories so the header, homepage grid,
  // and category chips reflect an established, many-department
  // marketplace rather than a two-category demo store.
  const moreCategories = [
    { name: "Home, Garden & Groceries", slug: "home-garden-groceries" },
    { name: "Toys, Baby & Kids", slug: "toys-baby-kids" },
    { name: "Fashion & Jewellery", slug: "fashion-jewellery" },
    { name: "Sports & Health", slug: "sports-health" },
    { name: "Beauty & Personal Care", slug: "beauty-personal-care" },
    { name: "Books, Music & Media", slug: "books-music-media" },
    { name: "Automotive", slug: "automotive" },
    { name: "Collectables & Hobbies", slug: "collectables-hobbies" },
    { name: "Business & Industry", slug: "business-industry" },
    { name: "Pet Supplies", slug: "pet-supplies" },
  ];
  for (let i = 0; i < moreCategories.length; i++) {
    const c = moreCategories[i];
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, sortOrder: i + 2 },
    });
  }

  if (vendorUser.vendorProfile) {
    await prisma.shippingMethod.upsert({
      where: { id: "seed-standard-shipping" },
      update: {},
      create: {
        id: "seed-standard-shipping",
        vendorId: vendorUser.vendorProfile.id,
        name: "Standard Shipping",
        cost: 50,
        estimatedDaysMin: 2,
        estimatedDaysMax: 5,
        isActive: true,
        isDefault: true,
      },
    });

    await prisma.product.upsert({
      where: { sku: "DEMO-TSHIRT-001" },
      update: {},
      create: {
        vendorId: vendorUser.vendorProfile.id,
        categoryId: clothing.id,
        name: "Demo Cotton T-Shirt",
        slug: "demo-cotton-t-shirt",
        description: "A soft cotton t-shirt, seeded for local demo/testing purposes.",
        shortDescription: "Soft cotton tee",
        price: 250,
        sku: "DEMO-TSHIRT-001",
        stockQuantity: 50,
        brand: "DemoWear",
        status: "PUBLISHED",
        images: { create: [{ url: "https://picsum.photos/seed/tshirt/600/600", sortOrder: 0 }] },
        variants: {
          create: [
            { sku: "DEMO-TSHIRT-001-S", optionsJson: { Size: "S" }, price: 250, stockQuantity: 15 },
            { sku: "DEMO-TSHIRT-001-M", optionsJson: { Size: "M" }, price: 250, stockQuantity: 20 },
            { sku: "DEMO-TSHIRT-001-L", optionsJson: { Size: "L" }, price: 250, stockQuantity: 15 },
          ],
        },
      },
    });

    await prisma.product.upsert({
      where: { sku: "DEMO-PHONE-001" },
      update: {},
      create: {
        vendorId: vendorUser.vendorProfile.id,
        categoryId: electronics.id,
        name: "Demo Smartphone X1",
        slug: "demo-smartphone-x1",
        description: "A mid-range demo smartphone, seeded for local demo/testing purposes.",
        shortDescription: "Mid-range demo phone",
        price: 4500,
        discountPrice: 3999,
        sku: "DEMO-PHONE-001",
        stockQuantity: 12,
        brand: "DemoTech",
        status: "PUBLISHED",
        images: { create: [{ url: "https://picsum.photos/seed/phone/600/600", sortOrder: 0 }] },
      },
    });

    await prisma.coupon.upsert({
      where: { code: "WELCOME10" },
      update: {},
      create: {
        code: "WELCOME10",
        type: "PERCENTAGE",
        value: 10,
        scope: "PLATFORM",
        isActive: true,
      },
    });
  }

  // Sample display-only currency rate (see CurrencyRate model doc comment).
  await prisma.currencyRate.upsert({
    where: { currencyCode: "USD" },
    update: {},
    create: { currencyCode: "USD", rateToBase: 0.055 },
  });

  console.log("Seed complete.");
  console.log("Admin login:    admin@marketplace.test / Admin123!");
  console.log("Vendor login:   vendor@marketplace.test / Vendor123! (pre-approved)");
  console.log("Customer login: customer@marketplace.test / Customer123!");
  console.log('Try coupon code "WELCOME10" (10% off, platform-wide) at checkout.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
