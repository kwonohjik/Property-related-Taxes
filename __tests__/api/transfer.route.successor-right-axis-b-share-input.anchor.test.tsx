/**
 * anchor — 축 B(같은 물건 지분 분할) **둘째 이후 지분 카드**에서 사용자가 화면으로 조합원 유형(승계)을 고르고
 * 승계 전용 칸을 채워 계산까지 갈 수 있는가.
 *
 * ## 🔴 결함 (2026-10-21 실측)
 *
 * 둘째 이후 지분 카드는 ① 기본정보를 숨긴다(`CompanionAssetCard` `hideInheritedSections`). 그런데 「조합원 유형」 토글은 ①에만 있었다.
 * 지분 카드는 `makeDefaultAsset`이라 `isSuccessorRightToMoveIn=false`이고 `mergePrimaryBasic`도 그 표지를 병합하지 않는다
 * ⇒ 사용자가 둘째 지분을 승계로 표시할 수 없었다. 첫 카드를 승계로 고르면 ⑧이 둘째 카드에 「① 기본정보의 「조합원 유형」을 …」이라
 * 안내하지만 그 칸이 그 카드에 없어 막다른 길이었다. UI 모양(표지 false · 승계 칸 비움)이면 200으로 254,298,000(실가)/145,266,000(감정가) 오답 또는 ⑧ 차단.
 *
 * ## 사용자 결정 (2026-10-21): 지분별 입력
 *
 * 지분마다 취득 경위가 다를 수 있다 — 둘째 이후 지분 카드 ③ 취득정보에 같은 컴포넌트(`SuccessorRightTypeToggle`)가 뜬다. 첫 카드 값 복사가 아니다.
 *
 * 이 테스트는 **실제 카드를 렌더해 클릭·입력한 결과**를 폼에 넣고 `callTransferTaxAPI` → route → 엔진까지 간다
 * (`transfer.route.successor-right-companion.anchor.test.ts`와 같은 시료 — 단건 승계 100%와 총세액이 같아야 한다).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect, useState } from "react";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

afterEach(() => cleanup());

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };

/** 승계 입주권 — 실가: 승계취득가 5억 + 추가분담금 1억 = 6억 (단건 기준선 146,366,000). */
const SUCC_ACTUAL: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  isSuccessorRightToMoveIn: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2020-03-01",
  redevApprovalDate: "2018-05-01",
  successorRightAcqPrice: "500000000",
  successorRightAddedContribution: "100000000",
  actualSalePrice: "1000000000",
  standardPriceAtTransfer: "800000000",
  useEstimatedAcquisition: false,
};
/** 감정가 — 감정가액 6억 + §165① 취득시 기준시가 = 납입 4억 + 프리미엄 1억 (단건 기준선 144,166,000). */
const SUCC_APPRAISAL: Partial<AssetForm> = {
  ...SUCC_ACTUAL,
  isAppraisalAcquisition: true,
  fixedAcquisitionPrice: "600000000",
  successorRightStdPaidAtAcq: "400000000",
  successorRightStdPremiumAtAcq: "100000000",
};

function mkForm(assets: Partial<AssetForm>[], extra: Partial<TransferFormData>): TransferFormData {
  const form = withTestAddress(createDefaultTransferFormData());
  form.transferDate = "2024-06-01";
  form.householdHousingCount = "2";
  form.isOneHousehold = false;
  form.bundledSaleMode = "actual";
  form.assets = assets.map(
    (over, i) =>
      ({
        ...(i === 0 ? form.assets[0] : makeDefaultAsset(i + 1)),
        assetId: `a${i}`,
        ...over,
        // 소재지는 ① 기본정보(첫 카드)에서 입력한다 — 지분 카드는 ①이 숨겨져 첫 카드 값이 병합된다.
        addressJibun: "서울 강남구 테스트동 1-1",
      }) as AssetForm,
  );
  Object.assign(form, extra);
  return form;
}

interface Run {
  status: number;
  /** 400이면 route의 오류 본문(Zod 등). */
  error?: string;
  totalTax?: number;
  stepIssues: string[];
  props: Array<{ id: string; lthd: number; hasRedevDetail: boolean; acq: number; gain: number }>;
}

