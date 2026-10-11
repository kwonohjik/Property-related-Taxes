/**
 * G2-3b anchor (결정 #40, 독립 검증 지적) — 「같은 날 먼저 양도」 선택은 **양도 대상이 주택일 때만** 주택 수에서 뺀다.
 *
 * §154⑨는 「법 제89조제1항제3호」(주택 비과세)의 규정이다. 화면 입력 게이트(⑤ `sameDayEnabled`)는 `isOneHouseExemptionAsset`
 * (주택·재개발APT)인데, ④ 전송·⑧ 검증·표시가 행 값만 보면 주택 양도에서 켠 선택을 입주권 양도로 바꾼 뒤에도 적용한다 —
 * 칸이 숨어 끌 수 없는 채로 §89①4호 가목(다른 주택이 없을 것) 판정이 바뀐다.
 *
 * 기준선(수정 전 실측): 행 {취득 2018-01-01, soldSameDay, first} × 양도일 2025-06-01
 *   · 판정 주택 수 — 주택 1 / 입주권 0 (칩 없이는 2 / 1)
 *   · ④ 명부 페이로드 — 입주권 1행 (칩 없이는 2행)
 */
import { describe, it, expect } from "vitest";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, deriveJudgmentHouseCount } from "@/lib/stores/one-house-judgment-form.types";
import {
  countedHouseRows,
  housesOwnedAtTransfer,
  resolveHouseholdHousingCount,
  sameDayOrderApplies,
} from "@/lib/calc/household-house-count";
import { sameDayExcludedRows, sameDayOrderNotice, sameDayUndecidedRows } from "@/lib/calc/same-day-transfer-notice";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { rowCountExclusionReductions } from "@/lib/calc/house-count-exclusion-rows";

const TD = "2025-06-01";
const row = (id: string, acq: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id, region: "non_capital", acquisitionDate: acq, officialPrice: "300000000", isInherited: false, isLongTermRental: false,
    isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...over,
  }) as HouseEntry;
const FIRST = row("B", "2018-01-01", { soldSameDay: true, sameDayTransferOrder: "first" });
const PLAIN = row("B", "2018-01-01");
const UNDECIDED = row("B", "2018-01-01", { soldSameDay: true });

describe("게이트 술어 — 화면 입력 게이트와 같은 한 술어", () => {
  it("주택·재개발APT만 true, 입주권·분양권·미지정은 false", () => {
    expect(sameDayOrderApplies("housing")).toBe(true);
    expect(sameDayOrderApplies("redevelopment_apt")).toBe(true);
    expect(sameDayOrderApplies("right_to_move_in")).toBe(false);
    expect(sameDayOrderApplies("presale_right")).toBe(false);
    expect(sameDayOrderApplies(undefined)).toBe(false);
  });
});

describe("주택 수 leaf — 긍정(주택 양도는 뺀다) / 부정(입주권 양도의 남은 선택값은 안 뺀다)", () => {
  it("주택·재개발APT 양도: first 행은 양도일 현재 보유 주택에서 빠진다", () => {
    expect(housesOwnedAtTransfer([FIRST], TD, "housing")).toEqual([]);
    expect(housesOwnedAtTransfer([FIRST], TD, "redevelopment_apt")).toEqual([]);
    expect(countedHouseRows([FIRST], TD, "housing")).toBe(0);
  });
  it("입주권·분양권·미지정 양도: 같은 행이 그대로 남는다(칩 없는 행과 같은 값)", () => {
    for (const kind of ["right_to_move_in", "presale_right", undefined]) {
      expect(housesOwnedAtTransfer([FIRST], TD, kind)).toHaveLength(1);
      expect(countedHouseRows([FIRST], TD, kind)).toBe(countedHouseRows([PLAIN], TD, kind));
    }
  });
  it("resolveHouseholdHousingCount — 입주권 양도는 칩 유무가 주택 수를 바꾸지 않는다", () => {
    const base = { transferDate: TD, legacyPrecedence: false, declared: 1 };
    expect(resolveHouseholdHousingCount({ ...base, primaryKind: "right_to_move_in", houses: [FIRST] })).toBe(
      resolveHouseholdHousingCount({ ...base, primaryKind: "right_to_move_in", houses: [PLAIN] }),
    );
    // 긍정 짝 — 주택 양도는 칩이 주택 수를 1 줄인다(양도 주택 1 + 0 vs 1 + 1)
    expect(resolveHouseholdHousingCount({ ...base, primaryKind: "housing", houses: [FIRST] })).toBe(1);
    expect(resolveHouseholdHousingCount({ ...base, primaryKind: "housing", houses: [PLAIN] })).toBe(2);
  });
});

