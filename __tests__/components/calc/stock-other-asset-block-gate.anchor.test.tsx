/**
 * anchor — Step1 `OtherAssetBlock` 게이트가 **marketType을 본다** (계획서 Q-2)
 *
 * 계획서: `docs/00-pm/stock-basic-deduction-group-gate.plan.md` §6
 *
 * ## ⚠️ 계획서 Q-2의 전제는 **틀렸다** — 실측으로 정정
 *
 * 「해외주식·국외전출세에서 stale 플래그로 기타자산 블록이 뜬다」고 적었으나, Step1은 그 둘에서
 * **조기 반환**한다(`Step1.tsx:175`·`:186` — `return items;`). 섹션 조립이 거기서 끝나므로
 * 기타자산 갈래에 **도달조차 하지 않는다**. 결함은 실재하지 않았다
 * (memory `feedback_early_return_branch_skips_pipeline_stages`).
 *
 * ## 그럼 이 파일은 무엇을 지키는가 — **술어 단일화**
 *
 * 종전 인라인 조건 `other_asset || 플래그`는 marketType을 보지 않았고, 안전은 **조기 반환이라는
 * 다른 층**이 만들고 있었다. 두 벌 판정을 유지하면 조기 반환이 바뀌는 순간 조용히 어긋난다
 * (memory `feedback_safety_attribution_in_compound_gate`).
 *
 * **mutation probe 실측(M-3)**: 술어를 `isOtherAssetGroup`으로 단일화한 뒤 `Step1.tsx`의 조기
 * 반환 2줄을 지워도 **S-1·S-1b가 통과한다** — 이제 술어가 혼자 막는다. 단일화 전이라면 같은
 * 뮤테이션에서 두 케이스가 깨졌다.
 */
// Step1 하위가 Dexie(IndexedDB)에 접근한다 — jsdom엔 없어 unhandled rejection이 난다.
// 저장소의 확립된 패턴(`stock-major-shareholder-toggle-removal.test.tsx:19`)대로 주입한다.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

/**
 * ⚠️ 이 문자열은 **두 곳**에 난다 — `Step1.tsx`의 `SectionTitle`과 `OtherAssetBlock`의
 * `FieldCard label`이 같은 문구다. `getByText`는 multiple로 throw하므로 **개수로 센다**.
 */
const BLOCK_TITLE = "기타자산 해당 여부 (§94①4)";
const blockCount = () => screen.queryAllByText(BLOCK_TITLE).length;

function renderStep1(overrides: Partial<StockTransferFormData> = {}) {
  const form: StockTransferFormData = { ...createInitialStockFormData(), ...overrides };
  render(<Step1 form={form} onChange={vi.fn()} />);
}

describe("Step1 — 기타자산 블록의 marketType 게이트", () => {
  it("S-1: 해외주식 + 과점주주 플래그 stale true — 블록 비노출", () => {
    renderStep1({ marketType: "foreign_stock", isQualifyingBlockShareholder: true });
    expect(blockCount()).toBe(0);
  });

  it("S-1b: 국외전출세 + 부동산과다보유 플래그 stale true — 블록 비노출", () => {
    renderStep1({ marketType: "exit_tax", isHeavyRealEstateForRate: true });
    expect(blockCount()).toBe(0);
  });

  it("S-2: 코스피 + 과점주주 플래그 — 블록 노출 (§94② 발동 경로는 살려 둔다)", () => {
    // 🔑 S-1의 양성 쌍둥이. 게이트를 통째로 지우거나 `other_asset` 단독으로 좁히면 깨진다.
    renderStep1({ marketType: "kospi", isQualifyingBlockShareholder: true });
    expect(blockCount()).toBeGreaterThan(0);
  });

  it("S-2b: 기타자산 선택 — 플래그 없이도 블록 노출", () => {
    renderStep1({ marketType: "other_asset" });
    expect(blockCount()).toBeGreaterThan(0);
  });
});
