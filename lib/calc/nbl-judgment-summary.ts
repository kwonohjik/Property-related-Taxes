/**
 * ⑥ 비사업용 토지 판정 메뉴 사이드바 요약 — 순수 함수 (계획서 `nbl-judgment-menu.ui.plan.md` §9.3)
 *
 * 세액·금액이 없는 화면이라 「지금까지 입력으로 무엇이 정해졌나」만 보인다. **입력으로 알 수 있는 항목만**, 빈 값은 제외한다.
 * 판정(사업용·비사업용)은 결과 화면이 말한다 — 여기서는 요건을 다시 따지지 않는다.
 * 무조건 사업용 의제는 입력 선언만 보고 단정하지 않고 엔진 판정(`evaluateUnconditionalExemption`)을 그대로 읽는다.
 */
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";
import { evaluateUnconditionalExemption, nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";
import { nblLandTypeLabel, nblZoneTypeLabel } from "./nbl-judgment-labels";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { consumesGracePeriods } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesPeriodJudgmentDate } from "@/lib/tax-engine/non-business-land/land-category";
import { consumesUrbanIncorporationDate } from "@/lib/tax-engine/non-business-land/land-category";

export interface NblJudgmentSummaryItem {
  label: string;
  value: string;
}

const ymd = (iso: string) => iso.replace(/-/g, ".");

/** 요약 줄 라벨 — 취득원인에 따라 같은 날짜 칸의 뜻이 달라진다(입력 칸 라벨은 `nblAcquisitionDateLabel`). */
const ACQUISITION_DATE_SUMMARY_LABEL: Record<string, string> = {
  inheritance: "상속개시일",
  gift: "증여 등기접수일",
  carryover_gift: "증여자 취득일",
};

export function computeNblJudgmentSummary(form: NblJudgmentFormData): NblJudgmentSummaryItem[] {
  const a = form.assets[0];
  const items: NblJudgmentSummaryItem[] = [];
  if (!a) return items;
  const push = (label: string, value: string | undefined) => {
    if (value && value.trim() !== "") items.push({ label, value });
  };

  const address = (a.addressRoad || a.addressJibun || "").trim();
  push("소재지", address.length > 24 ? `${address.slice(0, 24)}…` : address);

  const acq = nblAcquisitionDateOf(a);
  push(ACQUISITION_DATE_SUMMARY_LABEL[a.acquisitionCause] ?? "취득일", acq ? ymd(acq) : undefined);
  if (a.acquisitionCause === "carryover_gift" && a.carryover?.giftRegistryDate) {
    push("증여 등기접수일", ymd(a.carryover.giftRegistryDate));
  }
  push("양도일", form.transferDate ? ymd(form.transferDate) : undefined);

  const area = parseFloat(a.acquisitionArea);
  if (Number.isFinite(area) && area > 0) push("면적", `${area.toLocaleString()} ㎡`);
  const ratio = getOwnershipRatio(a);
  if (ratio < 1) push("공유 지분", `${parseFloat((ratio * 100).toFixed(4))}%`);

  push("지목", nblLandTypeLabel(a.nblLandType));
  push("용도지역", nblZoneTypeLabel(a.nblZoneType));

  // 무조건 사업용 의제 — 선언이 아니라 엔진 실제 판정. 양도일이 없으면 판정할 수 없으니 묻지 않는다.
  const exempt = !!form.transferDate && evaluateUnconditionalExemption(a, form.transferDate).isExempt;
  if (exempt) {
    push("무조건 사업용 의제", "성립 (엔진 판정)");
    return items; // 의제가 성립하면 유예·편입일·양도일 의제는 판정에 쓰이지 않는다(inputEffects `overridden_by_unconditional`)
  }
  // 아래 셋은 ④(`buildNonBusinessLandRaw`)·서버가 쓰는 같은 `consumes*` 술어로 거른다 — 지목이 읽지 않는 stale 값을 보이지 않는다.
  const graces = a.nblGracePeriods?.length ?? 0;
  if (graces > 0 && consumesGracePeriods(a.nblLandType)) push("부득이한 사유", `${graces}건`);
  if (consumesUrbanIncorporationDate(a.nblLandType) && a.nblUrbanIncorporationDate && /^\d{4}-\d{2}-\d{2}$/.test(a.nblUrbanIncorporationDate)) {
    push("도시편입일", ymd(a.nblUrbanIncorporationDate));
  }
  if (consumesPeriodJudgmentDate(a.nblLandType) && a.nblDeemedTransferReason && a.nblDeemedTransferReason !== "none" && a.nblDeemedTransferDate) {
    push("양도일 의제", ymd(a.nblDeemedTransferDate));
  }
  return items;
}
