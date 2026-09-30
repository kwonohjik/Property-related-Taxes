/**
 * Zod↔엔진 필수 2차분 — ④·⑧ 쪽 anchor (계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md`).
 *
 * - O4: ⑫가 5호 무주택 확인(`preContractNoHouse`)을 요구하므로 ④ 세 빌더(단건·판정 메뉴·다건)가 그 값을 싣는다.
 * - M2: ⑧ 분리 검증은 ④와 같은 유효 소유 축을 본다 — 토지에 남은 소유자 분리로 화면에 없는 칸을 요구하지 않는다.
 * - §4.3: ⑧ §99의3 1호 판정이 ⑫·라우터와 같은 술어(2호가 아니면 1호)다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { effectiveSelfOwns, selfOwnsSplitApplicable } from "@/lib/calc/self-owns-scope";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

async function capture(fn: () => Promise<unknown>) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await fn().catch(() => {});
  vi.unstubAllGlobals();
  return cap.body!;
}

const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-06-01",
    actualSalePrice: "800,000,000",
    fixedAcquisitionPrice: "400,000,000",
    ...over,
  }) as AssetForm;

const PROVISO_5 = { provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true } as const;

describe("O4 ④ — 5호 무주택 확인을 싣는다 (종전: 키가 없어 ⑫에서 strip)", () => {
  const calcForm = (over: Partial<TransferFormData> = {}): TransferFormData => ({
    ...createDefaultTransferFormData(),
    transferDate: "2023-06-01",
    contractTotalPrice: "800,000,000",
    assets: [house()],
    isOneHousehold: true,
    householdHousingCount: "1",
    ...over,
  });

  it("🔴 단건 계산기", async () => {
    const body = await capture(() => callTransferTaxAPI(calcForm(PROVISO_5)));
    expect(body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
  });

  it("🔴 판정 메뉴", () => {
    const f = {
      ...createInitialOneHouseJudgmentForm(),
      assets: [house()],
      transferDate: "2023-06-01",
      contractTotalPrice: "800000000",
      isOneHousehold: true,
      houses: [],
      presaleRights: [],
      ...PROVISO_5,
    } as unknown as OneHouseJudgmentFormData;
    expect(buildOneHouseExemptionApiBody(f).oneHouseExemptionProviso).toEqual({
      reason: "pre_designation_contract",
      preContractNoHouse: true,
    });
  });

  it("🔴 다건", async () => {
    const multiForm = { ...defaultMultiTransferFormData, taxYear: 2023, transferDate: "2023-06-01", properties: [] };
    const body = await capture(() =>
      callMultiTransferTaxAPI(multiForm as never, [
        { propertyId: "p1", propertyLabel: "자산 1", form: calcForm(PROVISO_5) } as never,
      ]),
    );
    const first = (body.properties as Record<string, unknown>[])[0];
    expect(first.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
  });

  it("다른 사유에는 싣지 않는다 (부정 짝)", async () => {
    const body = await capture(() =>
      callTransferTaxAPI(calcForm({ provisoReason: "unavoidable", provisoPreContractNoHouse: true })),
    );
    expect(body.oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
  });
});

describe("M2 ⑤·⑧ — 유효 소유 축", () => {
  const stale = (kind: AssetForm["assetKind"], over: Partial<AssetForm> = {}) =>
    ({ ...house(), assetKind: kind, selfOwns: "building_only", ...over }) as AssetForm;

  it("leaf — 토지·겸용은 범위 밖(`both`), 주택·건물은 저장값 그대로", () => {
    expect(effectiveSelfOwns(stale("land"))).toBe("both");
    expect(effectiveSelfOwns(stale("housing", { isMixedUseHouse: true }))).toBe("both");
    expect(effectiveSelfOwns(stale("housing"))).toBe("building_only");
    expect(effectiveSelfOwns(stale("building"))).toBe("building_only");
    expect(selfOwnsSplitApplicable(stale("general_building"))).toBe(false);
  });

  it("🔴 ⑧ — 토지에 남은 소유자 분리로 분리 기준시가(화면에 없는 칸)를 요구하지 않는다", () => {
    expect(validateSplitDirectInputs(stale("land"), "자산 1")).toBeNull();
  });

  it("주택은 종전대로 요구한다 (부정형의 짝)", () => {
    expect(validateSplitDirectInputs(stale("housing"), "자산 1") ?? "").toContain("토지·건물 소유자가 다르면");
  });
});

describe("§4.3 ⑧ §99의3 1호 — 2호가 아니면 1호 (⑫·라우터와 같은 술어)", () => {
  const withReduction = (r: Record<string, unknown>): TransferFormData =>
    ({
      transferDate: "2023-03-01",
      filingDate: "2023-05-31",
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2002-06-01",
          actualSalePrice: "1000000000",
          reductions: [
            {
              type: "new_99_3",
              standardPriceAtAcquisition993: "400000000",
              standardPriceAt5Years: "700000000",
              exclusiveAreaSqm993: "84",
              ...r,
            },
          ],
        },
      ],
      houses: [],
      presaleRights: [],
      contractTotalPrice: "1000000000",
      householdHousingCount: "1",
      isOneHousehold: true,
    }) as unknown as TransferFormData;
  const msgs = (f: TransferFormData) => collectStepIssues(2, f).map((i) => i.message);

  it("🔴 취득 유형 미설정 + 매매계약일 없음 → 1호로 보고 막는다 (종전: 두 분기 모두 건너뛰어 통과, ⑫는 400)", () => {
    expect(msgs(withReduction({})).some((m) => m.includes("§99의3 1호 적용: 매매계약일"))).toBe(true);
  });

  it("긍정 짝 — 1호(from_builder)는 종전과 같고, 계약일을 채우면 통과", () => {
    expect(msgs(withReduction({ acquisitionType993: "from_builder" })).some((m) => m.includes("1호 적용"))).toBe(true);
    expect(
      msgs(withReduction({ acquisitionType993: "from_builder", contractDate993: "2002-03-01" })).some((m) =>
        m.includes("1호 적용"),
      ),
    ).toBe(false);
  });

  it("2호(self_built)는 사용승인일을 요구한다 (종전과 같다)", () => {
    expect(msgs(withReduction({ acquisitionType993: "self_built" })).some((m) => m.includes("2호 적용: 사용승인일"))).toBe(true);
  });
});
