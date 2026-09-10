/**
 * anchor — UI 리뷰 대장 **밖** 미판정 23건 중 배치② 순수 축 (R06 · R11 · R13).
 * 대장: `docs/reviews/transfer-ui-review-2026-09-unjudged.md`
 */
import { describe, it, expect } from "vitest";
import { validateNblOtherLand } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import {
  isDeemedTransferApplicable,
  requiresDeemedTransferDate,
} from "@/lib/calc/nbl-deemed-transfer-scope";
import { resolveLookupYear } from "@/components/calc/transfer/HousePriceYearLookup";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const L = "자산1";
const land = (over: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind: "land",
  nblUseDetailedJudgment: true,
  nblLandType: "other_land",
  nblZoneType: "urban_residential",
  acquisitionArea: "500",
  nblOtherPropertyTaxType: "separate",
  ...over,
});

/* ══ R06 · 건축물이 있으면 바닥면적은 필수다 ══════════════════════════════
 *
 * 엔진 Step 0.6(`other-land.ts:165-172`)은 `buildingFloorArea > 0`일 때만
 * §101①2호 **배율 한도**를 판정한다. 미입력이면 한도 초과 부속토지가 사업용으로
 * 남아 **세액이 과소**해진다. 종전에는 ⑤ hint가 2% 케이스만 설명해 정상 건물
 * 보유자가 칸을 비웠고, ⑧에도 요구가 없었다.
 */
describe("R06 · 기타토지 건축물 바닥면적 필수", () => {
  it("🔴 건축물 있음 + 바닥면적 미입력 → 차단", () => {
    const err = validateNblOtherLand(
      land({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "" }),
      L,
    );
    expect(err).toContain("건축물 바닥면적");
  });

  it("🔴 0을 넣어도 차단된다 (엔진 게이트가 `> 0`이다)", () => {
    const err = validateNblOtherLand(
      land({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "0" }),
      L,
    );
    expect(err).toContain("건축물 바닥면적");
  });

  it("메시지가 «무엇에 쓰이는지»와 조문을 밝힌다", () => {
    const err = validateNblOtherLand(
      land({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "" }),
      L,
    );
    expect(err).toContain("배율 한도");
    expect(err).toContain("지방세법 시행령 제101조 제1항 제2호");
  });

  it("🔴 대조군 — 바닥면적을 넣으면 이 사유로는 막지 않는다", () => {
    const err = validateNblOtherLand(
      land({ nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "120" }),
      L,
    );
    expect(err ?? "").not.toContain("건축물 바닥면적");
  });

  it("🔴 대조군 — 건축물이 없으면 요구하지 않는다 (나대지)", () => {
    const err = validateNblOtherLand(
      land({ nblOtherHasBuilding: false, nblOtherBuildingFloorArea: "" }),
      L,
    );
    expect(err ?? "").not.toContain("건축물 바닥면적");
  });
});

/* ══ R11 · 양도일 의제 요구는 ⑤ 렌더 게이트와 «같은 술어»를 쓴다 ═════════════
 *
 * ⑤ `NblSectionContainer`는 `nblLandType !== "housing_site"`로 섹션을 게이트하는데
 * ⑧은 지목을 보지 않았다. 사유를 고른 뒤 지목을 주택부수토지로 바꾸면 섹션은 사라지고
 * 사유만 남아 **화면에 없는 칸을 요구하며 영구 차단**됐다(리셋 패치 없음).
 */
describe("R11 · 의제일 요구는 지목 게이트를 공유한다", () => {
  const withReason = (t: AssetForm["nblLandType"]) =>
    land({
      nblLandType: t,
      nblDeemedTransferReason: "auction",
      nblDeemedTransferDate: "",
    });

  it("🔴 주택부수토지에서는 의제일을 요구하지 않는다 — dead-end 해소", () => {
    const err = validateNblDetailedJudgment(withReason("housing_site"), L, "2024-06-30");
    expect(err ?? "").not.toContain("의제일");
  });

  it("🔴 대조군 — 기간기준 지목에서는 종전대로 요구한다", () => {
    const err = validateNblDetailedJudgment(withReason("farmland"), L, "2024-06-30");
    expect(err).toContain("의제일");
  });

  it("술어가 ⑤ 게이트와 같은 답을 낸다", () => {
    expect(isDeemedTransferApplicable("housing_site")).toBe(false);
    expect(isDeemedTransferApplicable("farmland")).toBe(true);
    expect(isDeemedTransferApplicable(undefined)).toBe(false);
  });

  it("사유가 «none»·미선택이면 지목과 무관하게 요구하지 않는다", () => {
    expect(requiresDeemedTransferDate(land({ nblDeemedTransferReason: "none" }))).toBe(false);
    expect(requiresDeemedTransferDate(land({ nblDeemedTransferReason: "" }))).toBe(false);
  });
});

/* ══ R13 · 공시가격 조회 기준연도 기본값 = «양도일» 연도 ════════════════════
 *
 * 여기서 채운 `house.officialPrice`는 §167의3①1호 다주택 주택 수 산정의 기준시가가
 * 되고, 그 판정 시점은 **양도 당시**다. 종전 기본값은 「오늘 연도」였다.
 */
describe("R13 · 조회 기준연도는 양도일에서 온다", () => {
  const THIS_YEAR = String(new Date().getFullYear());

  it("🔴 과거 양도면 그 연도가 기본값이다", () => {
    expect(resolveLookupYear("2019-04-15")).toBe("2019");
  });

  it("🔴 오늘 연도로 떨어지지 않는다", () => {
    expect(resolveLookupYear("2019-04-15")).not.toBe(THIS_YEAR);
  });

  it("양도일이 없으면 오늘 연도", () => {
    expect(resolveLookupYear(undefined)).toBe(THIS_YEAR);
    expect(resolveLookupYear("")).toBe(THIS_YEAR);
  });

  it("공시 개시(2006) 이전·미래 연도는 오늘 연도로 안전 복귀", () => {
    expect(resolveLookupYear("2003-01-01")).toBe(THIS_YEAR);
    expect(resolveLookupYear("2999-01-01")).toBe(THIS_YEAR);
  });
});
