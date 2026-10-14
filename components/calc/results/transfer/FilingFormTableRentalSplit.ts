/**
 * 신고서 split-2col — §155⑳ 장기임대 거주주택 특례 결과의 토지·건물 열 값 (엔진 echo 기반).
 *
 * 특례 결과는 합계 열의 의미가 일반 경로와 다르다 — 「과세대상 양도차익」은 전체 양도차익이고(비과세는 양도소득금액 단계에서
 * 분리), 「양도소득금액」은 §95① = 양도차익 − 장기보유특별공제(전체 양도차익 기준), 「감면후 소득금액」은 §161·12억 안분이 끝난
 * 과세대상 양도소득금액(`result.taxableGain`)이다. 열 값도 같은 의미로 만든다 — 종전 균일 비율(`result.taxableGain / Σ파트 양도차익`)을
 * 파트 양도차익에 곱하는 방식은 `result.taxableGain`이 이미 장특을 뺀 값이라 파트 장특을 한 번 더 빼 열 양도소득금액이 음수가 됐다.
 *
 * 값은 모두 엔진 echo다 — 파트 양도차익·파트 장특(`splitDetail.*`), 과세대상 양도소득금액(`rentalHousingExceptionDetail.taxableGain`),
 * 배율 초과 파트(`nonBusinessLandPart`). 새로 계산하는 것은 «특례 후 과세대상 양도소득금액의 파트 배분» 하나이고, 그 값도 합계 열을
 * 정본으로 두고 마지막 파트가 잔액을 흡수해 열 합 = 합계 열이 항상 성립한다.
 */
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { RentalHousingExceptionResult } from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import type { ColumnKey } from "./FilingFormTableHelpers";

type SetNum = (rowKey: string, col: ColumnKey, n: number | null) => void;
type SetNote = (rowKey: string, col: ColumnKey, note: string) => void;

const mulDiv = (a: number, b: number, c: number): number => (c <= 0 ? 0 : Number((BigInt(a) * BigInt(b)) / BigInt(c)));

/** 열 값을 만들 수 있는가 — 특례가 파트별 echo(`partsLthd`)를 채운 분리 취득 자산(본인이 두 파트를 모두 소유)만이다. */
export function hasRentalSplitColumns(sp: SplitGainResult | undefined, rhe: RentalHousingExceptionResult | undefined): boolean {
  return !!sp && !!rhe && rhe.applied && !!rhe.formulaTrace.partsLthd && (sp.selfOwns ?? "both") === "both";
}

export function rentalSplitTwoColFinancials(
  sp: SplitGainResult,
  rhe: RentalHousingExceptionResult,
  setNum: SetNum,
  setNote: SetNote,
): void {
  const nb = sp.nonBusinessLandPart;
  const landLt = sp.land.longTermDeduction + (nb?.longTermDeduction ?? 0);
  const buildingLt = sp.building.longTermDeduction;
  setNum("taxableGain", "land", sp.land.gain);
  setNum("taxableGain", "building", sp.building.gain);
  setNum("exemptGain", "land", 0);
  setNum("exemptGain", "building", 0);
  setNum("ltDeduction", "land", landLt);
  setNum("ltDeduction", "building", buildingLt);
  // §95① 양도소득금액 — 손실 파트는 공제 0이라 그 파트 양도차익(음수) 그대로다.
  const landIncome = sp.land.gain - landLt;
  const buildingIncome = sp.building.gain - buildingLt;
  setNum("incomeAmount", "land", landIncome);
  setNum("incomeAmount", "building", buildingIncome);

  // 특례 후 과세대상 양도소득금액 T(= rhe.taxableGain, 배율 초과분 제외)의 파트 배분. 초과분은 안분 없이 전액 과세라 토지 열에 그대로 더한다.
  const nbIncome = nb ? (nb.taxableGainAfterProration ?? nb.gain) - nb.longTermDeduction : 0;
  const ruling = rhe.formulaTrace.highValueExcessRuling;
  const parts = rhe.formulaTrace.partsLthd!;
  const T = rhe.taxableGain;
  // 가중치 — 회신 방식(A2 + 배율 초과)은 엔진이 만든 이내 토지·건물 과세 양도차익에 같은 표2 공제율을 곱한 파트 소득금액,
  // 그 밖에는 파트의 §95① 양도소득금액(배율 초과분 제외 주택분)이다.
  const wLand = ruling
    ? ruling.landTaxableGain - Math.floor(ruling.landTaxableGain * parts.land.rateTable2)
    : sp.land.gain - (nb?.gain ?? 0) - sp.land.longTermDeduction;
  const wBuilding = ruling
    ? ruling.buildingTaxableGain - Math.floor(ruling.buildingTaxableGain * parts.building.rateTable2)
    : sp.building.gain - sp.building.longTermDeduction;
  const wl = Math.max(wLand, 0);
  const wb = Math.max(wBuilding, 0);
  const landAfterHousing = wl + wb > 0 ? mulDiv(T, wl, wl + wb) : 0;
  const buildingAfterHousing = T - landAfterHousing; // 마지막 파트가 잔액을 흡수 — Σ = T
  const landAfter = landAfterHousing + nbIncome;
  setNum("incomeAmountAfter", "land", landAfter);
  setNum("incomeAmountAfter", "building", buildingAfterHousing);
  // 비과세 양도소득금액 = 양도소득금액 − 과세대상(열 안 항등식) — 합 = 합계 열(`nontaxableGainAmount`).
  setNum("nontaxableIncome", "land", landIncome - landAfter);
  setNum("nontaxableIncome", "building", buildingIncome - buildingAfterHousing);

  const alloc =
    "특례 적용 후 과세대상 양도소득금액을 파트별 양도소득금액" + (ruling ? "(회신 방식 안분 후 과세 양도차익 기준)" : "") +
    " 비율로 나눈 표시값입니다 — 합계 열이 정본입니다";
  setNote("incomeAmountAfter", "land", alloc);
  setNote("incomeAmountAfter", "building", alloc);
  setNote("nontaxableIncome", "land", alloc);
  setNote("nontaxableIncome", "building", alloc);
  if (nb) {
    const f = (n: number) => n.toLocaleString();
    setNote(
      "ltDeduction",
      "land",
      `기준면적 이내 토지분 ${f(sp.land.longTermDeduction)} + 배율 초과 부수토지분 ${f(nb.longTermDeduction)} (표1 — 토지 보유 ${nb.holdingYears}년, 공제율 ${Math.round(nb.longTermRate * 100)}%)`,
    );
  }
}
