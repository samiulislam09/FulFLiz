import "server-only";

export type SeloraxOrderItem = {
  order_item_id: number;
  order_id: number;
  product_id: number | null;
  variant_id: number | null;
  bundle_id: number | null;
  name: string;
  price: number;
  quantity: number | null;
  image: string | null;
  sku: string | null;
};

export type SeloraxOrder = {
  order_id: number;
  store_id: number;
  user_id: number | null;
  order_status: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  sub_total: number;
  tax: number;
  shipping: number;
  discount: number;
  grand_total: number;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  courier: string | null;
  courier_id: string | null;
  tracking_code: string | null;
  store_serial_order_no: string | null;
  items: SeloraxOrderItem[];
  metafields: Record<string, string | null>;
};

export type SeloraxListResponse = {
  data: SeloraxOrder[];
  pagination: { page: number; limit: number; total: number };
  status: number;
};

export type FulflizPayload = {
  apiSecret: string;
  courier_cn_id: string;
  order_number: string;
  merchant_name: string;
  currier_name: string;
  products: Array<{ sku: string; quantity: number }>;
};

export type FulflizCreatedOrder = {
  id: string;
  userId: string;
  courier_cn_id: string;
  courier_name: string;
  merchant_name: string;
  order_number: string;
  extranalOrderId: string;
  products: Array<{ id: string; sku: string; quantity: number; extranalOrderId: string }>;
};

export type FulflizResponse = {
  status: boolean;
  message: string;
  data: FulflizCreatedOrder[];
};

export const FULFLIZ_METAFIELD_NAMESPACE = "fulfliz";
export const FULFLIZ_METAFIELD_KEY = "external_order_id";
export const FULFLIZ_METAFIELD_PATH = `${FULFLIZ_METAFIELD_NAMESPACE}.${FULFLIZ_METAFIELD_KEY}`;

export type OrderRow = {
  order_id: number;
  store_serial_order_no: string | null;
  courier: string | null;
  tracking_code: string | null;
  grand_total: number;
  created_at: string;
  itemCount: number;
  alreadySynced: boolean;
};
