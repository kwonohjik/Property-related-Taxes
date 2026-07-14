/**
 * 겸용주택 거주기간 단일 소스화 — 보유상황(입주일·퇴거일)에서 residencePeriodYears 도출 앵커.
 *
 * 계획서: docs/02-design/features/mixed-use-residence-single-source.plan.md
 * 변경: API `mixedUse.residencePeriodYears`를 자산목록 ④(mixedUseResidencePeriodYears) 대신
 *        보유상황 거주(residencePeriods/residencePeriodMonthsAsset)에서 Math.floor(months/12)로 도출.
 *
 * Pre-Do: 현재는 mixedUseResidencePeriodYears(기본 "" → 0)를 사용 → 아래 anchor-A는 RED(0 반환).
 *          변경 후 보유상황 293개월 → 24년으로 GREEN.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/** 유효한 겸용주택 폼 (§97 직접환산, PHD 미적용) + Step4 거주 구간. */
function mixedForm(residence: {
  mode?: "interval" | "direct";
  periods?: { moveInDate: string; moveOutDate: string }[];
  months?: string;
}) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.filingDate = "2026-04-30";
  form.contractTotalPrice = "1500000000";
  form.householdHousingCount = "1";
  form.isOneHousehold = true;
  form.assets[0] = {
    ...form.assets[0],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    isOneHousehold: true,
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
    // 보유상황(이미지50) 거주 입력
    residenceInputMode: residence.mode ?? "direct",
    residencePeriods: residence.periods ?? [],
    residencePeriodMonthsAsset: residence.months ?? "0",
  };
  return form;
}

function mixedUseYears(body: Record<string, unknown>): number {
  const mu = body.mixedUse as { residencePeriodYears?: number } | undefined;
  return mu?.residencePeriodYears ?? -1;
}

describe("[MIXED-RESIDENCE] 거주기간 단일 소스 — 보유상황에서 도출", () => {
  it("anchor-A: 보유상황 구간 1997-09-12~2022-02-16(293개월) → residencePeriodYears=24", async () => {
    const form = mixedForm({
      mode: "interval",
      periods: [{ moveInDate: "1997-09-12", moveOutDate: "2022-02-16" }],
    });
    const { run, get } = captureBody(form);
    await run();
    expect(mixedUseYears(get()!)).toBe(24); // floor(293/12)=24
  });

  it("anchor-B 표2 경계: 직접 24개월 → 2년(표2 가능)", async () => {
    const form = mixedForm({ mode: "direct", months: "24" });
    const { run, get } = captureBody(form);
    await run();
    expect(mixedUseYears(get()!)).toBe(2); // floor(24/12)=2
  });

  it("anchor-B 표2 경계: 직접 23개월 → 1년(표1)", async () => {
    const form = mixedForm({ mode: "direct", months: "23" });
    const { run, get } = captureBody(form);
    await run();
    expect(mixedUseYears(get()!)).toBe(1); // floor(23/12)=1
  });

  it("anchor-D 거주 0 무회귀: 보유상황 미입력 → residencePeriodYears=0(표1)", async () => {
    const form = mixedForm({ mode: "direct", months: "0" });
    const { run, get } = captureBody(form);
    await run();
    expect(mixedUseYears(get()!)).toBe(0);
  });
});
