/**
 * anchor — 세대 보유 주택 수는 **명부가 정본**이다 (Q-8 · P7-2)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | HC-1 | 명부가 비면 스칼라 그대로 (D-4 간이 입력 유지) |
 * | HC-2 | 명부에 행이 있으면 **1 + 취득일 있는 행 수** — 스칼라를 무시한다 |
 * | HC-3 | 취득일 없는 행은 세지 않는다 |
 * | HC-4 | 주택 양도가 아니면 **스칼라 유지**(F1) — 입주권·분양권은 의미 축이 다르다 |
 * | HC-5 | `declared`는 **호출부가 파싱해 넘긴다** — 기본값 규칙을 이 함수가 삼키지 않는다 |
 * | HC-6 | D-6 게이트 시나리오 — 행 추가만으로 §155 특례의 「2채」가 성립한다 |
 * | HC-7 | `houseRosterIsAuthoritative` — 화면이 스칼라 버튼을 잠글 조건 |
 * | HC-8 | `housesPatchWithDerivedCount` — 명부 patch 가 스칼라를 **함께** 갱신한다 |
 * | HC-9 | `houseCountScalarLocked` — **정합된 상태만** 잠근다(어긋나면 열어 둔다) |
 *
 * ## 🔑 HC-6이 이 PR의 존재 이유다
 *
 * §155⑥⑦⑧은 전부 주택 수 **2**에서만 성립한다. D-6이 그 사실들을 명부 행으로 옮기면
 * 사용자는 행을 추가하는데, 게이트가 스칼라를 보면 **화면엔 입력이 있는데 특례가 조용히
 * 불성립**한다. HC-6이 그 연결을 고정한다.
 *
 * ## 🔑 HC-8·HC-9 — ⑤ 화면 게이트는 스칼라를 **원시로** 읽는다 (2026-09-22 실측)
 *
 * ④·⑧ 만 `resolveHouseholdHousingCount` 를 쓰고, 화면 게이트는 전부 원시 스칼라를 본다
 * (`house-count-inputs-scope.ts:62·75·91` · `temporary-two-house-section-scope.ts:54` ·
 * `grace-period-scope.ts:48` · Step4 4곳). ④ 안에서도 겸용주택만 원시다
 * (`transfer-tax-api-mixed-use.ts:246`). 그래서 두 값이 갈리면 층마다 다른 주택 수로 동작했다:
 *
 * | 겸용주택 · 선언 1채 + 명부 2채 | 값 |
 * |---|---|
 * | ④ 일반 · ⑧ (leaf 경유) | **3채** |
 * | ④ 겸용 `isOneHouseExempt` (원시) | **true = 1주택 비과세 부여** |
 * | ⑤ 3주택·2주택·장기임대 섹션 | **전부 닫힘** |
 *
 * ⑧ 은 빈 값만 막으므로(`transfer-tax-validate.ts:439`) 그대로 계산된다.
 * ⇒ 게이트를 층마다 고치는 대신 **명부 편집이 스칼라를 함께 갱신**해 한 값만 남긴다(HC-8).
 *   그다음에야 버튼 잠금이 안전하다 — 잠금만 먼저 하면 스칼라를 올려 섹션을 여는
 *   **유일한 경로가 사라진다**(HC-9 가 그 dead-end 를 막는 조건을 고정한다).
 */
import { describe, it, expect } from "vitest";
import {
  resolveHouseholdHousingCount,
  countedHouseRows,
  houseRosterIsAuthoritative,
  housesPatchWithDerivedCount,
  houseCountScalarLocked,
} from "@/lib/calc/household-house-count";

const row = (acquisitionDate?: string) => ({ acquisitionDate });

/** 기본: 주택 양도 · 스칼라 1 · 명부 비었음. */
function args(over: Partial<Parameters<typeof resolveHouseholdHousingCount>[0]> = {}) {
  return { primaryKind: "housing", declared: 1, houses: [], ...over };
}

