/**
 * 신고서 양식 split-2col 「거주기간」 파트 열 — 토지 파트의 거주 연수가 건물과 다를 때 (두 방향)
 *
 * FilingFormTableHelpers.ts 에서 분리(800줄 정책 — 위험구간이라 신규 규칙은 이 파일에 둔다).
 *
 * 분리취득의 거주기간 행은 합계 열(본인 거주)만 채운다. 토지 파트가 건물과 다른 거주 연수를 쓰는 경우는 방향이 둘이고, 한 칸에 섞이지 않게 **토지 연수 > 건물 연수 / <** 로 가른다.
 *  · 토지 연수 > 건물 연수 — 4289(건물 증여 전 같은 세대 거주를 토지분에 더함, 서면-2025-법규재산-4289). 엔진 `priorHouseholdResidenceEffect.rate`가 있을 때만
 *    (통칙 95-0…1로 표1이 이기거나 표2 대상이 아니면 거주기간별 공제율을 쓰지 않았다).
 *  · 토지 연수 < 건물 연수 — 역방향(토지를 건물보다 나중에 취득 — 토지분 거주는 토지 보유기간 중 거주만, 대법원 2025두34935). 4289 표지와 무관하고, 엔진 echo `holdingResidenceRateUsed`(표2 거주분이 공제율에 쓰임)가 게이트다. 직접 입력 상한(`holdingResidenceCap`)이 걸렸으면 그 사실을 병기한다.
 * 연수가 같거나 echo가 없는 옛 이력은 칸을 비워 둔다(종전 그대로). 값은 엔진 파트 echo(`SplitPartResult.residenceYears`)다.
 */
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { MixedUseHousingPart } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { fmtPeriod } from "./FilingFormTableDateHelpers";

type SetStr = (rowKey: string, col: string, s: string) => void;
type SetRoseNote = (rowKey: string, col: string, note: string) => void;

export function fillSplitResidenceCells(
  sp: SplitGainResult,
  /** 합계 열과 같은 본인 거주 개월(건물 열은 이 값) */
  ownResidenceMonths: number,
  setStr: SetStr,
  setRoseNote: SetRoseNote,
): void {
  const land = sp.land.residenceYears;
  const building = sp.building.residenceYears;
  if (land === undefined || building === undefined || land === building) return;
  if (land > building) {
    // 4289 개월이 토지 공제율을 실제로 바꾼 경우만.
    if (!sp.land.priorHouseholdResidenceEffect?.rate) return;
    setStr("residencePeriod", "land", fmtPeriod(land * 12));
    setStr("residencePeriod", "building", fmtPeriod(ownResidenceMonths));
    setRoseNote(
      "residencePeriod",
      "land",
      `거주기간별 공제율에 쓴 거주 ${land}년 — 건물 증여 전 같은 세대 거주 포함 (서면-2025-법규재산-4289). 건물은 증여일부터 본인 거주만 산정`,
    );
    return;
  }
  // 역방향 — 토지 거주 연수가 거주기간별 공제율에 쓰인 경우만(표2 비대상·거주분 없는 연혁이면 칸을 비운다).
  if (!sp.land.holdingResidenceRateUsed) return;
  setStr("residencePeriod", "land", fmtPeriod(land * 12));
  setStr("residencePeriod", "building", fmtPeriod(ownResidenceMonths));
  const cap = sp.land.holdingResidenceCap;
  setRoseNote(
    "residencePeriod",
    "land",
    `토지분 거주 ${land}년 — 토지를 건물보다 나중에 취득해 토지 보유기간 중 거주만 산정 (대법원 2025두34935). 건물은 본인 거주 전체` +
      (cap ? `. 거주 ${cap.directMonths}개월을 토지 보유기간 ${cap.landHoldingMonths}개월로 상한해 계산 — 확인 필요` : ""),
  );
}

/**
 * 겸용주택 4열(주택분 토지·건물) 「거주기간」 — 토지를 건물보다 나중에 취득해 토지분 거주를 토지 보유기간 중 거주로 센 경우(역방향)만 토지 열을 달리 채운다.
 * 게이트는 엔진 echo `landHoldingResidenceRateUsed`(표2 거주분이 공제율에 쓰임)이고 값은 파트 echo의 거주 연수다. 그 밖에는 호출부가 두 열에 같은 값을 둔다(종전 그대로).
 * @returns 채웠으면 true
 */
export function fillMixedHousingResidenceCells(
  hp: Pick<MixedUseHousingPart, "partLthd" | "landHoldingResidenceRateUsed" | "landHoldingResidenceCap">,
  ownResidenceMonths: number,
  setStr: SetStr,
  setRoseNote: SetRoseNote,
): boolean {
  const land = hp.partLthd?.land.residenceYears;
  const building = hp.partLthd?.building.residenceYears;
  if (!hp.landHoldingResidenceRateUsed || land === undefined || building === undefined || land >= building) return false;
  setStr("residencePeriod", "housingLand", fmtPeriod(land * 12));
  setStr("residencePeriod", "housingBuilding", fmtPeriod(ownResidenceMonths));
  const cap = hp.landHoldingResidenceCap;
  setRoseNote(
    "residencePeriod",
    "housingLand",
    `토지분 거주 ${land}년 — 토지를 건물보다 나중에 취득해 토지 보유기간 중 거주만 산정 (대법원 2025두34935). 건물은 본인 거주 전체` +
      (cap ? `. 거주 ${cap.directMonths}개월을 토지 보유기간 ${cap.landHoldingMonths}개월로 상한해 계산 — 확인 필요` : ""),
  );
  return true;
}
