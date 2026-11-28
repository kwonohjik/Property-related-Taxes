/**
 * 외국납부세액 — 소득세법 §118의6, 시행령 §178의7 (국외자산 양도소득에 대한 외국납부세액의 공제).
 *
 * 법 §118의6①: 「다음 각 호의 방법 중 하나를 선택하여 적용할 수 있다」
 *   1호 세액공제방법 — 「공제한도금액 = A × B / C」(A: §118의5 산출세액 · B: 해당 국외자산 양도소득금액 · C: 해당 과세기간 국외자산 양도소득금액)
 *       을 한도로 국외자산 양도소득세액을 「양도소득 산출세액에서 공제」
 *   2호 필요경비 산입방법 — 국외자산 양도소득세액을 「해당 과세기간의 필요경비에 산입」
 * 두 방법을 동시에 쓰지 않는다. 한도 이월 규정은 §118의6 본문에 없다(종합소득 §57④와 다름) — 한도 초과분은 `unappliedKrw`로 남긴다.
 *
 * 한도 함수는 주식 트랙의 의존 없는 leaf `computeForeignTaxCreditLimits`를 그대로 쓴다. 산식이 같음을 확인했다:
 *   A = 기본공제 **후** 과세표준의 §118의5① 산출세액(합계 1개) · B·C = 기본공제 **전** 양도소득금액(§92② 순서: 양도소득금액 → 기본공제 → 과세표준).
 *   차이: 주식은 A가 §104①12호 세율이고 B·C가 §102② 통산 후 값이지만, 부동산은 §118의5 §55① 세율이고 통산이 없다 — B·C는 차손 자산을 0으로 본 값(Σ 양(+) 양도소득금액)이다(차손 자산 B = 0 → 한도 0).
 *   절사 잔차(≤ n−1원)는 입력 순서상 마지막 양(+) B 자산이 흡수한다 — leaf의 규약이며 Σ한도 ≤ A를 지킨다.
 *
 * 원화 환산일(계획서 엔진 V-12): 영 §178의5①은 「양도가액 및 필요경비를 수령하거나 지출한 날 현재」 기준환율을 정한다.
 *   - 필요경비 산입방법: 외국세가 필요경비가 되므로 같은 조가 적용된다고 읽어 입력한 납부일·환율로 환산한다(조문 인용 — 해석 확인은 별도).
 *   - 세액공제방법: 영 §178의5는 「양도차익을 계산함에 있어서」의 환산이라 공제 대상 외국세의 환산일을 정한 조문을 찾지 못했다 →
 *     납부일·환율을 항목마다 필수 입력으로 받고(양도일 환율 fallback 없음) 결과에 확인 필요 코드를 싣는다.
 */
import { computeForeignTaxCreditLimits } from "../stock-transfer/foreign-tax-credit-limit";
import { convertItem } from "./convert";
import { assertForeignTaxAssetId, assertForeignTaxMethod } from "./input-asserts";
import type {
  ForeignRealEstateAssetRow,
  ForeignRealEstateConvertedItem,
  ForeignRealEstateForeignTaxInput,
  ForeignTaxMethod,
} from "./types";

export interface PreparedForeignTax {
  method: ForeignTaxMethod;
  /** 자산 id → 환산한 외국납부세액 항목 */
  byAsset: Map<string, ForeignRealEstateConvertedItem[]>;
}

/** 외국납부세액 입력을 환산·검증한다. 없거나 항목이 비면 undefined(§118의6 미적용). */
export function prepareForeignTax(
  foreignTax: ForeignRealEstateForeignTaxInput | undefined,
  assetIds: readonly string[],
): PreparedForeignTax | undefined {
  if (!foreignTax || foreignTax.items.length === 0) return undefined;
  assertForeignTaxMethod(foreignTax.method);
  const byAsset = new Map<string, ForeignRealEstateConvertedItem[]>();
  foreignTax.items.forEach((item, i) => {
    const path = `foreignTax.items[${i}]`;
    assertForeignTaxAssetId(item.assetId, assetIds, path);
    const list = byAsset.get(item.assetId) ?? [];
    list.push(convertItem(item, path));
    byAsset.set(item.assetId, list);
  });
  return { method: foreignTax.method, byAsset };
}

const paidOf = (items: ForeignRealEstateConvertedItem[]) => items.reduce((s, i) => s + i.amountKrw, 0);

/** 환산한 외국납부세액을 각 자산 행에 싣는다(공제·산입은 아직 하지 않음). */
export function attachForeignTax(
  rows: ForeignRealEstateAssetRow[],
  prepared: PreparedForeignTax | undefined,
): ForeignRealEstateAssetRow[] {
  if (!prepared) return rows;
  return rows.map((row) => {
    const items = prepared.byAsset.get(row.id) ?? [];
    return { ...row, foreignTax: { ...row.foreignTax, items, paidKrw: paidOf(items), unappliedKrw: paidOf(items) } };
  });
}

/** 필요경비 산입방법이면 외국납부세액을 양도차익에서 뺀 행으로 — 「차손 자산」 판정(확인 필요 코드)은 이 값 기준이다. */
export function rowsAfterMethod(
  rows: ForeignRealEstateAssetRow[],
  prepared: PreparedForeignTax | undefined,
): ForeignRealEstateAssetRow[] {
  return prepared?.method === "expense" ? rows.map(withExpenseMethod) : rows;
}

/** 필요경비 산입방법(§118의6①2호): 외국납부세액을 그 자산의 양도차익에서 뺀다. 차손으로 넘어가면 `lossAmount`가 된다. */
export function withExpenseMethod(row: ForeignRealEstateAssetRow): ForeignRealEstateAssetRow {
  const expense = row.foreignTax.paidKrw;
  const capitalGain = row.capitalGain - expense;
  return {
    ...row,
    capitalGain,
    lossAmount: capitalGain < 0 ? -capitalGain : 0,
    incomeAmount: Math.max(0, capitalGain),
    taxBaseAllocated: Math.max(0, capitalGain),
    foreignTax: { ...row.foreignTax, expenseKrw: expense, unappliedKrw: 0 },
  };
}

/**
 * 세액공제방법(§118의6①1호): 자산별 한도 A × B / C와 공제액 = min(외국납부세액, 한도).
 * `calculatedTax`는 합산한 과세표준의 산출세액(A) — leaf가 행별 `incomeTax`의 합을 A로 쓰므로 첫 행에 몰아 넘긴다(A는 합계 하나뿐).
 */
export function withCreditMethod(
  rows: ForeignRealEstateAssetRow[],
  calculatedTax: number,
): { rows: ForeignRealEstateAssetRow[]; applied: number } {
  const limits = computeForeignTaxCreditLimits(
    rows.map((r, i) => ({
      incomeAfterOffset: r.incomeAmount,
      incomeTax: i === 0 ? calculatedTax : 0,
      foreignTaxPaidKrw: r.foreignTax.paidKrw,
    })),
  );
  let applied = 0;
  const next = rows.map((r, i) => {
    applied += limits[i].applied;
    return {
      ...r,
      foreignTax: {
        ...r.foreignTax,
        limit: limits[i].limit,
        applied: limits[i].applied,
        unappliedKrw: r.foreignTax.paidKrw - limits[i].applied,
      },
    };
  });
  return { rows: next, applied };
}
