/**
 * Pre-Do anchor — 일반건물 × 이월과세의 **④ API 변환 · ⑧ validate** 계층.
 *
 * 계획: `docs/00-pm/transfer-gb-carryover-wiring.plan.md`
 * 설계: `docs/02-design/features/transfer-gb-carryover-wiring.engine.design.md` D9-10(payload 계약)·D5
 * route 계층 anchor: `__tests__/api/transfer.route.gb-carryover.predo.anchor.test.ts`
 *
 * ## 이 파일이 지키는 것
 *
 * route anchor는 **payload를 손으로 만들어** 엔진을 검증한다. 그래서 「폼에서 그 payload가
 * 만들어지는가」를 못 본다 — 그것이 이 기능의 **결함 그 자체**였다(계획 §2 ③:
 * 200 OK · 경고 0 · 세액 그대로). 여기서 ④를 직접 부른다.
 *
 * 고정 계약:
 *   K-01  `landCarryoverTaxation`/`carryoverGiftEvent`가 폼에서 만들어진다 (환산·실가 **두 진입점**)
 *   K-13  ⑧ 필수 칸 미입력 차단 + Σ 초과 차단
 *   K-15  지분 분할에서 이월과세 금액은 **× 지분율 하지 않는다** (Q3)
 *   K-18  부담부증여 × 이월과세 **차단** (Q4)
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

const TRANSFER_DATE = "2024-03-01";

/** 이월과세 서브객체 — 실가 모드 기준선(필수값 충족). */
const carryoverForm = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-03-01",
  donorAcquisitionDate: "2005-06-15",
  donorAcquisitionPrice: "150,000,000",
  giftTaxAmount: "30,000,000",
  giftDateValuation: "400,000,000",
  ...over,
});

/** 일반건물 자산 — 환산 모드 기준선. */
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

/** 이월과세를 고른 자산 (토지 취득원인 = 자산-수준 `acquisitionCause`). */
const carryoverAsset = (over: Partial<AssetForm> = {}) =>
  gbAsset({
    acquisitionCause: "carryover_gift",
    carryover: carryoverForm() as never,
    ...over,
  });

function form(assets: AssetForm[], over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "1,000,000,000",
    householdHousingCount: "2",
    assets,
    ...over,
  } as TransferFormData;
}

const build = (asset: AssetForm) =>
  buildGeneralBuildingValuation(asset, TRANSFER_DATE) as Record<string, unknown> | undefined;

const messages = (f: TransferFormData) => collectStepIssues(0, f).map((i) => i.message).join(" | ");

