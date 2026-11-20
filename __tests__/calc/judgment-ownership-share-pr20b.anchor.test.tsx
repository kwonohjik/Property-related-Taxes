/**
 * PR-20b anchor (결정 Q-24 · 2026-11 리뷰 D-48) — 판정 메뉴 「공동명의(지분)」 토글·지분율 칸 → 계산기 넘기기까지 지분 전달.
 *
 * 시료: 1세대 1주택 · 서울 마포(비조정 취급 — 판정 토글 false) · 취득 2018-01-01 · 양도 2026-02-16 · 주택 전체 14억 · 본인 50%.
 * - 판정은 주택 전체 가액(§156① 타인 소유부분 포함)이라 지분과 무관하게 같은 결론(고가주택 부분 비과세).
 * - 종전: 넘기기가 늘 100%로 넘어가 계산기가 주택 전체 세액을 냈다(⑧ 차단 없음). 이제 지분·「나머지 지분은 타인 소유」 선언이 함께 넘어가
 *   계산기에 직접 50%를 넣은 것과 같은 세액이다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { runJudgment, handoff } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { judgmentOwnershipShareError, judgmentOwnershipSharePatch } from "@/lib/calc/judgment-ownership-share";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import { JudgmentOwnershipShareField } from "@/app/calc/one-house-exemption/steps/JudgmentOwnershipShareField";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(cleanup);

const jForm = (share?: string) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2018-01-01",
        residenceInputMode: "direct",
        residencePeriods: [],
        residencePeriodMonthsAsset: "0",
        ...(share !== undefined ? { ...judgmentOwnershipSharePatch(true), ownershipNumerator: share } : {}),
      },
    ],
    transferDate: "2026-02-16",
    contractTotalPrice: "1400000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [],
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

describe("⑧ 지분율", () => {
  it("켰는데 비었거나 100%면 막고 · 50%는 통과 · 끄면 묻지 않는다", () => {
    const a = (over: Partial<AssetForm>) => ({ ...judgmentOwnershipSharePatch(true), ...over });
    expect(judgmentOwnershipShareError(a({}))).toContain("지분율");
    expect(judgmentOwnershipShareError(a({ ownershipNumerator: "100" }))).toContain("100% 미만");
    expect(judgmentOwnershipShareError(a({ ownershipNumerator: "50" }))).toBeNull();
    expect(judgmentOwnershipShareError(judgmentOwnershipSharePatch(false))).toBeNull();
    expect(validateStep3(jForm("")).map((e) => e.field)).toContain("ownershipNumerator");
    expect(validateStep3(jForm("50")).map((e) => e.field)).not.toContain("ownershipNumerator");
  });
});

describe("⑤ 토글", () => {
  it("켜면 선언 + 지분율 칸 · 끄면 100%로 되돌린다", () => {
    const onChange = vi.fn();
    const asset = jForm().assets[0];
    const r = render(<JudgmentOwnershipShareField asset={asset} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith({ ownershipRemainderThirdParty: "yes", ownershipNumerator: "", ownershipDenominator: "100" });
    r.unmount();
    const on = render(<JudgmentOwnershipShareField asset={jForm("50").assets[0]} onChange={onChange} />);
    expect(on.container.textContent).toContain("본인 지분율");
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenLastCalledWith({ ownershipRemainderThirdParty: "", ownershipNumerator: "100", ownershipDenominator: "100" });
  });
});

describe("판정 불변 · 넘기기 지분 전달", () => {
  it("판정은 지분과 무관하게 같다(주택 전체 가액)", async () => {
    const whole = await runJudgment(jForm());
    const half = await runJudgment(jForm("50"));
    expect(half.status).toBe(200);
    expect([half.data.judgment.isExempt, half.data.judgment.isPartialExempt]).toEqual([
      whole.data.judgment.isExempt,
      whole.data.judgment.isPartialExempt,
    ]);
  });
  it("넘긴 계산기 = 계산기에 직접 50%를 넣은 값 ≠ 100%", async () => {
    const acq = { fixedAcquisitionPrice: "700000000" };
    const viaHandoff = handoff(jForm("50"));
    Object.assign(viaHandoff.assets[0], acq);
    expect(viaHandoff.assets[0]).toMatchObject({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    const manual = handoff(jForm());
    Object.assign(manual.assets[0], acq, { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
    const full = handoff(jForm());
    Object.assign(full.assets[0], acq);
    const [h, m, f] = await Promise.all([runCalc(viaHandoff), runCalc(manual), runCalc(full)]);
    expect(h.status).toBe(200);
    expect(h.totalTax).toBe(m.totalTax);
    expect(h.totalTax).toBeLessThan(f.totalTax);
  });
});