describe("HC-1·2 명부 우선", () => {
  it("[HC-1] 명부가 비면 스칼라 그대로 — D-4 간이 입력", () => {
    expect(resolveHouseholdHousingCount(args({ declared: 1 }))).toBe(1);
    expect(resolveHouseholdHousingCount(args({ declared: 3 }))).toBe(3);
  });

  /** 🔴 종전에는 이 어긋남이 **경고**로만 끝났다. 이제 명부가 이긴다. */
  it("[HC-2] 명부에 2행 → 3채. 스칼라 5를 무시한다", () => {
    const n = resolveHouseholdHousingCount(
      args({ declared: 5, houses: [row("2020-01-01"), row("2021-01-01")] }),
    );
    expect(n).toBe(3); // 1(양도 주택) + 2
  });

  it("[HC-3] 취득일 없는 행은 세지 않는다", () => {
    const n = resolveHouseholdHousingCount(
      args({ declared: 1, houses: [row("2020-01-01"), row(), row(undefined)] }),
    );
    expect(n).toBe(2); // 1 + 1
    expect(countedHouseRows([row("2020-01-01"), row()])).toBe(1);
  });
});

describe("HC-4 F1 게이트 — 주택 양도만", () => {
  /**
   * 🔴 **긍정 짝이 필요하다**. 「명부를 아예 안 본다」와 구별되지 않으면
   *    HC-2가 깨져도 이 단언은 초록이다(`feedback_negative_anchor_needs_positive_twin`).
   */
  it.each(["right_to_move_in", "presale_right", "redevelopment_apt", "land", undefined])(
    "[HC-4] primaryKind=%s → 스칼라 유지",
    (kind) => {
      const n = resolveHouseholdHousingCount(
        args({ primaryKind: kind, declared: 5, houses: [row("2020-01-01")] }),
      );
      expect(n).toBe(5);
    },
  );

  it("[HC-4-twin] 같은 명부라도 housing이면 명부가 이긴다", () => {
    const n = resolveHouseholdHousingCount(
      args({ primaryKind: "housing", declared: 5, houses: [row("2020-01-01")] }),
    );
    expect(n).toBe(2);
  });
});

describe("HC-5 파싱은 호출부 책임", () => {
  /**
   * 🔑 ④는 `parseInt(x) || 0`, ⑤는 `parseInt(x || "1", 10)`로 **기본값이 다르다**(실측).
   *    이 함수가 문자열을 받으면 둘 중 하나를 조용히 바꾸게 된다.
   */
  it("[HC-5] declared를 그대로 쓴다 — 0도 0으로 돌려준다", () => {
    expect(resolveHouseholdHousingCount(args({ declared: 0 }))).toBe(0);
  });
});

describe("HC-6 D-6 게이트 시나리오 — 이 PR의 존재 이유", () => {
  /**
   * §155⑥⑦⑧이 요구하는 「2채」가 **행 추가만으로** 성립해야 한다.
   * 이 단언이 깨지면 D-6에서 특례가 조용히 불성립한다.
   */
  it("[HC-6] 스칼라 1 + 명부 1행 → 2채 (§155 특례 게이트 통과)", () => {
    const n = resolveHouseholdHousingCount(
      args({ declared: 1, houses: [row("2015-03-02")] }),
    );
    expect(n).toBe(2);
  });

  /** 짝 — 행이 없으면 2가 되지 않는다(스칼라만으로 열리면 D-6이 무의미해진다). */
  it("[HC-6-twin] 스칼라 1 + 명부 0행 → 1채", () => {
    expect(resolveHouseholdHousingCount(args({ declared: 1 }))).toBe(1);
  });
});

