/**
 * S15-14 anchor — 기존주택 원조합원 입주권 경로(`one-house/original-member-right.ts`)도 §155⑱의 양도일 연혁을 같은 술어
 * (`resolveDisposalDelay`)로 따른다: 2022-02-15 전 양도분은 사유 + 「그 방법으로 양도」 선언이 함께 있어야 처분기한을 치유한다.
 * ④⑫⑭ 배선(행 필드 `originalMemberDisposalDelayDisposedByThatMethod`)도 함께 고정한다.
 *
 * 연혁 원문 근거는 `temporary-two-house-155-18-era.anchor.test.ts` 머리말.
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// 스키마 모듈 순환 초기화 순서 — 진입 모듈을 먼저 불러야 sub의 shape가 정의된다(redev-right-approval-date-plumbing 선례).
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

/** A 2015-01-01 · B(기존주택 → 입주권) 2018-03-01 · 양도 — 3년 말일 2021-03-02가 지났다 */
function run(transferDate: string, r: Partial<PresaleRight>) {
  return resolveArticle89Clause2(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D("2015-01-01"),
      transferDate: D(transferDate),
      presaleRights: [
        { id: "r1", type: "redevelopment_right", acquisitionDate: D("2018-03-01"), region: "non_capital", memberOrigin: "original_house", ...r },
      ],
    }),
    undefined,
  );
}

describe("S15-14 원조합원 경로 — §155⑱ 연혁", () => {
  it("2021-06-01 · 사유만 → 불성립", () => {
    expect(run("2021-06-01", { originalMemberDisposalDelayReason: "auction" }).status).toBe("excluded");
  });
  it("양성 짝 — 같은 사실에 방법 선언을 더하면 성립", () => {
    const v = run("2021-06-01", { originalMemberDisposalDelayReason: "auction", originalMemberDisposalDelayDisposedByThatMethod: true });
    expect(v.status).toBe("exception_met");
  });
  it("대조 — 2023-06-01(현행 문언)은 사유만으로 성립", () => {
    expect(run("2023-06-01", { originalMemberDisposalDelayReason: "auction" }).status).toBe("exception_met");
  });
});

describe("S15-14 원조합원 행 ④⑫⑭", () => {
  const row = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry => ({
    id: "p1", type: "redevelopment_right", acquisitionDate: "2018-03-01", region: "non_capital", memberOrigin: "original_house", ...over,
  });
  it("사유가 있을 때만 방법 선언을 싣고 Zod·route를 거쳐 엔진으로 넘어간다", () => {
    const [p] = buildPresaleRightsPayload("housing", [
      row({ originalMemberDisposalDelayReason: "auction", originalMemberDisposalDelayDisposedByThatMethod: true }),
    ])!;
    expect(p).toMatchObject({ originalMemberDisposalDelayReason: "auction", originalMemberDisposalDelayDisposedByThatMethod: true });
    const [e] = mapPresaleRightsToEngine([presaleRightSchema.parse(p)])!;
    expect(e.originalMemberDisposalDelayDisposedByThatMethod).toBe(true);
    const [noReason] = buildPresaleRightsPayload("housing", [row({ originalMemberDisposalDelayDisposedByThatMethod: true })])!;
    expect(noReason).not.toHaveProperty("originalMemberDisposalDelayDisposedByThatMethod");
  });
});
