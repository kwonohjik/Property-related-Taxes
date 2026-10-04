/**
 * ⑫ 소령 §167의3⑪ 기한 연장 사실 Zod leaf — 2호 명부 행·양도 주택(`houseSchema`) · 3호 후단 · §155⑳ 임대주택
 * (`rentalUnitSchema`)이 같은 객체를 쓴다. zod 외 의존 없음(순수 leaf — 순환 import 방지).
 *
 * 미전송 = 「모름」(엔진 판정 보류). `confirmedNone`은 「연장 사유 없음」 확인 — 날짜와 함께 오면 모순이라
 * 400으로 막는다(⑧ 「있음」+빈 날짜 차단과 짝 · ⑤는 상태 전환 때 값을 정리한다).
 * 3호 단서(`relocationExpropriationTransfer`)는 3호 사업 사실(인가·지정일 · 이전고시일 · 「이전고시 전」)이 있을
 * 때만 온다(⑤④ `aptDeadlineRelocationFactPresent`와 같은 게이트) · 이전고시일과 「이전고시 전」은 상호 배타.
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
    /** ⑪3호 — 그 사업의 인가 또는 지정일 (미전송 = 모름) */
    relocationAuthorizationDate: z.string().date().optional(),
    /** ⑪3호 — 양도일 현재 이전고시 전 */
    relocationNotYetAnnounced: z.literal(true).optional(),
    /** ⑪3호 단서 — 협의·수용재결·매도청구소송에 따른 양도 (미전송 = 모름) */
    relocationExpropriationTransfer: z.boolean().optional(),
    /** ⑪ 각 호에 해당하지 않음 확인 — 기한 2027.12.31. 확정 */
    confirmedNone: z.literal(true).optional(),
  })
  .refine(
    (e) =>
      !(
        e.confirmedNone &&
        (e.dutyPeriodEndCancellationDate ||
          e.newRegulatedAreaAnnouncementDate ||
          e.relocationAnnouncementDate ||
          e.relocationAuthorizationDate ||
          e.relocationNotYetAnnounced ||
          e.relocationExpropriationTransfer !== undefined)
      ),
    { message: "「연장 사유 없음」과 연장 사유를 함께 보낼 수 없습니다 (소령 §167의3⑪)." },
  )
  .refine((e) => !(e.relocationNotYetAnnounced && e.relocationAnnouncementDate), {
    message: "이전고시일과 「양도일 현재 이전고시 전」을 함께 보낼 수 없습니다 (소령 §167의3⑪3호).",
  })
  .refine(
    (e) =>
      e.relocationExpropriationTransfer === undefined ||
      !!(e.relocationAuthorizationDate || e.relocationAnnouncementDate || e.relocationNotYetAnnounced),
    { message: "3호 사업 사실 없이 협의·수용재결·매도청구소송 여부만 보낼 수 없습니다 (소령 §167의3⑪3호 단서)." },
  );