async function run(form: TransferFormData): Promise<Run> {
  const stepIssues: string[] = [];
  for (let s = 0; s <= 4; s++) {
    stepIssues.push(
      ...collectStepIssues(s, form)
        .filter((x) => x.assetIndex !== undefined)
        .map((x) => `s${s}:a${x.assetIndex}:${x.message}`),
    );
  }
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = await res.json();
  const d = json.data ?? {};
  const error = res.status === 200 ? undefined : JSON.stringify(json.error ?? json).slice(0, 1500);
  if (d.aggregated) {
    return {
      status: res.status,
      error,
      totalTax: d.aggregated.totalTax,
      stepIssues,
      props: d.aggregated.properties.map((p: Record<string, number | string | object | undefined>) => ({
        id: p.propertyId as string,
        lthd: p.longTermHoldingDeduction as number,
        hasRedevDetail: !!p.redevelopmentDetail,
        acq: p.acquisitionPrice as number,
        gain: p.transferGain as number,
      })),
    };
  }
  const r = d.result ?? {};
  return {
    status: res.status,
    error,
    totalTax: r.totalTax,
    stepIssues,
    props: [{ id: "single", lthd: r.longTermHoldingDeduction, hasRedevDetail: !!r.redevelopmentDetail, acq: r.acquisitionPrice, gain: r.transferGain }],
  };
}

/**
 * 둘째 지분 카드를 **실제로 렌더**하고 사용자가 하는 입력을 그대로 재현한다.
 * 상태는 카드가 부르는 `onChange(patch)`를 받아 병합하는 것으로 충분하다(`Step1`의 자산 갱신과 같은 형태).
 */
function mountShareCard(primary: AssetForm, initial: AssetForm) {
  const ref: { current: AssetForm } = { current: initial };
  function Harness() {
    const [asset, setAsset] = useState<AssetForm>(initial);
    useEffect(() => {
      ref.current = asset;
    }, [asset]);
    return (
      <CompanionAssetCard
        index={1}
        asset={asset}
        primaryAsset={primary}
        bundledSaleMode="actual"
        onChange={(patch) => setAsset((a) => ({ ...a, ...patch }))}
        transferDate="2024-06-01"
        splitMode="fractional"
        onFractionalToggle={() => {}}
        hasSiblings
      />
    );
  }
  const utils = render(<Harness />);
  const card = utils.container.querySelector<HTMLElement>('[data-asset-card-index="1"]')!;
  const section = (n: number) => card.querySelector<HTMLElement>(`[data-asset-section="${n}"]`);
  const field = (name: string) => card.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const type = (name: string, value: string) => {
    const input = field(name)!.querySelector<HTMLInputElement>("input")!;
    fireEvent.change(input, { target: { value } });
  };
  /** `data-field` 앵커가 없는 칸(FieldCard 라벨로 찾는다). */
  const typeByLabel = (label: string, value: string) => {
    const fc = within(card).getByText(label).closest<HTMLElement>('[data-slot="field-card"]')!;
    fireEvent.change(fc.querySelector<HTMLInputElement>("input")!, { target: { value } });
  };
  const pick = (name: string, text: string) => {
    const el = within(field(name)!).getByText(text);
    fireEvent.click(el.closest("button") ?? el);
  };
  return { ref, card, section, field, type, typeByLabel, pick };
}

/** 지분 토글이 만드는 둘째 카드 그대로 — 저장 자산 종류는 기본값(주택)·표지 false·승계 칸 비움. 사용자가 채우는 취득일·인가일만 얹는다. */
const shareSeed = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(2),
    assetId: "a1",
    ...HALF,
    acquisitionCause: "purchase",
    acquisitionDate: "2020-03-01",
    redevApprovalDate: "2018-05-01",
    ...over,
  }) as AssetForm;

const primaryCard = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetId: "a0", ...over, ...HALF }) as AssetForm;

