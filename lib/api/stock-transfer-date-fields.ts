/**
 * ⑭ 주식 양도세 route handler 의 Date 강제 목록 — **단일 소스**
 *
 * ## 왜 route.ts 밖에 두는가
 *
 * 이 목록은 anchor 테스트가 「폼 → body → zod → coerceDates → 엔진」 파이프라인을 route 와
 * **똑같이** 재현할 때도 필요하다. 그런데 목록을 테스트가 **복사해** 두면 route 에서 필드를
 * 빼도 테스트는 자기 복사본으로 통과해 **구별력이 0**이 된다(⑭ 누락이 조용히 지나간다).
 *
 * route handler 모듈을 테스트에서 직접 import 하는 방법은 쓰지 않는다 — Next.js route 는
 * 서버 전용 모듈을 끌고 들어와 vitest 에서 로드가 불안정하다(실측: `STOCK_DATE_FIELDS is not
 * iterable`). 순수 상수 모듈로 분리하면 양쪽이 같은 값을 보면서도 안전하다.
 *
 * ⚠️ 여기에 등록하지 않은 Date 필드는 JSON 을 지나며 **string 으로 도달**하고, `Date < string`
 *    비교가 조용히 false 가 된다(`lib/api/date-coerce.ts`).
 */
export const STOCK_DATE_FIELDS = [
  "acquisitionDate",
  "transferDate",
  "priorYearEndDate",
  "listingDate",
  "filingDate",
  // 가산세 §47조의4 — 납부지연 경과일수 기산에 쓰인다
  "paymentDeadline",
  "actualPaymentDate",
  "decedentAcquisitionDate",
  "donorAcquisitionDate",
  "preMergerAcquisitionDate",
  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
  "judgmentDateOverride",
  // 분할 매수·분할 양도 (Plan v2.2) — coerceDates dot-notation 배열 표기
  "acquisitionLots[].acquisitionDate",
  "acquisitionLots[].decedentAcquisitionDate",
  // 이월과세 lot — §104②2 증여자 취득일 (2025.1.1.~ 증여분)
  "acquisitionLots[].donorAcquisitionDate",
  "acquisitionLots[].preMergerAcquisitionDate",
  "transferLots[].transferDate",
  // R-1' 매매사례가액 거래일
  "acquisitionMarketSampleDate",
  "transferMarketSampleDate",
  // R-2 자본조정 발생일
  "capitalAdjustments[].eventDate",
] as const;
