/**
 * 신고서 양식 — 주택 split **파트 이월과세**(소득세법 §97의2①) 열별 셀·각주 (P2 C).
 *
 * `FilingFormTableHelpers.ts`가 800줄 정책 경계라 신고서 쪽 이월과세 분기를 이 파일에 둔다. 값은 전부 엔진 echo(`splitCarryoverView`)이고
 * 새로 계산하지 않는다. 적용 파트는 증여자 취득일부터 장기보유특별공제 보유기간을 세므로 취득일자·보유기간 칸을 그 날짜로 덮고(세율 기산일은 각주로 따로 밝힌다),
 * 취득가액·필요경비 칸에는 증여자 취득가액 / 증여 신고가액과 증여세 상당액 가산을 각주로 밝힌다(각주 = 칸 값을 설명하는 것이지 다른 수를 만들지 않는다).
 */
import { holdingPeriodFromDates, fmtDate } from "./FilingFormTableDateHelpers";
import {
  splitCarryoverAcquisitionText,
  splitCarryoverApportionText,
  splitCarryoverComparisonText,
  splitCarryoverLthdBasisText,
  splitCarryoverRateBasisText,
  type SplitCarryoverView,
} from "@/lib/tax-engine/transfer-tax-split-carryover-display";

type ColumnKey = string;

export function fillSplitCarryoverCells(
  view: SplitCarryoverView,
  transferDate: string,
  /** 원인이 서로 달라 취득일자 각주가 이미 파트 원인·세율 기산일을 밝히는 결과(`summarizeSplitGain().mixedCause`) — 그 칸은 덮어쓰지 않는다 */
  acquisitionDateNoteTaken: boolean,
  setStr: (rowKey: string, col: ColumnKey, s: string) => void,
  setRoseNote: (rowKey: string, col: ColumnKey, note: string) => void,
): void {
  for (const p of view.parts) {
    // 취득일자·보유기간 — 적용: 증여자 취득일, 미적용: 증여 등기접수일(수증자 취득). 이 날부터 보유연수·장특공제율을 센다(장기보유특별공제 기산).
    // 세율 기산일은 주택 토지 파트에서 이와 다를 수 있다 — 엔진이 파트별로 세율을 판정했을 때만 각주에 따로 밝힌다.
    const rate = splitCarryoverRateBasisText(p);
    setStr("acquisitionDate", p.key, fmtDate(p.lthdStartDate));
    setStr("holdingPeriod", p.key, holdingPeriodFromDates(p.lthdStartDate, transferDate));
    setRoseNote("holdingPeriod", p.key, `장기보유특별공제 보유기간 (${p.lthdStartLabel} ${p.lthdStartDate}부터)`);
    if (!acquisitionDateNoteTaken) {
      setRoseNote("acquisitionDate", p.key, `${p.verdictLabel} — ${splitCarryoverLthdBasisText(p)}${rate ? ` · ${rate}` : ""}`);
    }
    const cmp = splitCarryoverComparisonText(p);
    setRoseNote("acquisitionPrice", p.key, `${splitCarryoverAcquisitionText(p)}${cmp ? ` · ${cmp}` : ""}`);
    setRoseNote("expenses", p.key, splitCarryoverApportionText(view, p));
  }
}
