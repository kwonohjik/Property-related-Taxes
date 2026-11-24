/**
 * 비사업용 토지 판정 → 양도세 계산기로 **사실만** 넘기기 (계획서 `nbl-judgment-menu.ui.plan.md` §7 · 선례 `one-house-judgment-handoff.ts`)
 *
 * 🔑 넘기는 것은 **폼(사실)** 이지 `result`가 아니다 — 계산기는 같은 엔진으로 다시 판정한다(D1). 메뉴 폼이 `TransferFormData` 그대로라(슈퍼셋이 아니라 동일 타입)
 *    1주택 판정처럼 키를 걷어내는 작업이 없다. `assets[0]`이 이미 `assetKind:"land"` · `isNonBusinessLand` · `nblUseDetailedJudgment`라
 *    계산기는 별도 조작 없이 Step4 「판정 도움」 모드로 열린다(`SpecialSituationSection`). 이월과세 칸(증여자 취득일·증여 등기접수일)도 같은 자산 필드라 그대로 간다.
 * 🔴 store가 얕은 병합이라 **이전 물건의 계산기 전용 선택**이 새 물건에 새지 않게 `undefined`로 덮는다(S11-7 규율 — 1주택 patch가 지우는 키의 상위집합 · anchor H-2).
 * 「판정 불러오기」(계산기 → 메뉴)는 만들지 않는다(D6). 호출처가 없는 쓰기-only 짝도 만들지 않는다 — patch 빌더를 export해 anchor가 직접 검증한다.
 */
import type { useRouter } from "next/navigation";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";

type AppRouter = ReturnType<typeof useRouter>;

/** 판정 메뉴가 모르는 계산기 전용 선택 — 이전 물건의 것이 남지 않게 늘 키를 싣고 `undefined`로 둔다. */
export const NBL_HANDOFF_STALE_KEYS = [
  "assetSplitMode",
  "sourceJudgmentId",
  "sourceJudgmentInputHash",
  "sourceJudgmentMenu",
  "importedOneHouseFacts",
  "regionCode",
  "sellingHouseExclusion",
  "gracePeriod",
] as const satisfies readonly (keyof TransferFormData)[];

export function toTransferFormPatchFromNbl(form: NblJudgmentFormData): Partial<TransferFormData> {
  const stale = Object.fromEntries(NBL_HANDOFF_STALE_KEYS.map((k) => [k, undefined])) as Partial<TransferFormData>;
  return { ...form, ...stale };
}

/**
 * 계산기 폼에 판정 사실을 쓰고 **양도세 계산기로 이동**한다.
 * 🔑 `setStep(0)`으로 1단계부터 열어 준다 — 메뉴가 묻지 않은 양도가액·취득가액을 계산기가 받아야 세액이 나온다.
 *    결과 단계로 바로 보내면 0원 취득가액으로 계산된 세액을 완성된 답으로 오해한다.
 */
export async function openTransferWithNblFacts(form: NblJudgmentFormData, router: AppRouter): Promise<void> {
  // 순환 방지 — 계산기 store는 이 파일을 import하는 쪽이 아니지만 선례(`openTransferWithOneHouseFacts`)와 같이 동적으로 가져온다.
  const { useCalcWizardStore } = await import("@/lib/stores/calc-wizard-store");
  const { updateFormData, setStep, clearResult } = useCalcWizardStore.getState();
  clearResult(); // 이전 물건의 계산 결과가 사이드바에 남아 다른 물건 세액을 보이지 않게 한다(1주택 D-16과 같다)
  updateFormData(toTransferFormPatchFromNbl(form));
  setStep(0);
  router.push(TAX_TYPE_ROUTES.transfer);
}
