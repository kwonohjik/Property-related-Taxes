/**
 * 집계(일반건물·일괄·다건) 결과에서 **카드별 증여자 신축·증축 §114조의2 echo** 를 모은다 — 결과 4뷰(카드·상세명세서·신고서·PDF)의 단일 수집 지점 (PR-5a).
 *
 * 단건 result 는 `carryoverTaxationDetail`/`splitDetail` 에 echo 가 하나 실린다(`resultDonorBuiltEcho`). 집계는 자산(카드)마다 `properties[].carryoverTaxationDetail`
 * 이 따로 있고(지분 분할이면 지분마다 건물 카드가 따로) 어댑터(`aggregateToFilingResult`)가 그 detail 을 싣지 않으므로, 어댑터가 이 leaf 로 모아 싣는다.
 * 값·문구는 전부 엔진 echo 이고 여기서 새로 계산하지 않는다(표시 드리프트 방지).
 */
import type { DonorBuiltPenaltyEcho } from "./types/transfer-carryover.types";

export interface DonorBuiltEchoEntry {
  /** 어느 카드(자산)의 echo 인가 — 결과에서 여러 장일 때 귀속을 밝힌다 */
  label: string;
  echo: DonorBuiltPenaltyEcho;
}

export function gbResultDonorBuiltEchoes(
  properties: ReadonlyArray<{
    propertyId: string;
    propertyLabel?: string;
    carryoverTaxationDetail?: { donorBuiltPenalty?: DonorBuiltPenaltyEcho };
  }>,
): DonorBuiltEchoEntry[] {
  return properties.flatMap((p) => {
    const echo = p.carryoverTaxationDetail?.donorBuiltPenalty;
    return echo ? [{ label: p.propertyLabel ?? p.propertyId, echo }] : [];
  });
}
