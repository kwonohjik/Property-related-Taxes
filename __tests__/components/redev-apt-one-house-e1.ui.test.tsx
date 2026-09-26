/**
 * @vitest-environment jsdom
 *
 * E1 anchor(⑤ · ⑦) — 재개발 완공APT 1세대1주택 화면 (OH-20 · OH-44 · OH-48 · OH-50 · OH-51 · OH-63)
 *
 * 실제 컴포넌트(`Step4` · `RedevelopmentDetailCard`)를 렌더한다. 결과 카드는 엔진 결과를 그대로 넣는다 —
 * 재개발 결과는 단건 뷰(`TransferTaxResultView`)에서만 이 카드로 렌더된다(다건·일괄·겸용은 §166 미지원).
 *
 * 근거: 소득세법 시행령 §154① 단서(자산 종류 무관) · §162①4호(승계조합원 취득시기 = 사용승인서 교부일) ·
 * 서면-2019-부동산-4508 · 소득세법 §89①3호 괄호(고가주택 기준 — 양도일 기준 9억/12억, `one-house/threshold.ts`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Asset = TransferFormData["assets"][number];

function form(asset: Partial<Asset>, over: Partial<TransferFormData> = {}): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    transferDate: "2023-03-01",
    assets: base.assets.map((a, i) => (i === 0 ? { ...a, ...asset } : a)),
    isOneHousehold: true,
    householdHousingCount: "1",
    ...over,
  };
}

const SUCCESSOR: Partial<Asset> = {
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  acquisitionDate: "2017-03-01",
  redevApprovalDate: "2016-05-01",
  redevIsSuccessorMember: "yes",
  redevCompletionDate: "2020-06-30",
};
const ORIGINAL: Partial<Asset> = {
  assetKind: "redevelopment_apt",
  redevSubject: "apt",
  acquisitionDate: "2018-01-10",
  redevApprovalDate: "2019-06-01",
  redevIsSuccessorMember: "no",
};

const PROVISO_CARD = /§154① 단서 — 보유·거주 요건 면제 사유/;
const RESIDENCE_INPUT = "거주 기간 입력";

describe("OH-20 ⑤ — 재개발 완공APT에 §154① 단서 카드가 열린다", () => {
  it("🔑 승계조합원 완공APT — 카드 렌더 (종전 0벌)", () => {
    render(<Step4 form={form(SUCCESSOR)} onChange={() => {}} />);
    expect(screen.queryAllByText(PROVISO_CARD).length).toBe(1);
  });

  it("부정 짝 — 조합원입주권(§89①4호 축)은 렌더하지 않는다", () => {
    render(
      <Step4
        form={form({ assetKind: "right_to_move_in", redevSubject: "right", acquisitionDate: "2017-03-01" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryAllByText(PROVISO_CARD).length).toBe(0);
  });
});

describe("OH-48 ⑤ — 분리 입력이 있으면 Step4 거주 입력 대신 안내", () => {
  it("🔑 원조합원 + 종전주택 거주 분리 입력 → 안내만, 입력칸 없음", () => {
    render(<Step4 form={form({ ...ORIGINAL, redevPriorHouseResidenceMonths: "30" })} onChange={() => {}} />);
    expect(screen.queryByTestId("redev-split-residence-notice")).not.toBeNull();
    expect(screen.queryAllByText(RESIDENCE_INPUT).length).toBe(0);
  });

  it("짝 — 분리 입력이 없으면 Step4 거주 입력이 그대로 (엔진 fallback 경로)", () => {
    render(<Step4 form={form(ORIGINAL)} onChange={() => {}} />);
    expect(screen.queryByTestId("redev-split-residence-notice")).toBeNull();
    expect(screen.queryAllByText(RESIDENCE_INPUT).length).toBe(1);
  });
});

describe("OH-50 ⑤ — 승계조합원 개월 수 직접 입력 안내", () => {
  it("🔑 승계조합원 + direct 모드 → 「준공일 이후 거주만」 안내", () => {
    render(<Step4 form={form({ ...SUCCESSOR, residenceInputMode: "direct" })} onChange={() => {}} />);
    expect(screen.getByTestId("successor-residence-direct-hint").textContent).toContain("2020-06-30");
  });

  it("짝 — 원조합원에는 뜨지 않는다", () => {
    render(<Step4 form={form({ ...ORIGINAL, residenceInputMode: "direct" })} onChange={() => {}} />);
    expect(screen.queryByTestId("successor-residence-direct-hint")).toBeNull();
  });
});

describe("OH-51 ⑤ — 승계조합원 「취득 당시」 조정대상지역은 준공일로 판별한다", () => {
  function stubRegulatedArea() {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return {
          ok: true,
          json: async () => ({
            isRegulatedAtTransfer: false,
            wasRegulatedAtAcquisition: true,
            transferBasis: "t",
            acquisitionBasis: "a",
            confidence: "high",
          }),
        } as unknown as Response;
      }),
    );
    return bodies;
  }

  it("🔑 자동판별 요청의 기준일 = 준공일 · 토글 라벨 「준공일 기준」 (종전 입주권 취득일)", async () => {
    const bodies = stubRegulatedArea();
    render(<Step4 form={form({ ...SUCCESSOR, regionCode: "4113310100" })} onChange={() => {}} />);
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies[0].acquisitionDate).toBe("2020-06-30");
    expect(screen.queryAllByText("준공일 기준 조정대상지역").length).toBe(1);
  });

  it("짝 — 원조합원은 종전주택 취득일 그대로", async () => {
    const bodies = stubRegulatedArea();
    render(<Step4 form={form({ ...ORIGINAL, regionCode: "4113310100" })} onChange={() => {}} />);
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies[0].acquisitionDate).toBe("2018-01-10");
    expect(screen.queryAllByText("취득일 기준 조정대상지역").length).toBe(1);
  });
});

// ── ⑦ 결과 카드 ──────────────────────────────────────────────────────────────

const rates = makeMockRates();

/** E3-01 fixture — 종전주택 2007 취득 · 인가 2013 · 청산금 1억 납부 · 거주 66개월 · 1세대1주택. */
function redevResult(price: number, transferDate: string, over: Partial<TransferTaxInput> = {}) {
  const redevelopment: RedevelopmentInfo = {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 600_000_000,
    settlementDirection: "pay",
    settlementAmount: 100_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
  };
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: price,
      transferDate: new Date(transferDate),
      acquisitionDate: new Date("2007-04-09"),
      acquisitionPrice: 450_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 66,
      redevelopment,
      ...over,
    }),
    rates,
  );
}

