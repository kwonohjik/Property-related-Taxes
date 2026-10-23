/**
 * anchor — 이월과세 × 증여자 신축·증축 §114조의2 (PR-2: ①②③ 폼 · ④ 전송 · ⑧ 검증 · ⑧↔⑫ 정합)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md §6
 *
 *  · DBC-S   적용 범위 술어(`donorBuiltApplicable`) — 엔진·⑫가 거부하는 조합은 UI 에서 비노출
 *  · DBC-N   ③ normalize — 구 세션·이력은 OFF 로 복원(가산세 없음, 회귀 0)
 *  · DBC-P   ④ payload — donorBuilt 중첩 전송(일체 주택은 housing.sale 포함) · stale 미전송 · 지분 스케일
 *  · DBC-V   ⑧ validate — 미입력 차단(자동 fallback 금지)
 *  · DBC-G   ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫(Zod) 통과 (UI 통과 ↔ 400 모순 0)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { donorBuiltApplicable, donorBuiltActive } from "@/lib/calc/donor-built-scope";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS, normalizeCarryoverForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

// ─── 픽스처 — 엔진 anchor(DB-2)와 같은 셀: 증여자 신축 2022-01-10 · 증여 2024-05-01 · 양도 2026-03-01 ───
const DONOR_BUILT_ON: Partial<CarryoverTaxationForm> = {
  donorBuilt: true,
  donorBuiltType: "new",
  donorBuiltDate: "2022-01-10",
};
const HOUSING_INPUTS: Partial<CarryoverTaxationForm> = {
  donorBuiltLandPricePerSqm: "1,000,000",
  donorBuiltLandArea: "100",
  donorBuiltBuildingStdAtAcq: "60,000,000",
};

function carryover(over: Partial<CarryoverTaxationForm> = {}): CarryoverTaxationForm {
  return {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2024-05-01",
    donorAcquisitionDate: "2022-01-10",
    useEstimatedAcquisition: true,
    estimationMode: "general",
    donorStandardPriceAtAcquisition: "200,000,000",
    donorStandardPriceAtTransfer: "400,000,000",
    giftDateValuation: "800,000,000",
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
    ...over,
  };
}

function form(opts: {
  kind?: "housing" | "building";
  co?: Partial<CarryoverTaxationForm>;
  asset?: Partial<AssetForm>;
} = {}): TransferFormData {
  const kind = opts.kind ?? "housing";
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "1,000,000,000";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: kind,
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    // 양도 당시 토지·건물 기준시가 — 기존 자산 수준 칸을 재사용한다(Q-6 b)
    landStandardPriceAtTransfer: kind === "housing" ? "240,000,000" : "",
    buildingStandardPriceAtTransfer: kind === "housing" ? "160,000,000" : "",
    carryover: carryover({ ...DONOR_BUILT_ON, ...(kind === "housing" ? HOUSING_INPUTS : {}), ...opts.co }),
    ...opts.asset,
  } as AssetForm;
  return f;
}

async function bodyOf(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f);
  return captured;
}
const donorBuiltOf = (body: Record<string, unknown>) =>
  (body.carryoverTaxation as { donorBuilt?: Record<string, unknown> } | undefined)?.donorBuilt;

describe("DBC-S 적용 범위 — 엔진·⑫ 거부 조합은 비노출", () => {
  const ok = (f: TransferFormData) => donorBuiltApplicable(f.assets[0], { transferDate: f.transferDate });
  it("일체 주택·비주택 건물 + 일반 기준시가 환산 → 적용", () => {
    expect(ok(form({ kind: "housing" }))).toBe(true);
    expect(ok(form({ kind: "building" }))).toBe(true);
  });
  it.each([
    ["실가 승계(환산 OFF)", { useEstimatedAcquisition: false }],
    ["개별주택가격 미공시 환산(phd)", { estimationMode: "phd" as const }],
    ["공동주택 최초고시 전 환산(apd)", { estimationMode: "apd" as const }],
    ["환산 방식 미선택", { estimationMode: null }],
  ])("%s → 비노출", (_l, co) => {
    expect(ok(form({ co }))).toBe(false);
  });
  it.each([
    ["토지", { assetKind: "land" as const }],
    ["상가", { assetKind: "commercial_building" as const }],
    ["일반건물", { assetKind: "general_building" as const }],
    ["분양권", { assetKind: "presale_right" as const }],
    ["입주권", { assetKind: "right_to_move_in" as const }],
    ["재개발", { assetKind: "redevelopment_apt" as const }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["부담부증여", { transferType: "burdened_gift" as const }],
    ["취득 원인이 이월과세가 아님", { acquisitionCause: "gift" as const }],
    ["증여자가 토지·건물을 다른 날 취득(파트 이월과세 C)", { carryoverDonorSplit: true }],
    ["토지·건물 취득일 분리(별개 취득)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01" }],
  ])("%s → 비노출", (_l, asset) => {
    expect(ok(form({ asset }))).toBe(false);
  });
  it("토글 OFF 면 적용 범위 안이어도 active 가 아니다 · 범위 밖의 stale ON 도 active 가 아니다", () => {
    const off = form({ co: { donorBuilt: false } });
    expect(donorBuiltActive(off.assets[0], { transferDate: off.transferDate })).toBe(false);
    const stale = form({ co: { useEstimatedAcquisition: false } });
    expect(stale.assets[0].carryover!.donorBuilt).toBe(true);
    expect(donorBuiltActive(stale.assets[0], { transferDate: stale.transferDate })).toBe(false);
  });
});

describe("DBC-N ③ normalize — 구 세션·이력 복원", () => {
  it("필드가 없는 구 이월과세 이력은 OFF · 빈 값 (가산세 없음)", () => {
    const old = normalizeCarryoverForm({ giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2022-01-10", useEstimatedAcquisition: true });
    expect(old.donorBuilt).toBe(false);
    expect(old.donorBuiltType).toBe("");
    expect(old.donorBuiltDate).toBe("");
    expect(old.donorBuiltLandPricePerSqm).toBe("");
  });
  it("저장된 값은 그대로 복원되고 형이 틀린 값은 기본값으로 돌아간다", () => {
    const saved = normalizeCarryoverForm({ ...DONOR_BUILT_ON, ...HOUSING_INPUTS, donorBuiltExtensionArea: "100", donorBuiltExtensionStdPrice: "15,000,000" });
    expect(saved).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10", donorBuiltLandArea: "100", donorBuiltBuildingStdAtAcq: "60,000,000" });
    const bad = normalizeCarryoverForm({ donorBuilt: "yes", donorBuiltType: "x", donorBuiltDate: 20220110, donorBuiltLandArea: 100 });
    expect(bad).toMatchObject({ donorBuilt: false, donorBuiltType: "", donorBuiltDate: "", donorBuiltLandArea: "" });
  });
});

describe("DBC-P ④ payload", () => {
  it("일체 주택 신축: donorBuilt.housing 이 취득 당시 + 양도 당시 입력을 싣는다 (구분 기재 없음 → sale 생략)", async () => {
    const db = donorBuiltOf(await bodyOf(form()));
    expect(db).toEqual({
      buildingType: "new",
      constructionDate: "2022-01-10",
      housing: {
        landPricePerSqmAtAcquisition: 1_000_000,
        landArea: 100,
        buildingStdPriceAtAcquisition: 60_000_000,
        landStdPriceAtTransfer: 240_000_000,
        buildingStdPriceAtTransfer: 160_000_000,
      },
    });
  });

  it("비주택 건물 신축: housing 없이 구분·신축일만", async () => {
    expect(donorBuiltOf(await bodyOf(form({ kind: "building" })))).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
  });

  it("증축: 바닥면적·증축 부분 기준시가를 싣는다 / 신축이면 싣지 않는다", async () => {
    const ext = donorBuiltOf(
      await bodyOf(form({ kind: "building", co: { donorBuiltType: "extension", donorBuiltExtensionArea: "100.5", donorBuiltExtensionStdPrice: "15,000,000" } })),
    );
    expect(ext).toEqual({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 100.5, extensionStdPriceAtAcquisition: 15_000_000 });
    // 신축으로 되돌린 뒤 남은 증축 칸은 stale — 전송하지 않는다
    const back = donorBuiltOf(
      await bodyOf(form({ kind: "building", co: { donorBuiltType: "new", donorBuiltExtensionArea: "100.5", donorBuiltExtensionStdPrice: "15,000,000" } })),
    );
    expect(back).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
  });

  it("Q-6(b) 구분 기재 모드: 토지·건물 양도가액이 sale 로 간다 / 안분 모드로 되돌린 뒤 남은 값은 가지 않는다", async () => {
    const actual = donorBuiltOf(
      await bodyOf(form({ asset: { saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000" } })),
    ) as { housing: { sale?: Record<string, unknown> } };
    expect(actual.housing.sale).toEqual({ landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000 });
    const stale = donorBuiltOf(
      await bodyOf(form({ asset: { saleSplitMode: "apportioned", landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000" } })),
    ) as { housing: Record<string, unknown> };
    expect(stale.housing.sale).toBeUndefined();
  });

  it("Q-6(b) 안분 모드로 되돌린 뒤 남은 감정가액·예외 값은 가지 않는다 (엔진은 모드가 아니라 값의 유무를 본다)", async () => {
    const db = donorBuiltOf(
      await bodyOf(form({ asset: { saleSplitMode: "apportioned", landAppraisalAtTransfer: "300,000,000", buildingAppraisalAtTransfer: "100,000,000", saleSplitExemption: "other_law" } })),
    ) as { housing: Record<string, unknown> };
    expect(db.housing.sale).toBeUndefined();
  });

  it("Q-6(b) 감정평가 모드: 양쪽 감정가액이 sale 로 간다", async () => {
    const db = donorBuiltOf(
      await bodyOf(form({ asset: { saleSplitMode: "appraisal", landAppraisalAtTransfer: "300,000,000", buildingAppraisalAtTransfer: "100,000,000" } })),
    ) as { housing: { sale?: Record<string, unknown> } };
    expect(db.housing.sale).toEqual({ landAppraisalAtTransfer: 300_000_000, buildingAppraisalAtTransfer: 100_000_000 });
  });

  it("범위 밖 stale 은 전송하지 않는다 — 환산 OFF / 토글 OFF / 자산 종류 변경", async () => {
    expect(donorBuiltOf(await bodyOf(form({ co: { useEstimatedAcquisition: false, donorAcquisitionPrice: "100,000,000" } })))).toBeUndefined();
    expect(donorBuiltOf(await bodyOf(form({ co: { donorBuilt: false } })))).toBeUndefined();
    expect(donorBuiltOf(await bodyOf(form({ asset: { assetKind: "land" } })))).toBeUndefined();
  });

  it("지분 모드(50%): 구분 기재 양도가액만 지분 스케일(transferPrice 와 같은 축), 기준시가·감정·취득 당시 입력은 스케일하지 않는다", async () => {
    const f = form({ asset: { saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000", landAppraisalAtTransfer: "300,000,000", buildingAppraisalAtTransfer: "100,000,000" } });
    f.assets[0] = { ...f.assets[0], ownershipNumerator: "50", ownershipDenominator: "100" } as AssetForm;
    const db = donorBuiltOf(await bodyOf(f)) as { housing: Record<string, unknown> & { sale: Record<string, unknown> } };
    expect(db.housing.sale.landTransferPrice).toBe(350_000_000);
    // 공유지분 — 건물은 비우고 엔진이 「지분 양도가액 − 토지」로 정한다 · 판정용 계약서 금액(100%)을 싣는다(계약 판정 계획서 PR-4)
    expect(db.housing.sale.buildingTransferPrice).toBeUndefined();
    expect(db.housing.sale).toMatchObject({ contractLandTransferPrice: 700_000_000, contractBuildingTransferPrice: 300_000_000 });
    expect(db.housing.sale.landAppraisalAtTransfer).toBe(300_000_000);
    expect(db.housing.landStdPriceAtTransfer).toBe(240_000_000);
    expect(db.housing.buildingStdPriceAtTransfer).toBe(160_000_000);
    expect(db.housing.landPricePerSqmAtAcquisition).toBe(1_000_000);
    expect(db.housing.buildingStdPriceAtAcquisition).toBe(60_000_000);
  });

  it("M10 컴패니언 payload 도 donorBuilt 를 싣는다 (함께 양도 자산의 이월과세 카드)", () => {
    const asset = {
      ...makeDefaultAsset(2),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "housing" as const,
      acquisitionCause: "carryover_gift" as const,
      acquisitionDate: "2024-05-01",
      standardPriceAtTransfer: "400,000,000",
      landStandardPriceAtTransfer: "240,000,000",
      buildingStandardPriceAtTransfer: "160,000,000",
      carryover: carryover({ ...DONOR_BUILT_ON, ...HOUSING_INPUTS }),
    };
    const payload = buildAssetPayload(asset as never, "apportioned", "2026-03-01") as { carryoverTaxation?: { donorBuilt?: unknown } };
    expect(payload.carryoverTaxation?.donorBuilt).toMatchObject({ buildingType: "new", constructionDate: "2022-01-10" });
  });
});

describe("DBC-V ⑧ validate — 미입력은 차단 (자동 fallback 금지)", () => {
  const issues = (f: TransferFormData) => collectStepIssues(0, f).map((i) => i.message ?? String(i));
  it("정상 입력(일체 주택·비주택)은 통과한다", () => {
    expect(issues(form())).toEqual([]);
    expect(issues(form({ kind: "building" }))).toEqual([]);
  });
  it.each([
    ["구분 미선택", { donorBuiltType: "" as const }, /신축.*증축.*구분|구분.*선택/],
    ["신축·증축일 미입력 (증여자 취득일로 채우지 않는다)", { donorBuiltDate: "" }, /대신 채우지 않습니다/],
    ["신축일이 증여자 취득일보다 앞", { donorBuiltDate: "2021-12-31" }, /증여자 취득일/],
    ["신축일이 증여 등기접수일보다 뒤", { donorBuiltDate: "2024-05-02" }, /증여 등기접수일/],
    ["일체 주택 ㎡당 공시지가 미입력", { donorBuiltLandPricePerSqm: "" }, /공시지가/],
    ["일체 주택 토지 면적 미입력", { donorBuiltLandArea: "" }, /면적/],
    ["일체 주택 취득 당시 건물 기준시가 미입력", { donorBuiltBuildingStdAtAcq: "" }, /건물 기준시가/],
  ])("일체 주택 · %s → 차단", (_l, co, re) => {
    const got = issues(form({ co }));
    expect(got.length).toBeGreaterThan(0);
    expect(got.join("\n")).toMatch(re);
  });
  it("증축 · 바닥면적 / 증축 부분 기준시가 미입력 → 차단", () => {
    expect(issues(form({ kind: "building", co: { donorBuiltType: "extension" } })).join("\n")).toMatch(/바닥면적/);
    expect(issues(form({ kind: "building", co: { donorBuiltType: "extension", donorBuiltExtensionArea: "100" } })).join("\n")).toMatch(/기준시가/);
  });
  it("일체 주택 · 양도 당시 토지·건물 기준시가 미입력 → 차단 (기존 칸 재사용, 입력 칸은 LandBuildingSaleSplitSection)", () => {
    expect(issues(form({ asset: { landStandardPriceAtTransfer: "" } })).length).toBeGreaterThan(0);
    expect(issues(form({ asset: { buildingStandardPriceAtTransfer: "" } })).length).toBeGreaterThan(0);
  });
  it("범위 밖 stale (환산 OFF · 토글 OFF) 는 요구하지 않는다 — 화면에 없는 칸을 요구하지 않는다", () => {
    expect(issues(form({ co: { donorBuilt: false, donorBuiltType: "", donorBuiltDate: "" } }))).toEqual([]);
    const stale = form({ co: { useEstimatedAcquisition: false, donorAcquisitionPrice: "100,000,000", donorBuiltType: "", donorBuiltDate: "" } });
    expect(issues(stale)).toEqual([]);
  });
});

describe("DBC-G ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫ 통과", () => {
  // 입력 상태 격자: 종류 × 신축/증축 × 일체 주택 입력 완비/누락 × 양도가액 모드 × 범위 밖 조합
  interface Cell { label: string; f: TransferFormData }
  const cells: Cell[] = [];
  for (const kind of ["housing", "building"] as const)
    for (const type of ["new", "extension", ""] as const)
      for (const full of [true, false])
        for (const sale of ["apportioned", "actual", "appraisal"] as const) {
          const co: Partial<CarryoverTaxationForm> = {
            donorBuiltType: type,
            ...(type === "extension" ? { donorBuiltExtensionArea: full ? "100" : "", donorBuiltExtensionStdPrice: full ? "15,000,000" : "" } : {}),
            ...(kind === "housing" && !full ? { donorBuiltLandArea: "" } : {}),
          };
          const asset: Partial<AssetForm> =
            sale === "actual"
              ? { saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000" }
              : sale === "appraisal"
                ? { saleSplitMode: "appraisal", landAppraisalAtTransfer: "300,000,000", buildingAppraisalAtTransfer: full ? "100,000,000" : "" }
                : {};
          cells.push({ label: `${kind}/${type || "미선택"}/${full ? "완비" : "누락"}/${sale}`, f: form({ kind, co, asset }) });
        }
  it(`격자 ${cells.length}셀 — ⑧이 통과시킨 입력은 ⑫(Zod)도 통과한다`, async () => {
    let passed = 0;
    for (const { label, f } of cells) {
      const err = collectStepIssues(0, f);
      if (err.length > 0) continue;
      passed++;
      const body = await bodyOf(f);
      const parsed = propertySchema.safeParse(body);
      expect(parsed.success, `${label}: ⑧ 통과인데 ⑫ 거부 — ${parsed.success ? "" : JSON.stringify(parsed.error.issues.map((i) => i.path.join(".") + ":" + i.message))}`).toBe(true);
    }
    expect(passed).toBeGreaterThan(4); // 격자가 전부 막혀 공허하지 않다
  });
  it("⑧이 막은 셀은 donorBuilt 필수 칸 누락뿐이다 (완비 셀은 모두 통과)", () => {
    for (const { label, f } of cells.filter((c) => c.label.includes("완비") && !c.label.includes("미선택"))) {
      expect(collectStepIssues(0, f), label).toEqual([]);
    }
  });
});