describe("GB × 이월과세 — ④ 변환 Pre-Do anchor", () => {
  // ══════════════════════════════════════════════════════════════════
  // K-01 — 폼에서 서브객체가 만들어진다 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-01: `landCarryoverTaxation`이 폼에서 만들어진다", () => {
    /**
     * 🔴 **이것이 결함의 본체다.** 현행 ④는 `landAcquisitionCause: "carryover_gift"`만 싣고
     *    서브객체를 만들지 않는다 ⇒ 엔진 STEP 0.475 조건 불충족 → **조용히 미발동**
     *    (실측: 200 OK · 경고 0 · 세액 그대로 — 계획 §2 ③).
     */
    it("양성 대조군 — 취득원인은 지금도 실린다", () => {
      const v = build(carryoverAsset());
      expect(v?.landAcquisitionCause).toBe("carryover_gift");
    });

    it.fails("🔴 환산 경로 — 서브객체가 실린다", () => {
      const v = build(carryoverAsset());
      expect(v?.landCarryoverTaxation ?? v?.landCarryoverPart).toBeDefined();
    });

    /**
     * 🔑 **두 진입점을 각각 건다**(설계 D1-1). `landAcquisitionCause`를 싣는 코드가
     *    환산 경로와 실가 경로에 **따로** 있어, 한쪽만 고치면 모드에 따라 켜졌다 꺼졌다 한다.
     */
    it.fails("🔴 실가 경로 — 서브객체가 실린다", () => {
      const v = build(
        carryoverAsset({
          useEstimatedAcquisition: false,
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          gbLandAcquisitionPrice: "300,000,000",
          gbBuildingAcquisitionPrice: "200,000,000",
        } as Partial<AssetForm>),
      );
      expect(v?.landCarryoverTaxation ?? v?.landCarryoverPart).toBeDefined();
    });

    it("음성 대조군 — 이월과세 미선택이면 서브객체가 없다 (회귀 0)", () => {
      const v = build(gbAsset());
      expect(v?.landCarryoverTaxation).toBeUndefined();
      expect(v?.landCarryoverPart).toBeUndefined();
      expect(v?.carryoverGiftEvent).toBeUndefined();
    });

    /**
     * 🔴 **타입 계층에도 갭이 있다** — `AssetForm.gbBuildingAcquisitionCause`는
     *    `purchase|inheritance|gift|newConstruction`뿐이라 `carryover_gift`를 받지 못한다
     *    (`BUILDING_CAUSE_OPTIONS`도 4종). 구현이 **타입과 옵션을 함께 넓혀야** 한다.
     *    그때까지는 `as unknown as`로 우회한다 — tsc가 0이어야 커밋할 수 있기 때문이다.
     */
    it.fails("🔴 건물 파트 — `buildingCarryoverTaxation`이 실린다 (Q1)", () => {
      const v = build(
        carryoverAsset({
          gbBuildingAcquisitionCause: "carryover_gift",
        } as unknown as Partial<AssetForm>),
      );
      expect(v?.buildingCarryoverTaxation ?? v?.buildingCarryoverPart).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-18 — 부담부증여 차단 (Q4) 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-18: 부담부증여 × 이월과세는 차단한다", () => {
    /**
     * 「소득세법 시행령」 §159가 부담부증여의 취득가액을 **직접 정한다**.
     * 함께 배선하면 이중 적용이 되고 어느 쪽이 이겼는지 화면으로 알 수 없다(계획 §6 Q4).
     *
     * ⚠️ **음성 단언만 두면 판별력이 0이다** — 지금은 어느 경우에도 서브객체가 없어
     *    「차단됐다」와 「애초에 안 만든다」가 구별되지 않는다.
     *    ⇒ **양성 대조군을 같은 테스트 안**에 둔다(메모리 `feedback_negative_assertion_needs_mutation_probe`).
     */
    it.fails("🔑 부담부증여면 없고, 일반 양도면 있다 (음성 + 양성 한 쌍)", () => {
      const burdened = build(
        carryoverAsset({ transferType: "burdened_gift" } as Partial<AssetForm>),
      );
      const normal = build(carryoverAsset());
      // 음성 — 부담부증여에서는 만들지 않는다
      expect(burdened?.landCarryoverTaxation ?? burdened?.landCarryoverPart).toBeUndefined();
      // 양성 — 일반 양도에서는 만든다 (이게 없으면 위 음성이 무의미하다)
      expect(normal?.landCarryoverTaxation ?? normal?.landCarryoverPart).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-15 — 지분 분할 × 이월과세: 스케일하지 않는다 (Q3) 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-15: 지분 분할에서 이월과세 금액은 × 지분율 하지 않는다", () => {
    /**
     * 각 지분은 **별개의 취득 사건**(법 §98·영 §162①)이고, 그 지분을 증여로 취득했다면
     * **그 증여에 대한 실제 증여세·증여자 취득가액**이 존재한다. 「100%였다면 얼마였을까」는
     * 존재하지 않는 가상값이라 역산을 시키게 된다(계획 §6 Q3).
     *
     * ⚠️ 대비 — `landAcquisitionPrice`를 × r 하는 것은 사용자가 물건 전체 시세를 아는 상황을
     *    전제한다. **같은 규칙을 기계적으로 확장하면 틀린다.**
     */
    const share = (id: string, num: string, over: Partial<AssetForm> = {}) =>
      gbAsset({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100", ...over });

    it.fails("40% 지분의 증여자 취득가액이 **입력값 그대로** 실린다", () => {
      const shares = buildGeneralBuildingShares(
        [
          share("a", "60"),
          share("b", "40", {
            acquisitionDate: "2021-03-01",
            acquisitionCause: "carryover_gift",
            carryover: carryoverForm() as never,
          }),
        ],
        TRANSFER_DATE,
      );
      const b = shares?.[1].valuation as Record<string, unknown> | undefined;
      const ct = (b?.landCarryoverTaxation ?? b?.landCarryoverPart) as
        | Record<string, number>
        | undefined;
      expect(ct).toBeDefined();
      // × 0.4 가 걸리면 60,000,000이 된다 — 그러면 안 된다
      expect(ct?.donorAcquisitionPrice).toBe(150_000_000);
      expect(ct?.giftTaxAmount ?? ct?.giftDateAssetValue).not.toBe(12_000_000);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// K-13 — ⑧ validate 🔴 현재 0건
// ══════════════════════════════════════════════════════════════════
describe("GB × 이월과세 — ⑧ validate Pre-Do anchor", () => {
  /**
   * 🔴 **가장 위험한 실패 모드**: `buildCarryoverPayload`는 `giftRegistryDate`·
   * `donorAcquisitionDate` 중 하나라도 비면 `undefined`를 돌려준다(`:45`).
   * ⇒ ④를 배선해도 빈 칸이면 **조용히 미발동으로 되돌아간다**. 사용자는 입력했다고 믿는다.
   *
   * ⇒ validate가 **`buildCarryoverPayload`와 같은 조건**을 검사해야 한다
   *   (메모리 `feedback_shared_predicate_argument_parity`).
   */
  it("양성 대조군 — 필수 칸이 다 차 있으면 이월과세 관련 오류가 없다", () => {
    const msg = messages(form([carryoverAsset()]));
    expect(msg).not.toMatch(/증여 등기접수일|증여자의 취득일/);
  });

  it.fails("🔴 증여 등기접수일 미입력 → 차단", () => {
    const msg = messages(
      form([carryoverAsset({ carryover: carryoverForm({ giftRegistryDate: "" }) as never })]),
    );
    expect(msg).toMatch(/증여 등기접수일/);
  });

  it.fails("🔴 증여자 취득일 미입력 → 차단 (법 §95④ 보유기간 기산일)", () => {
    const msg = messages(
      form([carryoverAsset({ carryover: carryoverForm({ donorAcquisitionDate: "" }) as never })]),
    );
    expect(msg).toMatch(/증여자의 취득일/);
  });

  it.fails("🔴 증여 당시 평가액 미입력 → 차단 (비교과세 B 취득가액)", () => {
    const msg = messages(
      form([carryoverAsset({ carryover: carryoverForm({ giftDateValuation: "" }) as never })]),
    );
    expect(msg).toMatch(/증여 당시 평가액/);
  });

  it.fails("🔴 실가 모드 + 증여자 취득가액 미입력 → 차단", () => {
    const msg = messages(
      form([
        carryoverAsset({
          carryover: carryoverForm({
            useEstimatedAcquisition: false,
            donorAcquisitionPrice: "",
          }) as never,
        }),
      ]),
    );
    expect(msg).toMatch(/증여자의 취득가액/);
  });

  /**
   * 🔑 **Σ 검증** — 안분 분모가 사용자 입력이라, 파트 합이 분모를 넘으면 증여세 상당액 합계가
   * 산출세액을 초과한다. 엔진이 막아주지 않으므로 ⑧에서 잡는다(설계 D5).
   */
  it.fails("🔴 Σ 파트 자산가액 > 증여세 과세가액 → 차단", () => {
    const msg = messages(
      form([
        carryoverAsset({
          // 위와 같은 이유로 `as unknown as` — 타입이 아직 `carryover_gift`를 모른다
          gbBuildingAcquisitionCause: "carryover_gift",
          carryover: carryoverForm({
            giftTaxBase: "500,000,000",
            giftDateAssetValue: "400,000,000",
            buildingGiftDateAssetValue: "300,000,000", // 합 700,000,000 > 500,000,000
          }) as never,
        } as unknown as Partial<AssetForm>),
      ]),
    );
    expect(msg).toMatch(/증여세 과세가액/);
  });
});
