/**
 * 양도세 사이드바 — 자산별 **직접 입력값**(취득가액·필요경비 raw) 파생 leaf.
 *
 * `transfer-per-asset-summary.ts`에서 분리(800줄 정책 — 749줄 파일에 분리 취득가액 분기를 더하면 ≥750 위험구간이라
 * 기회주의적으로 분리). 자산 종류마다 입력 필드가 다른 raw 값(승계조합원·재개발·다필지·겸용·별개 취득·일반건물 파트)을
 * API 변환(`transfer-tax-api.ts`)과 **같은 분기 순서**로 읽는다 — 동작 변경 없음.
 */

import type { AssetForm } from "./calc-wizard-asset";
import { isSeparateAcquisition, separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { isMixedUsePerPartAcq, mixedPartAcqSum } from "@/lib/calc/mixed-use-part-acq-split";
import {
  isSuccessorRightTransfer,
  successorRightAcquisitionTotal,
  successorRightEstimationMode,
} from "@/lib/calc/transfer-successor-right";
import { postApprovalExpensesInScope } from "@/lib/calc/redev-field-scope";

export function parseRaw(v: string | undefined): number {
  return parseInt((v ?? "").replace(/[^0-9]/g, "") || "0", 10);
}

/** 다필지 경로(§166⑥ 필지별 계산) 활성 판정 — API `transfer-tax-api.ts:140-141`과 동일 조건. */
export function isParcelMode(a: AssetForm): boolean {
  return !!a.parcelMode && a.assetKind === "land" && (a.parcels?.length ?? 0) > 0;
}

/** 재개발·입주권(§166) 경로 판정 — API `transfer-tax-api.ts:175-176`(`isRedevelopment`)과 동일 조건. */
export function isRedevelopmentPath(a: AssetForm): boolean {
  return a.assetKind === "redevelopment_apt" || a.assetKind === "right_to_move_in";
}

/**
 * 다필지 취득가액 합 — API `transfer-tax-api.ts:584`(`parcels[].acquisitionPrice`)와 같은 소스.
 *
 * 환산(`acquisitionMethod === "estimated"`) 필지는 API가 금액을 보내지 않고 엔진이 기준시가로
 * 산정하므로 계산 후에야 확정된다 → `pending`. 미확정 필지가 있으면 부분합을 총액으로 표시하지
 * 않는다(`separateAcqPartsSum`과 같은 정책 — 부분합 오독 차단).
 */
export function parcelAcqSum(a: AssetForm): { sum: number; pending: boolean } {
  let sum = 0;
  let pending = false;
  for (const p of a.parcels ?? []) {
    if (p.acquisitionMethod === "estimated") {
      pending = true;
      continue;
    }
    const v = parseRaw(p.acquisitionPrice);
    if (v <= 0) pending = true;
    sum += v;
  }
  return { sum, pending };
}

/** 다필지 필요경비 합 — 필지별 자본적지출 + 양도비 (legacy 단일 `expenses` fallback). */
export function parcelExpenseSum(a: AssetForm): number {
  return (a.parcels ?? []).reduce((acc, p) => {
    const split = parseRaw(p.capitalExpenditure) + parseRaw(p.transferExpense);
    return acc + (split > 0 ? split : parseRaw(p.expenses));
  }, 0);
}

/**
 * 자산별 직접 취득가액 base (지분 ratio 적용 전 raw) + 미확정 여부.
 *
 * **분기 순서·소스는 API 변환(`transfer-tax-api.ts:277-289` `acquisitionPrice`)의 정본을 미러링**한다 —
 * 자산 종류마다 취득가액을 담는 필드가 다르고, 사이드바가 자기 규칙을 세우면 표시값과 실제
 * 계산값이 갈린다(memory `feedback_ui_engine_dual_truth_avoidance`).
 *
 * 미확정(환산·미입력 파트)이 있으면 0 + `pending`을 돌려 fallback 체인으로 넘긴다 —
 * 부분합을 합계로 표시하면 총액으로 오독된다.
 */
export function directAcqRaw(a: AssetForm): { value: number; pending: boolean } {
  // ①-0 승계조합원 입주권 — §166 미적용(§97①1호 가목).
  //     ①보다 **앞**에 둔다 — `isRedevelopmentPath`가 assetKind만 보므로 순서를 바꾸면
  //     승계 자산이 §166 필드(빈 값)를 읽어 0으로 표시된다. API 변환의 분기 순서와 동일.
  //
  // 🔴 2026-08-26 정정(U2-04): 종전에는 **산정 방식과 무관하게** 실가 2칸 합을 확정값으로
  //    표시했다. 산정 방식 라디오는 boolean 3개만 뒤집고 실가 2칸을 비우지 않으므로(전용 필드를
  //    비우는 것은 「조합원 유형」 토글뿐), 환산으로 바꾸면 화면에서 사라진 값이 사이드바에만
  //    남았다 — ④는 `acquisitionPrice: 0`을 보내고 §165① 기준시가로 환산한다
  //    (실측 사이드바 500,000,000 vs 엔진 환산취득가 200,000,000).
  //    ⇒ ④와 **같은 술어**(`successorRightEstimationMode`)로 갈래를 나눈다.
  if (isSuccessorRightTransfer(a)) {
    switch (successorRightEstimationMode(a)) {
      case "actual":
        return { value: successorRightAcquisitionTotal(a), pending: false };
      // ④ `similarSalesValue`(영 §176의2③1호) — 승계는 §166을 안 타므로 추계 3종이 열린다.
      case "salesCase":
        return { value: parseRaw(a.similarSalesValue), pending: false };
      // ④ `appraisalValue`(영 §176의2③2호)는 `fixedAcquisitionPrice`를 싣는다.
      case "appraisal":
        return { value: parseRaw(a.fixedAcquisitionPrice), pending: false };
      // 환산(영 §176의2②2호)은 계산 후 확정 — 0을 돌려 공통 fallback 체인의
      // 「미계산 + 환산 → pending」 규칙에 맡긴다(여기서 pending을 세우면 계산 후에도 남는다).
      case "estimated":
        return { value: 0, pending: false };
    }
  }
  // ① 재개발·입주권 — 상단 일반 취득가액 칸이 숨겨지고 §166 섹션 전용 필드를 쓴다.
  //    승계조합원(사례 48)만 자산 카드 `fixedAcquisitionPrice` (API :283-286).
  if (isRedevelopmentPath(a)) {
    const v =
      a.redevIsSuccessorMember === "yes"
        ? parseRaw(a.fixedAcquisitionPrice)
        : parseRaw(a.redevActualAcquisitionPrice);
    return { value: v, pending: false };
  }
  // ② 다필지 — 자산 전체 취득가액이 없고 필지별로 실재한다 (API :277 `parcelModeActive` → 0 송신).
  if (isParcelMode(a)) {
    const { sum, pending } = parcelAcqSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  // ③-0 겸용 별개 취득 파트 모델(B1) — 자산 전체 칸이 숨겨지고 토지·건물 파트 값이 입력이다.
  //     `isSeparateAcquisition`이 겸용을 제외하므로 따로 연다. 숨은 총액(stale `fixedAcquisitionPrice`)이 ⑤ 분기에 남는 것을 막는다.
  if (isMixedUsePerPartAcq(a)) {
    const { sum, pending } = mixedPartAcqSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  // ③ 별개 취득(토지·건물 취득시기 상이) — 자산 전체 칸이 숨겨져 파트 합계가 정본.
  if (isSeparateAcquisition(a)) {
    const { sum, pending } = separateAcqPartsSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  // ④ 매매사례가액
  if (a.isSalesCaseAcquisition) return { value: parseRaw(a.similarSalesValue), pending: false };
  // ⑤ 자산 전체 실가. 비어 있는데 파트별 실가가 있으면(일반건물 토지·건물 개별 입력) 파트 합계.
  //    자산 전체 값이 있으면 그쪽이 우선 — stale 파트 값에 밀리지 않게 한다.
  const fixed = parseRaw(a.fixedAcquisitionPrice);
  if (fixed > 0) return { value: fixed, pending: false };
  // 매매사례 파트 값(`*SalesCaseValue`)도 파트 값이다 — 분리 ON + 같은 취득일(`isSeparateAcquisition` false)에서 놓치지 않는다(A2 §8.1).
  if (
    parseRaw(a.landAcquisitionPrice) > 0 ||
    parseRaw(a.buildingAcquisitionPrice) > 0 ||
    parseRaw(a.landSalesCaseValue) > 0 ||
    parseRaw(a.buildingSalesCaseValue) > 0
  ) {
    const { sum, pending } = separateAcqPartsSum(a);
    return { value: pending ? 0 : sum, pending };
  }
  return { value: 0, pending: false };
}

/**
 * 자산별 직접 필요경비 base (지분 ratio 적용 전 raw).
 *
 * 취득가액과 같은 이유로 자산 종류별 소스가 다르다 — 재개발은 §166 인가 전·후 분리 입력,
 * 다필지는 필지별, 일반건물은 토지·건물 파트별.
 */
export function directExpenseRaw(a: AssetForm): number {
  // 재개발·입주권 — API `transfer-tax-api-redev.ts`: 인가전 + (인가후 + 자본적지출 + 양도비)
  // ⚠️ 인가후 분은 **승계조합원 축에서만** 합산한다 — API가 같은 술어로 게이트하므로(U1-02)
  //    여기서만 더하면 사이드바가 계산에 쓰이지 않는 금액을 보여준다.
  if (isRedevelopmentPath(a)) {
    return (
      parseRaw(a.redevPreApprovalExpenses) +
      (postApprovalExpensesInScope(a) ? parseRaw(a.redevPostApprovalExpenses) : 0) +
      parseRaw(a.capitalExpenditure) +
      parseRaw(a.transferExpense)
    );
  }
  if (isParcelMode(a)) return parcelExpenseSum(a);
  const split = parseRaw(a.capitalExpenditure) + parseRaw(a.transferExpense);
  if (split > 0) return split;
  const partSplit = parseRaw(a.landDirectExpenses) + parseRaw(a.buildingDirectExpenses);
  if (partSplit > 0) return partSplit;
  return parseRaw(a.directExpenses);
}
