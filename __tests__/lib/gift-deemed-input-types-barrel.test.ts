/**
 * anchor: `gift-deemed-input-types.ts` 분할 후 **export 경로 보존** — 정적 가드.
 *
 * Phase 3 타입을 `gift-deemed-input-phase3.ts`로 분리하면서 barrel이 전량 re-export하도록 했다.
 * 신규 Phase 3 타입을 추가하고 **barrel의 re-export 목록에 넣지 않으면**, 기존 import 경로
 * (`@/lib/tax-engine/gift-deemed/types` · `.../gift-deemed-input-types`)에서 **조용히 사라진다**
 * — 타입이므로 런타임 오류도 없고, 그 타입을 쓰지 않는 코드는 tsc도 통과한다.
 *
 * 이 저장소는 같은 함정을 이미 두 번 겪었다(feedback_800line_split_export_preservation ·
 * 법령 매니페스트 등재 누락 2회). 주석은 게이트가 아니므로 정적 분석으로 막는다.
 *
 * ⚠️ 순수 정적 분석이라 렌더·엔진 실행이 필요 없다 ⇒ pre-push와 CI 전체 테스트 양쪽에서 잡힌다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "lib/tax-engine/gift-deemed");
const BARREL = readFileSync(join(DIR, "gift-deemed-input-types.ts"), "utf-8");
const PHASE3 = readFileSync(join(DIR, "gift-deemed-input-phase3.ts"), "utf-8");

const declared = (src: string) =>
  [...src.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]);

function reexportedFromPhase3(): string[] {
  const block = BARREL.match(
    /export type \{\n((?:\s*\w+,\n)+)\} from "\.\/gift-deemed-input-phase3";/,
  );
  if (!block) return [];
  return [...block[1].matchAll(/(\w+),/g)].map((m) => m[1]);
}

describe("gift-deemed-input-types 분할 — export 경로 보존", () => {
  it("스캐너가 실제로 선언을 보고 있다 (구별력 바닥)", () => {
    expect(declared(PHASE3).length).toBeGreaterThan(10);
    expect(reexportedFromPhase3().length).toBeGreaterThan(10);
  });

  it("🔑 Phase 3의 모든 export가 barrel에서 re-export된다", () => {
    const missing = declared(PHASE3).filter((n) => !reexportedFromPhase3().includes(n));
    expect(missing, `barrel re-export 누락: ${missing.join(", ")}`).toEqual([]);
  });

  it("re-export 목록에 실재하지 않는 이름이 없다 (오타·삭제 잔재)", () => {
    const orphan = reexportedFromPhase3().filter((n) => !declared(PHASE3).includes(n));
    expect(orphan, `phase3에 없는 이름: ${orphan.join(", ")}`).toEqual([]);
  });

  it("두 파일 모두 800줄 트리거 아래에 있다", () => {
    expect(BARREL.split("\n").length).toBeLessThan(800);
    expect(PHASE3.split("\n").length).toBeLessThan(800);
  });
});
