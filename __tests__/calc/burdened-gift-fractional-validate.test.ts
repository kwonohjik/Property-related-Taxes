/**
 * A2 ⑧ — 부담부증여 × 지분: validate가 엔진과 **같은 스케일**로 B/C를 비교한다.
 *
 * ## 결함
 *
 * `transfer-tax-validate-bg.ts`의 시가 모드 B/C>1 검사가 `bgMarketValueAtTransfer`를
 * **물건 전체(100%)** 로 비교했다. 엔진은 §159의 C를 지분분으로 축소하므로
 * (`scaleBurdenedGiftInfo`), 지분 모드에서 **UI는 통과하는데 엔진이 죽는** 모순이 생긴다.
 *
 * 채무는 사용자가 **해당 지분 인수분**을 입력하므로 스케일하지 않는다 —
 * 스케일 대상은 평가액뿐이다.
 *
 * CLAUDE.md ⑧: "API/UI fallback 있는 필드는 validate도 동일 fallback.
 * UI 통과 ↔ validate 차단 모순 금지" 의 역방향(validate 통과 ↔ 엔진 차단)도 같은 원칙이다.
 */
import { describe, it, expect } from "vitest";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";

const asset = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionTotal: "300,000,000",
    // 물건 전체 시가 12억 / 인수채무 7억
    bgMarketValueAtTransfer: "1,200,000,000",
    bgLendingDepositTotal: "0",
    bgMortgageDebtAmount: "700,000,000",
    ...over,
  }) as never;

describe("⑧ 부담부증여 지분 — B/C 검사 스케일 정합", () => {
  it("단독 소유: 채무 7억 < 시가 12억 → 통과 (회귀 가드)", () => {
    expect(validateBurdenedGiftAsset(asset({}), "자산1")).toBeNull();
  });

  it("🔴 지분 1/2: 지분분 시가 6억 < 채무 7억 → 차단된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toMatch(/채무액/);
    expect(msg).toMatch(/초과/);
  });

  it("차단 메시지에 지분분·물건 전체 금액이 함께 노출된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toContain("600,000,000"); // 지분분 C
    expect(msg).toContain("1,200,000,000"); // 물건 전체 (사용자 혼란 방지)
    expect(msg).toContain("1/2");
  });

  it("지분 1/2 + 채무 5억: 지분분 6억 이내 → 통과 (판별력)", () => {
    expect(
      validateBurdenedGiftAsset(
        asset({
          ownershipNumerator: "1",
          ownershipDenominator: "2",
          bgMortgageDebtAmount: "500,000,000",
        }),
        "자산1",
      ),
    ).toBeNull();
  });
});

/**
 * 부담부증여 × 함께양도(일괄) 차단 — E2E 실측으로 드러난 침묵 오산.
 *
 * 단건에서 부담부증여를 고른 뒤 "같은 날 다른 부동산도 함께" 토글을 켜면
 * `transferType`은 `burdened_gift`로 남고 **채무 입력 UI도 화면에 그대로 보이는데**,
 * 계산은 `mode: bundled`로 가서 §159 안분(STEP 0.48)을 타지 않는다
 * (응답에 `debtRatio`·`burdenedGift` 흔적 0건 — Playwright 실측).
 *
 * 다물건 계산기는 이미 같은 이유로 차단한다(`multi-transfer-tax-validate.ts:54`
 * — "침묵 오산보다 명시 차단이 안전하다"). 함께양도 경로에도 같은 가드를 둔다.
 */
