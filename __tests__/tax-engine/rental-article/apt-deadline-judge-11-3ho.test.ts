/**
 * leaf — `judgeAptTransferDeadline` ⑪3호 분기 전수(route anchor `transfer.route.apt-deadline-11-3ho-conditions`의 짝).
 * route anchor가 닿지 않는 조합(인가 모름 + 이전고시 전 · 단서 예 + 인가 모름 · 이전고시 상태 없음 직접 호출)을 고정한다.
 * 3호의 「모름」은 납세자 불리(사용자 결정 2026-10-04): 인가·지정일 모름 → 3호 불성립 + 결론을 가를 때만 고지.
 */
import { describe, it, expect } from "vitest";
import { judgeAptTransferDeadline, type AptTransferDeadlineExtension } from "@/lib/tax-engine/rental-article/rules";

const d = (s: string) => new Date(s);
const judge = (transfer: string, ext?: AptTransferDeadlineExtension) => judgeAptTransferDeadline(d(transfer), ext);

describe("judgeAptTransferDeadline — ⑪3호", () => {
  it("사실 전무: 바닥 이내 확정 · 바닥 초과 기한 경과 + NO_FACT(모름 = 불리 적용 · 사용자 결정 2026-10-04)", () => {
    // 종전(#1910): 2028-01-01 → { within: true, pending: ["NO_FACT"] }(판정 보류 · 기한 내 유지)
    expect(judge("2027-12-31")).toEqual({ within: true, pending: [] });
    expect(judge("2028-01-01")).toEqual({ within: false, pending: ["NO_FACT"] });
    // 「없음」 확정과 결론은 같고 확인 필요 사유만 다르다
    expect(judge("2028-01-01", {})).toEqual({ within: false, pending: ["NO_FACT"] });
    expect(judge("2028-01-01", { confirmedNone: true })).toEqual({ within: false, pending: [] });
  });

  it("1·2호 기한 안이면 3호 사실은 결론과 무관 — 인가 모름이어도 고지 없음", () => {
    const ext = { dutyPeriodEndCancellationDate: d("2028-06-01"), relocationAnnouncementDate: d("2033-05-01") };
    expect(judge("2029-06-01", ext)).toEqual({ within: true, pending: [] });
  });

  it("인가 시점: 기한 이전(당일 포함) 성립 · 다음 날 불성립(3호 주택 아님 → 단서도 없음)", () => {
    const at = (auth: string, exprop?: boolean) => ({
      relocationAuthorizationDate: d(auth),
      relocationAnnouncementDate: d("2033-05-01"),
      relocationExpropriationTransfer: exprop,
    });
    expect(judge("2030-01-01", at("2027-12-31"))).toEqual({ within: true, pending: [] });
    expect(judge("2030-01-01", at("2028-01-01"))).toEqual({ within: false, pending: [] });
    expect(judge("2035-01-01", at("2028-01-01", true))).toEqual({ within: false, pending: [] });
  });

  it("이전고시 전: 인가 확인 → 기한 내 확정 · 인가 모름 → 3호 불성립(기한 경과) + AUTH_DATE_UNKNOWN", () => {
    expect(judge("2040-01-01", { relocationAuthorizationDate: d("2026-01-01"), relocationNotYetAnnounced: true })).toEqual({
      within: true,
      pending: [],
    });
    expect(judge("2040-01-01", { relocationNotYetAnnounced: true })).toEqual({
      within: false,
      pending: ["AUTH_DATE_UNKNOWN"],
    });
  });

  it("이전고시 상태 없음(인가일만 — ⑧·⑫가 막는 입력, 엔진 직접 호출 방어): 3호 기한 미상 → 불성립 · 고지 없음", () => {
    expect(judge("2030-01-01", { relocationAuthorizationDate: d("2027-06-01") })).toEqual({ within: false, pending: [] });
  });

  it("인가 모름 + 이전고시일: 3호였다면 기한 안 → 경과 + AUTH 고지 / 3호여도 경과(단서 아니오) → 고지 없음", () => {
    const ann = { relocationAnnouncementDate: d("2033-05-01") };
    expect(judge("2030-01-01", ann)).toEqual({ within: false, pending: ["AUTH_DATE_UNKNOWN"] });
    expect(judge("2035-01-01", { ...ann, relocationExpropriationTransfer: false })).toEqual({ within: false, pending: [] });
  });

  it("단서: 예 → 기한 내(인가 확인) · 예+인가 모름 → 경과 + AUTH 고지 · 아니오 → 경과 · 모름 → 경과 + EXPROPRIATION_UNKNOWN", () => {
    const base = { relocationAuthorizationDate: d("2027-06-01"), relocationAnnouncementDate: d("2033-05-01") };
    expect(judge("2035-01-01", { ...base, relocationExpropriationTransfer: true })).toEqual({ within: true, pending: [] });
    expect(judge("2035-01-01", { relocationAnnouncementDate: d("2033-05-01"), relocationExpropriationTransfer: true })).toEqual({
      within: false,
      pending: ["AUTH_DATE_UNKNOWN"],
    });
    expect(judge("2035-01-01", { ...base, relocationExpropriationTransfer: false })).toEqual({ within: false, pending: [] });
    expect(judge("2035-01-01", base)).toEqual({ within: false, pending: ["EXPROPRIATION_UNKNOWN"] });
    // 인가 모름 + 단서 모름 — 둘 다 확인돼야 기한 내가 될 수 있다
    expect(judge("2035-01-01", { relocationAnnouncementDate: d("2033-05-01") })).toEqual({
      within: false,
      pending: ["EXPROPRIATION_UNKNOWN", "AUTH_DATE_UNKNOWN"],
    });
  });

  it("이전고시일+1년 경계 — 당일 기한 내 · 다음 날 경과(민법 §157·§160 역상 응당일)", () => {
    const ext = { relocationAuthorizationDate: d("2027-06-01"), relocationAnnouncementDate: d("2033-05-02"), relocationExpropriationTransfer: false };
    expect(judge("2034-05-02", ext).within).toBe(true);
    expect(judge("2034-05-03", ext).within).toBe(false);
  });
});
