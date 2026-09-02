/**
 * @vitest-environment jsdom
 *
 * PR-H RTL anchor — UnlistedStockHistoryModal + UnlistedStockV2Card 통합
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-history-lookup.design.md §5.3
 *
 * 검증 대상 (H-16 ~ H-20):
 *   H-16: 모달 open + Dialog 표시
 *   H-17: 후보 카드 클릭 → onSelect + 모달 close
 *   H-18: 선택 후 sourceCalculationId 부착 (배지 표시)
 *   H-19: corpName 수정 시 sourceCalculationId 제거 (mirror-pattern)
 *   H-20: evaluationDate·ownedShares 보존 (Q1 B안 검증)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { UnlistedStockHistoryModal } from "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockHistoryModal";
import type { UnlistedStockCandidate } from "@/lib/calc/unlisted-stock-valuation-lookup";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

afterEach(() => cleanup());

// ============================================================
// 사례 6 fixture
// ============================================================

const case6Input: UnlistedStockValuationInput = {
  corpName: "㈜향기",
  businessStartDate: new Date("2000-01-01"),
  evaluationDate: new Date("2024-01-20"),
  faceValuePerShare: 5_000,
  totalShares: 50_000,
  ownedShares: 26_000,
  isRealEstateHeavy: false,
  fiscalYears: [
    { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31"), taxableIncome: 76_842_660 },
    { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31"), taxableIncome: 62_416_500 },
    { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31"), taxableIncome: -5_311_910 },
  ],
  capitalChanges: [],
  netAssetValueRaw: {
    bsTotalAssets: 2_476_889_520, assetValuationDelta: 91_548_350,
    corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
    prepaidExpenses: 65_400_500, preGiftRetainedEarnings: 0,
    bsTotalLiabilities: 1_833_780_000, corporateTaxPayable: 32_627_890,
    farmingSurtax: 0, localIncomeTax: 3_262_780, dividendPayable: 0,
    retirementProvision: 445_785_000, otherProvision: 0,
    reserveExcluded: 0, allowanceExcluded: 301_770_000, deferredTaxAdjustment: 0,
  },
  isContinuousLossLastThreeYears: false,
  capitalizationRate: 0.10,
  isMaxShareholder: true,
  companySize: "large",
};

// calculationRepository.list() 모킹 — IndexedDB 미사용
// vi.hoisted로 case6Input 참조 가능 (hoisting issue 회피)
const mockRecords = vi.hoisted(() => [
  {
    id: "rec-1",
    userId: "local-user",
    taxType: "inheritance" as const,
    title: "㈜향기 평가",
    inputData: {
      estateItems: [
        {
          id: "item-1",
          category: "unlisted_stock",
          unlistedStockValuationV2: {
            corpName: "㈜향기",
            businessStartDate: new Date("2000-01-01").toISOString(),
            evaluationDate: new Date("2024-01-20").toISOString(),
            faceValuePerShare: 5_000,
            totalShares: 50_000,
            ownedShares: 26_000,
            isRealEstateHeavy: false,
            fiscalYears: [
              { fiscalYearLabel: "2023", fiscalYearEndDate: new Date("2023-12-31").toISOString(), taxableIncome: 76_842_660 },
              { fiscalYearLabel: "2022", fiscalYearEndDate: new Date("2022-12-31").toISOString(), taxableIncome: 62_416_500 },
              { fiscalYearLabel: "2021", fiscalYearEndDate: new Date("2021-12-31").toISOString(), taxableIncome: -5_311_910 },
            ],
            capitalChanges: [],
            netAssetValueRaw: {
              bsTotalAssets: 2_476_889_520, assetValuationDelta: 91_548_350,
              corpTaxReservedAmount: 0, paidInCapitalIncrease: 0, otherEarnedRights: 0,
              prepaidExpenses: 65_400_500, preGiftRetainedEarnings: 0,
              bsTotalLiabilities: 1_833_780_000, corporateTaxPayable: 32_627_890,
              farmingSurtax: 0, localIncomeTax: 3_262_780, dividendPayable: 0,
              retirementProvision: 445_785_000, otherProvision: 0,
              reserveExcluded: 0, allowanceExcluded: 301_770_000, deferredTaxAdjustment: 0,
            },
            isContinuousLossLastThreeYears: false,
            capitalizationRate: 0.10,
            isMaxShareholder: true,
            companySize: "large",
          },
        },
      ],
    },
    resultData: {
      estateValuations: [
        {
          estateItemId: "item-1",
          method: "book_value",
          valuatedAmount: 340_392_000,
          breakdown: [{ label: "1주당 평가액 ⑥", value: 10_910 }],
        },
      ],
    },
    taxLawVersion: "2024-01-01",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2024-01-21T00:00:00.000Z",
    updatedAt: "2024-01-21T00:00:00.000Z",
  },
]);

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    list: vi.fn().mockResolvedValue(mockRecords),
  },
}));

// ============================================================
// H-16: 모달 open + Dialog 표시
// ============================================================

describe("[H-16] 모달 open + Dialog 표시", () => {
  it("open=true 시 Dialog 마운트", async () => {
    const onSelect = vi.fn();
    render(
      <UnlistedStockHistoryModal
        open={true}
        onOpenChange={() => {}}
        currentCorpName="㈜향기"
        currentClientId={null}
        excludeCalculationIds={[]}
        onSelect={onSelect}
      />,
    );
    // 비동기 records 로드 대기
    await screen.findByTestId("same-corp-section");
    expect(screen.getByTestId("unlisted-stock-history-modal")).toBeInTheDocument();
    expect(screen.getByText(/비상장주식 평가 이력 조회/)).toBeInTheDocument();
  });
});

// ============================================================
// H-17: 후보 카드 클릭 → onSelect + 모달 close
// ============================================================

describe("[H-17] 후보 카드 클릭 → onSelect + 모달 close", () => {
  it("카드 클릭 시 onSelect 호출 + onOpenChange(false)", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UnlistedStockHistoryModal
        open={true}
        onOpenChange={onOpenChange}
        currentCorpName="㈜향기"
        currentClientId={null}
        excludeCalculationIds={[]}
        onSelect={onSelect}
      />,
    );
    await screen.findByTestId("same-corp-section");
    const card = await screen.findByTestId("candidate-card-rec-1-item-1");
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    // partial input에 법인 정보 포함, evaluationDate·ownedShares·isMaxShareholder 미포함
    const [partial, sourceId] = onSelect.mock.calls[0];
    expect(partial.corpName).toBe("㈜향기");
    expect(partial.evaluationDate).toBeUndefined();
    expect(partial.ownedShares).toBeUndefined();
    expect(partial.isMaxShareholder).toBeUndefined();
    expect(sourceId).toBe("rec-1-item-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

// ============================================================
// H-18·H-19·H-20: UnlistedStockV2Card 통합 (선택 후 배지·수정 시 제거·필드 보존)
// ============================================================

describe("[H-18·H-19·H-20] UnlistedStockV2Card 통합 — sourceCalculationId 배지·mirror·필드 보존", () => {
  it("H-18: 카드 클릭 후 sourceCalculationId 배지 표시", async () => {
    const { UnlistedStockV2Card, createDefaultUnlistedStockV2 } = await import(
      "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card"
    );
    let currentInput = createDefaultUnlistedStockV2();
    const handleChange = vi.fn((next: UnlistedStockValuationInput) => {
      currentInput = next;
    });
    const { rerender } = render(
      <UnlistedStockV2Card input={currentInput} onChange={handleChange} />,
    );
    // 이력 조회 버튼 클릭
    fireEvent.click(screen.getByTestId("open-unlisted-stock-history-modal"));
    await screen.findByTestId("same-corp-section");
    // 후보 카드 클릭 → onSelect 호출
    fireEvent.click(await screen.findByTestId("candidate-card-rec-1-item-1"));
    // onChange 호출 후 input 갱신 — rerender로 반영
    rerender(<UnlistedStockV2Card input={currentInput} onChange={handleChange} />);
    // sourceCalculationId 배지 표시
    expect(await screen.findByTestId("source-calculation-id-badge")).toBeInTheDocument();
    // ⚠️ 이 it은 describe의 **첫 테스트라 `UnlistedStockV2Card`의 동적 import 비용을 혼자
    //    부담**한다. 실측(2026-09-02): H-18 5.4s / H-19 2.0s / H-20 0.6s — 뒤 둘은 모듈
    //    캐시를 재사용한다. 병렬 부하가 얹히면 기본 5s를 넘겨 **순수 master에서도 3/3 실패**해
    //    pre-push 전체를 막았다(18,761 통과 / 이 1건 실패).
    //    e9a58680이 findBy*로 async 대기는 이미 붙였으나 «렌더 자체가 5s를 넘는» 축은 남아
    //    있었다 — 같은 커밋이 mixed-use 중부하 anchor에 쓴 처방(timeout 15000)을 그대로 적용한다.
    //    단언은 그대로이므로 검증력은 줄지 않는다.
  }, 15000);

  it("H-19: corpName 수정 시 sourceCalculationId 배지 제거 (mirror-pattern)", async () => {
    const { UnlistedStockV2Card, createDefaultUnlistedStockV2 } = await import(
      "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card"
    );
    let currentInput = createDefaultUnlistedStockV2();
    const handleChange = vi.fn((next: UnlistedStockValuationInput) => {
      currentInput = next;
    });
    const { rerender } = render(
      <UnlistedStockV2Card input={currentInput} onChange={handleChange} />,
    );
    // 이력 조회 → 선택
    fireEvent.click(screen.getByTestId("open-unlisted-stock-history-modal"));
    await screen.findByTestId("same-corp-section");
    fireEvent.click(await screen.findByTestId("candidate-card-rec-1-item-1"));
    rerender(<UnlistedStockV2Card input={currentInput} onChange={handleChange} />);
    expect(await screen.findByTestId("source-calculation-id-badge")).toBeInTheDocument();

    // UI 통한 corpName 변경 (CorporateInfoSection의 unlisted-v2-corp-name input)
    // wrappedOnChange 트리거 → sourceCalculationId 자동 제거
    const corpNameInput = screen.getByTestId("unlisted-v2-corp-name");
    fireEvent.change(corpNameInput, { target: { value: "다른법인" } });
    rerender(<UnlistedStockV2Card input={currentInput} onChange={handleChange} />);
    await waitFor(() =>
      expect(screen.queryByTestId("source-calculation-id-badge")).not.toBeInTheDocument(),
    );
  });

  it("H-20: Q1 B안 — evaluationDate·ownedShares·isMaxShareholder는 사용자 입력 보존", async () => {
    const { UnlistedStockV2Card, createDefaultUnlistedStockV2 } = await import(
      "@/components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card"
    );
    const initialEvalDate = new Date("2025-06-30");
    const baseInput: UnlistedStockValuationInput = {
      ...createDefaultUnlistedStockV2(),
      evaluationDate: initialEvalDate,
      ownedShares: 12_345,
      isMaxShareholder: false,
    };
    let currentInput = baseInput;
    const handleChange = vi.fn((next: UnlistedStockValuationInput) => {
      currentInput = next;
    });
    render(<UnlistedStockV2Card input={currentInput} onChange={handleChange} />);
    // 이력 조회 → 선택
    fireEvent.click(screen.getByTestId("open-unlisted-stock-history-modal"));
    await screen.findByTestId("same-corp-section");
    fireEvent.click(await screen.findByTestId("candidate-card-rec-1-item-1"));

    // 호출된 onChange의 args 검증
    const lastCall = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    // 보존 필드 — 사용자 입력 그대로
    expect(lastCall.evaluationDate).toEqual(initialEvalDate);
    expect(lastCall.ownedShares).toBe(12_345);
    expect(lastCall.isMaxShareholder).toBe(false);
    // 자동 채움 필드 — 사례 6 값
    expect(lastCall.corpName).toBe("㈜향기");
    expect(lastCall.faceValuePerShare).toBe(5_000);
    expect(lastCall.totalShares).toBe(50_000);
  });
});
