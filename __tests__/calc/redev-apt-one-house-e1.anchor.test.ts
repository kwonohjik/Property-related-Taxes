/**
 * E1 anchor(④ · ⑧) — 재개발 완공APT의 §154① 단서·거주 구간 (OH-20 · OH-48 · OH-49 · OH-50)
 *
 * ── 근거 (KoreanLaw MCP · 소득세법 시행령 MST 286211 원문, 2026-09-26) ──
 * · §154① 단서 — 「1세대가 양도일 현재 국내에 1주택을 보유하고 있는 경우로서 제1호부터 제3호까지의
 *   어느 하나에 해당하는 경우에는 그 보유기간 및 거주기간의 제한을 받지 않으며 **제5호**에 해당하는
 *   경우에는 거주기간의 제한을 받지 않는다」 — 자산 종류로 가르지 않는다.
 *   5호 「조정대상지역의 공고가 있은 날 이전에 매매계약을 체결하고 계약금을 지급 … 계약금 지급일
 *   현재 주택을 보유하지 아니하는 경우」.
 * · 서면-2022-부동산-5057(2022.12.21, taxlaw.nts.go.kr 원문) — 기획재정부 재산세제과-1422(2022.11.14)
 *   인용: 공고일 이전 무주택자가 재개발 **조합원입주권을 매매계약으로 취득**한 경우 「거주요건을
 *   적용하지 않음(제2안)」. ⇒ 승계조합원 완공APT의 5호가 대표 사례다.
 * · §154① 괄호 「그 보유기간 중 거주기간」 + 서면-2019-부동산-4508 「멸실 전 거주기간을 통산하지 아니함」
 *   (승계조합원 보유기간 = 준공인가증 교부일부터 — 시행령 §162①4호).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI, buildResidenceReqInput } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

type Asset = ReturnType<typeof makeDefaultAsset>;

/** 승계조합원 완공APT — 입주권 승계 2017-03-01 · 인가 2016-05-01 · 준공 2020-06-30 · 양도 2023-03-01. */
function successorAsset(over: Partial<Asset> = {}): Asset {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2017-03-01",
    actualSalePrice: "1,100,000,000",
    fixedAcquisitionPrice: "500,000,000",
    redevApprovalDate: "2016-05-01",
    redevSettlementDirection: "pay",
    redevIsSuccessorMember: "yes",
    redevCompletionDate: "2020-06-30",
    ...over,
  } as Asset;
}

/** 원조합원 완공APT — 종전주택 2018-01-10 취득 · 인가 2019-06-01 · 양도 2024-03-01. */
function originalAsset(over: Partial<Asset> = {}): Asset {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-10",
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    redevApprovalDate: "2019-06-01",
    redevRightsValue: "600,000,000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "100,000,000",
    redevIsSuccessorMember: "no",
    ...over,
  } as Asset;
}

function makeForm(asset: Asset, over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    transferDate: asset.redevIsSuccessorMember === "yes" ? "2023-03-01" : "2024-03-01",
    assets: [asset],
    houses: [],
    presaleRights: [],
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "0",
    annualBasicDeductionUsed: "0",
    ...over,
  } as unknown as TransferFormData;
}

const PROVISO_5 = {
  provisoReason: "pre_designation_contract",
  provisoPreContractNoHouse: true,
} as Partial<TransferFormData>;

