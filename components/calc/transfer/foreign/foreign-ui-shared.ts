/**
 * 국외자산 부동산 입력 화면 공용 상수·헬퍼 — 문구는 한 곳에 둔다(테스트·hint·결과 카드(U2)가 같은 문구를 본다).
 */
import { parseDecimal } from "@/lib/calc/number-parse";
import { tryToKrw } from "@/lib/tax-engine/foreign-realestate/fx";
import { FOREIGN_TAX_METHOD_OPTIONS } from "@/components/calc/foreign/foreign-options";
import { FOREIGN_RE_MAX_ROWS } from "@/lib/api/transfer-foreign-schema";
import { TRANSFER_FOREIGN_RE as RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { ForeignAssetKindForm } from "@/lib/stores/calc-wizard-form-foreign";

/** 환율 3종 함정(기준환율 ↔ 대고객 매입률·매도율) — 환율 칸 hint. 영 §178의5① */
export const FX_RATE_HINT = `외국환거래법에 따른 기준환율(기준환율이 없는 통화는 재정환율)입니다. 은행이 고객에게 사고파는 대고객 매입률·매도율이 아닙니다 — ${RE.DECREE_178_5_FX_BASE_RATE}. 소수 4자리까지 입력할 수 있습니다.`;

export const FX_AMOUNT_HINT = "해당 통화 단위 그대로 입력하세요(센트·소수 4자리까지).";

export const ROW_EMPTY_HINT = "없으면 비워두세요";

/** 환율 입력 단위 안내 — FieldCard `trailing`이 있으면 `unit`이 렌더되지 않아 hint 앞머리에 쓴다 */
export const fxRateUnit = (currency: string) => `KRW/${currency || "외화"}`;

export const FOREIGN_ASSET_KIND_OPTIONS: { value: ForeignAssetKindForm; label: string }[] = [
  { value: "land", label: "토지" },
  { value: "building", label: "건물" },
  { value: "right", label: "부동산에 관한 권리" },
];

/** 5년 미만 경고 문구 — 비차단 */
export const RESIDENCE_UNDER_MIN_NOTICE = `거주 기간이 5년 미만입니다. ${RE.SECTION_118_2_SCOPE}에 따라 국외자산 양도소득세 납세의무가 없어 세액은 0으로 산출됩니다(입력은 계속할 수 있습니다).`;

/** 미등기 안내 — 칸을 만들지 않는 이유(C-3). 엔진 V-3 확정 전이라 «확인 필요»를 함께 싣는다 */
export const UNREGISTERED_NOTICE = `국외자산은 미등기 여부를 입력하지 않습니다. 세율은 ${RE.SECTION_118_5_RATE}에 따라 일반 양도소득 세율(${TRANSFER.PROGRESSIVE_RATE_TABLE})이고 기본공제(${RE.SECTION_118_7_BASIC_DEDUCTION} 연 250만원)에도 미등기 배제 단서가 없습니다.`;

/** 거주 연수가 5로 걸리는 다건 — C-2 한계 고지 */
export const RESIDENCE_BOUNDARY_NOTICE =
  "확인 필요: 거주 연수는 모든 국외자산에 같은 값으로 적용합니다. 양도일이 서로 다른 자산이 함께 있으면 5년 기준 충족 여부가 자산마다 달라질 수 있습니다 — 양도일까지 계속 거주한 연수를 자산별로 확인하세요.";

/** 원화 환산 미리보기 — 엔진 환산 leaf(`toKrw`)와 같은 값. 입력이 비었거나 환산할 수 없으면 null */
export function foreignKrwPreview(amount: string, rate: string): number | null {
  if (amount.trim() === "" || rate.trim() === "") return null;
  const r = tryToKrw(parseDecimal(amount), parseDecimal(rate));
  return "krw" in r ? r.krw : null;
}

/** 같은 통화로 쓰는 `krwOf`(ForeignDatedAmountRows 용) */
export function krwOfExact(amountForeign: number, exchangeRate: number): number | null {
  const r = tryToKrw(amountForeign, exchangeRate);
  return "krw" in r ? r.krw : null;
}

/** 행 목록 상한(`FOREIGN_RE_MAX_ROWS`) — 「+ 추가」로 넘기려 하면 직전 목록을 유지한다(⑧도 같은 상한으로 막는다) */
export function limitRows<T>(next: T[], prev: T[]): T[] {
  return next.length > FOREIGN_RE_MAX_ROWS ? prev : next;
}

/** 외국납부세액 처리 방법 선택지 — 값·라벨은 주식과 공용 단일 소스(`foreign-options.ts`), 설명만 «종목» → «자산» */
export const FOREIGN_RE_TAX_METHOD_OPTIONS = FOREIGN_TAX_METHOD_OPTIONS.map((o) => ({
  ...o,
  value: o.value as "credit" | "expense",
  description: o.description.replace("종목", "자산"),
}));
