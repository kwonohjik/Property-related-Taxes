/**
 * 「공고 전 매매계약」(영 §167의3①11호 · §167의4③5호 · §167의10①11호 · §167의11①10호) 입력이 의미를 갖는 범위 —
 * ⑤ UI · ④ 전송 · ⑧ validate **공용 단일 소스** (계획서 `docs/00-pm/regulated-area-region-code-match.plan.md` §5.5).
 *
 * 세 층이 같은 술어를 쓴다 — 조건을 복제하면 「보이지 않는 칸 차단」이나 「화면엔 있는데 전송 안 됨」으로
 * 갈라진다(`grace-period-scope.ts`가 겪은 Q03 · memory `feedback_shared_predicate_argument_parity`).
 *
 * 조건:
 * 1. 양도 물건이 주택 계열 + 세대 명부(보유 주택 행 ≥ 1 또는 분양권·입주권 ≥ 1) — ④ `buildHousesPayload`가
 *    `houses[]`를 싣는 조건 그대로다. 이것이 없으면 정밀 중과 판정(STEP 0.5) 자체가 돌지 않는다.
 * 2. 양도일 ≥ 2018-08-28 — 호 시행(대통령령 제29242호 부칙 제5조).
 * 3. 양도 주택 법정동코드가 양도일에 조정대상지역 — 11호는 조정대상지역 소재 주택의 중과만 배제한다.
 *    판정은 엔진 Step 2와 같은 `isRegulatedByBjdCode`. 코드가 없으면 엔진이 공고를 특정할 수 없어 열지 않는다.
 */
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { PRE_DESIGNATION_CONTRACT_EXCLUSION_EFFECTIVE_DATE } from "@/lib/tax-engine/legal-codes/transfer-house";
import { isHousingLike } from "./housing-like-asset";
import { fieldError } from "./transfer-tax-validate-field";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const EFFECTIVE_FROM = PRE_DESIGNATION_CONTRACT_EXCLUSION_EFFECTIVE_DATE.toISOString().slice(0, 10);

export interface PreDesignationContractScopeArgs {
  assetKind: string | undefined;
  regionCode: string | undefined;
  transferDate: string | undefined;
  houseRows: number;
  presaleRights: number;
}

export function preDesignationContractInScope(a: PreDesignationContractScopeArgs): boolean {
  if (!isHousingLike(a.assetKind ?? "")) return false;
  if (a.houseRows <= 0 && a.presaleRights <= 0) return false;
  if (!a.transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(a.transferDate) || a.transferDate < EFFECTIVE_FROM) return false;
  if (!a.regionCode) return false;
  return isRegulatedByBjdCode(a.regionCode, a.transferDate).isRegulated;
}

/** 폼 편의 래퍼 — ⑤·⑧이 부른다(④는 `buildHousesPayload` 인자로 같은 값을 넘긴다). */
export function preDesignationContractInScopeOf(
  form: Pick<TransferFormData, "transferDate" | "assets" | "houses" | "presaleRights">,
): boolean {
  const primary = form.assets?.[0];
  return preDesignationContractInScope({
    assetKind: primary?.assetKind,
    regionCode: primary?.regionCode,
    transferDate: form.transferDate,
    houseRows: form.houses?.length ?? 0,
    presaleRights: form.presaleRights?.length ?? 0,
  });
}

/**
 * ⑧ 검증 — 범위 안에서 「계약금 수령 ✅」이면 양도 매매계약일 필수 · 계약일 ≤ 양도일.
 * 범위 밖이면 ④가 싣지 않으므로 검증하지 않는다(⑤도 숨는다 — 보이지 않는 칸 차단 방지).
 */
export function collectPreDesignationContractErrors(
  form: Pick<TransferFormData, "transferDate" | "assets" | "houses" | "presaleRights" | "sellingHouseExclusion">,
): string[] {
  const se = form.sellingHouseExclusion;
  if (!se?.saleDepositReceived || !preDesignationContractInScopeOf(form)) return [];
  if (!se.saleContractDate) return [fieldError("sellingHouseExclusion.saleContractDate", "양도 주택 공고 전 매매계약: 양도 매매계약 체결일을 입력하세요.")];
  if (se.saleContractDate > form.transferDate)
    return [fieldError("sellingHouseExclusion.saleContractDate", "양도 주택 공고 전 매매계약: 매매계약 체결일은 양도일보다 늦을 수 없습니다.")];
  return [];
}
