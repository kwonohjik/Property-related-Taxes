/**
 * anchor G-1: 부담부증여 **지원 자산 목록 3층 parity**.
 *
 * 게이트는 세 곳에 있고 타입이 서로 다르다:
 *
 * | 층 | 위치 | 타입 |
 * |---|---|---|
 * | ⑤ UI | `components/calc/transfer/TransferModeBlock.tsx` `SUPPORTED_ASSET_KINDS` | `AssetForm["assetKind"][]` |
 * | ⑧ validate | `lib/calc/transfer-tax-validate-bg.ts` `SUPPORTED_KINDS` | `AssetForm["assetKind"][]` |
 * | 엔진 | `lib/tax-engine/burdened-gift-eligibility.ts` `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES` | `string[]` |
 *
 * ❌ **상수를 하나로 합치지 않는다** — 엔진은 순수 계층이라 클라이언트 타입을 import하지
 *    않는다(단방향 의존). 대신 여기서 **내용 동일성**을 단언한다.
 *
 * 🔑 한 곳만 넓히면 어떤 일이 생기나:
 *   · ⑤만 → UI는 부담부증여 카드를 렌더하는데 ⑧이 차단 → 입력은 되나 계산이 안 된다
 *   · ⑧만 → 검증은 통과하는데 ⑤가 rose 안내만 보여 **입력 경로가 없다**(payload 미도달)
 *   · 엔진만 → 클라이언트를 거치지 않은 API 직접 호출만 열린다(UI에서는 도달 불가)
 *
 * ⚠️ ⑤·⑧은 배열을 export하지 않으므로 **소스 텍스트에서 뽑는다**. 배열 리터럴의 형태가
 *    바뀌면(예: 다른 배열에서 파생) 이 파서가 먼저 실패해 조용한 통과가 없다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES } from "@/lib/tax-engine/burdened-gift-eligibility";

const ROOT = join(__dirname, "..", "..", "..");

/** `const <name>: <타입> = [ "a", "b" ];` 의 문자열 리터럴만 뽑는다. */
function extractArray(relPath: string, constName: string): string[] {
  const src = readFileSync(join(ROOT, relPath), "utf-8");
  const re = new RegExp(`const\\s+${constName}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`);
  const m = src.match(re);
  if (!m)
    throw new Error(
      `${relPath}: ${constName} 배열 리터럴을 찾지 못했다 — 형태가 바뀌었는지 확인할 것`,
    );
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("G-1 · 부담부증여 게이트 3층 parity", () => {
  const ui = extractArray(
    "components/calc/transfer/TransferModeBlock.tsx",
    "SUPPORTED_ASSET_KINDS",
  );
  const validate = extractArray("lib/calc/transfer-tax-validate-bg.ts", "SUPPORTED_KINDS");
  const engine = BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES;

  it("세 배열이 비어 있지 않다 (파서 자기검증)", () => {
    expect(ui.length).toBeGreaterThan(0);
    expect(validate.length).toBeGreaterThan(0);
    expect(engine.length).toBeGreaterThan(0);
  });

  it("⑤ UI ≡ ⑧ validate", () => {
    expect([...ui].sort()).toEqual([...validate].sort());
  });

  it("⑧ validate ≡ 엔진", () => {
    expect([...validate].sort()).toEqual([...engine].sort());
  });

  it("2026-09-08 편입분 — redevelopment_apt가 세 곳 모두에 있다", () => {
    expect(ui).toContain("redevelopment_apt");
    expect(validate).toContain("redevelopment_apt");
    expect(engine).toContain("redevelopment_apt");
  });

  it("🔴 대조군 — 조합원입주권은 아직 세 곳 모두에 없다 (후속 배치)", () => {
    expect(ui).not.toContain("right_to_move_in");
    expect(validate).not.toContain("right_to_move_in");
    expect(engine).not.toContain("right_to_move_in");
  });
});
