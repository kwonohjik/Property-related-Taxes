/** @vitest-environment jsdom */
/**
 * 「판정 불러오기」 모달 인계 → Step1 화면 모드(`splitMode`) 초기화
 *
 * 결함: 모달은 이동·재마운트가 없어 Step1의 `splitMode`(useState)가 인계 전 값으로 남았다.
 * 축 B(지분 분할) 2장 상태에서 자산 1건 판정을 불러오면 폼은 단건인데 화면은 지분 분할 모드라
 * 「‘지분별 취득’ 모드와 동시에 사용할 수 없습니다」·함께 양도 토글 막힘·「총 양도가액」 칸이 남고,
 * 그 상태에서 가격을 고치면 `contractTotalPrice`와 `assets[0].actualSalePrice`가 갈라졌다.
 * 또 `toTransferFormPatch`가 `assetSplitMode`를 비우지 않아 직전 묶음의 선택이 새 폼에 남았다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { Step1 } from "@/app/calc/transfer-tax/steps/Step1";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import type { CalculationRecord } from "@/lib/storage/types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

const records = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: {
    list: vi.fn(async () => records.value),
    get: vi.fn(async () => null),
  },
}));

const COMPANION = "같은 날 다른 부동산도 함께 파셨나요?";
const DISABLED = /‘지분별 취득’ 모드와 동시에 사용할 수 없습니다/;

function judgmentForm() {
  const j = createInitialOneHouseJudgmentForm();
  j.transferDate = "2026-03-01";
  j.contractTotalPrice = "900000000";
  j.assets = [{ ...j.assets[0], assetKind: "housing", addressJibun: "판정 주택", acquisitionDate: "2016-01-01" }];
  return j;
}
function record(): CalculationRecord {
  return {
    id: "ohh-1",
    userId: "u1",
    taxType: "one_house_exemption",
    title: "1세대1주택 판정 — 판정 주택 (양도예정 2026-03-01)",
    inputData: judgmentForm(),
    resultData: { judgment: { isExempt: true, isPartialExempt: false, pending: [] } },
    taxLawVersion: "2026-03-01",
    linkedCalculationId: null,
    clientId: null,
    inputHash: "h1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-21T01:00:00.000Z",
  } as unknown as CalculationRecord;
}

const half = (n: number): AssetForm =>
  ({ ...makeDefaultAsset(n), ownershipNumerator: "50", ownershipDenominator: "100" }) as AssetForm;
const full = (n: number): AssetForm =>
  ({ ...makeDefaultAsset(n), ownershipNumerator: "100", ownershipDenominator: "100" }) as AssetForm;

/** 실제 스토어를 Step1에 물린다 — 모달이 쓰는 `useCalcWizardStore.updateFormData` 경로 그대로. */
function Host() {
  const formData = useCalcWizardStore((s) => s.formData);
  const updateFormData = useCalcWizardStore((s) => s.updateFormData);
  return <Step1 form={formData} onChange={(p: Partial<TransferFormData>) => updateFormData(p)} />;
}

function switchOf(title: string): HTMLElement {
  let el: HTMLElement | null = screen.getByText(title);
  while (el && !el.querySelector('[role="switch"]')) el = el.parentElement;
  return el!.querySelector('[role="switch"]') as HTMLElement;
}

async function loadJudgment() {
  fireEvent.click(screen.getByTestId("open-one-house-judgment-load"));
  fireEvent.click(await screen.findByTestId("load-judgment-ohh-1"));
  await waitFor(() => expect(screen.queryByTestId("one-house-judgment-load-modal")).toBeNull());
}

beforeEach(() => {
  records.value = [record()];
  useCalcWizardStore.getState().reset();
});
afterEach(cleanup);

describe("모달 인계 후 Step1 화면 모드", { timeout: 30_000 }, () => {
  it("[SM-1] 축 B 2장 → 인계(자산 1건) → 단건 모드(지분 모드 경고·총 양도가액 칸 없음, 함께 양도 토글 사용 가능)", async () => {
    useCalcWizardStore.getState().updateFormData({
      transferDate: "2026-02-16",
      assetSplitMode: "fractional",
      assets: [half(1), half(2)],
      contractTotalPrice: "700000000",
    });
    render(<Host />);
    // 전제: 인계 전에는 실제로 축 B 화면이다.
    expect(screen.queryByText(DISABLED)).not.toBeNull();
    expect(screen.queryAllByText("총 양도가액").length).toBeGreaterThan(0);

    await loadJudgment();

    const f = useCalcWizardStore.getState().formData;
    expect(f.assets).toHaveLength(1);
    expect(f.assetSplitMode).toBeUndefined();
    expect(screen.queryByText(DISABLED)).toBeNull();
    expect(screen.queryAllByText("총 양도가액")).toHaveLength(0);
    const sw = switchOf(COMPANION);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.hasAttribute("disabled") || sw.getAttribute("aria-disabled") === "true").toBe(false);
  });

  it("[SM-2] 인계 후 양도가액을 고치면 contractTotalPrice와 assets[0].actualSalePrice가 같은 값이다", async () => {
    useCalcWizardStore.getState().updateFormData({
      transferDate: "2026-02-16",
      assetSplitMode: "fractional",
      assets: [half(1), half(2)],
      contractTotalPrice: "700000000",
    });
    render(<Host />);
    await loadJudgment();

    const holder = screen.getByTestId("companion-actual-sale-price");
    const input = (holder.tagName === "INPUT" ? holder : holder.querySelector("input")) as HTMLInputElement;
    expect(input.value.replace(/,/g, "")).toBe("900000000");
    act(() => {
      fireEvent.change(input, { target: { value: "1000000000" } });
    });
    const f = useCalcWizardStore.getState().formData;
    expect(f.assets[0].actualSalePrice).toBe("1000000000");
    expect(f.contractTotalPrice).toBe("1000000000");
  });

  it("[SM-3] 함께 양도(companion) 2건 상태에서 인계해도 단건 모드로 돌아온다", async () => {
    useCalcWizardStore.getState().updateFormData({
      transferDate: "2026-02-16",
      assetSplitMode: "companion",
      assets: [full(1), full(2)],
    });
    render(<Host />);
    expect(switchOf(COMPANION).getAttribute("aria-checked")).toBe("true");

    await loadJudgment();

    expect(useCalcWizardStore.getState().formData.assets).toHaveLength(1);
    expect(switchOf(COMPANION).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(DISABLED)).toBeNull();
  });
});

describe("인계 patch의 자산 분할 모드", () => {
  it("[SM-4] toTransferFormPatch는 assetSplitMode 키를 undefined로 실어 직전 선택을 비운다", () => {
    const p = toTransferFormPatch(judgmentForm());
    expect("assetSplitMode" in p).toBe(true);
    expect(p.assetSplitMode).toBeUndefined();
  });

  it("[SM-5] 스토어에 쓰면 직전 묶음의 assetSplitMode가 사라진다(얕은 병합)", () => {
    useCalcWizardStore.getState().updateFormData({ assetSplitMode: "fractional", assets: [half(1), half(2)] });
    useCalcWizardStore.getState().updateFormData(toTransferFormPatch(judgmentForm()));
    expect(useCalcWizardStore.getState().formData.assetSplitMode).toBeUndefined();
  });
});
