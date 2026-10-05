/**
 * anchor(⑧·④·⑤) — 명부 필수화(PR-1, 2026-10-05, 명부 없이 스칼라만으로 다주택 선언 금지)
 *
 * 계획서 `docs/00-pm/merge-composition-unknown-unfavorable.plan.md` §3-2(Q-2·Q-3·Q-5·Q-6·Q-7).
 *
 * ## 설계 — 두 레이어로 나눈다 (D-4 보존)
 *
 * - **⑧ 계산기 UI 차단** (`collectStep1Issues`) — 주택(`"housing"`) 양도에서 명부 0행이면
 *   「다른 보유 주택이 없습니다」 확정이 없는 한 다음 단계로 못 간다.
 * - **④ 엔진 입력 도출** (`resolveHouseholdHousingCount`) — **바뀌지 않는다**. 0행이면 여전히
 *   스칼라로 폴백한다(D-4). API 직접 호출자는 명부 없이 보낼 수 있고(Q-8), 「명부 없음」 엔진
 *   경로(#1947 등)가 그 경우를 처리한다 — ⑧은 **계산기 UI** 진입만 막는다.
 *
 * | # | 주장 |
 * |---|---|
 * | HR-1 | 0행 + 미확정 → ⑧ 차단, 메시지는 `householdNoOtherHousesConfirmed` 필드로 간다 |
 * | HR-2 | 0행 + 확정 → ⑧ 통과 |
 * | HR-3 | 1행 이상이면 미확정이어도 ⑧ 통과(행이 곧 명부 입력) |
 * | HR-4 | legacy 표식(OH-34)이면 0행 + 미확정도 ⑧ 통과(구 이력 세액 보존) |
 * | HR-5 | Q-7 범위 밖(입주권·분양권·재개발APT) — 0행이어도 차단하지 않는다 |
 * | HR-6 | ④는 바뀌지 않는다 — 0행 + 스칼라 "3"(D-4) → 엔진 입력 3 (API 직접 호출 시나리오) |
 * | HR-7 | `housesPatchWithDerivedCount` — 행이 생기면(빈 행 포함) 확정을 해제한다 |
 * | HR-8 | `houseRosterRendered` — `"housing"`은 스칼라·행 수와 무관하게 명부가 항상 열린다 |
 */
import { describe, it, expect } from "vitest";
import { collectStep1Issues } from "@/lib/calc/transfer-tax-validate-step1";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  resolveHouseholdHousingCount,
  housesPatchWithDerivedCount,
} from "@/lib/calc/household-house-count";
import { houseRosterRendered } from "@/lib/calc/house-count-inputs-scope";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" };
  return { ...f, transferDate: "2024-06-01", filingDate: "2024-08-31", ...over };
}

function step1FieldsOf(f: TransferFormData): string[] {
  return collectStep1Issues(f)
    .filter((i) => i.field === "householdNoOtherHousesConfirmed")
    .map((i) => i.message);
}

describe("HR-1~4 ⑧ 명부 필수화 차단", () => {
  it("[HR-1] 0행 + 미확정 → 차단", () => {
    const issues = step1FieldsOf(form({ houses: [], householdNoOtherHousesConfirmed: false }));
    expect(issues.length).toBe(1);
    expect(issues[0]).toMatch(/다른 보유 주택이 없는지 확인/);
  });

  it("[HR-2] 0행 + 확정 → 통과", () => {
    expect(step1FieldsOf(form({ houses: [], householdNoOtherHousesConfirmed: true }))).toEqual([]);
  });

  it("[HR-3] 1행 이상 → 미확정이어도 통과", () => {
    const row = {
      id: "h1",
      region: "capital",
      acquisitionDate: "2018-01-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
    };
    expect(
      step1FieldsOf(
        form({ houses: [row] as unknown as TransferFormData["houses"], householdNoOtherHousesConfirmed: false }),
      ),
    ).toEqual([]);
  });

  it("[HR-4] legacy 표식 → 0행 + 미확정도 통과(구 이력 세액 보존)", () => {
    expect(
      step1FieldsOf(
        form({ houses: [], householdNoOtherHousesConfirmed: false, legacyHouseCountPrecedence: true }),
      ),
    ).toEqual([]);
  });
});