describe("축 B 둘째 지분 카드 — 조합원 유형(승계) 입력 (화면)", () => {
  it("U1 둘째 지분 카드는 ③ 취득정보에 「조합원 유형」 질문이 있고 ① 기본정보에는 없다", () => {
    const m = mountShareCard(primaryCard(SUCC_ACTUAL), shareSeed());
    expect(m.section(3)!.querySelector('[data-field="isSuccessorRightToMoveIn"]')).not.toBeNull();
    // ①은 지분 카드에서 렌더되지 않는다 — 질문이 ①에만 있던 것이 결함의 원인이었다.
    expect(m.section(1)).toBeNull();
    expect(m.card.querySelectorAll('[data-field="isSuccessorRightToMoveIn"]')).toHaveLength(1);
  });

  it("U2 첫 카드가 주택이면 질문이 없다 (입주권 전용 — 활성화 조건)", () => {
    const m = mountShareCard(primaryCard({ assetKind: "housing" }), shareSeed());
    expect(m.field("isSuccessorRightToMoveIn")).toBeNull();
  });

  it("U3 승계를 고르기 전에는 원조합원 §166 블록, 고른 뒤에는 승계 전용 칸 (지분별 입력 — 첫 카드가 승계여도 이 카드는 아직 원조합원)", () => {
    const m = mountShareCard(primaryCard(SUCC_ACTUAL), shareSeed());
    expect(m.field("successorRightAcqPrice")).toBeNull();
    expect(m.ref.current.isSuccessorRightToMoveIn).toBe(false);
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    expect(m.ref.current.isSuccessorRightToMoveIn).toBe(true);
    expect(m.field("successorRightAcqPrice")).not.toBeNull();
    expect(m.field("successorRightAddedContribution")).not.toBeNull();
  });

  it("U4 되돌리면 승계 전용 값이 함께 비워진다 (반대편 전용 필드 — 단일 배치 patch)", () => {
    const m = mountShareCard(primaryCard(SUCC_ACTUAL), shareSeed());
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    m.type("successorRightAcqPrice", "500000000");
    expect(m.ref.current.successorRightAcqPrice).toBe("500000000");
    m.pick("isSuccessorRightToMoveIn", "원조합원");
    expect(m.ref.current.isSuccessorRightToMoveIn).toBe(false);
    expect(m.ref.current.successorRightAcqPrice).toBe("");
  });

  it("U5 첫 카드(index 0)는 종전 위치 그대로 ① 기본정보에 있다 — ③에는 없다", () => {
    const first = primaryCard({ ...SUCC_ACTUAL });
    const { container } = render(
      <CompanionAssetCard
        index={0}
        asset={first}
        primaryAsset={first}
        bundledSaleMode="actual"
        onChange={() => {}}
        transferDate="2024-06-01"
        splitMode="fractional"
        onFractionalToggle={() => {}}
        hasSiblings
        showFormDates
      />,
    );
    const card = container.querySelector<HTMLElement>('[data-asset-card-index="0"]')!;
    expect(card.querySelector('[data-asset-section="1"] [data-field="isSuccessorRightToMoveIn"]')).not.toBeNull();
    expect(card.querySelector('[data-asset-section="3"] [data-field="isSuccessorRightToMoveIn"]')).toBeNull();
  });

  it("U6 함께 양도(다른 물건) 컴패니언 카드는 ①이 보이므로 종전대로 ①에 있다 (③에 중복 없음)", () => {
    const { container } = render(
      <CompanionAssetCard
        index={1}
        asset={{ ...shareSeed(), assetKind: "right_to_move_in" } as AssetForm}
        primaryAsset={primaryCard({ assetKind: "housing" })}
        bundledSaleMode="actual"
        onChange={() => {}}
        transferDate="2024-06-01"
        splitMode="companion"
        onFractionalToggle={() => {}}
        hasSiblings
      />,
    );
    const card = container.querySelector<HTMLElement>('[data-asset-card-index="1"]')!;
    expect(card.querySelector('[data-asset-section="1"] [data-field="isSuccessorRightToMoveIn"]')).not.toBeNull();
    expect(card.querySelector('[data-asset-section="3"] [data-field="isSuccessorRightToMoveIn"]')).toBeNull();
  });
});

