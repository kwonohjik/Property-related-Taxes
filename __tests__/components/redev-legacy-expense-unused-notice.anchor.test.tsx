/**
 * anchor — 재개발·재건축 자산(§166) 옛 필요경비 칸의 ⑤ 안내 (계획서 `docs/02-design/features/redev-transfer-expense-residual.plan.md` Q-1 a).
 * ⑤ 안내와 ⑧ 차단은 같은 술어·같은 문장을 읽는다(`redev-legacy-expense-unused.ts`). ⑧ 격자는 `__tests__/calc/redev-legacy-expense-unused.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { redevLegacyExpenseUnusedMessage } from "@/lib/calc/redev-legacy-expense-unused";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const apt = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1", assetKind: "redevelopment_apt", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
    redevSubject: "apt", redevOriginalAssetType: "housing", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-05-01",
    redevSettlementDirection: "pay", redevRightsValue: "500000000", redevSettlementAmount: "80000000", redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "300000000", actualSalePrice: "700000000", directExpenses: "7000000", ...over,
  }) as AssetForm;
const renderExpense = (a: AssetForm) =>
  render(<AssetSectionExpense asset={a} onChange={() => {}} totalTransferExpense="" isSingleAsset isNonPrimaryAsset={false} />);
const notice = () => screen.queryByTestId("redev-legacy-expense-unused-notice");
const legacyField = () => document.querySelector('[data-field="directExpenses"]');

describe("RL-1 ⑤ 안내 ≡ ⑧ 문장", () => {
  it("원조합원 실가 — 안내가 옛 칸 위에 뜨고 「인가전 분 필요경비」를 지목한다", () => {
    const a = apt();
    renderExpense(a);
    expect(notice()?.textContent).toBe(redevLegacyExpenseUnusedMessage(a));
    expect(notice()?.textContent).toContain("「인가전 분 필요경비」");
    expect(legacyField()).not.toBeNull();
  });

  it("원조합원 환산 — 인가 전 분 칸이 없으므로 지목하지 않는다", () => {
    const a = apt({ useEstimatedAcquisition: true, redevAcquisitionMethod: "estimated", redevActualAcquisitionPrice: "" });
    renderExpense(a);
    expect(notice()?.textContent).toBe(redevLegacyExpenseUnusedMessage(a));
    expect(notice()?.textContent).not.toContain("「인가전 분 필요경비」");
  });

  it("입주권도 같다", () => {
    const a = apt({ assetKind: "right_to_move_in", redevSubject: "right" });
    renderExpense(a);
    expect(notice()?.textContent).toBe(redevLegacyExpenseUnusedMessage(a));
  });
});

describe("RL-2 안내가 없는 경우", () => {
  it("승계 입주권 — 옛 칸이 쓰이므로 칸만 있고 안내는 없다", () => {
    renderExpense(apt({ assetKind: "right_to_move_in", redevSubject: "right", isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes" }));
    expect(notice()).toBeNull();
    expect(legacyField()).not.toBeNull();
  });

  it("옛 칸이 0이면 칸도 안내도 없다", () => {
    renderExpense(apt({ directExpenses: "0" }));
    expect(notice()).toBeNull();
    expect(legacyField()).toBeNull();
  });

  it("자본적지출 칸에 값이 있으면 옛 칸이 숨고 안내도 없다", () => {
    renderExpense(apt({ capitalExpenditure: "1000000" }));
    expect(notice()).toBeNull();
    expect(legacyField()).toBeNull();
  });
});
