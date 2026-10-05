/**
 * بيانات أولية واقعية (يمنية) لمتجر «الأمانة للتجارة» — تشغيل: bun scripts/seed.ts
 * ملاحظة: لا فواتير هنا — تُضاف فواتير العرض التجريبي لاحقاً عبر طبقة Domain (الوكيل 2).
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// ───────────── أدوات تاريخ ─────────────
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}

async function main() {
  console.log('🧹 تنظيف الجداول...')
  // ترتيب يحترم المفاتيح الأجنبية (الأبناء قبل الآباء)
  await db.auditLog.deleteMany()
  await db.backupLog.deleteMany()
  await db.settings.deleteMany()
  await db.shift.deleteMany()
  await db.commission.deleteMany()
  await db.installment.deleteMany()
  await db.installmentPlan.deleteMany()
  await db.salaryPeriod.deleteMany()
  await db.attendance.deleteMany()
  await db.cashTx.deleteMany()
  await db.quotationItem.deleteMany()
  await db.quotation.deleteMany()
  await db.invoiceItem.deleteMany()
  await db.invoice.deleteMany()
  await db.stocktakeLine.deleteMany()
  await db.stocktake.deleteMany()
  await db.batch.deleteMany()
  await db.stockMovement.deleteMany()
  await db.stockLevel.deleteMany()
  await db.productPrice.deleteMany()
  await db.product.deleteMany()
  await db.appUser.deleteMany()
  await db.employee.deleteMany()
  await db.salesRep.deleteMany()
  await db.supplier.deleteMany()
  await db.customer.deleteMany()
  await db.expenseCategory.deleteMany()
  await db.cashbox.deleteMany()
  await db.warehouse.deleteMany()
  await db.category.deleteMany()
  await db.unit.deleteMany()
  await db.exchangeRate.deleteMany()
  await db.currency.deleteMany()
  await db.company.deleteMany()

  console.log('💱 العملات وأسعار الصرف...')
  const yer = await db.currency.create({ data: { code: 'YER', name: 'ريال يمني', symbolSvg: 'yer', isBase: true, decimals: 0 } })
  const sar = await db.currency.create({ data: { code: 'SAR', name: 'ريال سعودي', symbolSvg: 'sar', decimals: 2 } })
  const usd = await db.currency.create({ data: { code: 'USD', name: 'دولار أمريكي', symbolSvg: 'usd', decimals: 2 } })

  // 30 يوماً: SAR من 695 إلى 700 تدريجياً، USD من 2590 إلى 2620
  for (let i = 0; i < 30; i++) {
    const rateDate = daysAgo(29 - i)
    const sarRate = Math.round(695 + (i * 5) / 29)
    const usdRate = Math.round(2590 + (i * 30) / 29)
    await db.exchangeRate.create({ data: { currencyId: sar.id, rateDate, rate: sarRate, source: 'manual' } })
    await db.exchangeRate.create({ data: { currencyId: usd.id, rateDate, rate: usdRate, source: 'manual' } })
  }
  console.log('   ✓ أسعار 30 يوماً — اليوم: SAR=700 USD=2620')

  console.log('🏢 المنشأة والمخازن والصناديق...')
  const company = await db.company.create({
    data: {
      name: 'متجر الأمانة للتجارة',
      phone: '777123456',
      whatsapp: '777123456',
      address: 'صنعاء',
      currencyId: yer.id,
      taxRate: 0,
      invoicePrefix: 'INV',
      footerText: 'شكراً لتعاملكم معنا — نتشرف بخدمتكم',
    },
  })
  const mainWh = await db.warehouse.create({ data: { name: 'المخزن الرئيسي', location: 'صنعاء - شارع الزراعة', isDefault: true } })
  const branchWh = await db.warehouse.create({ data: { name: 'مخزن الفرع', location: 'صنعاء - حدة' } })
  const mainBox = await db.cashbox.create({ data: { name: 'الصندوق الرئيسي', currencyId: yer.id, isDefault: true } })
  const sarBox = await db.cashbox.create({ data: { name: 'صندوق الريال السعودي', currencyId: sar.id } })

  console.log('🗂️ الفئات والوحدات وفئات المصروفات...')
  const catNames = ['مواد غذائية', 'مشروبات', 'منظفات', 'معلبات', 'ألبان ومخبوزات', 'حلويات']
  const cats: Record<string, number> = {}
  for (let i = 0; i < catNames.length; i++) {
    const c = await db.category.create({ data: { name: catNames[i], sortOrder: i } })
    cats[catNames[i]] = c.id
  }
  const piece = await db.unit.create({ data: { name: 'قطعة' } })
  const carton = await db.unit.create({ data: { name: 'كرتون', baseUnitId: piece.id, factor: 12 } })
  await db.unit.create({ data: { name: 'كرتون كبير', baseUnitId: piece.id, factor: 24 } })
  const kilo = await db.unit.create({ data: { name: 'كيلو جرام' } })
  const liter = await db.unit.create({ data: { name: 'لتر' } })
  await db.unit.create({ data: { name: 'شوال', baseUnitId: kilo.id, factor: 50 } })

  const expNames = ['إيجار', 'رواتب', 'كهرباء ومياه', 'نقل وشحن', 'صيانة', 'إنترنت واتصالات', 'أخرى']
  for (const n of expNames) await db.expenseCategory.create({ data: { name: n } })

  console.log('📦 الأصناف (24) والأسعار والأرصدة...')
  // [الاسم، الفئة، الوحدة، التكلفة، سعر البيع، الحد الأدنى، رصيد الرئيسي، رصيد الفرع]
  type P = [string, string, number, number, number, number, number, number]
  const products: P[] = [
    ['أرز بسمتي 5كجم', 'مواد غذائية', piece.id, 8500, 9800, 10, 85, 22],
    ['سكر أبيض 1كجم', 'مواد غذائية', kilo.id, 1150, 1350, 30, 180, 45],
    ['زيت دوار الشمس 1.8لتر', 'مواد غذائية', piece.id, 3900, 4500, 15, 64, 12],
    ['شاي أحمر 450جم', 'مواد غذائية', piece.id, 1750, 2100, 20, 96, 18],
    ['حليب بودرة 900جم', 'مواد غذائية', piece.id, 5200, 6000, 10, 5, 0], // منخفض
    ['دقيق فاخر 10كجم', 'مواد غذائية', piece.id, 7800, 8900, 8, 40, 9],
    ['مكرونة 400جم', 'مواد غذائية', piece.id, 480, 600, 40, 200, 50],
    ['تونة معلبة 185جم', 'معلبات', piece.id, 850, 1050, 24, 8, 6], // منخفض
    ['فاصوليا معلبة 400جم', 'معلبات', piece.id, 620, 780, 24, 72, 14],
    ['معجون طماطم 800جم', 'معلبات', piece.id, 1250, 1500, 18, 55, 10],
    ['ماء معدني 1.5لتر', 'مشروبات', piece.id, 180, 250, 48, 150, 30],
    ['مشروب غازي 330مل', 'مشروبات', piece.id, 220, 350, 48, 6, 4], // منخفض
    ['عصير مانجو 1لتر', 'مشروبات', liter.id, 950, 1200, 20, 48, 10],
    ['مسحوق غسيل 1كجم', 'منظفات', kilo.id, 2400, 2900, 15, 38, 8],
    ['صابون غسيل سائل 1لتر', 'منظفات', piece.id, 1400, 1800, 20, 44, 0],
    ['معطر أرضيات 1لتر', 'منظفات', liter.id, 1600, 2000, 12, 26, 5],
    ['بسكويت شاي 200جم', 'حلويات', piece.id, 550, 700, 30, 120, 25],
    ['شوكولاتة', 'حلويات', piece.id, 750, 950, 24, 60, 15],
    ['علكة', 'حلويات', piece.id, 90, 150, 50, 20, 0], // منخفض
    ['جبن مثلثات', 'ألبان ومخبوزات', piece.id, 1900, 2300, 15, 34, 7],
    ['زبادي 170جم', 'ألبان ومخبوزات', piece.id, 350, 450, 24, 10, 3], // منخفض
    ['خبز توست', 'ألبان ومخبوزات', piece.id, 800, 1000, 12, 28, 0],
    ['بيض (كرتون 30)', 'ألبان ومخبوزات', carton.id, 4200, 4900, 6, 14, 3],
    ['ملح طعام 1كجم', 'مواد غذائية', kilo.id, 250, 400, 20, 80, 16],
  ]

  let lowCount = 0
  for (let i = 0; i < products.length; i++) {
    const [name, cat, unitId, cost, sale, minStock, mainQty, branchQty] = products[i]
    const barcode = `6281000${String(10001 + i * 7).padStart(6, '0')}` // شكل EAN-13
    const p = await db.product.create({
      data: { name, barcode, categoryId: cats[cat], unitId, costPrice: cost, minStock },
    })
    // أسعار البيع بالعملات الثلاث (هامش تحويل الصرف مضمّن تقريباً)
    await db.productPrice.create({ data: { productId: p.id, currencyId: yer.id, price: sale, marginPercent: 0 } })
    await db.productPrice.create({ data: { productId: p.id, currencyId: sar.id, price: Math.round((sale / 700) * 100) / 100, marginPercent: 12 } })
    await db.productPrice.create({ data: { productId: p.id, currencyId: usd.id, price: Math.round((sale / 2620) * 100) / 100, marginPercent: 12 } })
    // أرصدة المخزن + حركة افتتاحية
    await db.stockLevel.create({ data: { productId: p.id, warehouseId: mainWh.id, qty: mainQty } })
    if (branchQty > 0) await db.stockLevel.create({ data: { productId: p.id, warehouseId: branchWh.id, qty: branchQty } })
    await db.stockMovement.create({
      data: {
        productId: p.id,
        warehouseId: mainWh.id,
        movementType: 'opening',
        qty: mainQty,
        unitCost: cost,
        refType: 'opening',
        movedAt: daysAgo(45),
        notes: 'رصيد افتتاحي',
      },
    })
    if (mainQty + branchQty < minStock) lowCount++
  }
  console.log(`   ✓ ${products.length} صنفاً — ${lowCount} تحت الحد الأدنى`)

  console.log('👥 العملاء (12)...')
  const customers: Array<[string, string, string, number, number]> = [
    // [الاسم، الهاتف، المنطقة، حد الائتمان، الرصيد الافتتاحي (مدين)]
    ['علي محمد الحداد', '777100201', 'شعوب', 200000, 45000],
    ['أحمد صالح المقطري', '733445566', 'حدة', 150000, 0],
    ['فاطمة عبدالله', '712223344', 'السنينة', 0, 0],
    ['محمد يحيى الشامي', '770998877', 'مذبح', 300000, 120000],
    ['شركة النور للتجارة', '711223344', 'شعوب', 500000, 85000],
    ['بقالة السعادة', '734556677', 'بيت بوس', 0, 0],
    ['ناصر قائد', '777334455', 'حدة', 0, 0],
    ['سامي المروني', '712778899', 'شعوب', 100000, 28000],
    ['عبدالرحمن الجابري', '770112233', 'السنينة', 0, 0],
    ['هدى الحكيمي', '735667788', 'مذبح', 0, 0],
    ['طارق العزي', '771445566', 'بيت بوس', 80000, 0],
    ['مؤسسة الخير', '713889900', 'حدة', 250000, 0],
  ]
  for (const [name, phone, area, creditLimit, opening] of customers) {
    await db.customer.create({
      data: { name, phone, whatsapp: phone, area, creditLimit, openingBalance: opening, address: `صنعاء - ${area}` },
    })
  }

  console.log('🚚 الموردون (6)...')
  const suppliers: Array<[string, string, number]> = [
    ['شركة النخبة للاستيراد', '711001122', 150000],
    ['مؤسسة البركة', '733002233', 90000],
    ['شركة اليمن للتوزيع', '777003344', 0],
    ['وكيل سعادتي', '712004455', 60000],
    ['شركة الأفق', '735005566', 0],
    ['مؤسسة الإخلاص', '770006677', 35000],
  ]
  for (const [name, phone, opening] of suppliers) {
    await db.supplier.create({ data: { name, phone, openingBalance: opening, address: 'صنعاء' } })
  }

  console.log('🤝 المناديب (3)...')
  await db.salesRep.create({ data: { name: 'خالد الشرعبي', phone: '777123100', commissionType: 'sales', commissionPercent: 2, areas: 'شعوب، مذبح' } })
  await db.salesRep.create({ data: { name: 'ياسر بامطرف', phone: '733123200', commissionType: 'collection', commissionPercent: 1.5, areas: 'حدة، السنينة' } })
  await db.salesRep.create({ data: { name: 'عمار الأصبحي', phone: '712123300', commissionType: 'both', commissionPercent: 1, areas: 'بيت بوس، شعوب' } })

  console.log('🧑‍💼 الموظفون (5)...')
  const employees: Array<[string, string, string, number, string]> = [
    ['محمد عبده الشميري', '777100001', 'بائع', 120000, '2024-03-01'],
    ['سالم ناجي', '733100002', 'كاشير', 100000, '2024-06-15'],
    ['وليد الحيمي', '712100003', 'عامل مخزن', 80000, '2025-01-10'],
    ['أنس التام', '771100004', 'سائق', 90000, '2025-05-01'],
    ['رائد مبخوت', '735100005', 'حارس', 70000, '2025-09-01'],
  ]
  for (const [name, phone, role, salary, hiredAt] of employees) {
    await db.employee.create({ data: { name, phone, role, salary, salaryCycle: 'monthly', hiredAt } })
  }

  console.log('🔐 المستخدم...')
  // للعرض التجريبي: الـ PIN مخزّن نصاً — في الإنتاج يُهشَّر (Argon2id)
  await db.appUser.create({
    data: { username: 'admin', displayName: 'المدير', role: 'admin', pinHash: '1234', defaultCashboxId: mainBox.id },
  })

  console.log('⚙️ الإعدادات...')
  const settings: Array<[string, string]> = [
    ['display.currencyId', '1'],
    ['display.numbers', '"western"'],
    ['print.paper', '"80"'],
    ['print.copies', '1'],
    ['print.mode', '"raster"'],
    ['invoice.prefixes', '{"sale":"INV","purchase":"PUR","sale_return":"SRN","purchase_return":"PRN","quotation":"QTE"}'],
  ]
  for (const [key, value] of settings) await db.settings.create({ data: { key, value } })

  console.log('\n✅ تمت التهيئة بنجاح:')
  console.log(`   المنشأة: ${company.name} | العملة الأساسية: YER`)
  console.log(`   صناديق: ${mainBox.name} (YER)، ${sarBox.name} (SAR)`)
  console.log(`   مخازن: ${mainWh.name}، ${branchWh.name}`)
}

main()
  .catch((e) => {
    console.error('❌ فشل التهيئة:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