describe("부담부증여 × 함께양도 — 침묵 오산 차단", () => {
  const bg = {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    acquisitionDate: "2009-03-01",
    bgValuationMode: "sangjeungbeop_standard",
    bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300,000,000",
    bgMortgageDebtAmount: "300,000,000",
    standardPriceAtTransfer: "1,000,000,001",
    standardPriceAtAcq: "500,000,001",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "500,000,000",
  };
  const other = {
    ...makeDefaultAsset(2),
    assetKind: "housing",
    acquisitionDate: "2010-01-01",
    fixedAcquisitionPrice: "111,000,000",
    standardPriceAtTransfer: "400,000,000",
    actualSalePrice: "500,000,000",
  };
  const form = (assets: unknown[]) =>
    ({
      ...createDefaultTransferFormData(),
      transferDate: "2024-03-01",
      filingDate: "2024-05-31",
      contractTotalPrice: "1,000,000,000",
      householdHousingCount: "2",
      houses: [],
      presaleRights: [],
      assets,
    }) as never;

  const hasBlock = (assets: unknown[]) =>
    collectStepIssues(0, form(assets)).some((i) =>
      /함께 양도와 같이 계산할 수 없습니다/.test(i.message),
    );

  /**
   * 🔄 **2026-09-03 반전.** 종전에는 「차단된다」를 단언했다. 컴패니언(다른 물건) 축이
   * 열리면서 그 차단이 사라졌다 — ④가 신고 단위 채무를 자산가액 비율로 재배분해
   * 소령 §159①의 단일 B/C를 보존한다(`apportionCompanionBurdenedGiftDebt`).
   * 정합·증여세 1회는 `companion-burdened-gift-plumbing.anchor.test.ts`가 지킨다.
   */
  it("부담부증여 + 다른 자산 → **차단되지 않는다** (2026-09-03 개방)", () => {
    expect(hasBlock([bg, other])).toBe(false);
  });

  it("부담부증여 단건은 차단되지 않는다 (회귀 가드)", () => {
    expect(hasBlock([bg])).toBe(false);
  });

  it("일반 양도 다자산은 차단되지 않는다 (회귀 가드)", () => {
    expect(hasBlock([{ ...bg, transferType: "regular" }, other])).toBe(false);
  });

  it("companion 쪽에만 부담부증여가 남아 있어도 **차단되지 않는다**", () => {
    // 토글·자산추가 순서에 따라 primary가 아닌 자산에 남을 수 있다 — 위와 같은 축이다.
    expect(hasBlock([{ ...bg, transferType: "regular" }, { ...other, transferType: "burdened_gift" }])).toBe(false);
  });

  /**
   * 라우트 if-체인 순서(일괄 :446 → 겸용 :568 → 일반건물 :611 → 단건 :660) 때문에
   * companion이 있으면 뒤쪽 특수 분기가 **실행조차 되지 않는다**.
   * 라우트 하네스 실측으로 4종 전부 소실 확인 → 동일 가드 적용.
   */
  describe("같은 원인의 형제 기능 (라우트 분기 순서)", () => {
    const blockMsg = (assets: unknown[]) =>
      collectStepIssues(0, form(assets))
        .map((i) => i.message)
        .filter((m) => /함께 양도와 같이 계산할 수 없습니다/.test(m));

    /**
     * 🔄 **반전 (2026-09-04) — 겸용주택 차단이 «전부» 없어졌다.**
     *
     * 컴패니언이 먼저 열리고(#1466), 이어 **주 자산 겸용**도 열렸다 — 5-a의 primary 조립부가
     * `{...engineInput}` 스프레드라 겸용이 평범한 주택 item이 되던 것을 파트 확장으로 바꿨다.
     * 파트 카드 되먹임은 실측상 단건 겸용과 **세액이 완전히 일치**한다.
     *
     * ⚠️ **반전이 안전망을 지우지 않도록** 아래를 함께 단언한다:
     *    ① 겸용 × **지분 분할**은 여전히 차단(`totalPropertyTransferPrice` 의미 충돌)
     *    ② 일반건물·부담부증여 등 형제 항목의 `blockMsg` 필터는 그대로다(각자 it이 지킨다)
     */
    it("✅ 겸용주택 + 함께양도 → 자리에 무관하게 더는 차단되지 않는다", () => {
      const mixed = { ...bg, transferType: "regular", isMixedUseHouse: true };
      const msgs = (assets: unknown[]) =>
        collectStepIssues(0, form(assets)).map((i) => i.message);
      const asPrimary = msgs([mixed, other]);
      const asCompanion = msgs([other, mixed]);
      expect(asPrimary.filter((m) => /함께 양도/.test(m))).toEqual([]);
      expect(asCompanion.filter((m) => /함께 양도/.test(m))).toEqual([]);
      /**
       * ⚠️ **공허하지 않음을 보인다** — 이 픽스처는 겸용 면적을 채우지 않아 그쪽 검증이 뜬다.
       *    그 메시지가 있다는 것이 「검증이 실제로 돌았는데 함께양도 차단만 없다」의 근거다.
       */
      expect(asPrimary.some((m) => /주택 연면적/.test(m))).toBe(true);
    });

    /**
     * 🔒 **위 반전의 양성 대조군** — 겸용 × 지분 분할은 별개 축이고 **계속 차단**이다.
     * 이 항목이 없으면 위 반전이 「겸용 관련 차단이 전부 사라졌다」를 조용히 허용한다.
     */
    /**
     * 🔄 **재인계 (2026-09-04 후속)** — 겸용 × 지분 분할도 같은 날 열렸다(막던 것은 「모델
     * 비양립」이 아니라 **절대금액 성분의 지분 스케일 부재**였다). 대조군은 아직 살아 있는
     * **재개발APT × 지분 분할**로 옮긴다 — 청산금·권리가액이 절대금액이라 그 배관이 없다.
     */
    it("🔴 재개발APT × 지분 분할 → 계속 차단 (양성 대조군)", () => {
      const r1 = { ...bg, transferType: "regular", assetKind: "redevelopment_apt", ownershipNumerator: "60", ownershipDenominator: "100" };
      const r2 = { ...other, assetKind: "redevelopment_apt", ownershipNumerator: "40", ownershipDenominator: "100" };
      expect(
        collectStepIssues(0, form([r1, r2]))
          .map((i) => i.message)
          .some((m) => /지분 분할 취득 계산을 지원하지 않습니다/.test(m)),
      ).toBe(true);
    });

    /**
     * 🔄 **반전 (2026-09-03)** — 재개발APT 컴패니언이 열렸다. 장벽은 ⑩ enum(400)이었고,
     * ⑫ `redevelopment` 서브객체를 함께 등록해 해소했다. 겸용주택·일반건물은 그대로 차단이다
     * (각각 route 전용 분기 미실행 / 토지·건물 2파트 축 미배관).
     */
    it("✅ 재개발 + 함께양도 → 더는 차단되지 않는다", () => {
      const redev = { ...bg, transferType: "regular", assetKind: "redevelopment_apt" };
      expect(blockMsg([redev, other]).join()).not.toMatch(/재개발/);
    });

    /**
     * 🔄 **반전 (2026-09-03)** — 일반건물 컴패니언이 열렸다. 차단 사유는 「일괄이 GB 분기를
     * 삼킨다」였는데 정확히는 **5-a가 `return`해 5-a-3이 도달조차 하지 않는다**였고,
     * ⑭가 `buildGbPartCards`로 파트 카드를 만들어 aggregate에 합류시켜 해소했다.
     * 설계: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md`
     */
    it("✅ 일반건물 + 함께양도 → 더는 차단되지 않는다", () => {
      const gb = { ...bg, transferType: "regular", assetKind: "general_building" };
      expect(blockMsg([gb, other]).join()).not.toMatch(/일반건물/);
    });

    it("각 기능의 단건은 차단되지 않는다 (회귀 가드)", () => {
      for (const over of [
        { isMixedUseHouse: true },
        { assetKind: "redevelopment_apt" },
        { assetKind: "general_building" },
      ]) {
        expect(blockMsg([{ ...bg, transferType: "regular", ...over }])).toEqual([]);
      }
    });

    it("상가(commercial_building)는 차단하지 않는다 — 동일 결함 미확인", () => {
      // 5-a-3(일반건물) 분기를 타지 않아 같은 결함인지 검증되지 않았다.
      // 근거 없이 막으면 잘못된 차단이 된다 — 검증 후 판단(계획서 §7 OPEN).
      const cb = { ...bg, transferType: "regular", assetKind: "commercial_building" };
      expect(blockMsg([cb, other])).toEqual([]);
    });
  });
});
