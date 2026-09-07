/**
 * anchor: 조특령 §66⑭ **결격 과세기간 검증의 게이트** (UI 리뷰 낮음 L2).
 *
 * 결함: 이 검증이 `if (nblExempt) return null;` **앞**에 있고 지목 조건도 없어,
 *       유일한 입력칸(`FarmlandDetailSection` — 지목 「농지」에서만 마운트 + 의제 성립 시
 *       `pointer-events-none`)이 화면에 **없거나 클릭 불가**인 상태에서 1단계가 차단됐다.
 *
 * ⇒ 검증 게이트를 렌더 게이트와 같게 맞춘다. ④(`form-mapper`)는 파싱된 연도만 싣고
 *   invalid는 버리므로 **세액은 불변**이다 — 고쳐진 것은 도달 가능성뿐이다.
 */
import { describe, it, expect } from "vitest";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER = "2025-05-01";

function landAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionDate: "2010-06-01",
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "management",
    acquisitionArea: "500",
    ...over,
  } as AssetForm;
}

const run = (over: Partial<AssetForm> = {}) =>
  validateNblDetailedJudgment(landAsset(over), "토지", TRANSFER);

describe("L2 — 결격 과세기간 검증은 입력칸의 렌더 게이트를 따른다", () => {
  it("🔑 G-1: 지목이 임야면 형식 오류가 남아 있어도 차단하지 않는다 (칸이 화면에 없다)", () => {
    const msg = run({ nblLandType: "forest", nblDisqualifiedTaxPeriods: "이십십구" });
    expect(msg).toBeNull();
  });

  it("🔑 G-2: 지목이 농지면 종전대로 형식 오류를 차단한다 — 게이트를 지운 게 아니다", () => {
    const msg = run({ nblDisqualifiedTaxPeriods: "이십십구" });
    expect(msg).toContain("결격 과세기간");
    expect(msg).toContain("인식할 수 없는 값");
  });

  it("G-3: 농지 + 범위 밖 연도도 종전대로 차단한다", () => {
    const msg = run({ nblDisqualifiedTaxPeriods: "1999" });
    expect(msg).toContain("범위 밖");
  });

  it("G-4: 농지 + 정상 입력은 통과", () => {
    expect(run({ nblDisqualifiedTaxPeriods: "2019, 2020" })).toBeNull();
  });

  it("🔑 G-5: 무조건 사업용 의제가 성립하면 차단하지 않는다 (칸이 pointer-events-none)", () => {
    // 상속일 2006.12.31 이전 + 2009.12.31까지 양도 + 지목 농지 → §168의14③ 의제 성립.
    const asset = landAsset({
      acquisitionCause: "inheritance",
      acquisitionDate: "2005-03-01",
      nblExemptInheritBefore2007: true,
      nblExemptInheritDate: "2005-03-01",
      nblDisqualifiedTaxPeriods: "이십십구",
    });
    expect(validateNblDetailedJudgment(asset, "토지", "2009-06-01")).toBeNull();
  });
});
