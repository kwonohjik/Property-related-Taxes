/**
 * 12호 도소매업용 토지의 **품목 한정** — 소득세법 시행규칙 §83조의4⑭ (NBL2611-V7-S · Q-6 (다)).
 *
 * 영 §168의11①12호는 「…그 밖에 이와 유사한 토지로서 재정경제부령이 정하는 토지」, 규칙 ⑭는 그 토지를
 * 「블록ㆍ석물ㆍ토관ㆍ벽돌ㆍ콘크리트제품ㆍ옹기ㆍ철근ㆍ비철금속ㆍ플라스틱파이프ㆍ골재ㆍ조경작물ㆍ화훼ㆍ분재ㆍ농산물ㆍ수산물ㆍ축산물의 도매업 및 소매업용
 * (농산물ㆍ수산물 및 축산물의 경우에는 「유통산업발전법」에 따른 시장과 그 밖에 이와 유사한 장소에서 운영하는 경우에 한한다) 토지」로 한정한다.
 * 종전에는 수입금액비율(⑮5호 10%)만 보아 품목과 무관한 도소매업도 12호로 읽혔다.
 *
 * 순수 함수 — 엔진·⑧·⑫·UI가 같은 표·같은 술어를 쓴다.
 */
import type { NblRevenueBusinessType } from "../legal-codes";

/** 규칙 §83조의4⑭ 열거 품목 — `marketLimited`는 괄호 단서(시장·유사 장소)가 걸리는 농·수·축산물 */
export const WHOLESALE_ITEMS = {
  block: { label: "블록", marketLimited: false },
  stone_work: { label: "석물", marketLimited: false },
  clay_pipe: { label: "토관", marketLimited: false },
  brick: { label: "벽돌", marketLimited: false },
  concrete_product: { label: "콘크리트제품", marketLimited: false },
  pottery: { label: "옹기", marketLimited: false },
  rebar: { label: "철근", marketLimited: false },
  nonferrous_metal: { label: "비철금속", marketLimited: false },
  plastic_pipe: { label: "플라스틱파이프", marketLimited: false },
  aggregate: { label: "골재", marketLimited: false },
  landscape_plant: { label: "조경작물", marketLimited: false },
  flower: { label: "화훼", marketLimited: false },
  bonsai: { label: "분재", marketLimited: false },
  agricultural_product: { label: "농산물", marketLimited: true },
  marine_product: { label: "수산물", marketLimited: true },
  livestock_product: { label: "축산물", marketLimited: true },
} as const satisfies Record<string, { label: string; marketLimited: boolean }>;

export type WholesaleItem = keyof typeof WHOLESALE_ITEMS;

/** ⑫ Zod enum의 단일 소스 — 표 키 그대로 */
export const WHOLESALE_ITEM_VALUES = Object.keys(WHOLESALE_ITEMS) as [WholesaleItem, ...WholesaleItem[]];

export const WHOLESALE_ITEM_MISSING_MESSAGE =
  "도소매업(12호) — 취급 품목을 선택하세요. 소득세법 시행규칙 제83조의4 제14항이 정한 품목(블록·석물·토관·벽돌·콘크리트제품·옹기·철근·비철금속·플라스틱파이프·골재·조경작물·화훼·분재·농산물·수산물·축산물)의 도매업·소매업용 토지만 12호입니다.";
export const WHOLESALE_MARKET_MESSAGE =
  "농산물·수산물·축산물 도소매업은 「유통산업발전법」에 따른 시장과 그 밖에 이와 유사한 장소에서 운영하는 경우에 한하므로(소득세법 시행규칙 제83조의4 제14항) 12호로 인정하지 않습니다 — 해당하면 시장·유사 장소 운영을 확인하세요.";

export type WholesaleItemIssue =
  | { kind: "missing"; message: string }
  | { kind: "not_in_market"; message: string };

/**
 * 도소매업 품목 이슈. 업종이 도소매업이 아니면 `undefined`.
 * `missing` — 품목 미선택(차단), `not_in_market` — 농·수·축산물인데 시장·유사 장소가 아님(12호 불인정).
 * 값이 열거 밖(직접 호출의 오타)이어도 `missing`으로 본다 — 조용히 통과시키지 않는다.
 */
export function wholesaleItemIssue(p: {
  businessType?: NblRevenueBusinessType | string;
  wholesaleItem?: string;
  wholesaleInMarket?: boolean;
}): WholesaleItemIssue | undefined {
  if (p.businessType !== "wholesale_retail") return undefined;
  const item = p.wholesaleItem && p.wholesaleItem in WHOLESALE_ITEMS ? WHOLESALE_ITEMS[p.wholesaleItem as WholesaleItem] : undefined;
  if (!item) return { kind: "missing", message: WHOLESALE_ITEM_MISSING_MESSAGE };
  if (item.marketLimited && p.wholesaleInMarket !== true) return { kind: "not_in_market", message: WHOLESALE_MARKET_MESSAGE };
  return undefined;
}
