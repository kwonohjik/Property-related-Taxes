/**
 * 지분 모드(같은 물건 분할취득) — companion 자산 basic을 primary에서 병합 앵커.
 *
 * 배경: 지분 모드는 같은 물건을 지분(%)별로 나눠 취득한 것이므로 자산종류·면적 등
 *   기본정보가 전 자산 동일. UI에서 companion(자산2+) ① 기본정보를 숨기면 companion
 *   form-state의 assetKind는 makeDefaultAsset 기본값("housing")에 머문다.
 * 수정: API 변환·validate에서 `mergePrimaryBasic`로 primary basic을 companion에 병합
 *   (게이트 = isFullFractionalBundle: 전 자산 fractional). buildAssetPayload는 assetKind를
 *   항상 emit하므로, 병합 없으면 companion.assetKind가 "housing"으로 잘못 도달(세율·장특 오산).
 *
 * Pre-Do: 병합 전 companion.assetKind === "housing"(기본값) → A1 RED. 병합 후 "land" GREEN.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";

afterEach(() => vi.unstubAllGlobals());

function captureBody(form: ReturnType<typeof createDefaultTransferFormData>) {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "bundled", result: {} } }) } as Response;
    }),
  );
  return { run: () => callTransferTaxAPI(form), get: () => captured };
}

/**
 * primary = land 60% 상속, companion = land 40% 매매(같은 나대지).
 * companion은 UI ① 숨김을 모사 — basic 공란 + assetKind 기본값(housing) 유지.
 */
function fractionalLandForm(companionOwnershipFilled: boolean) {
  const form = createDefaultTransferFormData();
  form.transferDate = "2026-02-16";
  form.contractTotalPrice = "1000000000"; // 100% 기준 총 양도가
  form.bundledSaleMode = "apportioned";
  // primary = 토지(60% 상속) — basic 입력
  form.assets[0] = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionArea: "300",
    transferArea: "300",
    acquisitionCause: "inheritance",
    acquisitionDate: "2008-05-05",
    decedentAcquisitionDate: "2001-01-01",
    publishedValueAtInheritance: "808000000",
    ownershipNumerator: "60",
    ownershipDenominator: "100",
  };
  // companion = 40% 매매 — ① 숨김 모사: basic 공란 + assetKind 기본값(housing).
  form.assets.push({
    ...makeDefaultAsset(2),
    // assetKind 미설정 → 기본값 "housing" (병합 대상)
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-03",
    fixedAcquisitionPrice: "400000000", // 100% 기준
    ownershipNumerator: companionOwnershipFilled ? "40" : "",
    ownershipDenominator: companionOwnershipFilled ? "100" : "",
  });
  return form;
}

function companion0(body: Record<string, unknown>) {
  const arr = body.companionAssets as Array<{ assetKind?: string }> | undefined;
  return arr?.[0];
}

/** 환산(estimated) 모드 companion: 취득시·양도시 기준시가는 ③ 취득정보에서 입력(② 아님). */
function fractionalEstimatedForm() {
  const form = fractionalLandForm(true);
  form.assets[1] = {
    ...form.assets[1],
    acquisitionCause: "purchase",
    useEstimatedAcquisition: true, // 환산
    fixedAcquisitionPrice: "",
    standardPriceAtAcq: "500000000", // 취득시 기준시가 (100% 기준, ③ 입력)
    standardPriceAtTransfer: "900000000", // 양도시 기준시가 (100% 기준, ③ 환산 입력)
  };
  return form;
}

describe("[FRACTIONAL-BASIC-MERGE] 지분 모드 companion basic ← primary 병합", () => {
  it("A1: companion(basic 공란·기본 housing)의 payload assetKind가 primary 'land'로 병합", async () => {
    const { run, get } = captureBody(fractionalLandForm(true));
    await run();
    // 병합 전이면 "housing"(makeDefaultAsset 기본값) → RED. 병합 후 "land" → GREEN.
    expect(companion0(get()!)?.assetKind).toBe("land");
  });

  it("A2-pass: fractional companion(land·면적 공란)이 validate 미차단(면적 primary 병합)", () => {
    // companion assetKind를 명시 land로 두고 면적 공란 → 병합 전이면 "면적 입력" 차단(RED),
    // 병합 후 primary 면적(300)이 채워져 통과(GREEN). (판별력 확보)
    const form = fractionalLandForm(true);
    form.assets[1] = {
      ...form.assets[1],
      assetKind: "land",
      acquisitionArea: "",
      transferArea: "",
    };
    const issues = collectStepIssues(0, form);
    const companionBasicBlock = issues.find(
      (i) => i.assetIndex === 1 && /면적|자산 유형|소재지/.test(i.message),
    );
    expect(companionBasicBlock).toBeUndefined();
  });

  it("A2-block: fractional companion 지분율 미입력은 여전히 차단", () => {
    const form = fractionalLandForm(false); // companion ownership 공란
    const issues = collectStepIssues(0, form);
    const ownershipBlock = issues.find((i) => i.assetIndex === 1 && /지분/.test(i.message));
    expect(ownershipBlock).toBeDefined();
  });

  it("A3-sum: 지분율 합계≠100% 차단 (60%+30%=90% → 과소과세 방지)", () => {
    const form = fractionalLandForm(true);
    form.assets[0] = { ...form.assets[0], ownershipNumerator: "60", ownershipDenominator: "100" };
    form.assets[1] = { ...form.assets[1], ownershipNumerator: "30", ownershipDenominator: "100" };
    const issues = collectStepIssues(0, form);
    const sumBlock = issues.find((i) => /합계|100%/.test(i.message));
    expect(sumBlock).toBeDefined();
  });

  it("A3-sum-pass: 지분율 합계=100% 통과 (60%+40%)", () => {
    const form = fractionalLandForm(true); // 60 + 40 = 100
    const issues = collectStepIssues(0, form);
    const sumBlock = issues.find((i) => /지분율.*합계|합계.*100%/.test(i.message));
    expect(sumBlock).toBeUndefined();
  });

  it("A4-estimated: 환산 companion의 양도시 기준시가(③ 입력)가 payload에 도달 (F2 non-issue)", async () => {
    const { run, get } = captureBody(fractionalEstimatedForm());
    await run();
    const arr = get()!.companionAssets as Array<{
      standardPriceAtTransfer?: number;
      standardPriceAtAcquisition?: number;
      useEstimatedAcquisition?: boolean;
    }>;
    // ② 안분 입력을 숨겨도 환산(③) 양도시 기준시가가 정상 전달 → 환산 지분 분할 작동
    expect(arr[0].standardPriceAtTransfer).toBe(900000000);
    expect(arr[0].standardPriceAtAcquisition).toBe(500000000);
    expect(arr[0].useEstimatedAcquisition).toBe(true);
  });

  it("A4-estimated-pass: 환산 companion가 validate 미차단", () => {
    const issues = collectStepIssues(0, fractionalEstimatedForm());
    const companionBlock = issues.find((i) => i.assetIndex === 1);
    expect(companionBlock).toBeUndefined();
  });
});
