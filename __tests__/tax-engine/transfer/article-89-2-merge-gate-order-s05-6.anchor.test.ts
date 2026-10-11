/**
 * S05-6(게이트 순서 정정 부분) — §156의2⑧⑨ 합가 축은 날짜·선언 게이트(먼저 양도 → 합가 이후 양도 → N년 기한)를
 * **합가 전 보유 구성 판정보다 먼저** 본다. 날짜가 안 맞으면 구성을 묻지 않고 그 축은 불성립이다(「모름」을 말할 자리가 없다 —
 * 형제 §155④⑤ `matchMergeGateAndComposition`과 같은 순서).
 *
 * 🔴 범위 밖(사용자 결정 대기): 게이트를 **통과한** 세대의 구성 미선언을 판정 보류로 둘지 불성립으로 바꿀지 — 현행(판정 보류)을
 *    그대로 둔다. 이 파일의 「통과 뒤 미선언 → undetermined」 짝이 그 현행을 고정한다.
 *
 * 법령: 「소득세법 시행령」 제156조의2제8항(합친 날부터 10년 이내에 먼저 양도하는 주택) · 제9항(혼인한 날부터 10년 이내에 먼저 양도하는 주택)
 *       — MST 290841(시행 2026-10-01) 원문 확인(S05-6 리뷰). 분양권은 제156조의3제6항이 ⑧·⑨를 따른다.
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const D = (s: string) => new Date(s);
const right = (): PresaleRight => ({ id: "r1", type: "redevelopment_right", acquisitionDate: D("2016-10-01"), region: "capital" });

/** 주택 1 + 입주권 1, 권리 취득 후 3년 초과(§156의2③ 탈락) · 3년 예외 없음 — 결과는 오직 ⑧⑨ 축이 가른다. */
function input(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    transferPrice: 900_000_000,
    acquisitionPrice: 400_000_000,
    acquisitionDate: D("2015-06-01"),
    transferDate: D("2024-06-01"),
    residencePeriodMonths: 60,
    presaleRights: [right()],
    rightThreeYearException: { kind: "none" },
    ...over,
  });
}
const verdict = (i: TransferTaxInput) => resolveArticle89Clause2(i, undefined);
const PARENTAL = { parentalCareMerge: { mergeDate: D("2020-03-01"), parentAge: "over_60" as const } };

describe("S05-6 게이트 순서 — 구성 미선언이어도 날짜·선언 게이트가 먼저 불성립을 확정한다", () => {
  it("「먼저 양도」 아님 + 구성 미선언 → 배제 확정(종전: 판정 보류)", () => {
    expect(verdict(input({ ...PARENTAL, isFirstTransferredInMerge: false })).status).toBe("excluded");
    expect(verdict(input({ ...PARENTAL })).status).toBe("excluded"); // 미선언(undefined)도 같다
  });
  it("N년 기한 경과 + 구성 미선언 → 배제 확정 (혼인 2010-01-01 · 양도 2024-06-01)", () => {
    const v = verdict(input({ marriageMerge: { marriageDate: D("2010-01-01") }, isFirstTransferredInMerge: true }));
    expect(v.status).toBe("excluded");
  });
  it("합가 전 양도 + 구성 미선언 → 배제 확정 (S05-1 하한)", () => {
    const v = verdict(input({ parentalCareMerge: { mergeDate: D("2024-09-01"), parentAge: "over_60" as const }, isFirstTransferredInMerge: true }));
    expect(v.status).toBe("excluded");
  });
  it("합가 전 양도 + 구성 선언(house_only)도 배제 확정 — 선언이 있어도 하한이 먼저 막는다", () => {
    const v = verdict(
      input({
        marriageMerge: { marriageDate: D("2024-09-01") },
        isFirstTransferredInMerge: true,
        mergedHouseholdFirstHouse: { kind: "house_only" },
      }),
    );
    expect(v.status).toBe("excluded");
  });

  it("긍정 짝 — 게이트를 통과한 구성 미선언은 불성립 + 확인 필요(결정 #7 — 종전: 판정 보류·비과세 유지)", () => {
    const v = verdict(input({ ...PARENTAL, isFirstTransferredInMerge: true }));
    expect(v.status).toBe("excluded");
    expect(v.undeclaredMergeArticles).toEqual(["소득세법 시행령 §156의2 ⑧"]);
  });
  it("긍정 짝 — 게이트를 통과한 구성 선언(house_only · 합가 전 취득)은 ⑧3호 성립", () => {
    const v = verdict(
      input({ ...PARENTAL, isFirstTransferredInMerge: true, mergedHouseholdFirstHouse: { kind: "house_only" } }),
    );
    expect(v.status).toBe("exception_met");
  });
  it("경계 — 합가일 = 양도일(같은 날)은 하한을 통과한다", () => {
    const v = verdict(
      input({
        parentalCareMerge: { mergeDate: D("2024-06-01"), parentAge: "over_60" as const },
        isFirstTransferredInMerge: true,
        mergedHouseholdFirstHouse: { kind: "house_only" },
      }),
    );
    expect(v.status).toBe("exception_met");
  });
  it("두 합가일 중 죽은 축은 확인 필요 안내에서 빠진다 — 혼인(2010 · 기한 경과)은 빼고 동거봉양(2020)만 ⑧", () => {
    const v = verdict(
      input({ marriageMerge: { marriageDate: D("2010-01-01") }, ...PARENTAL, isFirstTransferredInMerge: true }),
    );
    expect(v.status).toBe("excluded");
    expect(v.undeclaredMergeArticles).toEqual(["소득세법 시행령 §156의2 ⑧"]);
  });
});