describe("HR-5 Q-7 범위 밖", () => {
  it.each(["right_to_move_in", "presale_right", "redevelopment_apt"] as const)(
    "[HR-5-%s] 0행 + 미확정이어도 차단하지 않는다",
    (kind) => {
      const f = form({ houses: [], householdNoOtherHousesConfirmed: false });
      f.assets[0] = { ...f.assets[0], assetKind: kind };
      expect(step1FieldsOf(f)).toEqual([]);
    },
  );
});

describe("HR-6 ④ 엔진 입력 도출은 바뀌지 않는다 (D-4 보존, Q-8)", () => {
  it("[HR-6] 0행 + 스칼라 3 → 엔진 입력 3 (API 직접 호출 — ⑧을 거치지 않는다)", () => {
    const n = resolveHouseholdHousingCount({
      primaryKind: "housing",
      declared: 3,
      houses: [],
      legacyPrecedence: false,
    });
    expect(n).toBe(3);
  });

  it("[HR-6b] 1행 있으면 명부가 이긴다(스칼라 무시) — 종전과 같다", () => {
    const n = resolveHouseholdHousingCount({
      primaryKind: "housing",
      declared: 9,
      houses: [{ acquisitionDate: "2018-01-01" }],
      legacyPrecedence: false,
    });
    expect(n).toBe(2);
  });
});

describe("HR-7 housesPatchWithDerivedCount — 행이 생기면 확정을 해제한다", () => {
  it("[HR-7] 0행→1행(빈 행, 취득일 없음) → householdNoOtherHousesConfirmed: false로 해제", () => {
    const patch = housesPatchWithDerivedCount(
      [{ id: "new", acquisitionDate: "" }],
      "housing",
      false,
    );
    expect(patch.householdNoOtherHousesConfirmed).toBe(false);
  });

  it("[HR-7b] 0행 그대로면 확정 필드를 건드리지 않는다", () => {
    const patch = housesPatchWithDerivedCount([], "housing", false);
    expect(patch).not.toHaveProperty("householdNoOtherHousesConfirmed");
  });

  it("[HR-7a2] 취득일 있는 1행(명부가 정본인 분기)에서도 확정을 해제한다", () => {
    const patch = housesPatchWithDerivedCount(
      [{ id: "h1", acquisitionDate: "2018-01-01" }],
      "housing",
      false,
    );
    expect(patch.householdNoOtherHousesConfirmed).toBe(false);
    expect(patch.householdHousingCount).toBe("2");
  });

  it("[HR-7c] legacy 표식이면 행이 생겨도 확정을 건드리지 않는다", () => {
    const patch = housesPatchWithDerivedCount(
      [{ id: "new", acquisitionDate: "" }],
      "housing",
      true,
    );
    expect(patch).not.toHaveProperty("householdNoOtherHousesConfirmed");
    expect(patch).not.toHaveProperty("householdHousingCount");
  });

  it("[HR-7d] 입주권(F1 범위 밖)은 행이 생겨도 확정을 건드리지 않는다", () => {
    const patch = housesPatchWithDerivedCount(
      [{ id: "new", acquisitionDate: "" }],
      "right_to_move_in",
      false,
    );
    expect(patch).not.toHaveProperty("householdNoOtherHousesConfirmed");
  });
});

describe("HR-8 houseRosterRendered — housing은 항상 열린다", () => {
  it("[HR-8] 0행 + 스칼라 1 + housing → 열린다(종전엔 닫힘)", () => {
    expect(
      houseRosterRendered(
        { houses: [], householdHousingCount: "1" } as unknown as TransferFormData,
        "housing",
      ),
    ).toBe(true);
  });

  it("[HR-8-twin] 0행 + 스칼라 1 + 입주권(F1 범위 밖) → 닫혀 있다(회귀 가드)", () => {
    expect(
      houseRosterRendered(
        { houses: [], householdHousingCount: "1" } as unknown as TransferFormData,
        "right_to_move_in",
      ),
    ).toBe(false);
  });
});
