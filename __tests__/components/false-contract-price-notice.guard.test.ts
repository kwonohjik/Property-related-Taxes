/**
 * 가드: 소득세법 §91② 범위 밖 고지 (결정 #48 A) — 배선 5곳 · 판정 메뉴 제외 · 「엔진에 §91② 입력 없음」 전제.
 *
 * 렌더 테스트(`false-contract-price-notice.anchor.test.tsx`)는 격자가 빈 곳을 못 본다 — 여기서는 소스를 직접 읽어
 * 「5곳 전건 배선」을 센다. 파일 목록은 **하드코딩**한다(글롭이 하위 카드를 잘못 잡는다 — `one-house-provenance-four-views`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripComments } from "./_helpers/strip-comments";

const read = (p: string) => stripComments(readFileSync(resolve(process.cwd(), p), "utf-8"));

/** 고지가 붙는 결과뷰 — 양도세 4종 + 부담부증여 양도세 카드(`GiftTaxResultView`가 렌더). */
const VIEWS = {
  단건: "components/calc/results/TransferTaxResultView.tsx",
  다건: "components/calc/results/MultiTransferTaxResultView.tsx",
  겸용: "components/calc/results/mixed-use/MixedUseTotalTaxSection.tsx",
  일괄: "components/calc/results/BundledAllocationCard.tsx",
  부담부증여: "components/calc/results/BurdenedTransferTaxResultCard.tsx",
} as const;

describe("§91② 고지 — 결과뷰 5곳 전건 배선", () => {
  it.each(Object.entries(VIEWS))("[G-1] %s 뷰가 공용 고지 컴포넌트를 렌더한다", (_l, path) => {
    const src = read(path);
    expect(src).toMatch(/<FalseContractPriceNotice(ForItems)?\b/);
    expect(src).toContain('@/components/calc/results/shared/FalseContractPriceNotice"');
  });

  it("[G-2] 부담부증여 카드에 증여일이 흘러 들어간다 (시행일 게이트)", () => {
    expect(read("components/calc/results/GiftTaxResultView.tsx")).toMatch(
      /<BurdenedTransferTaxResultCard[^>]*transferDate=\{giftDate\}/,
    );
  });

  it("[G-3] 뷰가 노출 조건을 손으로 쓰지 않는다 — 술어는 공용 leaf 하나다", () => {
    for (const path of Object.values(VIEWS)) {
      const src = read(path);
      expect(src, `${path}: 시행일을 직접 비교하지 말 것`).not.toMatch(/2011-0?[17]-0?1/);
      expect(src, `${path}: FALSE_CONTRACT_PRICE_EFFECTIVE_DATE 직접 사용 금지`).not.toContain("FALSE_CONTRACT_PRICE_EFFECTIVE_DATE");
    }
  });

  it("[G-4] 부담부증여(매매 아님)를 술어에서 빼지 않는다 — 매수인 쪽 적용 여부 미확인", () => {
    const src = read("lib/calc/false-contract-price-notice.ts");
    expect(src).not.toMatch(/burdened_gift|transferType/);
  });
});

describe("§91② 고지 — 판정 메뉴에는 두지 않는다 (하위 결정 2: 나)", () => {
  it("[J-1] 1세대1주택 판정 결과뷰가 고지를 렌더하지 않는다", () => {
    const src = read("components/calc/results/OneHouseJudgmentResultView.tsx");
    expect(src).not.toContain("FalseContractPriceNotice");
    expect(src).not.toContain("false-contract-price-notice");
  });
});

describe("§91② 고지 — 「엔진에 §91② 입력이 없다」는 전제", () => {
  /**
   * 이 고지는 「계약서 거래가액을 받지 않아 이 계산에 반영하지 않았다」고 말한다. 입력 타입·Zod에 그런 필드가 생기면
   * (= 결정 #48 B 구현) 고지는 거짓이 된다 — 그때 고지·이 가드를 함께 걷고 계산으로 옮긴다.
   * 식별자 이름 기반이라 완전하지 않다: 이름이 다른 필드를 추가하면 이 가드는 못 본다 → 구현자가 이 파일을 먼저 찾도록 `contract` 계열만 막는다.
   */
  const FORBIDDEN = /\b\w*(?:contractPrice|contractAmount|contractTransferPrice|falseContract|bookTransferPrice|contractDeedPrice|stampedPrice)\w*\b/i;
  const INPUT_SURFACES = [
    "lib/tax-engine/types/transfer.types.ts",
    "lib/api/transfer-tax-schema-base-shape.ts",
    "lib/stores/calc-wizard-form.types.ts",
  ];
  it.each(INPUT_SURFACES)("[E-1] %s 에 계약서 거래가액 필드가 없다", (path) => {
    const m = read(path).match(FORBIDDEN);
    expect(m, `${path}: ${m?.[0]} — §91② 구현이면 범위 밖 고지(lib/calc/false-contract-price-notice.ts)를 함께 걷을 것`).toBeNull();
  });
});
