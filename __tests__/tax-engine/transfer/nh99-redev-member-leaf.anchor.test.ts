/**
 * anchor — §99·§99의3 완공 아파트 조합원 갈래 leaf(`new-99-redev-member.ts`) — 리뷰 NH-36 · NH-16 ③2호 · NH-27 · NH-32.
 * 화면 경로(폼 → route)는 `__tests__/api/transfer.route.nh99-redev-member.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  judgeRedevMemberPeriod,
  redevMemberNewHouseOf,
  redevMemberNeedsRemainderAnswerIso,
} from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";

const D = (s: string) => new Date(s);

describe("조합원 갈래 leaf — 준공일 축 · ③2호 잔여주택 계약 사실 (NH-36 · NH-16 · NH-27)", () => {
  const P = { periodStart: D("2001-05-23"), periodEnd: D("2003-06-30"), periodLabel: "2001.5.23.~2003.6.30." };
  it("기간 안 준공 → 통과 · 경과 후는 「예」만 통과 · 「아니오」·「모름」·빈 값은 불성립", () => {
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2002-06-30"), ...P })).toBeUndefined();
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2003-06-30"), ...P })).toBeUndefined();
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2008-06-30"), remainderContract: "yes", ...P })).toBeUndefined();
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2008-06-30"), remainderContract: "no", ...P })?.code).toBe("NO_REMAINDER_CONTRACT");
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2008-06-30"), remainderContract: "unknown", ...P })?.code).toBe("REMAINDER_CONTRACT_UNCONFIRMED");
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2008-06-30"), ...P })?.code).toBe("REMAINDER_CONTRACT_UNCONFIRMED");
    expect(judgeRedevMemberPeriod({ article: "new_99_3", completionDate: D("2001-05-22"), ...P })?.code).toBe("OUT_OF_ACQUISITION_PERIOD");
    expect(judgeRedevMemberPeriod({ article: "new_99_3", ...P })?.code).toBe("MISSING_REDEV_COMPLETION_DATE");
  });
  it("잔여주택 계약 질문 범위 — 기간 종기 다음 날부터 (§99 국민주택은 1999.12.31.)", () => {
    expect(redevMemberNeedsRemainderAnswerIso("new_99_3", "2003-06-30")).toBe(false);
    expect(redevMemberNeedsRemainderAnswerIso("new_99_3", "2003-07-01")).toBe(true);
    expect(redevMemberNeedsRemainderAnswerIso("new_99", "1999-07-01")).toBe(true);
    expect(redevMemberNeedsRemainderAnswerIso("new_99", "1999-07-01", true)).toBe(false);
    expect(redevMemberNeedsRemainderAnswerIso("new_99", undefined)).toBe(false);
  });
  it("갈래 범위 — 완공 아파트만 · 청산금 수령 단독신고 제외 · 주택 출자 원조합원만 재개발 변형", () => {
    const base = { subject: "apt" as const, originalAssetType: "housing" as const };
    expect(redevMemberNewHouseOf(base)?.houseContributed).toBe(true);
    expect(redevMemberNewHouseOf({ ...base, originalAssetType: "land" })?.houseContributed).toBe(false);
    expect(redevMemberNewHouseOf({ ...base, isSuccessorMember: true })?.houseContributed).toBe(false);
    expect(redevMemberNewHouseOf({ ...base, receiveOnlyMode: true })).toBeUndefined();
    expect(redevMemberNewHouseOf({ subject: "right", originalAssetType: "housing" })).toBeUndefined();
  });
});

