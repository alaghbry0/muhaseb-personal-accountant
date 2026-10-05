/**
 * أنواع مشتركة لطباعة السندات (client/server آمنة — بلا استيراد DOM).
 */
import type { VoucherDto } from "@/domain/parties";

export type { VoucherDto };

export interface PrintCompanyInfo {
  name: string;
  phone?: string | null;
  address?: string | null;
  footerText?: string | null;
}
