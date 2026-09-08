/**
 * 대주주 판정 UI 재배치 — 배치·경계 anchor.
 *
 * Plan: docs/00-pm/stock-major-shareholder-ui-restructure.plan.md §6 (L-1~L-12)
 *
 * 배경(실측 2026-09-08):
 *   이 화면의 배치를 지키는 안전망이 **0건**이었다. 뮤테이션 7종(hint 4장·총발행주식수 2곳·
 *   대차/PEF 블록·장내 토글을 전부 제거, 708→620줄)에 7266파일 20261테스트가 **전건 통과**했고
 *   `tsc --noEmit`도 0건이었다. 즉 88줄을 지워도 아무도 모른다.
 *
 * ⚠️ 배치 anchor는 **순서**를 단언한다. 문자열 존재만 보면 이동을 감지하지 못한다.
 * ⚠️ 부정형 anchor("§5에 없다")는 반드시 긍정 짝("§6에는 있다")과 함께 둔다 —
 *    짝이 없으면 「지워버리기」로도 통과한다(feedback_negative_anchor_needs_positive_twin).
 */

// Step1 하위가 Dexie(IndexedDB)에 접근한다 — jsdom엔 IndexedDB가 없어 unhandled rejection이 난다.
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { MajorShareholderBlock } from "@/components/calc/stock-transfer/MajorShareholderBlock";
import { computeAutoIsMajor } from "@/components/calc/stock-transfer/major-sync";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function makeForm(patch: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    ...patch,
  } as StockTransferFormData;
}

/** MajorShareholderBlock 단독 렌더 (= 화면의 §5 영역) */
function block(patch: Partial<StockTransferFormData> = {}) {
  return render(<MajorShareholderBlock form={makeForm(patch)} onChange={vi.fn()} />);
}

/** Step1 전체 렌더 (= §1~§6 전 섹션) */
function step1(patch: Partial<StockTransferFormData> = {}) {
  return render(<Step1 form={makeForm(patch)} onChange={vi.fn()} />);
}

/** a가 b보다 문서상 앞에 있는가 */
function isBefore(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** 라벨 텍스트가 붙은 FieldCard 안의 input */
function inputInFieldCard(labelText: string): HTMLInputElement | null {
  const label = screen.queryByText(labelText);
  if (!label) return null;
  const card = label.closest("[data-slot='field-card']");
  if (!card) return null;
  return within(card as HTMLElement).queryByRole("textbox") as HTMLInputElement | null;
}

/**
 * 🔑 `CollapsibleHintCard`는 접힌 상태에서 **본문을 렌더하지 않는다**
 * (`MajorShareholderCheckpointHints.tsx:52` — `{open && <div>{children}</div>}`).
 * 따라서 hint **본문** 문구를 그냥 queryByText로 찾으면 「없다」가 항상 참이 되어
 * 구별력 0인 anchor가 된다(feedback_mutation_zero_discrimination_is_not_proof).
 * 본문을 단언할 때는 반드시 먼저 펼친다.
 */
function expandHintCard(summaryPattern: RegExp): boolean {
  const btn = screen.queryByRole("button", { name: summaryPattern });
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
}

// 판정이 성립하는 최소 입력 — 임계표 행 선택은 양도일, 측정값은 기준일 현재.
const JUDGABLE = {
  transferDate: "2026-06-01",
  priorYearEndDate: "2025-12-31",
} as const;

// ────────────────────────────────────────────────────────────────
// A. 기준이 먼저 온다
// ────────────────────────────────────────────────────────────────

describe("L-1 — 판정 기준이 기준일 입력보다 앞에 온다", () => {
  it("「현재 적용 기준」이 「직전 사업연도 종료일」보다 문서상 앞", () => {
    block(JUDGABLE);
    const criteria = screen.getByText(/현재 적용 기준/);
    const dateLabel = screen.getByText("직전 사업연도 종료일");
    expect(isBefore(criteria, dateLabel)).toBe(true);
  });

  it("시기별 기준 이력 토글도 기준일 입력보다 앞 (기준 박스에 흡수)", () => {
    block(JUDGABLE);
    const history = screen.getByText(/시기별 기준 이력/);
    const dateLabel = screen.getByText("직전 사업연도 종료일");
    expect(isBefore(history, dateLabel)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// B. hint 해체 — 카드는 사라지고 항목은 제 주제로 이사한다
// ────────────────────────────────────────────────────────────────

describe("L-2 — 「합병·분할·간접투자」 hint 카드는 소멸했다", () => {
  it("기본 화면에 그 카드 제목이 없다", () => {
    block(JUDGABLE);
    expect(screen.queryByText(/합병·분할·간접투자/)).toBeNull();
  });

  it("특수 판정 기준일 토글을 켜도 없다 (카드 자체가 사라졌으므로)", () => {
    block({ ...JUDGABLE, judgmentBasis: "merger", judgmentDateOverride: "2025-03-01" });
    expect(screen.queryByText(/합병·분할·간접투자/)).toBeNull();
  });

  // 긍정 짝 — 항목이 지워진 게 아니라 이사했음을 증명한다
  it("L-2b 「상장 전환」 항목은 기준 영역에 살아 있다", () => {
    block(JUDGABLE);
    const item = screen.getAllByText(/상장 전환/)[0];
    const dateLabel = screen.getByText("직전 사업연도 종료일");
    expect(isBefore(item, dateLabel)).toBe(true);
  });

  it("L-2c 「§178 투자기구」 항목은 합산 hint로 이사했다 (펼쳐서 확인)", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: true });
    expect(expandHintCard(/특수관계인 합산/)).toBe(true);
    // 라벨 span과 그 조상 li가 함께 매칭되므로 getAllByText로 존재만 단언한다
    expect(screen.getAllByText(/§178 투자기구/).length).toBeGreaterThan(0);
  });

  it("L-2d 「창업투자조합」 항목도 함께 이사했다", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: true });
    expect(expandHintCard(/특수관계인 합산/)).toBe(true);
    expect(screen.getAllByText(/창업투자조합/).length).toBeGreaterThan(0);
  });
});

