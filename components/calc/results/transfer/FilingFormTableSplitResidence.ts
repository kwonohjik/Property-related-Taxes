/**
 * 신고서 양식 split-2col 「거주기간」 파트 열 — 건물 증여 전 같은 세대 거주(서면-2025-법규재산-4289)
 *
 * FilingFormTableHelpers.ts 에서 분리(800줄 정책 — 위험구간이라 신규 규칙은 이 파일에 둔다).
 *
 * 분리취득의 거주기간 행은 합계 열(본인 거주)만 채운다. 4289는 토지 파트의 거주기간별 공제율에 건물 증여 전 같은 세대 거주를 더하므로
 * 두 파트의 공제율 산정 연수가 다르다 — 엔진 파트 echo(`SplitPartResult.residenceYears`)가 그 값이다. 연수가 같거나 echo가 없는 옛 이력은 칸을 비워 둔다(종전 그대로).
 */
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";
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
  if (land === undefined || building === undefined || land <= building) return;
  setStr("residencePeriod", "land", fmtPeriod(land * 12));
  setStr("residencePeriod", "building", fmtPeriod(ownResidenceMonths));
  setRoseNote(
    "residencePeriod",
    "land",
    `거주기간별 공제율에 쓴 거주 ${land}년 — 건물 증여 전 같은 세대 거주 포함 (서면-2025-법규재산-4289). 건물은 증여일부터 본인 거주만 산정`,
  );
}
