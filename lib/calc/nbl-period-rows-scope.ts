/**
 * 비사업용 토지 상세판정 — 「사업용 사용기간」·「거주 이력」 행이 **어느 지목에서 쓰이는가** (단일 소스).
 *
 * ⑤ 입력칸 렌더 · ⑧ 빈 행 검증이 같은 판정을 쓴다. 따로 쓰면 한쪽만 바뀌어 막다른 오류가 된다 —
 * 지목을 바꿔도 스토어는 행을 지우지 않으므로(`calc-wizard-asset-nbl.ts`), 농지에서 만든 빈 행이
 * 다른 지목에 남는다. 입력칸이 없는 지목에서 그 행을 막으면 사용자가 고칠 방법이 없다.
 *
 * 근거(엔진 소비처 — 입력칸이 있는 지목과 일치한다):
 *   · 사업용 사용기간 `businessUsePeriods` — 농지 자경기간만(`farmland.ts`). 목장 축산·별장 사용기간은 별도 배열.
 *   · 거주 이력 `ownerProfile.residenceHistories` — 농지(§168의8②)·임야(§168의9②)만(`farmland.ts`·`forest.ts`·
 *     `engine.ts` `residenceMatch`). 목장에는 재촌 요건이 없다(법 §104의3①3호 — 엔진 `pasture.ts`는 참조하지 않는다).
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md` §7-4 N1.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type NblLandType = AssetForm["nblLandType"];

/** 「사업용 사용기간(자경 등)」 행이 쓰이는 지목 — 농지만. */
export function nblBusinessUsePeriodsApply(landType: NblLandType): boolean {
  return landType === "farmland";
}

/** 「거주 이력」 행이 쓰이는 지목 — 재촌 판정 대상인 농지·임야. */
export function nblResidenceHistoryApplies(landType: NblLandType): boolean {
  return landType === "farmland" || landType === "forest";
}