describe("판정 메뉴 ④ — 주택 수·페이로드", () => {
  const judgment = (kind: "housing" | "right_to_move_in", houses: HouseEntry[]) => {
    const f = createInitialOneHouseJudgmentForm();
    f.transferDate = TD;
    f.houses = houses;
    f.assets = [{ ...makeDefaultAsset(), assetKind: kind }];
    return f;
  };
  it("입주권 양도 + 남은 first 행: 판정 주택 수는 칩 없는 경우와 같다(1)", () => {
    expect(deriveJudgmentHouseCount(judgment("right_to_move_in", [FIRST]))).toBe(1);
    expect(deriveJudgmentHouseCount(judgment("right_to_move_in", [PLAIN]))).toBe(1);
  });
  it("주택 양도 + first 행: 1(양도 주택만) — 칩 없으면 2", () => {
    expect(deriveJudgmentHouseCount(judgment("housing", [FIRST]))).toBe(1);
    expect(deriveJudgmentHouseCount(judgment("housing", [PLAIN]))).toBe(2);
  });
  it("엔진 명부 페이로드 — 입주권 양도는 남은 first 행도 싣는다(2행), 주택 양도는 싣지 않는다(1행)", () => {
    const asset = (kind: "housing" | "right_to_move_in") => ({ ...makeDefaultAsset(), assetKind: kind, acquisitionDate: "2015-01-01" });
    expect(buildHousesPayload(asset("right_to_move_in"), [FIRST], 0, undefined, TD)).toHaveLength(2);
    expect(buildHousesPayload(asset("housing"), [FIRST], 0, undefined, TD)).toHaveLength(1);
    expect(buildHousesPayload(asset("housing"), [PLAIN], 0, undefined, TD)).toHaveLength(2);
  });
});

describe("표시·고지 — 입주권 양도에서는 남은 선택값을 표시하지 않는다", () => {
  it("제외 행·미선택 행 목록은 주택 양도에서만 나온다", () => {
    expect(sameDayExcludedRows([FIRST], TD, "housing")).toHaveLength(1);
    expect(sameDayExcludedRows([FIRST], TD, "right_to_move_in")).toEqual([]);
    expect(sameDayUndecidedRows([UNDECIDED], TD, "housing")).toHaveLength(1);
    expect(sameDayUndecidedRows([UNDECIDED], TD, "right_to_move_in")).toEqual([]);
  });
  it("순서 미선택 고지도 입주권 양도에서는 나오지 않는다", () => {
    const houses = [UNDECIDED, row("C", "2019-01-01")];
    expect(sameDayOrderNotice({ primaryKind: "housing", houses, transferDate: TD })).not.toBeNull();
    expect(sameDayOrderNotice({ primaryKind: "right_to_move_in", houses, transferDate: TD })).toBeNull();
  });
});

describe("행 선언(조특법 주택 수 제외) — 같은 leaf를 거친다", () => {
  const withDecl = row("B", "2018-01-01", {
    soldSameDay: true, sameDayTransferOrder: "first",
    countExclusion: { kind: "reduction", reduction: { type: "new_99_4_hometown" } as never },
  });
  it("주택 양도: first 행의 선언은 빠지고, 입주권 양도: 남는다", () => {
    expect(rowCountExclusionReductions([withDecl], TD, "housing")).toHaveLength(0);
    expect(rowCountExclusionReductions([withDecl], TD, "redevelopment_apt")).toHaveLength(0);
    expect(rowCountExclusionReductions([withDecl], TD, "right_to_move_in")).toHaveLength(1);
  });
});
