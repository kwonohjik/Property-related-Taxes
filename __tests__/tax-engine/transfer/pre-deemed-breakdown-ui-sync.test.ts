/**
 * pre-deemed 후보 비교 — **타입 ↔ 결과 카드 동기화 가드**
 *
 * 배경: `sec164Amount`(② §164④~⑦)를 엔진에 추가했을 때 결과 카드가 ①③만 렌더해
 *       **②가 채택돼도 「선택」 배지가 아무 데도 붙지 않고, 화면의 어느 값과도 다른
 *       취득가액이 최종 반영**되는 상태로 머물렀다. tsc·기존 테스트 모두 이를 잡지 못했다.
 *
 * 이 가드는 타입 정의에서 후보 필드·selectedMethod 값을 **추출**해 카드가 전부
 * 다루는지 대조한다 ⇒ 후보가 늘면 자동으로 실패한다(수동 목록 갱신 불요).
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-a-b-separation.plan.md §8 결함 A
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const TYPES_SRC = readFileSync(
  join(process.cwd(), "lib/tax-engine/types/inheritance-acquisition.types.ts"),
  "utf8",
);
const CARD_SRC = readFileSync(
  join(process.cwd(), "components/calc/results/transfer/InheritedAcquisitionDetailCard.tsx"),
  "utf8",
);

/** PreDeemedBreakdown의 금액 필드(number 계열) */
function amountFields(): string[] {
  const body = TYPES_SRC.match(/export interface PreDeemedBreakdown \{([\s\S]*?)\n\}/)?.[1];
  if (!body) throw new Error("PreDeemedBreakdown 인터페이스를 찾지 못했다 — 타입이 이동했는지 확인할 것");
  return [...body.matchAll(/^\s*(\w+):\s*number/gm)].map((m) => m[1]);
}

/** PreDeemedSelectedMethod 유니온 리터럴 */
function selectedMethods(): string[] {
  const union = TYPES_SRC.match(/export type PreDeemedSelectedMethod =([^;]+);/)?.[1];
  if (!union) throw new Error("PreDeemedSelectedMethod를 찾지 못했다 — 타입이 이동했는지 확인할 것");
  return [...union.matchAll(/"([\w]+)"/g)].map((m) => m[1]);
}

describe("pre-deemed 후보 ↔ 결과 카드 동기화", () => {
  it("A-1: 후보 금액 필드가 전부 카드에서 렌더된다", () => {
    const fields = amountFields();
    expect(fields).toContain("sec164Amount"); // 결함 A의 대상 — 목록 추출이 비어버리는 것 방지
    expect(fields.length).toBeGreaterThanOrEqual(3);

    for (const f of fields) {
      expect(CARD_SRC, `결과 카드가 ${f}를 렌더하지 않는다`).toContain(`preDeemedBreakdown.${f}`);
    }
  });

  it("A-2: selectedMethod 값마다 「선택」 배지 분기가 있다", () => {
    const methods = selectedMethods();
    expect(methods).toContain("sec164");
    expect(methods.length).toBeGreaterThanOrEqual(3);

    for (const m of methods) {
      expect(CARD_SRC, `결과 카드에 selectedMethod "${m}" 배지 분기가 없다`).toContain(
        `selectedMethod === "${m}"`,
      );
    }
  });

  it("A-3: 후보 개수를 고정 문구로 단정하지 않는다 (「세 금액」식 표현 금지)", () => {
    // ①②는 opt-in이라 표시 개수가 가변이다 — 고정 개수 문구는 화면과 어긋난다.
    expect(CARD_SRC).not.toMatch(/[한두세네다섯]\s*금액 중/);
  });
});
