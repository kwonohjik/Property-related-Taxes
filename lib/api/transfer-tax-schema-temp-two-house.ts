import { z } from "zod";

/**
 * ⑫ §155① 일시적 2주택 — `temporaryTwoHouse` 하위 스키마.
 *
 * `transfer-tax-schema-sub.ts`(795줄)에서 분리했다(800줄 정책 — OH-01 A2b 필드 추가 전 선분리).
 * 외부 import 경로는 그대로다 — `transfer-tax-schema-sub.ts`가 재수출한다.
 */
export const temporaryTwoHouseSchema = z.object({
  previousAcquisitionDate: z.string().date(),
  newAcquisitionDate: z.string().date(),
  /** §155⑯ 공공기관·법인 지방이전 — 처분기한 3년→5년 + 1년 요건 면제 */
  publicInstitutionRelocation: z.boolean().optional(),
  /** §155⑯ 연접 판정 — 행안부 표준 10자리. 미제공 시 자기선언 신뢰 */
  relocatedSigunguCode: z.string().optional(),
  newHouseSigunguCode: z.string().optional(),
  /** §155⑱ 처분기한 예외 — 「다른 주택 취득일부터 3년이 되는 날 현재」 각 호 해당 */
  disposalDelayReason: z
    .enum(["kamco", "auction", "public_sale", "cash_settlement_suit", "expropriation_suit"])
    .optional(),
  // ── §155①2호 조정대상지역 (OH-01 A2b) — 엔진 `resolveRegulatedAtNewAcquisition`·연혁 leaf ──
  /** 신규 주택 법정동코드(명부 행 주소) — 신규 취득일 기준 정밀 판정 */
  newHouseRegionCode: z.string().optional(),
  /** 코드 없을 때 선언 — 신규 취득 당시 신규 주택이 조정대상지역 */
  newHouseRegulatedAtAcquisition: z.boolean().optional(),
  /** 양도주택 코드 없을 때 선언 — 신규 취득 당시 종전 주택이 조정대상지역 */
  previousHouseRegulatedAtNewAcquisition: z.boolean().optional(),
  /** 매매계약 체결·계약금 지급일 — 제29242호 부칙 제2조②2호·제30395호 부칙 제15조②2호 */
  newHouseContractDate: z.string().date().optional(),
  /** 2호 가목 — 세대전원 이사·전입신고일 */
  wholeHouseholdMoveInDate: z.string().date().optional(),
  /** 2호 단서 — 전 소유자와 기존 임차인의 임대차계약 종료일 */
  existingTenantLeaseEndDate: z.string().date().optional(),
});