describe("HC-7 명부가 정본인 상태", () => {
  it("[HC-7a] 주택 양도 + 취득일 있는 행 → true", () => {
    expect(houseRosterIsAuthoritative("housing", [row("2020-01-01")])).toBe(true);
  });

  it("[HC-7b] 행은 있으나 취득일 미입력 → false (아직 세어지지 않는다)", () => {
    expect(houseRosterIsAuthoritative("housing", [row()])).toBe(false);
  });

  it("[HC-7c] 주택 양도가 아니면 false", () => {
    expect(houseRosterIsAuthoritative("right_to_move_in", [row("2020-01-01")])).toBe(false);
  });

  it("[HC-7d] 명부 자체가 없으면 false", () => {
    expect(houseRosterIsAuthoritative("housing", undefined)).toBe(false);
  });
});

describe("HC-8 명부 patch 가 스칼라를 함께 갱신한다", () => {
  it("[HC-8a] 취득일 있는 행 2개 → 스칼라 '3' (= 1 + 2)", () => {
    const p = housesPatchWithDerivedCount([row("2020-01-01"), row("2021-01-01")], "housing");
    expect(p.householdHousingCount).toBe("3");
    expect(p.houses).toHaveLength(2);
  });

  it("[HC-8b] 행 1개 → '2'", () => {
    expect(housesPatchWithDerivedCount([row("2020-01-01")], "housing").householdHousingCount).toBe("2");
  });

  it("[HC-8c] 취득일 없는 행은 세지 않는다 — 갱신 자체가 없다", () => {
    const p = housesPatchWithDerivedCount([row()], "housing");
    expect(p.householdHousingCount).toBeUndefined();
    expect(p.houses).toHaveLength(1);
  });

  it("[HC-8d] 명부를 비우면 갱신하지 않는다 — 몇 채인지 알 수 없다(D-4 복귀)", () => {
    expect(housesPatchWithDerivedCount([], "housing").householdHousingCount).toBeUndefined();
  });

  it("[HC-8e] 주택 양도가 아니면 갱신하지 않는다 (F1)", () => {
    const p = housesPatchWithDerivedCount([row("2020-01-01")], "right_to_move_in");
    expect(p.householdHousingCount).toBeUndefined();
  });

  it("[HC-8f] 갱신값은 ④·⑧ leaf 와 같다 — 한 값만 남는다", () => {
    const houses = [row("2020-01-01"), row("2021-01-01"), row()];
    const derived = housesPatchWithDerivedCount(houses, "housing").householdHousingCount;
    const leaf = resolveHouseholdHousingCount({ primaryKind: "housing", declared: 1, houses });
    expect(Number(derived)).toBe(leaf);
  });
});

describe("HC-9 잠금은 «정합된 상태»만 고정한다", () => {
  const two = [row("2020-01-01"), row("2021-01-01")]; // 파생 = 3

  it("[HC-9a] 선언값이 파생값과 같으면 잠근다", () => {
    expect(houseCountScalarLocked("housing", two, 3)).toBe(true);
  });

  it("[HC-9b] 🔴 어긋나면 잠그지 않는다 — 구 이력 복원분의 dead-end 방지", () => {
    expect(houseCountScalarLocked("housing", two, 1)).toBe(false);
    expect(houseCountScalarLocked("housing", two, 5)).toBe(false);
  });

  it("[HC-9c] 명부가 비면 잠그지 않는다 (D-4 간이 입력)", () => {
    expect(houseCountScalarLocked("housing", [], 1)).toBe(false);
  });

  it("[HC-9d] 주택 양도가 아니면 잠그지 않는다 (F1)", () => {
    expect(houseCountScalarLocked("right_to_move_in", two, 3)).toBe(false);
  });

  it("[HC-9e] HC-8 갱신 직후는 반드시 잠긴 상태다 — 두 술어가 같은 산식을 쓴다", () => {
    const declared = Number(housesPatchWithDerivedCount(two, "housing").householdHousingCount);
    expect(houseCountScalarLocked("housing", two, declared)).toBe(true);
  });
});
