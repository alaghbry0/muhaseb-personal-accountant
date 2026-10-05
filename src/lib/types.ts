/**
 * أنواع مشتركة لواجهات API — يستخدمها الواجهة والـ API معاً.
 */

export interface CompanyDto {
  id: number
  name: string
  phone: string | null
  whatsapp: string | null
  address: string | null
  taxNumber: string | null
  taxRate: number
  invoicePrefix: string | null
  footerText: string | null
  currencyId: number
}

export interface CurrencyDto {
  id: number
  code: string
  name: string
  isBase: boolean
  decimals: number
  /** سعر اليوم مقابل العملة الأساسية */
  rate?: number
  rateDate?: string
}

export interface WarehouseDto {
  id: number
  name: string
  location: string | null
  isDefault: boolean
}

export interface CashboxDto {
  id: number
  name: string
  currencyId: number
  isDefault: boolean
  currency?: { code: string; name: string }
}

export interface BootstrapData {
  company: CompanyDto | null
  currencies: CurrencyDto[]
  /** خريطة code → سعر اليوم (أو آخر سعر متاح) */
  rates: Record<string, { rate: number; rateDate: string }>
  baseCurrency: CurrencyDto | null
  warehouses: WarehouseDto[]
  cashboxes: CashboxDto[]
  settings: Record<string, unknown>
}

export interface DashboardData {
  date: string
  todaySales: number
  yesterdaySales: number
  salesTrendPercent: number | null
  todayProfit: number
  todayInvoiceCount: number
  cashNet: number
  dueInstallmentsToday: number
  lowStockCount: number
  last30Days: Array<{ date: string; total: number }>
}
