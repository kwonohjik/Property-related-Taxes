/**
 * Pre-Do anchor ⑧ — 일반건물 × 지분 분할의 **validate 계층**.
 *
 * 계획서:   `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3) §D7
 * 엔진설계: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md` D7
 * 정책:     `feedback_pre_anchor_verification` · `it.fails` 규약은 route anchor 파일 헤더 참조.
 *
 * 고정 계약 (Phase G에서 green 전환):
 *   GBF-13  일반건물 지분 분할이 **더 이상 차단되지 않는다**
 *   GBF-12  단, **상속 지분에 환산·감정·매매사례**를 고르면 **그 지분 인덱스**로 차단된다
 *   GBF-14  부담부증여·공익수용 차단은 **범위 밖으로 유지**된다 (계획 §2-2)
 *   GBF-15  지분율 합계 100% 검증은 **기존 로직이 자산종류 무관으로 이미 커버**한다 (재사용 확인)
 *
 * ## 🔴 실행으로 뒤집힌 설계 가정 (2026-08-10)
 *
 * 엔진 설계 D7은 「상속 파트 추계 차단이 **primary만 검사**한다 — 지분마다 돌게 고쳐야 한다」고
 * 적었다. **틀렸다.** `collectStepIssues`의 자산 루프(`transfer-tax-validate.ts:136~143`)가
 * **전 자산**에 `validateAssetEntry`를 돌리고, 지분 companion은 `mergePrimaryBasic`으로
 * `assetKind`가 채워져 `validateGeneralBuildingAsset`에 그대로 도달한다.
 * ⇒ GBF-12는 **지금도 green**이다. Phase G에서 할 일이 하나 줄었다.
 *
 * 상속이 환산 대상이 아닌 근거: 「소득세법」 제97조 제1항 제1호 단서 · 같은 법 시행령
 * 제163조 제9항 — 상증법 평가액이 취득 당시 실지거래가액으로 **의제**된다.
 */
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2024-03-01";

/** 일반건물 지분 1건 — 환산 모드 기준선(필수값 충족) */
function gbShare(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    // 물건-수준 (전 지분 공통)
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    // 지분-수준 취득측
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

/** 지분 분할 폼 — 전 자산이 fractional이어야 `isFullFractionalBundle`이 성립한다. */
function fractionalForm(assets: AssetForm[], over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    contractTotalPrice: "1,000,000,000",
    householdHousingCount: "2",
    assets,
    ...over,
  } as TransferFormData;
}

const SHARE_A = gbShare({
  assetId: "share-a",
  ownershipNumerator: "60",
  ownershipDenominator: "100",
});
const SHARE_B = gbShare({
  assetId: "share-b",
  acquisitionDate: "2015-03-01",
  ownershipNumerator: "40",
  ownershipDenominator: "100",
  gbAcqLandPricePerSqm: "1,500,000",
  gbAcqBuildingValue: "150,000,000",
});

const messages = (form: TransferFormData) => collectStepIssues(0, form).map((i) => i.message);
const issuesAt = (form: TransferFormData, idx: number) =>
  collectStepIssues(0, form).filter((i) => i.assetIndex === idx);

