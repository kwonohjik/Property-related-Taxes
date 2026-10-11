/**
 * 조특법 §71의2① 인구감소지역주택 질문의 **노출 범위** (결정 #42) — ⑤ 위젯이 쓴다. 엔진 평가기(`population-decline-71-2.ts`)와 같은 상수·판정을 읽는다.
 *
 * 후보 행 = 취득일이 2024.1.4.~2026.12.31.이고 소재지가 인구감소지역(자동 판정 또는 ④ 지정)인 행. 인구감소관심지역은 법률 부칙(제21223호 제14조)상
 * 2025.11.28. 이후 취득분만이다. 후보가 아니면 묻지 않는다 — 이 칸은 적용 여부를 고르는 토글이 아니라 **명부에 없는 과거 사실**을 받는 칸이다.
 */
import { classifyPopulationDeclineArea } from "@/lib/tax-engine/data/population-decline-areas";
import {
  POP_DECLINE_INTEREST_ACQ_FROM,
  POP_DECLINE_WINDOW_END,
  POP_DECLINE_WINDOW_START,
} from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Row = Pick<HouseEntry, "acquisitionDate" | "regionCode" | "isPopulationDeclineArea" | "populationAreaType">;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 이 행이 §71의2① 후보인가 — 취득일 창 + 인구감소(관심)지역. 중과 ④와 같은 인자(`isPopulationDeclineArea ?? 자동판정`)로 읽는다. */
export function popDeclineRowCandidate(row: Row): boolean {
  const acq = row.acquisitionDate;
  if (!acq || acq < iso(POP_DECLINE_WINDOW_START) || acq > iso(POP_DECLINE_WINDOW_END)) return false;
  const auto = row.regionCode ? classifyPopulationDeclineArea(row.regionCode).kind : null;
  const isPop = row.isPopulationDeclineArea ?? auto !== null;
  if (!isPop) return false;
  const kind = row.populationAreaType ?? auto;
  if (kind === "interest" && acq < iso(POP_DECLINE_INTEREST_ACQ_FROM)) return false;
  return true;
}

/** 양도(종전) 주택이 이 행보다 늦게 취득된 것으로 기록된 경우에만 「종전 주택을 권리로 받았는가」를 묻는다 — 그때만 선후가 권리 보유일에 달렸다. */
export function popDeclinePriorRightQuestionVisible(row: Pick<HouseEntry, "acquisitionDate">, sellingAcquisitionDate: string | undefined): boolean {
  if (!row.acquisitionDate || !sellingAcquisitionDate) return false;
  return sellingAcquisitionDate >= row.acquisitionDate;
}