describe("OH-20 ④ — 재개발 완공APT의 §154① 단서가 body에 실린다", () => {
  it("🔑 승계조합원 5호(공고 전 계약 · 무주택) → oneHouseExemptionProviso 전송 (종전 undefined)", async () => {
    const captured = captureBody();
    await callTransferTaxAPI(makeForm(successorAsset(), PROVISO_5));
    expect(captured.body?.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract" });
  });

  it("긍정 짝 — 주택은 종전부터 전송", async () => {
    const captured = captureBody();
    const housing = { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2017-03-01", actualSalePrice: "1,100,000,000", fixedAcquisitionPrice: "500,000,000" } as Asset;
    await callTransferTaxAPI(makeForm(housing, PROVISO_5));
    expect(captured.body?.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract" });
  });

  it("부정 짝 — 조합원입주권(§89①4호 축)에는 보내지 않는다", async () => {
    const captured = captureBody();
    const right = { ...successorAsset(), assetKind: "right_to_move_in", redevSubject: "right", redevIsSuccessorMember: "" } as Asset;
    await callTransferTaxAPI(makeForm(right, PROVISO_5));
    expect(captured.body?.oneHouseExemptionProviso).toBeUndefined();
  });

  it("Step4 거주요건 안내 빌더도 같은 게이트 — 단서 사유가 실린다", () => {
    const r = buildResidenceReqInput(makeForm(successorAsset(), PROVISO_5));
    expect(r.oneHouseExemptionProviso?.reason).toBe("pre_designation_contract");
  });
});

describe("OH-20 ⑧ — 재개발 완공APT도 단서 필수값을 검증한다", () => {
  it("🔑 5호를 골랐는데 무주택 확인이 없으면 차단 (종전 0건)", () => {
    const issues = collectStepIssues(1, makeForm(successorAsset(), { provisoReason: "pre_designation_contract" } as Partial<TransferFormData>));
    expect(issues.some((i) => i.message.includes("무주택"))).toBe(true);
  });

  it("짝 — 무주택 확인이 있으면 통과", () => {
    const issues = collectStepIssues(1, makeForm(successorAsset(), PROVISO_5));
    expect(issues.some((i) => i.message.includes("무주택"))).toBe(false);
  });
});

const interval = (periods: { moveInDate: string; moveOutDate: string }[]): Partial<Asset> => ({
  residenceInputMode: "interval",
  residencePeriods: periods,
});
const residenceIssues = (form: TransferFormData) =>
  collectStepIssues(1, form).filter((i) => i.message.includes("거주 구간"));

describe("OH-49 ⑧ — 재개발 완공APT 거주 구간도 housing과 같은 규칙으로 검증한다", () => {
  it("🔑 취득 전 임차 거주(입주일 < 종전주택 취득일) 차단 (종전 0건)", () => {
    const f = makeForm(originalAsset(interval([
      { moveInDate: "2016-01-01", moveOutDate: "2018-01-09" },
      { moveInDate: "2018-01-10", moveOutDate: "2018-07-10" },
    ])));
    expect(residenceIssues(f).some((i) => i.message.includes("취득일(2018-01-10)"))).toBe(true);
  });

  it("🔑 구간 겹침 차단", () => {
    const f = makeForm(originalAsset(interval([
      { moveInDate: "2020-01-01", moveOutDate: "2020-06-01" },
      { moveInDate: "2020-03-01", moveOutDate: "2020-12-01" },
    ])));
    expect(residenceIssues(f).some((i) => i.message.includes("겹칩니다"))).toBe(true);
  });

  it("🔑 퇴거일 누락 차단", () => {
    const f = makeForm(originalAsset(interval([{ moveInDate: "2020-01-01", moveOutDate: "" }])));
    expect(residenceIssues(f).some((i) => i.message.includes("퇴거일을 입력"))).toBe(true);
  });

  it("긍정 짝 — 보유기간 안의 정상 구간은 통과", () => {
    const f = makeForm(originalAsset(interval([{ moveInDate: "2018-01-10", moveOutDate: "2020-06-01" }])));
    expect(residenceIssues(f)).toEqual([]);
  });

  it("OH-48 — 분리 입력이 Step4를 대신하면(⑤가 입력을 숨긴다) 숨은 구간은 검증하지 않는다", () => {
    const f = makeForm(originalAsset({
      ...interval([{ moveInDate: "2016-01-01", moveOutDate: "" }]),
      redevPriorHouseResidenceMonths: "30",
    }));
    expect(residenceIssues(f)).toEqual([]);
  });
});

describe("OH-50 ⑧ — 승계조합원 거주 구간은 준공일과 비교한다", () => {
  it("🔑 준공일 전(멸실 전 종전주택) 거주 차단 — 입주권 취득일 이후여도 막는다 (종전 0건)", () => {
    const f = makeForm(successorAsset(interval([{ moveInDate: "2017-08-01", moveOutDate: "2019-10-01" }])));
    expect(residenceIssues(f).some((i) => i.message.includes("취득일(2020-06-30)"))).toBe(true);
  });

  it("긍정 짝 — 준공일 이후 거주는 통과", () => {
    const f = makeForm(successorAsset(interval([{ moveInDate: "2020-06-30", moveOutDate: "2023-01-01" }])));
    expect(residenceIssues(f)).toEqual([]);
  });

  it("승계조합원 분리 입력(신축 거주)이 있으면 Step4 구간은 검증하지 않는다", () => {
    const f = makeForm(successorAsset({
      ...interval([{ moveInDate: "2017-08-01", moveOutDate: "2019-10-01" }]),
      redevNewHouseResidenceMonths: "0",
    }));
    expect(residenceIssues(f)).toEqual([]);
  });

  it("승계조합원의 종전주택 거주 입력(`prior`)은 분리 입력으로 치지 않는다 — 엔진이 읽지 않는다", () => {
    const f = makeForm(successorAsset({
      ...interval([{ moveInDate: "2017-08-01", moveOutDate: "2019-10-01" }]),
      redevPriorHouseResidenceMonths: "26",
    }));
    expect(residenceIssues(f).length).toBeGreaterThan(0);
  });
});