describe("⑧ 일반건물 × 지분 분할 — validate Pre-Do anchor", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBF-13 — 자산종류 차단 해제 (Phase G)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-13: 일반건물 지분 분할 차단 해제", () => {
    it("「해당 자산 종류는 지분 분할 취득 계산을 지원하지 않습니다」가 더 이상 뜨지 않는다", () => {
      const msgs = messages(fractionalForm([SHARE_A, SHARE_B]));
      expect(msgs.some((m) => m.includes("해당 자산 종류는 지분 분할 취득"))).toBe(false);
    });

    /**
     * 🔑 **부정 단언에는 양성 대조군이 필요하다**
     * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
     * 재개발은 계속 차단되어야 한다 — 「해제」가 전 자산종류로 번지지 않았음을 고정한다.
     *
     * 🔄 **상가는 2026-09-03에 해제됐다.** 막고 있던 것은 「전용 경로 부재」가 아니라
     *    ⑩ 컴패니언 enum 3종이었고, 상가 서브객체 둘 다 지분 스케일이 불요라
     *    배관만으로 정합이 성립했다(축 B 합계 = 단건 100%, 부수토지 판정 양쪽 발동).
     *    정합은 `__tests__/calc/axis-b-commercial.anchor.test.ts`가 지킨다.
     */
    it("상가(commercial_building)는 **차단되지 않는다** (2026-09-03 개방)", () => {
      const msgs = messages(
        fractionalForm([
          { ...SHARE_A, assetKind: "commercial_building" } as AssetForm,
          { ...SHARE_B, assetKind: "commercial_building" } as AssetForm,
        ]),
      );
      expect(msgs.some((m) => m.includes("해당 자산 종류는 지분 분할 취득"))).toBe(false);
    });

    it("재개발(redevelopment_apt)은 계속 차단된다", () => {
      const msgs = messages(
        fractionalForm([
          { ...SHARE_A, assetKind: "redevelopment_apt" } as AssetForm,
          { ...SHARE_B, assetKind: "redevelopment_apt" } as AssetForm,
        ]),
      );
      expect(msgs.some((m) => m.includes("해당 자산 종류는 지분 분할 취득"))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-12 — 상속 지분 추계 차단이 **지분 인덱스**로 보고된다 🔴
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-12: 상속 지분에 환산 선택 → 차단", () => {
    /** 지분 B를 상속으로 취득했는데 환산(estimated)을 고른 잘못된 입력 */
    const SHARE_B_INHERITED_ESTIMATED = gbShare({
      assetId: "share-b",
      acquisitionDate: "2015-03-01",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      landAcqMode: "estimated", // 🔴 상속인데 환산 — §97①1호 단서·영 §163⑨ 위반
      buildingAcqMode: "estimated",
    });

    it("지분 B(index 1)의 상속 × 환산이 assetIndex 1로 차단된다", () => {
      const issues = issuesAt(fractionalForm([SHARE_A, SHARE_B_INHERITED_ESTIMATED]), 1);
      expect(issues.some((i) => /상속으로 취득한/.test(i.message))).toBe(true);
    });

    it("차단 메시지가 조문(§97①1호 단서·§163⑨)을 명시한다", () => {
      const issues = issuesAt(fractionalForm([SHARE_A, SHARE_B_INHERITED_ESTIMATED]), 1);
      const msg = issues.find((i) => /상속으로 취득한/.test(i.message))?.message ?? "";
      expect(msg).toMatch(/163/);
      expect(msg).toMatch(/97/);
    });

    /**
     * 🔑 **양성 대조군** — 같은 잘못된 입력을 **primary(index 0)** 에 두면 **지금도** 차단된다.
     * 이것이 GBF-12의 실패가 「검증 로직 부재」가 아니라 **「primary만 검사한다」** 때문임을 증명한다.
     */
    it("같은 오류가 primary(index 0)에 있으면 현재도 차단된다", () => {
      const primaryInherited = gbShare({
        assetId: "share-a",
        ownershipNumerator: "60",
        ownershipDenominator: "100",
        acquisitionCause: "inheritance",
        gbBuildingAcquisitionCause: "inheritance",
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
      });
      const issues = issuesAt(fractionalForm([primaryInherited, SHARE_B]), 0);
      expect(issues.some((i) => /상속으로 취득한/.test(i.message))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-21 — 「함께 양도」 가드가 지분 분할까지 막지 않는다 🔴
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-21: SINGLE_ONLY 가드는 함께양도 전용", () => {
    /**
     * 🔴 **E2E가 잡은 갭**(2026-08-10). `collectStepIssues`에는 차단 블록이 **둘** 있다:
     *   (1) 지분 모드 자산종류 차단 — GBF-13이 검증
     *   (2) `assets.length > 1` **함께양도** 차단(`SINGLE_ONLY`) ← **이쪽을 놓쳤다**
     *
     * (2)는 「일괄(5-a)이 일반건물 분기를 삼킨다」가 근거인데, 지분 분할은 route 5-0이
     * **5-a보다 앞에서** 가로채므로 삼킴이 없다. 그런데 `assets.length > 1`만 보고 걸려서
     * 지분 분할 일반건물이 **계산 자체를 못 했다**.
     *
     * vitest anchor는 payload를 손으로 만들어 route를 불렀기 때문에 못 잡았다 —
     * **폼 → 계산 전체 배관을 도는 E2E**가 필요했던 이유다.
     */
    it("지분 분할 일반건물은 「함께 양도와 같이 계산할 수 없습니다」가 뜨지 않는다", () => {
      const msgs = messages(fractionalForm([SHARE_A, SHARE_B]));
      expect(msgs.some((m) => m.includes("함께 양도와 같이 계산할 수 없습니다"))).toBe(false);
    });

    /**
     * 🔄 **반전 (2026-09-03) — 이 항목은 「양성 대조군」이었다.**
     *
     * 종전에는 진짜 함께양도(지분율 100% 자산 2건)가 **계속 차단**되는 것이 「가드를 통째로
     * 없앴다」와의 유일한 구별점이었다. 그런데 일반건물 컴패니언이 열려 그 비대칭 자체가
     * 소멸했다 — GB는 이제 **지분 모드·함께양도 양쪽에서** 계산된다.
     *
     * ⚠️ **대조군 역할은 아래 겸용주택 항목이 이어받는다.** 반전만 하고 대조군을 두지 않으면
     *    `SINGLE_ONLY` 가드가 통째로 사라져도 이 파일이 초록으로 남는다
     *    ([[feedback_shared_assertion_reversal_erases_sibling_net]]).
     */
    it("진짜 함께양도(전 자산 100%)도 더는 차단되지 않는다", () => {
      const full1 = gbShare({ assetId: "f1", ownershipNumerator: "100", ownershipDenominator: "100" });
      const full2 = gbShare({ assetId: "f2", ownershipNumerator: "100", ownershipDenominator: "100" });
      const msgs = messages(fractionalForm([full1, full2]));
      expect(msgs.some((m) => m.includes("일반건물(토지·건물 일괄)은(는) 함께 양도"))).toBe(false);
    });

    /**
     * 🔄 **반전 (2026-09-03)** — 재개발APT 함께양도가 열렸다(⑩ enum + ⑫ §166 서브객체).
     * 이 항목의 원래 역할(「가드를 통째로 없앤 것이 아니다」)은 **바로 위 양성 대조군**
     * (일반건물 100% 2건 차단)이 계속 맡는다. 겸용주택은 아래에서 따로 고정한다.
     */
    it("재개발·재건축 함께양도는 더는 차단되지 않는다", () => {
      const redev1 = gbShare({ assetId: "r1", assetKind: "redevelopment_apt", ownershipNumerator: "100", ownershipDenominator: "100" });
      const redev2 = gbShare({ assetId: "r2", assetKind: "redevelopment_apt", ownershipNumerator: "100", ownershipDenominator: "100" });
      const msgs = messages(fractionalForm([redev1, redev2]));
      expect(msgs.some((m) => m.includes("재개발·재건축"))).toBe(false);
    });

    /**
     * 🔄 **반전 (2026-09-04) — 겸용주택 함께양도도 열렸다.** 파트 카드 4~5장으로 되먹이면
     * 단건 겸용과 세액이 완전히 일치한다(설계문서 §10·§11). 컴패니언·주 자산 양쪽 다 열렸다.
     *
     * 🔴 **이로써 `SINGLE_ONLY` 목록이 비었다** — 「그 가드가 살아 있음」을 보는 대조군은
     *    더 이상 성립하지 않는다. 아래 항목이 그 역할을 **살아 있는 다른 차단**으로 옮겨 받는다.
     *    ([[feedback_shared_assertion_reversal_erases_sibling_net]])
     */
    it("겸용주택 함께양도는 더는 차단되지 않는다", () => {
      const mu1 = gbShare({ assetId: "m1", assetKind: "housing", isMixedUseHouse: true, ownershipNumerator: "100", ownershipDenominator: "100" });
      const mu2 = gbShare({ assetId: "m2", assetKind: "housing", isMixedUseHouse: true, ownershipNumerator: "100", ownershipDenominator: "100" });
      const msgs = messages(fractionalForm([mu1, mu2]));
      expect(msgs.some((m) => m.includes("함께 양도"))).toBe(false);
    });

    /**
     * 🔑 **양성 대조군 (2026-09-04 재인계)** — 위 반전들이 「차단 블록을 통째로 없앴다」와
     * 구별되게 한다.
     *
     * ⚠️ 이 자리는 **두 번 옮겼다**: 겸용 함께양도(→ 열림) → 겸용 × 지분 분할(→ 같은 날 열림)
     *    → **재개발APT × 지분 분할**. 반전할 때마다 「무엇이 아직 살아 있는가」를 다시 골라야
     *    한다([[feedback_shared_assertion_reversal_erases_sibling_net]]).
     *
     * 재개발이 남아 있는 이유는 근거가 분명하다 — **청산금·권리가액이 절대금액**이라 지분
     * 스케일이 필요한데 그 배관이 없다(겸용이 같은 이유로 막혀 있다가 ④ 스케일로 열렸다).
     */
    it("재개발APT × 지분 분할은 계속 차단된다", () => {
      const r1 = gbShare({ assetId: "r1", assetKind: "redevelopment_apt", ownershipNumerator: "60", ownershipDenominator: "100" });
      const r2 = gbShare({ assetId: "r2", assetKind: "redevelopment_apt", ownershipNumerator: "40", ownershipDenominator: "100" });
      const msgs = messages(fractionalForm([r1, r2]));
      expect(msgs.some((m) => m.includes("지분 분할 취득 계산을 지원하지 않습니다"))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-22 — 화면에 없는 칸을 요구하지 않는다 (⑧ UI↔validate 모순 금지) 🔴
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-22: 지분 카드의 물건-수준 필드를 validate가 요구하지 않는다", () => {
    /**
     * 🔴 **E2E가 잡은 두 번째 갭**(2026-08-10). 지분 카드는 면적·양도시 기준시가·용도지역을
     * **UI에서 숨긴다**(`shareAcquisitionOnly`). 그런데 자산별 검증 루프가
     * `mergePrimaryBasic`(7키)만 병합해서 「자산 2: 토지면적을 입력하세요」가 떴다 —
     * **화면에 칸이 없는데 입력하라는** 모순이다(CLAUDE.md ⑧).
     *
     * ⇒ 일반건물 지분은 ④ API 변환과 **같은 함수**(`mergeGbPropertyLevel`)로 병합한다.
     */
    const BARE_SHARE = {
      ...makeDefaultAsset(2),
      // 지분 카드가 실제로 갖는 상태 — 물건-수준 GB 필드가 **비어 있다**(UI에서 안 받으니까).
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      useEstimatedAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      gbAcqLandPricePerSqm: "1,500,000",
      gbAcqBuildingValue: "150,000,000",
    } as AssetForm;

    it("면적·양도시 기준시가 미입력 지분이 차단되지 않는다", () => {
      const issues = issuesAt(fractionalForm([SHARE_A, BARE_SHARE]), 1);
      expect(issues.map((i) => i.message)).toEqual([]);
    });

    /**
     * 🔑 **양성 대조군** — 병합해도 채워지지 않는 **지분 고유** 필수값은 계속 차단되어야 한다.
     * 이게 없으면 「지분 카드 검증을 통째로 껐다」와 구별되지 않는다.
     */
    it("지분 고유 필수값(취득시 기준시가)이 비면 계속 차단된다", () => {
      const noAcqStd = { ...BARE_SHARE, gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" } as AssetForm;
      const issues = issuesAt(fractionalForm([SHARE_A, noAcqStd]), 1);
      expect(issues.length).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-14 — 범위 밖 조합은 계속 차단 (계획 §2-2)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-14: 부담부증여·공익수용 모두 ✅ 지원 (2026-09-03 전건 해제)", () => {
    /**
     * 🔄 **2026-09-03 정정 — 부담부증여가 열렸다.**
     *
     * 종전 서술: 「부담부증여·공익수용은 범위 밖으로 유지된다」.
     * 축 B × 부담부증여를 구현하면서(`transfer-axis-b-burdened-gift.plan.md`)
     * 부담부증여만 해제했다 — §159는 총양도가를 쓰지 않고 `양도가액 = A × B/C`로 자체
     * 산정하므로 「지분 분할 양도가액 = 총양도가 × 지분율」과의 비양립이 애초에 없었다.
     *
     * **공익수용도 같은 날 해제**됐다 — 「보상가액과 비양립」이라는 사유가 틀렸다.
     * 양도가액은 총계약가를 그대로 쓰고, 보상 필드는 §164⑨ **환산 분모** 전용이라 분자와
     * 약분된다(`axis-b-expropriation.anchor.test.ts` 6케이스).
     *
     * ⚠️ 단언을 「부담부증여·공익수용」 **합성 문자열 substring**으로 하고 있었다. 메시지가
     *    갈라지자 **차단이 유지되는 공익수용까지 함께 빨개졌다** — 동작 변화와 문구 변화를
     *    구별하지 못하는 단언이었다. 조문별 고유 문구로 바꾼다
     *    (`feedback_enum_substring_match_forbidden`과 같은 층위).
     */
    it("✅ 부담부증여 × 지분 분할은 이제 계산된다", () => {
      const msgs = messages(
        fractionalForm([
          { ...SHARE_A, transferType: "burdened_gift" } as AssetForm,
          { ...SHARE_B, transferType: "burdened_gift" } as AssetForm,
        ]),
      );
      expect(msgs.some((m) => m.includes("지분 분할 취득과 함께 계산할 수 없습니다"))).toBe(false);
      expect(msgs.some((m) => m.includes("함께 양도와 같이 계산할 수 없습니다"))).toBe(false);
    });

    it("✅ 공익수용 × 지분 분할도 이제 계산된다", () => {
      const msgs = messages(
        fractionalForm([
          { ...SHARE_A, transferCause: "public_expropriation" } as AssetForm,
          { ...SHARE_B, transferCause: "public_expropriation" } as AssetForm,
        ]),
      );
      expect(msgs.some((m) => m.includes("지분 분할 취득과 함께 계산할 수 없습니다"))).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-15 — 지분율 합계 검증은 기존 로직 재사용 (추가 작업 불요 확인)
  // ══════════════════════════════════════════════════════════════════
  describe("GBF-15: 지분율 합계 100% — 자산종류 무관 기존 로직", () => {
    it("60% + 30% = 90% → 합계 오류가 자산종류와 무관하게 뜬다", () => {
      const msgs = messages(
        fractionalForm([SHARE_A, { ...SHARE_B, ownershipDenominator: "100", ownershipNumerator: "30" } as AssetForm]),
      );
      expect(msgs.some((m) => m.includes("전체 지분율 합계가 100%"))).toBe(true);
    });

    it("60% + 40% = 100% → 합계 오류가 없다", () => {
      const msgs = messages(fractionalForm([SHARE_A, SHARE_B]));
      expect(msgs.some((m) => m.includes("전체 지분율 합계가 100%"))).toBe(false);
    });
  });
});