describe("L-3 — 세율 부칙 안내는 삭제됐다 (대주주 판정 주제가 아니다)", () => {
  it("카드 제목에서 「세율 부칙」이 사라졌다", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: true, judgmentBasis: "merger" });
    expect(screen.queryByText(/세율 부칙/)).toBeNull();
  });

  /**
   * ⚠️ 본문 단언은 **펼친 상태**에서만 의미가 있다.
   * 접힌 카드는 본문을 렌더하지 않아 「없다」가 공짜로 참이 된다.
   * 세율 부칙 항목이 다른 hint 카드로 슬쩍 옮겨가는 것까지 막는다.
   */
  it("합산 hint를 펼쳐도 「20% 단일」 문구가 없다", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: true });
    expect(expandHintCard(/특수관계인 합산/)).toBe(true);
    expect(screen.queryByText(/20% 단일/)).toBeNull();
  });

  it("시총·발행주식총수 hint를 펼쳐도 「20% 단일」 문구가 없다", () => {
    block(JUDGABLE);
    expect(expandHintCard(/시가총액/)).toBe(true);
    expect(screen.queryByText(/20% 단일/)).toBeNull();
  });
});

describe("L-9 — 시총·발행주식총수 hint는 한 장으로 병합됐다", () => {
  it("「(6건)」 제목의 카드가 있다", () => {
    block(JUDGABLE);
    expect(screen.getByText(/시가총액.*발행주식총수.*6건/)).toBeTruthy();
  });

  it("종전 2장 제목(4건·2건)은 없다", () => {
    block(JUDGABLE);
    expect(screen.queryByText(/시가총액 산정 시 포함\/제외 항목 \(4건\)/)).toBeNull();
    expect(screen.queryByText(/발행주식총수 산정 시 포함 항목 \(2건\)/)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────
// C. 총 발행주식수는 §3 단일 소스
// ────────────────────────────────────────────────────────────────

describe("L-4 — §5에는 총 발행주식수 입력칸이 없다", () => {
  it("본인 주식수 모드에서도 §5에 입력칸이 없다", () => {
    block({ ...JUDGABLE, selfShareRatioMode: "shares" });
    expect(inputInFieldCard("총 발행주식수")).toBeNull();
  });

  it("합산 주식수 모드에서도 없다", () => {
    block({
      ...JUDGABLE,
      isLargestShareholderGroup: true,
      combinedShareRatioMode: "shares",
    });
    expect(inputInFieldCard("총 발행주식수")).toBeNull();
  });

  // 긍정 짝 — 필드가 사라진 게 아니라 §3이 유일한 입력 지점이 됐다
  it("L-4b §3에는 「발행주식 총수」 입력칸이 그대로 있다", () => {
    step1({ ...JUDGABLE, selfShareRatioMode: "shares" });
    expect(inputInFieldCard("발행주식 총수")).toBeTruthy();
  });
});

describe("L-5 — §3에서 발행주식 총수를 바꾸면 지분율이 재산출된다", () => {
  function Harness({ onPatch }: { onPatch: (p: Partial<StockTransferFormData>) => void }) {
    const [form, setForm] = React.useState<StockTransferFormData>(
      makeForm({
        ...JUDGABLE,
        selfShareRatioMode: "shares",
        selfOwnedShares: "3000",
        totalIssuedShares: "",
      }),
    );
    return (
      <Step1
        form={form}
        onChange={(patch) => {
          onPatch(patch);
          setForm((prev) => ({ ...prev, ...patch }));
        }}
      />
    );
  }

  it("총수 100,000 입력 → 같은 patch에 selfShareRatio 3.0000 이 실린다", () => {
    const onPatch = vi.fn();
    render(<Harness onPatch={onPatch} />);

    const input = inputInFieldCard("발행주식 총수");
    expect(input).toBeTruthy();
    fireEvent.change(input as HTMLInputElement, { target: { value: "100000" } });

    const patches = onPatch.mock.calls.map((c) => c[0]);
    const withTotal = patches.find((p) => p.totalIssuedShares);
    expect(withTotal).toBeTruthy();
    // 3,000 ÷ 100,000 × 100 = 3.0000%
    expect(withTotal.selfShareRatio).toBe("3.0000");
  });
});

// ────────────────────────────────────────────────────────────────
// D. 대차·PEF — 합산 토글에 갇혀 있지 않다 (D-1)
// ────────────────────────────────────────────────────────────────

describe("L-6 — 대차·사모펀드 입력은 합산 토글 OFF에서도 접근 가능하다", () => {
  it("합산 OFF에서 「대차주식 수」 입력칸이 렌더된다", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: false });
    expect(screen.getByText("대차주식 수")).toBeTruthy();
  });

  it("합산 OFF에서 「사모펀드 간접소유 주식 수」 입력칸이 렌더된다", () => {
    block({ ...JUDGABLE, isLargestShareholderGroup: false });
    expect(screen.getByText("사모펀드 간접소유 주식 수")).toBeTruthy();
  });
});

/**
 * L-10·L-11 — 화면 판정이 엔진과 같은 결론을 낸다 (D-2).
 *
 * 엔진 앵커 `textbook-alignment-augmentation.test.ts:94-108`(PHF-03)이 이미
 * `isLargestShareholderGroup: false` + `lentSharesCount: 600` → `listed_major` 를 검증한다.
 * 화면이 가산을 반영하지 않으면 같은 입력에서 「비대주주」를 보여주고,
 * `stock-classification.ts:170-175`가 상시 mismatchWarning을 낸다.
 */
const PHF03 = {
  marketType: "kosdaq" as const,
  transferDate: "2024-06-01",
  priorYearEndDate: "2023-12-31",
  selfShareRatio: "1.5",
  selfMarketCap: "0",
  totalIssuedShares: "100000",
  lentSharesCount: "600",
  isLargestShareholderGroup: false,
};

describe("L-10 — 대차주식 가산이 화면 판정 배지에 반영된다", () => {
  it("본인 1.5% + 대차 600주(0.6%) = 2.1% ≥ 코스닥 2% → 대주주 배지", () => {
    block(PHF03);
    expect(screen.getByText(/✓ 대주주/)).toBeTruthy();
  });

  it("사모펀드 간접소유도 같다", () => {
    block({ ...PHF03, lentSharesCount: "0", pefIndirectSharesCount: "600" });
    expect(screen.getByText(/✓ 대주주/)).toBeTruthy();
  });
});

describe("L-11 — computeAutoIsMajor가 엔진과 같은 결론을 낸다", () => {
  it("PHF-03 입력에서 true (엔진 taxCategory=listed_major와 일치)", () => {
    expect(computeAutoIsMajor(makeForm(PHF03), {})).toBe(true);
  });

  it("가산이 없으면 false — 1.5% < 2%", () => {
    expect(computeAutoIsMajor(makeForm({ ...PHF03, lentSharesCount: "0" }), {})).toBe(false);
  });
});

/**
 * L-12는 **현행에서도 통과한다** — 현행은 가산 자체를 안 하므로 게이트도 자동으로 지켜진다.
 * 즉 지금은 구별력이 0이고, D-2(가산 반영) 이후에야 의미가 생긴다.
 * 그때 게이트를 빠뜨리면 이 anchor가 유일하게 잡는다.
 */
describe("L-12 — 2013.2.15. 이전 양도는 가산되지 않는다 (게이트 회귀 차단)", () => {
  it("양도일 2013-02-14 + 대차 600주 → 가산 없음", () => {
    // 2013-02-14 시점 코스닥 임계로도 1.5%는 미달이어야 한다.
    expect(
      computeAutoIsMajor(makeForm({ ...PHF03, transferDate: "2013-02-14", priorYearEndDate: "2012-12-31" }), {}),
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// E. 장내/장외는 대주주 판정 섹션이 아니다
// ────────────────────────────────────────────────────────────────

describe("L-7 / L-8 — 거래소 장내 거래 토글은 §5 밖으로 나갔다", () => {
  it("L-7 MajorShareholderBlock 렌더 결과에 없다", () => {
    block(JUDGABLE);
    expect(screen.queryByText(/거래소 장내 거래/)).toBeNull();
  });

  // 긍정 짝 — 지운 게 아니라 별도 섹션으로 옮겼다
  it("L-8 Step1 렌더에는 있다", () => {
    step1(JUDGABLE);
    expect(screen.getByText(/거래소 장내 거래/)).toBeTruthy();
  });

  it("L-8b 대주주 판정 섹션보다 뒤에 온다 (설명문이 판정 결과에 의존하므로)", () => {
    step1(JUDGABLE);
    const major = screen.getByText(/대주주 여부 — 자동 판정/);
    const venue = screen.getByText(/거래소 장내 거래/);
    expect(isBefore(major, venue)).toBe(true);
  });
});
