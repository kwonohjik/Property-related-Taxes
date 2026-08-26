/**
 * anchor — §89② 3년 초과 예외 ④→⑫ 배관 (C1-01 Phase 2)
 *
 * `rightThreeYearException`은 **판별 유니온**이라 층마다 다르게 깨질 수 있다:
 *   · ④ FLAT → 유니온 조립 — 필수값이 비면 키 자체를 만들지 않아야 한다
 *   · ⑫ Zod discriminatedUnion — `kind`가 안 맞으면 통째로 400
 *   · ⑭ `completionDate`만 string → Date — 갈래를 안 보고 통째로 spread하면
 *        `Date < string` 비교가 조용히 false가 된다(`lib/api/date-coerce.ts` 규약)
 *
 * ⚠️ 특히 **`kind: "none"`이 살아남는지**가 중요하다 — 이 값이 사라지면 「해당 없음」 선언이
 *    미선언으로 되돌아가 §89② 배제가 조용히 풀린다(세액이 줄어드는 방향).
 */
import { describe, it, expect } from "vitest";
import { buildRightThreeYearExceptionPayload } from "@/lib/calc/transfer-tax-api-helpers";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다(Phase 1 전례).
import "@/lib/api/transfer-tax-schema";
import { rightThreeYearExceptionSchema } from "@/lib/api/transfer-tax-schema-sub";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return { ...createDefaultTransferFormData(), ...over };
}

/** ④가 만든 payload를 ⑫에 태워 파싱된 값을 돌려준다 (없으면 null). */
function throughZod(f: TransferFormData) {
  const payload = buildRightThreeYearExceptionPayload(f) as {
    rightThreeYearException?: unknown;
  };
  if (payload.rightThreeYearException === undefined) return null;
  const parsed = rightThreeYearExceptionSchema.safeParse(payload.rightThreeYearException);
  if (!parsed.success) {
    throw new Error(`⑫ 거부: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}

describe("④ FLAT → 유니온 조립", () => {
  it("미선택은 키 자체를 만들지 않는다 — 엔진이 「판정 불가」로 읽어야 한다", () => {
    expect(buildRightThreeYearExceptionPayload(form())).toEqual({});
  });

  it("★ `none`은 **명시 선언**이라 반드시 실린다", () => {
    expect(throughZod(form({ rightThreeYearExceptionKind: "none" }))).toEqual({ kind: "none" });
  });

  it("new_house — 완성일이 있으면 3필드가 그대로 실린다", () => {
    const parsed = throughZod(
      form({
        rightThreeYearExceptionKind: "new_house",
        rightNewHouseCompletionDate: "2023-01-01",
        rightMovedInWithin3Years: true,
        rightResidedOneYearOrMore: true,
      }),
    );
    expect(parsed).toEqual({
      kind: "new_house",
      completionDate: "2023-01-01",
      movedInWithin3Years: true,
      residedOneYearOrMore: true,
    });
  });

  it("🔑 new_house — 완성일이 비면 키를 만들지 않는다 (입력 중인 상태이지 선언이 아니다)", () => {
    expect(
      buildRightThreeYearExceptionPayload(
        form({ rightThreeYearExceptionKind: "new_house", rightMovedInWithin3Years: true }),
      ),
    ).toEqual({});
  });

  it("★ R-3 — `before_completion`은 **완성일 없이** 실린다", () => {
    expect(
      throughZod(
        form({
          rightThreeYearExceptionKind: "before_completion",
          rightMovedInWithin3Years: true,
          rightResidedOneYearOrMore: true,
        }),
      ),
    ).toEqual({
      kind: "before_completion",
      movedInWithin3Years: true,
      residedOneYearOrMore: true,
    });
  });

  it("🔑 `before_completion`에 완성일을 넣어도 payload에 실리지 않는다 (2호 전단은 비교가 없다)", () => {
    const parsed = throughZod(
      form({
        rightThreeYearExceptionKind: "before_completion",
        rightNewHouseCompletionDate: "2026-01-01",
      }),
    ) as Record<string, unknown>;
    expect(Object.keys(parsed)).not.toContain("completionDate");
  });

  it("delay — 사유가 있으면 둘째 요건까지 실린다", () => {
    const parsed = throughZod(
      form({
        rightThreeYearExceptionKind: "delay",
        rightDisposalDelayReason: "auction",
        rightDisposedByThatMethod: true,
      }),
    );
    expect(parsed).toEqual({ kind: "delay", reason: "auction", disposedByThatMethod: true });
  });

  it("🔑 delay — 사유가 비면 키를 만들지 않는다", () => {
    expect(
      buildRightThreeYearExceptionPayload(form({ rightThreeYearExceptionKind: "delay" })),
    ).toEqual({});
  });
});

describe("⑫ Zod discriminatedUnion", () => {
  it("§75① 사유 열거는 **3개뿐**이다 — §155⑱의 4·5호는 거부한다", () => {
    for (const reason of ["kamco", "auction", "public_sale"]) {
      expect(
        rightThreeYearExceptionSchema.safeParse({
          kind: "delay",
          reason,
          disposedByThatMethod: true,
        }).success,
        reason,
      ).toBe(true);
    }
    for (const reason of ["cash_settlement_suit", "expropriation_suit"]) {
      expect(
        rightThreeYearExceptionSchema.safeParse({
          kind: "delay",
          reason,
          disposedByThatMethod: true,
        }).success,
        reason,
      ).toBe(false);
    }
  });

  it("R-3 — `before_completion`은 완성일을 **요구하지 않는다**", () => {
    expect(
      rightThreeYearExceptionSchema.safeParse({
        kind: "before_completion",
        movedInWithin3Years: true,
        residedOneYearOrMore: false,
      }).success,
    ).toBe(true);
  });

  it("모르는 kind는 거부한다", () => {
    expect(rightThreeYearExceptionSchema.safeParse({ kind: "whatever" }).success).toBe(false);
  });

  it("갈래별 필수 필드가 빠지면 거부한다", () => {
    expect(rightThreeYearExceptionSchema.safeParse({ kind: "new_house" }).success).toBe(false);
    expect(rightThreeYearExceptionSchema.safeParse({ kind: "delay" }).success).toBe(false);
  });
});