describe("OH-44 ⑦ — 전액 비과세 완공APT에 「전체 과세」가 함께 뜨지 않는다", () => {
  it("🔑 10억 · 1세대1주택 비과세 → 비과세 박스만, 「전체 과세」 없음", () => {
    const r = redevResult(1_000_000_000, "2023-02-16");
    expect(r.isExempt).toBe(true);
    render(<RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="apt" settlementDirection="pay" />);
    expect(screen.queryByTestId("redev-apt-one-house-exempt")).not.toBeNull();
    expect(screen.queryAllByText(/전체 과세/).length).toBe(0);
  });

  it("짝 — 1세대1주택이 아니면 「전체 과세」 박스가 뜨고 비과세 박스는 없다", () => {
    const r = redevResult(1_000_000_000, "2023-02-16", { isOneHousehold: false, householdHousingCount: 2 });
    render(<RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="apt" settlementDirection="pay" />);
    expect(screen.queryByTestId("redev-apt-one-house-exempt")).toBeNull();
    expect(screen.queryAllByText(/전체 과세/).length).toBe(1);
  });
});

describe("OH-63 ⑦ — 고가주택 안분 박스는 적용된 기준금액으로 말한다", () => {
  it("🔑 2021-12-07 양도 10억 — 「9억 초과」 (종전 「12억을 초과하므로」 + 900,000,000)", () => {
    const r = redevResult(1_000_000_000, "2021-12-07");
    expect(r.redevelopmentDetail?.highValueAllocation?.nontaxableThreshold).toBe(900_000_000);
    const { container } = render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="apt" settlementDirection="pay" />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("고가주택 9억 초과 안분 적용");
    expect(text).toContain("9억을 초과하므로");
    expect(text).toContain("9억 안분 전 양도차익");
    expect(text).not.toContain("12억");
  });

  it("경계 짝 — 2021-12-08 양도 15억은 「12억 초과」", () => {
    const r = redevResult(1_500_000_000, "2021-12-08");
    const { container } = render(
      <RedevelopmentDetailCard detail={r.redevelopmentDetail!} subject="apt" settlementDirection="pay" />,
    );
    expect(container.textContent).toContain("고가주택 12억 초과 안분 적용");
  });
});
