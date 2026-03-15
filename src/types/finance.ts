// ===== Account =====
export type AccountType = 'cash' | 'bank' | 'investment' | 'credit_card' | 'loan' | 'receivable' | 'inventory';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  is_active: boolean;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}

// ===== Investment =====
export type AssetClass = 'stock' | 'mutual_fund' | 'crypto' | 'bond' | 'loan' | 'business' | 'inventory';

export interface Investment {
  id: string;
  account_id: string;
  symbol: string;
  asset_class: AssetClass;
  total_units: number;
  average_cost_per_unit: number;
  current_market_price: number;
  is_deleted: boolean;
  last_updated: number;
}

// ===== Goal =====
export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  status: string;
  is_deleted: boolean;
}

// ===== Extended Transaction fields (optional, backward compatible) =====
export interface TransactionExtendedFields {
  from_account_id?: string;
  to_account_id?: string;
  tags?: string[];
  is_deleted?: boolean;
}
