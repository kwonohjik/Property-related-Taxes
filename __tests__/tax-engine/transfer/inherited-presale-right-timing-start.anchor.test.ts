/**
 * 동일세대 상속 분양권의 §156의3②·③ 기한 기산일 — 피상속인 취득일(사용자 결정 2026-10-09).
 *
 * 근거: 사전-2023-법규재산-0464(2023.8.23. — 동일세대 안의 상속은 새로운 취득이 아니라 상속개시일을 신규주택
 * 취득일로 볼 수 없다 · 입주권 §155①) · 기획재정부 재산세제과-1033(같은 논리로 피상속인 취득일). 분양권을 직접 다룬
 * 해석은 미확보 — 상속개시일로 세면 예외가 성립하는 경우에만 확인 필요(`confirmNotes`).
 *
 * | # | 주장 |
 * |---|---|
 * | T-1 | 3년 — 피상속인 취득일부터 3년을 넘기면 배제 + 확인 필요 · 피상속인 취득일 미입력이면 상속개시일부터(짝) |
 * | T-2 | 1년 — 종전주택 취득 후 1년 안에 피상속인이 취득했으면 배제 + 확인 필요 |
 * | T-3 | 두 기준 모두 성립 → 확인 필요 없음 · 별도세대는 상속개시일 그대로 |
 * | T-4 | 3년 경과 예외 칸 노출(⑤⑧ 공용 술어)이 같은 날을 쓴다 |
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { INHERITED_PRESALE_RIGHT_TIMING_START_NOTE } from "@/lib/tax-engine/transfer-tax-89-2-acquired-right-timing";
import { rightThreeYearExceptionVisible } from "@/lib/calc/right-three-year-exception-scope";
import type { PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput } from "../_helpers/mock-rates";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

const D = (s: string) => new Date(s);
const START = D("2021-01-01");

/** 종전주택 A · 피상속인(배우자, 동일세대) 2022-01-10 분양권 취득 · 상속개시 2024-06-01. */
const right = (over: Partial<PresaleRight> = {}): PresaleRight => ({
  id: "b",
  type: "presale_right",
  acquisitionDate: D("2024-06-01"),
  region: "capital",
  isInherited: true,
  decedentSameHouseholdAtInheritance: true,
  decedentAcquisitionDate: D("2022-01-10"),
  ...over,
});

const judge = (r: PresaleRight, houseAcq: string, transfer: string) =>
  resolveArticle89Clause2(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionDate: D(houseAcq),
      transferDate: D(transfer),
      presaleRights: [r],
    }),
    START,
  );

describe("T-1 3년 — 피상속인 취득일부터", () => {
  it("2022-01-10부터 3년을 넘긴 2025-06-01 양도 → 배제 + 확인 필요(상속개시일로는 3년 이내)", () => {
    const r = judge(right(), "2015-03-15", "2025-06-01");
    expect(r.status).toBe("excluded");
    expect(r.confirmNotes).toContain(INHERITED_PRESALE_RIGHT_TIMING_START_NOTE);
    // 「3년 이내 양도했으면」 기한 안내도 피상속인 취득일부터
    expect(r.deadline).toEqual(D("2025-01-10"));
  });

  it("짝 — 피상속인 취득일 미입력이면 상속개시일(2024-06-01)부터 3년 이내 → 예외 성립", () => {
    expect(judge(right({ decedentAcquisitionDate: undefined }), "2015-03-15", "2025-06-01").status).toBe("exception_met");
  });
});

describe("T-2 1년 — 종전주택 취득 후 1년", () => {
  it("종전주택 2021-06-01 · 피상속인 취득 2022-01-10(1년 미경과) → 배제 + 확인 필요(상속개시일로는 1년 경과)", () => {
    const r = judge(right(), "2021-06-01", "2024-12-01");
    expect(r.status).toBe("excluded");
    expect(r.confirmNotes).toContain(INHERITED_PRESALE_RIGHT_TIMING_START_NOTE);
  });
});

describe("T-3 확인 필요는 결론이 갈릴 때만", () => {
  it("두 기준 모두 3년 이내(2024-12-01 양도) → 예외 성립 · 확인 필요 없음", () => {
    const r = judge(right(), "2015-03-15", "2024-12-01");
    expect(r.status).toBe("exception_met");
    expect(r.confirmNotes).toBeUndefined();
  });

  it("두 기준 모두 3년 초과(2027-07-01 양도) → 배제 · 이 확인 필요 없음", () => {
    expect(judge(right(), "2015-03-15", "2027-07-01").confirmNotes ?? []).not.toContain(INHERITED_PRESALE_RIGHT_TIMING_START_NOTE);
  });

  it("별도세대 상속은 상속개시일 그대로 — §156의3④ 불성립(피상속인 주택 보유)이라 ② 기한으로 가도 3년 이내", () => {
    const r = judge(right({ decedentSameHouseholdAtInheritance: false, decedentOwnedHouseAtDeath: true }), "2015-03-15", "2025-06-01");
    expect(r.status).toBe("exception_met");
  });
});

describe("T-5 구 §156의3③(2022-02-15 전 취득 — 1년 요건 없음)도 피상속인 취득일로 가른다", () => {
  it("종전주택 2021-06-01 · 피상속인 2022-01-10(1년 미경과) · 3년 초과 양도 → ③ 선언 칸만 열린다", () => {
    const r = judge(right(), "2021-06-01", "2025-06-01");
    expect(r.status).toBe("excluded");
    expect(r.undeclaredArticles).toEqual([TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3]);
  });
});

describe("T-4 3년 경과 예외 칸 노출", () => {
  const form = (r: Record<string, unknown>) =>
    ({
      transferDate: "2025-06-01",
      assets: [{ assetKind: "housing" }],
      presaleRights: [
        {
          id: "b",
          type: "presale_right",
          acquisitionDate: "2024-06-01",
          region: "capital",
          isInherited: true,
          decedentSameHouseholdAtInheritance: true,
          ...r,
        },
      ],
    }) as unknown as TransferFormData;

  it("동일세대 + 피상속인 2022-01-10 → 3년 초과로 칸이 뜬다 · 미입력·별도세대면 상속개시일 기준이라 안 뜬다", () => {
    expect(rightThreeYearExceptionVisible(form({ decedentAcquisitionDate: "2022-01-10" }))).toBe(true);
    expect(rightThreeYearExceptionVisible(form({}))).toBe(false);
    expect(
      rightThreeYearExceptionVisible(form({ decedentAcquisitionDate: "2022-01-10", decedentSameHouseholdAtInheritance: false })),
    ).toBe(false);
  });
});
