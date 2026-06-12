// F-2 — 시한 표 드리프트 방지 (evaluator 상수 ↔ 모드2 WINDOWS 일치)
//
// 미분양·신축 조문의 취득(계약)기간 윈도우가 evaluator 평가 상수와 모드2 주택수 제외
// SPECIAL_HOUSE_EXCLUSION_WINDOWS 두 곳에 정의된다. 한쪽만 수정하면 단건 감면 판정과 모드2
// 주택수 제외 판정이 어긋난다 — 본 anchor가 일치를 고정해 드리프트를 즉시 탐지한다.
//
// ※ §98의6(임대계약 기준 vs WINDOWS 취득기준)·§98의3 비거주자 2-트랙은 의미가 달라 제외.
//   period-check RULES의 D() 리터럴은 비-export라 본 anchor 범위 외(별도 변경 드뭄).
import { describe, it, expect } from "vitest";
import {
  UNSOLD_98_7_CONTRACT_FROM,
  UNSOLD_98_7_CONTRACT_TO,
  UNSOLD_99_2_CONTRACT_FROM,
  UNSOLD_99_2_CONTRACT_TO,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid";
import {
  UNSOLD_98_3_PERIOD_FROM_RESIDENT,
  UNSOLD_98_3_PERIOD_TO,
  UNSOLD_98_5_CONTRACT_FROM,
  UNSOLD_98_5_CONTRACT_TO,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import {
  UNSOLD_98_2_PERIOD_FROM,
  UNSOLD_98_2_PERIOD_TO,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p4";
import {
  UNSOLD_98_TRACK1_FROM,
  UNSOLD_98_TRACK1_TO,
  UNSOLD_98_TRACK3_FROM,
  UNSOLD_98_TRACK3_TO,
  SPECIAL_HOUSE_EXCLUSION_WINDOWS,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";

const W = SPECIAL_HOUSE_EXCLUSION_WINDOWS;
const t = (d: Date) => d.getTime();
/** WINDOWS 윈도우 배열을 [from,to] ms 쌍 배열로 평탄화 */
const win = (a: keyof typeof W) => W[a].windows.map(([f, to]) => [t(f), t(to)]);

describe("[F-2] evaluator 시한 상수 ↔ 모드2 WINDOWS 드리프트", () => {
  it("§98 — 2-트랙 (1995.11.1~1997.12.31 / 1998.3.1~12.31)", () => {
    expect(win("unsold_98")).toEqual([
      [t(UNSOLD_98_TRACK1_FROM), t(UNSOLD_98_TRACK1_TO)],
      [t(UNSOLD_98_TRACK3_FROM), t(UNSOLD_98_TRACK3_TO)],
    ]);
  });

  it("§98의2 (2008.11.3~2010.12.31)", () => {
    expect(win("unsold_98_2")).toEqual([[t(UNSOLD_98_2_PERIOD_FROM), t(UNSOLD_98_2_PERIOD_TO)]]);
  });

  it("§98의3 거주자 (2009.2.12~2010.2.11)", () => {
    expect(win("unsold_98_3")).toEqual([
      [t(UNSOLD_98_3_PERIOD_FROM_RESIDENT), t(UNSOLD_98_3_PERIOD_TO)],
    ]);
  });

  it("§98의5 (2010.2.12~2011.4.30)", () => {
    expect(win("unsold_98_5")).toEqual([[t(UNSOLD_98_5_CONTRACT_FROM), t(UNSOLD_98_5_CONTRACT_TO)]]);
  });

  it("§98의7 (2012.9.24~2012.12.31)", () => {
    expect(win("unsold_98_7")).toEqual([[t(UNSOLD_98_7_CONTRACT_FROM), t(UNSOLD_98_7_CONTRACT_TO)]]);
  });

  it("§99의2 (2013.4.1~2013.12.31)", () => {
    expect(win("unsold_99_2")).toEqual([[t(UNSOLD_99_2_CONTRACT_FROM), t(UNSOLD_99_2_CONTRACT_TO)]]);
  });
});
