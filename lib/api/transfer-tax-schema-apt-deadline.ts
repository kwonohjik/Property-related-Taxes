/**
 * ⑫ 소령 §167의3⑪ 기한 연장 사실 Zod leaf — 2호 명부 행·양도 주택(`houseSchema`) · 3호 후단 · §155⑳ 임대주택
 * (`rentalUnitSchema`)이 같은 객체를 쓴다. zod 외 의존 없음(순수 leaf — 순환 import 방지).
 *
 * 미전송 = 「모름」(엔진 판정 보류). `confirmedNone`은 「연장 사유 없음」 확인 — 날짜와 함께 오면 모순이라
 * 400으로 막는다(⑧ 「있음」+빈 날짜 차단과 짝 · ⑤는 상태 전환 때 값을 정리한다).
 */
import { z } from "zod";

export const aptDeadlineExtensionSchema = z
  .object({
    /** ⑪1호 — 임대의무기간 2027.1.1. 이후 종료 주택의 등록말소일(민특법 §6⑤) */
    dutyPeriodEndCancellationDate: z.string().date().optional(),
    /** ⑪2호 — 2027.1.1. 이후 조정대상지역 신규 지정 공고일 */
    newRegulatedAreaAnnouncementDate: z.string().date().optional(),
    /** ⑪3호 — 정비사업 이전고시일 */
    relocationAnnouncementDate: z.string().date().optional(),
    /** ⑪ 각 호에 해당하지 않음 확인 — 기한 2027.12.31. 확정 */
    confirmedNone: z.literal(true).optional(),
  })
  .refine(
    (e) =>
      !(e.confirmedNone && (e.dutyPeriodEndCancellationDate || e.newRegulatedAreaAnnouncementDate || e.relocationAnnouncementDate)),
    { message: "「연장 사유 없음」과 연장 기산일을 함께 보낼 수 없습니다 (소령 §167의3⑪)." },
  );