describe("축 B 둘째 지분 카드 — 화면 입력이 계산까지 간다 (callTransferTaxAPI → route)", () => {
  it("R1 실가: 둘째 지분을 화면에서 승계로 고르고 2칸을 입력 → 단건 승계 100%와 총세액 146,366,000 일치", async () => {
    const primary = primaryCard(SUCC_ACTUAL);
    const m = mountShareCard(primary, shareSeed());
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    m.type("successorRightAcqPrice", "500000000");
    m.type("successorRightAddedContribution", "100000000");

    const single = await run(mkForm([{ ...SUCC_ACTUAL }], { contractTotalPrice: "1000000000" }));
    expect(single.totalTax).toBe(146_366_000);

    const form = mkForm([primary, m.ref.current], { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never);
    const r = await run(form);
    expect(r.stepIssues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(single.totalTax);
    for (const p of r.props) {
      expect(p.lthd).toBe(0);
      expect(p.hasRedevDetail).toBe(false);
    }
    expect(r.props.map((p) => p.acq)).toEqual([300_000_000, 300_000_000]);
  });

  it("R2 감정가: 산정 방식 감정가액 + 감정가액·§165① 취득시 기준시가 입력 → 단건과 144,166,000 일치", async () => {
    const primary = primaryCard(SUCC_APPRAISAL);
    const m = mountShareCard(primary, shareSeed());
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    // 산정 방식 라디오는 이 카드의 승계 블록 안에 있다 — 옵션 「감정가액」(value="appraisal").
    const radio = m.card.querySelector<HTMLInputElement>('input[name^="successorAcqMode-"][value="appraisal"]');
    expect(radio).toBeTruthy();
    fireEvent.click(radio!);
    m.type("fixedAcquisitionPrice", "600000000");
    m.type("successorRightStdPaidAtAcq", "400000000");
    m.typeByLabel("취득일 현재 프리미엄", "100000000");

    const single = await run(mkForm([{ ...SUCC_APPRAISAL }], { contractTotalPrice: "1000000000" }));
    expect(single.totalTax).toBe(144_166_000);

    const form = mkForm([primary, m.ref.current], { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never);
    const r = await run(form);
    expect(r.stepIssues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(single.totalTax);
    for (const p of r.props) expect(p.hasRedevDetail).toBe(false);
  });

  it("R3 부정 — 같은 입력을 하되 승계를 고르지 않으면(원조합원) 승계 계산이 아니다 (표지가 계산을 가른다)", async () => {
    const primary = primaryCard(SUCC_ACTUAL);
    const form = mkForm([primary, shareSeed()], { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never);
    const r = await run(form);
    // 인가일(2018-05-01) < 취득일(2020-03-01)이면 승계 사실이다 — ⑧이 막고, 문구는 이 카드에 실제 있는 ③을 가리킨다(종전 ① 기본정보).
    expect(r.stepIssues.join("\n")).toContain('③ 취득정보의 「조합원 유형」을 "승계조합원"으로 바꾸세요');
    expect(r.stepIssues.join("\n")).not.toContain("① 기본정보");
  });
});

/** 원조합원 입주권 첫 카드(인가 2016-06-01 · 취득 2008-01-01 · 비과세 요건 불충족 선언 → 과세 경로) — 혼합 시료. */
const ORIGINAL_FIRST: Partial<AssetForm> = {
  assetKind: "right_to_move_in",
  redevSubject: "right",
  isSuccessorRightToMoveIn: false,
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  redevApprovalDate: "2016-06-01",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "50000000",
  redevRightsValue: "900000000",
  redevActualAcquisitionPrice: "400000000",
  redevExemptionEligibleAtApproval: "no",
  actualSalePrice: "1000000000",
  standardPriceAtTransfer: "800000000",
};

describe("혼합 — 첫 카드 원조합원 + 둘째 지분 승계 (지분별 취득 경위)", () => {
  it("X1 둘째 지분만 승계 계산 — 둘째 카드는 승계 취득가 3억(×50%) · 장특 0 · §166 상세 없음 / 첫 카드는 원조합원 §166 상세", async () => {
    const primary = primaryCard(ORIGINAL_FIRST);
    const m = mountShareCard(primary, shareSeed());
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    m.type("successorRightAcqPrice", "500000000");
    m.type("successorRightAddedContribution", "100000000");

    const form = mkForm([primary, m.ref.current], { contractTotalPrice: "1000000000", assetSplitMode: "fractional" } as never);
    const r = await run(form);
    expect(r.stepIssues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.props).toHaveLength(2);
    const [first, second] = r.props;
    expect(first.hasRedevDetail).toBe(true);
    expect(second.hasRedevDetail).toBe(false);
    expect(second.lthd).toBe(0);
    expect(second.acq).toBe(300_000_000);
    // 둘째 지분의 양도차익 = 양도가액 5억(총양도가 × 50%) − 취득가액 3억 — 둘 다 승계인 A2 시료의 카드와 같다.
    expect(second.gain).toBe(200_000_000);
    // 총세액은 엔진 산출값(원조합원 §166 첫 카드와 합산) — 독립 재계산한 정답이 아니라 회귀 고정값이다.
    expect(r.totalTax).toBe(150_766_000);
  });
});

describe("#2248 판정 사실 복사(`soleSplitRightJudgmentFacts`)와 지분별 승계 여부의 정합", () => {
  const originalPrimary = () => primaryCard({ ...ORIGINAL_FIRST, redevExemptionEligibleAtApproval: "yes" });

  it("Y1 첫 카드 원조합원 + 둘째 원조합원 — 첫 카드 선언을 둘째 카드가 읽는다 (종전 동작 그대로)", () => {
    const m = mountShareCard(originalPrimary(), shareSeed({ redevSubject: "right" }));
    expect(m.card.querySelector('[data-testid="imported-redev-right-facts"]')).not.toBeNull();
  });

  it("Y2 둘째를 승계로 바꾸면 선언 요약이 사라진다 — 승계 취득분에는 「인가일 현재 기존주택 소유」 선언이 성립하지 않는다", () => {
    const m = mountShareCard(originalPrimary(), shareSeed({ redevSubject: "right" }));
    m.pick("isSuccessorRightToMoveIn", "승계조합원");
    expect(m.card.querySelector('[data-testid="imported-redev-right-facts"]')).toBeNull();
    expect(m.field("successorRightAcqPrice")).not.toBeNull();
  });

  it("Y3 첫 카드가 승계면 둘째 원조합원 지분에는 복사할 선언이 없다 (빈 값 — 입력 경로 없음, 보고 대상)", () => {
    const m = mountShareCard(primaryCard(SUCC_ACTUAL), shareSeed({ redevSubject: "right" }));
    expect(m.card.querySelector('[data-testid="imported-redev-right-facts"]')).toBeNull();
    expect(m.ref.current.redevExemptionEligibleAtApproval).toBe("");
  });
});

describe("축 B 둘째 지분 카드 — ⑧ 문구는 그 카드에 실제 있는 위치를 가리킨다", () => {
  /** 원조합원으로 남은 둘째 지분(인가일 < 취득일 = 승계 사실) — 화면 모양 그대로. */
  const message = (index: number, assets: Partial<AssetForm>[], axisB: boolean) => {
    const form = mkForm(assets, {
      contractTotalPrice: "1000000000",
      ...(axisB ? { assetSplitMode: "fractional" } : { assetSplitMode: "companion" }),
    } as never);
    for (let s = 0; s <= 4; s++) {
      const hit = collectStepIssues(s, form).find((x) => x.assetIndex === index && /조합원 유형/.test(x.message));
      if (hit) return hit.message;
    }
    return undefined;
  };

  it("M1 둘째 지분 카드 — ③ 취득정보의 「조합원 유형」을 승계조합원으로 바꾸라고 안내한다", () => {
    const msg = message(1, [{ ...SUCC_ACTUAL, ...HALF }, { ...shareSeed(), ...{ redevSubject: "right" } }], true);
    expect(msg).toBeDefined();
    expect(msg).toContain('③ 취득정보의 「조합원 유형」을 "승계조합원"으로 바꾸세요');
    expect(msg).not.toContain("① 기본정보");
  });

  it("M2 첫 카드 — 종전대로 ① 기본정보", () => {
    const msg = message(0, [{ ...SUCC_ACTUAL, ...HALF, isSuccessorRightToMoveIn: false }, shareSeed()], true);
    expect(msg).toContain('① 기본정보의 「조합원 유형」을 "승계조합원"으로 바꾸세요');
  });

  it("M3 함께 양도 컴패니언 — ①이 보이므로 ① 기본정보", () => {
    const house: Partial<AssetForm> = {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
      fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "400000000",
    };
    const msg = message(1, [house, { ...SUCC_ACTUAL, isSuccessorRightToMoveIn: false, redevSubject: "right" }], false);
    expect(msg).toContain("① 기본정보의 「조합원 유형」");
  });

  it("M4 반대 방향 — 승계로 남은 둘째 지분(인가일 > 취득일)도 ③을 가리킨다", () => {
    const succLate = { ...SUCC_ACTUAL, redevApprovalDate: "2021-01-01" };
    const msg = message(1, [{ ...SUCC_ACTUAL, ...HALF }, { ...shareSeed(), ...succLate, ...HALF }], true);
    expect(msg).toContain('③ 취득정보의 「조합원 유형」을 "원조합원"으로 바꾸세요');
  });
});
