/**
 * anchor — §89② 합가 예외 ④→⑫→⑭ 배관 (C1-01 Phase 4)
 *
 * `mergedHouseholdFirstHouse`는 **6갈래 판별 유니온**이라 층마다 다르게 깨진다:
 *   · ④ FLAT → 유니온 조립 — 갈래마다 요구 필드가 다르다(가목 2 · 나·다목 1 · 나머지 0)
 *   · ⑫ Zod discriminatedUnion — `kind`가 안 맞으면 통째로 400
 *   · ⑭ 날짜 필드가 없어 그대로 통과하지만, **매핑 자체를 빼면 조용히 사라진다**
 *
 * ## 🔴 다건 route가 §89② 축을 통째로 버리고 있었다 (2026-08-26 실측)
 *
 * ⑬(`multi-transfer-tax-api.ts`)이 보내고 ⑫가 통과시키는데 다건 route의 명시 매핑에
 * `rightThreeYearException`(Phase 2)·`generalHouseHeldAtInheritance`·
 * `inheritedRightChoiceWhenBothHeld`(Phase 3)·`generalHouseGiftedFromDecedentWithin2yr`(§155②)가
 * **없었다**. 단건 route에는 있어 TypeScript가 잡지 못한 침묵 strip이다
 * (memory `feedback_api_zod_schema_sync`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildMergedHouseholdFirstHousePayload } from "@/lib/calc/transfer-tax-api-helpers";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다(Phase 1 전례).
import "@/lib/api/transfer-tax-schema";
import { mergedHouseholdFirstHouseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return { ...createDefaultTransferFormData(), ...over };
}

/** ④가 만든 payload를 ⑫에 태워 파싱된 값을 돌려준다 (없으면 null). */
function throughZod(f: TransferFormData) {
  const payload = buildMergedHouseholdFirstHousePayload(f) as {
    mergedHouseholdFirstHouse?: unknown;
  };
  if (payload.mergedHouseholdFirstHouse === undefined) return null;
  const parsed = mergedHouseholdFirstHouseSchema.safeParse(payload.mergedHouseholdFirstHouse);
  if (!parsed.success) throw new Error(`⑫ 거부: ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data;
}

describe("④ FLAT → 유니온 조립", () => {
  it("미선택은 키 자체를 만들지 않는다 — 엔진이 「판정 불가」로 읽어야 한다", () => {
    expect(buildMergedHouseholdFirstHousePayload(form())).toEqual({});
  });

  it("🔴 신규 필드가 **없는** stale 폼도 키를 만들지 않는다 (⑫ 400 방지)", () => {
    // sessionStorage 구 버전 폼에는 `mergedHouseholdFirstHouseKind` 자체가 없다.
    // 「빈 문자열만 걸러내는」 구현은 여기서 `kind: undefined`를 실어 요청 전체를 400으로 만든다.
    const stale = { ...createDefaultTransferFormData() } as Record<string, unknown>;
    delete stale.mergedHouseholdFirstHouseKind;
    expect(
      buildMergedHouseholdFirstHousePayload(stale as unknown as TransferFormData),
    ).toEqual({});
  });

  it("★ `none`은 **명시 선언**이라 반드시 실린다", () => {
    expect(throughZod(form({ mergedHouseholdFirstHouseKind: "none" }))).toEqual({ kind: "none" });
  });

  it("요건 없는 갈래(3호·5호)는 `kind`만 싣는다", () => {
    expect(throughZod(form({ mergedHouseholdFirstHouseKind: "house_only" }))).toEqual({
      kind: "house_only",
    });
    expect(throughZod(form({ mergedHouseholdFirstHouseKind: "right_only" }))).toEqual({
      kind: "right_only",
    });
  });

  it("⭐ 가목은 **두 요건**을 함께 싣는다 — 하나로 뭉치면 조문이 틀린다", () => {
    expect(
      throughZod(
        form({
          mergedHouseholdFirstHouseKind: "initial_right",
          mergedHouseholdAcquiredAfterApproval: true,
          mergedHouseholdResidedOneYear: false,
        }),
      ),
    ).toEqual({ kind: "initial_right", acquiredAfterApproval: true, residedOneYear: false });
  });

  it("나·다목은 하나만 싣는다", () => {
    expect(
      throughZod(
        form({
          mergedHouseholdFirstHouseKind: "succeeded_right",
          mergedHouseholdOwnedBeforeRight: true,
        }),
      ),
    ).toEqual({ kind: "succeeded_right", ownedBeforeRight: true });
    expect(
      throughZod(
        form({
          mergedHouseholdFirstHouseKind: "presale_right",
          mergedHouseholdOwnedBeforeRight: false,
        }),
      ),
    ).toEqual({ kind: "presale_right", ownedBeforeRight: false });
  });
});

describe("⑫ Zod discriminatedUnion", () => {
  it("모르는 kind는 거부한다", () => {
    expect(mergedHouseholdFirstHouseSchema.safeParse({ kind: "whatever" }).success).toBe(false);
  });

  it("갈래별 필수 필드가 빠지면 거부한다", () => {
    expect(mergedHouseholdFirstHouseSchema.safeParse({ kind: "initial_right" }).success).toBe(false);
    expect(
      mergedHouseholdFirstHouseSchema.safeParse({
        kind: "initial_right",
        acquiredAfterApproval: true,
      }).success,
    ).toBe(false);
    expect(mergedHouseholdFirstHouseSchema.safeParse({ kind: "succeeded_right" }).success).toBe(
      false,
    );
  });
});

/**
 * ⑭ — 다건 route는 **명시 매핑**이라 필드를 적지 않으면 조용히 사라진다.
 * leaf 호출 anchor로는 관측되지 않으므로(그 층을 안 태운다) **소스를 직접 검사**한다
 * (memory `feedback_leaf_anchor_skips_zod_layer`).
 */
describe("⑭ 다건 route가 §89② 축을 버리지 않는다", () => {
  const src = readFileSync("app/api/calc/transfer/multi/route.ts", "utf8");

  it("★ Phase 3·4 필드가 그대로 엔진 입력으로 매핑된다", () => {
    for (const field of [
      "mergedHouseholdFirstHouse",
      "generalHouseHeldAtInheritance",
      "inheritedRightChoiceWhenBothHeld",
      "generalHouseGiftedFromDecedentWithin2yr",
    ]) {
      expect(src, field).toContain(`${field}: p.${field}`);
    }
  });

  it("🔑 `rightThreeYearException`은 `completionDate`를 Date로 바꿔서 넘긴다", () => {
    // 통째로 spread하면 `Date < string` 비교가 조용히 false가 된다(date-coerce 규약).
    expect(src).toContain('"rightThreeYearException.completionDate"');
  });
});
