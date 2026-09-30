/**
 * anchor: 겸용주택 결과뷰에 **조특법 주택 수 제외 카드**가 뜬다 (§99의4·§98의9·보유 감면주택)
 *
 * ## 무엇이 없었나
 *
 * 겸용 엔진은 D4-02부터 주택 수 제외를 판정하고 detail을 결과 **최상위**(`breakdown.new994Detail`·
 * `houseCountExclusionDetails`·`specialHouseExclusionDetail`)에 싣는다. 그런데 결과뷰는 감면 카드에
 * `total.reductionDetails`(세액감면형 7종 부분집합)만 넘겨, 세액은 맞는데 화면에서
 *   · 어느 주택을 뺐는지(「보유 주택 N」)
 *   · 요건 미달이면 왜 안 빠졌는지(적용 불가 사유)
 *   · 농어촌주택 3년 미만 양도의 추징 경고(조특법 §99의4⑥)
 * 가 전부 사라졌다. 단건 결과뷰(`TransferTaxResultView`)는 같은 카드를 모두 그린다.
 *
 * 계획서 `docs/00-pm/transfer-calc-count-exclusion-row-link.plan.md` §7-3 후속.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_DATE } from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

/** §99의4 농어촌주택 — 겸용주택보다 뒤에 취득(취득순서 요건 성립) · 양도일(2022-02-16)까지 3년 미만 보유 */
const RURAL = {
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: new Date("2020-05-01"),
  ruralHouseStdPrice: 200_000_000,
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
  houseId: "r",
};

const SPECIAL = {
  article: "unsold_98_7",
  houseAcquisitionDate: new Date("2012-10-15"),
  requirementsConfirmed: true,
  houseId: "s",
};

function run(over: Partial<MixedUseAssetInput> = {}) {
  return calcMixedUseTransferTax(
    1_000_000_000,
    CASE14_TRANSFER_DATE,
    {
      ...mixedUseCase14(),
      isOneHouseExempt: false,
      isOneHousehold: true,
      householdHousingCountForExclusion: 2,
      ...over,
    } as MixedUseAssetInput,
    makeMockRates(),
  );
}

function formData(): TransferFormData {
  return {
    transferDate: "2022-02-16",
    contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), isMixedUseHouse: true }],
    houses: [
      { id: "s", acquisitionDate: "2012-10-15" },
      { id: "r", acquisitionDate: "2020-05-01" },
    ],
  } as unknown as TransferFormData;
}

const rural = (over: object = {}) =>
  run({ reductions: [{ ...RURAL, ...over }] as MixedUseAssetInput["reductions"] });

// ── M-0 구별력 — 엔진이 detail을 실제로 싣는다(없으면 아래 단언은 아무것도 구별하지 못한다) ──
describe("MXC-0 격자", () => {
  it("§99의4 선언 → 결과 최상위에 행 id를 가진 detail이 있고, 감면 detail 묶음에는 없다", () => {
    const b = rural();
    expect(b.houseCountExclusionDetails?.map((d) => [d.id, d.isEligible, d.houseId])).toEqual([
      ["new_99_4_rural", true, "r"],
    ]);
    expect(b.new994Detail && "clawbackWarning" in b.new994Detail && b.new994Detail.clawbackWarning).toBe(true);
    expect(b.total.reductionDetails).not.toHaveProperty("new994Detail");
  });
});

describe("MXC-1 겸용 결과뷰 — 조특법 주택 수 제외 카드", () => {
  it("🔴 §99의4 카드가 뜨고 「보유 주택 N (취득일)」과 §99의4⑥ 추징 경고를 보인다", () => {
    const { container } = render(<MixedUseResultCard breakdown={rural()} formData={formData()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("§99의4 — 농어촌주택 소유주택 제외");
    expect(screen.getByTestId("count-exclusion-house-ref").textContent).toBe(
      "대상: 보유 주택 2 (2020-05-01 취득)",
    );
    expect(text).toContain("§99의4⑥");
  });

  it("🔴 요건 미달이면 「적용 불가」와 사유를 보인다", () => {
    // 농어촌주택을 겸용주택보다 먼저 취득 → §99의4① 취득순서 요건 불충족(D4-02-4)
    const b = rural({ ruralHouseAcquisitionDate: new Date("1990-01-01") });
    expect(b.new994Detail?.isEligible).toBe(false);
    const { container } = render(<MixedUseResultCard breakdown={b} formData={formData()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("§99의4 — 농어촌주택 소유주택 제외 — 적용 불가");
    expect(text).toContain("적용 불가 사유");
  });

  it("🔴 보유 감면주택 카드가 행마다 「보유 주택 N」을 붙인다", () => {
    const b = run({ specialHouseExclusions: [SPECIAL] as MixedUseAssetInput["specialHouseExclusions"] });
    expect(b.specialHouseExclusionDetail?.excludedCount).toBe(1);
    const { container } = render(<MixedUseResultCard breakdown={b} formData={formData()} />);
    expect(container.textContent ?? "").toContain("조특법 감면주택 보유 — 주택수 제외");
    expect(screen.getByTestId("count-exclusion-house-ref").textContent).toContain(
      "보유 주택 1 (2012-10-15 취득)",
    );
  });

  it("짝 — 명부를 모르면(formData 없음) 카드는 뜨되 「보유 주택 N」은 생략한다", () => {
    const { container } = render(<MixedUseResultCard breakdown={rural()} />);
    expect(container.textContent ?? "").toContain("§99의4 — 농어촌주택 소유주택 제외");
    expect(screen.queryByTestId("count-exclusion-house-ref")).toBeNull();
  });

  it("대조군 — 선언이 없으면 카드가 없다", () => {
    const { container } = render(<MixedUseResultCard breakdown={run()} formData={formData()} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("§99의4 — 농어촌주택");
    expect(text).not.toContain("조특법 감면주택 보유 — 주택수 제외");
  });
});
