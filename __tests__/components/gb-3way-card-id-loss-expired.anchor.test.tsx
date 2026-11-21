/**
 * 결과뷰 리뷰 2026-11-21 MAJOR — 일반건물 증축 3자산 요약표(`GeneralBuilding3WayTable`). 화면 경로(폼 → ⑧ → ④ → ⑫ → ⑭ → 표) · mock 세율.
 *
 * R-c07-01: 열을 라벨 부분 문자열(「1001」「3001」「3002」)로 골랐다 — 함께 양도 카드 라벨은 「<자산 명칭> 토지(1001)」라
 *   명칭이 「상가 3001호」이면 토지 카드가 건물1 열에도 들어가 양도가액 합계가 2,575,258,716(참값 1,600,000,000)이 됐다.
 * R-c07-04: 결손 자산의 기여분을 |양도소득금액| 전액으로 셌다 — 흡수되지 못하고 소멸한 결손까지 「+」로 세고,
 *   단건에서도 「함께 양도한 다른 자산의 양수 소득에 흡수」라고 적었다(단건 +1,609,572,901 = 엔진 unusedLoss).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { gbBlockViewsOf } from "@/components/calc/results/transfer/gb-result-block-views";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const SALE = 1_600_000_000;
/** 증축 일반건물 — 토지 4억 · 원건물 25억(결손) · 증축분 실가 5천만. */
const GB: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: String(SALE),
  landAcqMode: "actual", buildingAcqMode: "actual", gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50",
  gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01", acquisitionDate: "2010-05-01", landAcquisitionPrice: "400000000", buildingAcquisitionPrice: "2500000000",
} as Partial<AssetForm>;
const LAND: Partial<AssetForm> = {
  assetKind: "land", addressJibun: "서울 강남구 역삼동 2", acquisitionCause: "purchase", acquisitionDate: "2010-05-01",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "900000000", landArea: "100",
} as Partial<AssetForm>;

async function tableText(f: TransferFormData): Promise<string[]> {
  expect(allIssues(f)).toEqual([]);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(await captureBody(f)),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const agg = json.data.aggregated;
  return gbBlockViewsOf(agg, json.data.apportionment ?? { apportioned: [] }, f).map((v) => {
    const { container } = render(<GeneralBuilding3WayTable aggregated={agg} view={v} />);
    return container.textContent ?? "";
  });
}
/** 결손 통산 행 — 근거는 소득세법 §102② + 시행령 §167의2(종전 「영§102②」는 시행령 §102 채권등의 범위 — 오기). */
const OFFSET_ROW = `결손 통산 (${TRANSFER.LOSS_OFFSET})`;
/** 행 하나의 칸(구분 · 토지 · 건물1 · 건물2 · 합계). */
const rowCells = (text: string, head: string) => {
  const tr = [...document.querySelectorAll("tr")].find((r) => r.querySelector("td")?.textContent === head);
  expect(tr, `${head} 행 (${text.slice(0, 40)})`).toBeTruthy();
  return [...tr!.querySelectorAll("td")].slice(1).map((td) => td.textContent);
};

const EXPIRED_ROW = "통산 못한 결손 소멸 (이월 불인정)";
const num = (c: string | null) => (c === "-" || c === null ? 0 : c.startsWith("△") ? -Number(c.slice(1).replace(/,/g, "")) : Number(c.replace(/^\+/, "").replace(/,/g, "")));
/** 열마다 통산 전 양도소득금액 + 결손 통산 + 소멸 결손 = 통산 후 양도소득금액(합계 열 포함). */
const expectColumnsAddUp = (text: string) => {
  const [before, offset, expired, after] = ["양도소득금액", OFFSET_ROW, EXPIRED_ROW, "통산 후 양도소득금액"].map((h) => rowCells(text, h).map(num));
  expect(before.map((b, i) => b + offset[i] + expired[i])).toEqual(after);
};

describe("R-c07-04 — 단건: 흡수되지 못한 결손은 기여가 아니라 소멸", () => {
  it("결손 통산 행 = 실제 넘어간 몫(엔진 lossOffsetTable) · 합계 0 · 「다른 자산」 서술 없음 · 소멸 1,609,572,901 각주", async () => {
    const f = newForm();
    Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", contractTotalPrice: String(SALE) });
    f.assets = [Object.assign({ ...makeDefaultAsset(1) }, GB) as AssetForm];
    const [text] = await tableText(f);
    // 종전: △605,670,105 | +2,210,015,710 | +5,227,296 | +1,609,572,901
    expect(rowCells(text, OFFSET_ROW)).toEqual(["△605,670,105", "+604,240,908", "+1,429,197", "0"]);
    // 종전: 소멸 행이 없어 건물 열·합계 열이 통산 전 + 결손 통산 ≠ 통산 후였다.
    // 건물1 604,240,908 + 1,605,774,802 = 2,210,015,710 · 건물2 1,429,197 + 3,798,099 = 5,227,296 (= 각 결손 전액)
    expect(rowCells(text, EXPIRED_ROW)).toEqual(["-", "+1,605,774,802", "+3,798,099", "+1,609,572,901"]);
    expectColumnsAddUp(text);
    expect(text).not.toContain("함께 양도한 다른 자산");
    expect(text).toContain("결손 중 1,609,572,901은 공제할 양도소득금액이 없어 통산되지 못하고 소멸합니다(이월 불인정).");
    expect(text).toContain(`이 표의 통산 후 합계는 통산 전보다 1,609,572,901 큽니다 (${TRANSFER.LOSS_OFFSET}).`);
    expect(text).not.toMatch(/영 ?§102②/);
  });
});

describe("R-c07-01 + R-c07-04 — 함께 양도 · 자산 명칭 「상가 3001호」", () => {
  it("열은 카드 id로 — 양도가액 1,265,243,006 | 289,984,290 | 44,772,704 | 1,600,000,000 · 다른 자산 흡수 560,000,000 · 소멸 1,049,572,901", async () => {
    const f = newForm() as unknown as Record<string, unknown>;
    const land = Object.assign({ ...makeDefaultAsset(1) }, LAND, { assetLabel: "나대지" }) as AssetForm;
    const gb = Object.assign({ ...makeDefaultAsset(2) }, GB, { assetLabel: "상가 3001호" }) as AssetForm;
    Object.assign(f, {
      transferDate: "2026-02-16", filingDate: "2026-05-31", assets: [land, gb],
      assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: String(SALE + 900_000_000),
    });
    const [text] = await tableText(f as unknown as TransferFormData);
    expect(text).toContain("상가 3001호");
    // 종전: 1,265,243,006 | 1,265,243,006 | 44,772,704 | 2,575,258,716 (토지 카드가 건물1 열에도)
    expect(rowCells(text, "양도가액")).toEqual(["1,265,243,006", "289,984,290", "44,772,704", "1,600,000,000"]);
    expect(rowCells(text, OFFSET_ROW)).toEqual(["△605,670,105", "+1,162,919,479", "+2,750,626", "+560,000,000"]);
    // 건물1 1,162,919,479 + 1,047,096,231 = 2,210,015,710 · 건물2 2,750,626 + 2,476,670 = 5,227,296
    expect(rowCells(text, EXPIRED_ROW)).toEqual(["-", "+1,047,096,231", "+2,476,670", "+1,049,572,901"]);
    expectColumnsAddUp(text);
    expect(text).toContain("결손 중 560,000,000은 함께 양도한 다른 자산의 양수 소득에 흡수되었습니다.");
    expect(text).toContain("결손 중 1,049,572,901은 공제할 양도소득금액이 없어 통산되지 못하고 소멸합니다(이월 불인정).");
    expect(text).toContain("이 표의 통산 후 합계는 통산 전보다 1,609,572,901 큽니다");
  });
});
