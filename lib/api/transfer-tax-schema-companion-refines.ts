/**
 * ⑩ 컴패니언 자산 `acquisitionCause`별 필수 입력 검증 — `propertySchema.superRefine`에서 호출.
 *
 * `transfer-tax-schema.ts` 800줄 정책에 따라 분리 (2026-08-23, F16 `carryover_gift` arm 추가 시).
 * 옮긴 것은 위치뿐이고 술어·메시지·`path`는 그대로다.
 *
 * 🔑 각 arm의 필수 항목은 ⑧(`lib/calc/transfer-tax-validate-asset.ts`)과 **같은 기준**이어야 한다 —
 *    어긋나면 「⑧ 통과 ↔ ⑩ 400」 모순이 된다(14지점 ⑧·⑩).
 */

import { z } from "zod";
import { carryoverDebtPiecesUnsupportedReason, DEBT_PIECES_REASON } from "@/lib/tax-engine/carryover-debt-pieces-scope";
import type { companionAssetSchema } from "./transfer-tax-schema-sub";
// 의제취득일(1985.1.1.) — ⑧과 같은 상수(단일 소스)
import { DEEMED_ACQUISITION_DATE } from "@/lib/calc/transfer-163-9-base-date";
import { refineCompanionMixedUseBurdenedGift } from "./transfer-tax-schema-mixed-bg-refines";
import { refineGbPropertyRequired } from "./transfer-tax-schema-required-refines-gb";

type CompanionAsset = z.infer<typeof companionAssetSchema>;

export function addCompanionAcquisitionCauseRefines(
  companions: CompanionAsset[],
  /** 폼-전역 양도일 (YYYY-MM-DD) — 이월과세 날짜 순서 검증용. */
  transferDate: string,
  ctx: z.RefinementCtx,
): void {
  // 겸용주택 × 부담부증여(MB-6) — 컴패니언 겸용에는 채무 귀속 입력 경로가 없다.
  refineCompanionMixedUseBurdenedGift(companions, ctx);
  // ── 컴패니언별 acquisitionCause 검증 ──
  for (let i = 0; i < companions.length; i++) {
    const c = companions[i];
    /**
     * 🔴 **부담부증여 제외** (축 B, 2026-09-03).
     *
     * 부담부증여는 취득가액을 「소득세법 시행령」 제159조 제1항 제1호가 **자동 산정**한다
     * (기준시가 모드 = 취득시 기준시가 × 채무비율 / 시가 모드 = K-4 실지·K-5 환산).
     * 그래서 UI도 자산 전체 취득가액 칸을 숨긴다 — 요구하면 **입력할 칸이 화면에 없는데
     * 그 칸을 채우라고 막는** 상태가 된다.
     *
     * 단건 경로는 이 요구가 아예 없고, ⑧ `validateAssetEntry`도 같은 이유로
     * `transferType !== "burdened_gift"` 게이트를 둔다(O-2, 2026-08-12) — **같은 규율**이다.
     *
     * 판정을 `burdenedGiftInfo` 존재로 하는 이유: 컴패니언 스키마에는 `transferType`이 없고,
     * 이 서브객체가 실렸다는 것 자체가 「§159가 취득가액을 산정한다」는 신호이기 때문이다.
     */
    /**
     * 🔴 **일반건물 제외** (컴패니언 함께양도, 2026-09-03).
     *
     * 일반건물은 환산 기준시가를 **자기 서브객체가 갖는다**(`generalBuildingValuation`의
     * `acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`). 컴패니언-수준
     * `standardPriceAtAcquisition`은 GB 경로 계산에 **쓰이지 않는다** — ⑭가
     * `buildGbPartCards`로 파트 카드를 만들 때 GB 엔진이 서브객체의 값만 읽는다.
     *
     * ⑧도 같은 기준이다 — `validateAssetEntry`가 `assetKind === "general_building"`을
     * `validateGeneralBuildingAsset`에 **통째로 위임**하고 일반 기준시가는 요구하지 않는다
     * (`transfer-tax-validate-asset.ts:193`). 요구하면 「⑧ 통과 ↔ ⑩ 400」 모순이 되어
     * 사용자가 **안내 없는 dead-end**를 만난다 — 실제로 E2E가 이 상태를 잡았다.
     *
     * 판정을 서브객체 존재로 하는 이유는 부담부증여와 같다: 컴패니언 스키마에는 `assetKind`가
     * 있지만, **「누가 취득가액을 산정하는가」를 말해 주는 것은 그 서브객체**다.
     */
    /**
     * 🔴 **겸용주택 제외** (2026-09-04) — 일반건물과 **완전히 같은 형태**다.
     *
     * 겸용은 환산 기준시가를 **자기 서브객체가 갖는다**(`mixedUse`의 `transferStandardPrice`·
     * `acquisitionStandardPrice` 3시점). 컴패니언-수준 `standardPriceAtAcquisition`은 겸용
     * 경로 계산에 **쓰이지 않는다** — ⑭가 겸용 엔진을 돌릴 때 서브객체 값만 읽는다.
     *
     * ⑧도 같은 기준이다(`validateAssetEntry`가 겸용을 전용 검증에 위임한다). 요구하면
     * **「⑧ 통과 ↔ ⑩ 400」 모순**이 되어 사용자가 안내 없는 dead-end를 만난다 —
     * 실측으로 실제 그 상태였다(겸용 × 환산 × 컴패니언/축 B가 전부 400).
     *
     * 판정을 서브객체 존재로 하는 이유는 부담부증여·일반건물과 같다.
     */
    if (
      c.acquisitionCause === "purchase" &&
      c.burdenedGiftInfo === undefined &&
      c.generalBuildingValuation === undefined &&
      c.mixedUse === undefined
    ) {
      if (c.useEstimatedAcquisition) {
        // 재개발 §166 서브객체가 있으면 환산 기준시가는 `redevelopment`(취득시·관리처분일)가 정한다 — 주 자산 refine
        // (`transfer-tax-schema-refines.ts` `isRedevelopmentEstimated`)과 같은 면제. ⑧도 이 칸을 요구하지 않아
        // 면제하지 않으면 「⑧ 통과 ↔ ⑩ 400」 모순이다.
        if (c.redevelopment === undefined && (!c.standardPriceAtAcquisition || c.standardPriceAtAcquisition <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "standardPriceAtAcquisition"],
            message: "매매(환산) 시 취득시 기준시가 필수",
          });
        }
        if (c.redevelopment === undefined && (!c.standardPriceAtTransfer || c.standardPriceAtTransfer <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "standardPriceAtTransfer"],
            message: "매매(환산) 시 양도시 기준시가 필수",
          });
        }
      } else {
        // 별개 취득(토지·건물 취득일 상이)은 취득가액이 파트별로 완결된다 — 파트 가액은 `refineSplitAcquisitionInputs` V1·V2가 요구하고
        // 엔진도 파트 가액으로 계산한다(자산 전체 값은 세액에 쓰이지 않는다). 그 화면에는 자산 전체 취득가액 칸이 없어 요구하면
        // 「⑧ 통과 ↔ ⑫ 400」 막다른 길이었다. 아래 증여 갈래의 D2 면제(`isBuildingCauseMixCompanion`)와 같은 형태 — 주 자산 ⑫도 요구하지 않는다.
        // 계획서: docs/00-pm/companion-split-fixed-acq-price.plan.md
        if (c.isSeparateAcquisition !== true && (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "fixedAcquisitionPrice"],
            message: "매매(실가) 시 취득가액 필수",
          });
        }
      }
      if (!c.acquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "acquisitionDate"],
          message: "매매 자산은 취득일 필수",
        });
      }
    } else if (c.acquisitionCause === "gift") {
      // D2 — 건물 증여 + 토지 매매(overlay `purchase`)는 증여 신고가액을 건물 파트 취득가액으로 받는다(상속 arm의 CP-1 면제와 같은 술어).
      /**
       * 🔴 **부담부증여 · 일반건물 파트 취득가액 면제** (`docs/00-pm/gb-companion-gift-fixed-acq-price.plan.md` Q-1 a).
       *
       *  · 부담부증여 — 취득가액을 「소득세법 시행령」 제159조 제1항 제1호가 정한다(위 `companionAssets` 머리 주석의 「부담부증여 제외」). UI도 자산 전체 칸을 숨긴다
       *    (`CompanionAcqGiftBlock` `isBurdenedGift`) — 요구하면 입력할 칸 없이 막는 막다른 길이다.
       *  · 일반건물 분리 ON — 토지 파트 취득가액(`landAcquisitionPrice`)이 있으면 파트 값이 취득가액을 정하고 자산 전체 값은 세액에 쓰이지 않는다(1,000원·6억·50억 모두 같은 세액 — 실측).
       *    ⑧도 이 칸을 요구하지 않는다(분리 ON 은 파트 칸 V-7). **분리 OFF 일괄 증여는 파트 가액이 없어 면제하지 않는다** — ⑧이 같은 칸을 요구하고 값이 세액에 쓰인다.
       *    매매 갈래의 별개 취득 면제(`isSeparateAcquisition`)와 달리 같은 날 분리 ON 도 파트 값으로 판정한다.
       */
      const gbLandPartPrice = (c.generalBuildingValuation as { landAcquisitionPrice?: number } | undefined)?.landAcquisitionPrice ?? 0;
      const giftPriceFromOtherSource = c.burdenedGiftInfo !== undefined || gbLandPartPrice > 0;
      if (!isBuildingCauseMixCompanion(c) && !giftPriceFromOtherSource && (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "fixedAcquisitionPrice"],
          message: "증여 자산은 신고가액(취득가액) 필수",
        });
      }
      // 증여자 취득일은 **필수가 아니다** — 단순 증여의 세율 보유기간은 「증여받은 날」부터
      // (§104② 본문 + 영 §162①5호). §104②2호는 이월과세에만 적용된다.
      // UI validate와 기준이 어긋나면 「UI 통과 ↔ API 400」 모순이 된다(14지점 ⑧·⑩).
      if (!c.acquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "acquisitionDate"],
          message: "증여 자산은 증여일 필수",
        });
      }
    } else if (c.acquisitionCause === "carryover_gift") {
      /**
       * ⑩ 배우자등 이월과세 §97의2 — **컴패니언 자산 정식 지원**(F16).
       *
       * 🔴 종전에는 이 arm이 없어 `carryover_gift`가 **취득가액 0으로 엔진에 도달할 수 있는
       *    유일한 컴패니언 취득원인**이었다(D-3). ⑫에 `carryoverTaxation`이 없어 값이 조용히
       *    strip되는데 ⑩도 그것을 요구하지 않았으므로 400이 아니라 200 + 취득가액 0이었다.
       *
       * 필수 항목은 ⑧(`lib/calc/transfer-tax-validate-asset.ts` `carryover_gift` 분기)과
       * **같은 기준**이다 — 어긋나면 「⑧ 통과 ↔ ⑩ 400」 모순이 된다(14지점 ⑧·⑩).
       * ⚠️ **`acquisitionDate`는 이 arm이 아니라 `refineCompanionAcquisitionDate`가 요구한다**(CP-5, 2026-09-30).
       *    ⑭의 「주 자산 취득일 대체」는 제거됐고, ④는 이월과세 컴패니언에 주 자산과 같은 helper
       *    (`carryoverAcquisitionDateFallback`)로 증여 등기일을 싣는다 — 그래서 UI↔⑫ 모순이 없다.
       */
      const ct = c.carryoverTaxation;
      if (!ct) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "carryoverTaxation"],
          message: "이월과세(증여) 자산은 증여 정보(carryoverTaxation) 필수",
        });
      } else {
        refineCarryoverTaxation(ct, transferDate, ctx, ["companionAssets", i, "carryoverTaxation"], true, c.transferType === "burdened_gift" && c.burdenedGiftInfo !== undefined);
        // 채무 부분 조각 규칙을 적용할 수 없는 입력(컴패니언 와이어는 `propertyType` 대신 `assetKind`) — 본문 전체가 필요해 호출부에서 본다.
        const unsupported = (ct.giftAssumedDebt ?? 0) > 0 ? carryoverDebtPiecesUnsupportedReason({ ...(c as Record<string, unknown>), propertyType: c.assetKind }) : null;
        if (unsupported)
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companionAssets", i, "carryoverTaxation", "giftAssumedDebt"], message: `당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못하는 입력입니다(${unsupported})` });
      }
    } else if (c.acquisitionCause === "inheritance") {
      // P2c: 상속 취득가액은 inheritanceValuation(신고가액) 경로로 항상 전송 (manual/fixedAcquisitionPrice 폐기).
      if (!c.decedentAcquisitionDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "decedentAcquisitionDate"],
          message: "상속 자산은 피상속인 취득일 필수",
        });
      }
      refineCompanionInheritedValue(c, i, ctx);
    } else if (c.acquisitionCause === "newConstruction") {
      refineCompanionNewConstruction(c, i, ctx);
    }
    refineCompanionAcquisitionDate(c, i, ctx);
    /**
     * 일반건물 자산-수준 필수 입력(I3·X1·Z4·Z5·C1~C4) — 주 자산과 **같은 함수**를 건다(`gb-companion-required-refines-parity.plan.md` Q-1 a).
     * 위 매매 arm 은 일반건물을 면제하지만 면제는 「화면에 없는 자산 전체 값을 요구하지 말라」는 뜻이지 일반건물 자신의 필수 항목을 풀어 주는 것이 아니다 —
     * 없으면 ⑧ 이 막는 입력이 200 + 취득가액 0 으로 계산됐다. 부담부증여는 함수가 `transferType` 으로 면제한다(§159 가 취득가액을 정한다).
     * 취득가액 칸은 컴패니언에서 `fixedAcquisitionPrice`(⑧ 이 요구하는 칸 · route `bundled-apportionment.ts` 가 읽는 칸)다.
     */
    refineGbPropertyRequired(
      {
        transferType: c.burdenedGiftInfo !== undefined ? "burdened_gift" : c.transferType,
        transferDate,
        reductions: c.reductions,
        acquisitionPrice: c.fixedAcquisitionPrice,
        useEstimatedAcquisition: c.useEstimatedAcquisition ?? false,
        generalBuildingValuation: c.generalBuildingValuation,
      },
      ctx,
      ["companionAssets", i],
      ["companionAssets", i, "fixedAcquisitionPrice"],
    );
  }
}

/**
 * CP-1 (2026-09-30 2차 점검) — 컴패니언 상속: **①(상속 평가액) 또는 ②(§164④~⑦)** 필수.
 *
 * route는 컴패니언 상속 취득가액을 `inheritanceValuation`(①)으로, §163⑨ ②·의제 전 환산은
 * `inheritedAcquisition`·`inheritedHouseValuation`·`commercialInheritanceValuation`(CP-3 — 주 자산과 같은 leaf)으로
 * 만든다. 셋 다 없으면 **취득가액 0**으로 계산됐다(200 + 다른 세액).
 *
 * ⑧ 거울: `transfer-tax-validate-clause-a.ts` `postDeemedClauseARequiredError`(주택·토지·건물·분양권) ·
 * `transfer-tax-validate-commercial-asset.ts` `validateCommercialInheritanceAsset`(상가) — post-deemed는
 * ①·② 중 하나가 **필수**다(상증법 §60③ — 평가액이 「없는」 상태는 성립하지 않는다).
 * ⚠️ **pre-deemed(1985.1.1. 前)는 요구하지 않는다** — ⑧은 「가목 확인 불가」 선언으로 ③(환산)을 통과시킨다
 *    (`clauseADeclarationError`). 여기서 막으면 ⑧ 통과 ↔ ⑫ 400 막다른 길이 된다.
 * 겸용·일반건물·재개발은 자기 서브객체가 취득가액을 만든다 — ⑧도 이 규칙을 걸지 않는다.
 */
/** D2 컴패니언 — overlay `purchase` + 토지 취득일 + 주택·건물. 파트 완결(토지·건물 가액)은 `refineSplitAcquisitionInputs`가 요구한다. */
function isBuildingCauseMixCompanion(c: CompanionAsset): boolean {
  return c.landAcquisitionCause === "purchase" && !!c.landAcquisitionDate && (c.assetKind === "housing" || c.assetKind === "building");
}
const CLAUSE_A_KINDS = new Set(["housing", "land", "building", "presale_right", "commercial_building"]);
function refineCompanionInheritedValue(c: CompanionAsset, i: number, ctx: z.RefinementCtx): void {
  if (!CLAUSE_A_KINDS.has(c.assetKind)) return;
  // D2 — 건물 상속·증여 + 토지 매매(overlay `purchase`)는 건물 평가액을 건물 파트 취득가액(`buildingAcquisitionPrice`)으로 받는다.
  // 파트 완결(토지·건물 가액)은 `refineSplitAcquisitionInputs`가 요구하고, 자산 단위 ①②는 오히려 leaf Y7이 막는다(한 쌍).
  if (isBuildingCauseMixCompanion(c)) return;
  const baseDate = c.inheritanceValuation?.inheritanceDate ?? c.acquisitionDate;
  if (baseDate && baseDate < DEEMED_ACQUISITION_DATE) return;
  const clauseA1 = (c.inheritanceValuation?.publishedValueAtInheritance ?? 0) > 0;
  // 구 API 계약(P2c 이전) — route가 `inheritanceValuation`이 없으면 `fixedAcquisitionPrice`를 그대로 취득가액으로
  // 쓴다(`bundled-apportionment.ts` (2)). ④는 상속에 이 값을 싣지 않지만, 싣는 호출자는 명시 값을 준 것이다.
  const legacyFixed = c.inheritanceValuation === undefined && (c.fixedAcquisitionPrice ?? 0) > 0;
  const clauseA2 =
    c.inheritedAcquisition !== undefined ||
    c.inheritedHouseValuation !== undefined ||
    c.commercialInheritanceValuation !== undefined;
  if (clauseA1 || clauseA2 || legacyFixed) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["companionAssets", i, "inheritanceValuation"],
    message:
      "상속 자산은 상속개시일 평가액(inheritanceValuation.publishedValueAtInheritance) 또는 §164④~⑦ 기준시가(inheritedAcquisition 등)가 필요합니다 (소득세법 시행령 §163⑨ · 상증법 §60③)",
  });
}

/**
 * CP-2 — 컴패니언 신축(자가건축): 신축비용(취득가액) 필수. 비우면 취득가액 0으로 계산됐다.
 * ⑧ 거울: `transfer-tax-validate-acquisition.ts` 신축 분기(「신축 비용(취득가액)을 입력하세요」).
 * 겸용·일반건물·재개발은 ⑧이 그 분기 전에 자기 검증으로 빠진다 — 같은 제외.
 */
function refineCompanionNewConstruction(c: CompanionAsset, i: number, ctx: z.RefinementCtx): void {
  if (c.mixedUse !== undefined || c.generalBuildingValuation !== undefined || c.redevelopment !== undefined) return;
  if ((c.fixedAcquisitionPrice ?? 0) > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["companionAssets", i, "fixedAcquisitionPrice"],
    message: "신축(자가건축) 자산은 신축 비용(취득가액)이 필요합니다",
  });
}

/**
 * CP-4·5 — 컴패니언 취득일은 **모든 취득원인에서 필수**다.
 *
 * 🔴 종전에는 ⑭(`bundled-split-helpers.ts`)가 비어 있으면 **주 자산 취득일**로 대신 채웠다(C) — 다른 물건의
 *    취득일로 보유기간·세율·장기보유공제가 계산됐다(200 + 다른 세액). 그 대체를 없애고 여기서 요구한다.
 * ⑧은 모든 자산에 취득일을 요구한다(`validateAssetAcquisition` 공통 · 겸용·일반건물·재개발 전용 검증).
 * 입력 칸이 없는 두 원인은 ④가 채운다 — 신축: 4시점 중 가장 이른 날(영 §162①4호) · 이월과세: 주 자산과
 * **같은 규칙**(증여 등기접수일 — `carryoverAcquisitionDateFallback`). 매매·증여 arm은 위에서 이미 요구한다.
 */
function refineCompanionAcquisitionDate(c: CompanionAsset, i: number, ctx: z.RefinementCtx): void {
  if (c.acquisitionDate) return;
  const purchaseArmCovers =
    c.acquisitionCause === "purchase" &&
    c.burdenedGiftInfo === undefined &&
    c.generalBuildingValuation === undefined &&
    c.mixedUse === undefined;
  if (purchaseArmCovers || c.acquisitionCause === "gift") return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["companionAssets", i, "acquisitionDate"],
    message: "함께양도 자산은 취득일(상속개시일·사용승인일·증여 등기접수일 등)이 필요합니다",
  });
}

/**
 * 이월과세(§97의2) 서브객체 필수·정합 검증 — 컴패니언 arm과 주 자산(`transfer-tax-schema-required-refines.ts`)이
 * 공용한다(2026-09-30 — 종전엔 컴패니언에만 있어 주 자산은 비워도 200이었다).
 * 필수 항목은 ⑧(`transfer-tax-validate-acquisition.ts` `carryover_gift` 분기)과 같은 기준이다.
 */
export function refineCarryoverTaxation(
  ct: NonNullable<CompanionAsset["carryoverTaxation"]>,
  /** 폼-전역 양도일 (YYYY-MM-DD) */
  transferDate: string,
  ctx: z.RefinementCtx,
  /** `carryoverTaxation` 객체의 경로 */
  path: (string | number)[],
  /**
   * 관계 「그 외」 거부 — 컴패니언만 켠다. 주 자산은 엔진이 §97의2① 관계요건 불충족으로 **미적용**을
   * 판정한다(조용한 값 변경이 아니다 — `transfer.route.review-2026-08-f15` F15-6이 그 행동을 고정한다).
   */
  rejectOtherRelation = true,
  /**
   * 부담부증여(엔진 `isBurdenedGiftCarryover`와 같은 조건) — 당초 증여자 취득가액은 `burdenedGiftInfo.carryoverDonorBasis`가 정본이다(⑤가 이 칸을 숨기고 ④도 싣지 않는다 ·
   * `gb-bg-on-building-block-fields.plan.md` Q-2 a · 일반건물 밖도 같다). ⑧도 요구하지 않는다 — 여기서 요구하면 「⑧ 통과 ↔ ⑫·⑩ 400」이다.
   */
  donorPriceInCoDonorBasis = false,
): void {
  // 주 자산의 「그 외」 관계는 엔진이 이월과세를 적용하지 않는다 — 아래 증여자 기준 값은 쓰이지 않는다.
  if (!rejectOtherRelation && ct.donorRelation === "other") return;
  // ⑧ (a) §97의2④ 가업상속공제 의제 취득가액 자산은 미지원
  if (ct.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "exclusionDeclared"],
      message: "가업상속공제 적용 자산은 지원하지 않습니다 (소득세법 §97조의2 ④)",
    });
  }
  // ⑧ (b-3a) §97의2① 본문 — 대상은 배우자·직계존비속뿐
  if (rejectOtherRelation && ct.donorRelation === "other") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "donorRelation"],
      message: "이월과세는 배우자 또는 직계존비속 증여만 대상입니다 (소득세법 §97조의2 ①)",
    });
  }
  // ⑧ (b-3) 사망을 선언했으면 관계가 있어야 판정이 갈린다
  if (ct.donorDeceased && !ct.donorRelation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "donorRelation"],
      message: "증여자 사망 선언 시 증여자와의 관계 필수 (소득세법 §97조의2 ①)",
    });
  }
  // ⑧ (b-2) 날짜 순서 — 증여자 취득 → 증여 등기 → 양도
  // (YYYY-MM-DD 사전식 비교 = 날짜 비교 동치. Zod가 형식을 이미 강제한다.)
  if (ct.donorAcquisitionDate >= ct.giftRegistryDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "donorAcquisitionDate"],
      message: "증여자 취득일은 증여 등기접수일보다 이전이어야 합니다",
    });
  }
  if (ct.giftRegistryDate >= transferDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "giftRegistryDate"],
      message: "증여 등기접수일은 양도일보다 이전이어야 합니다",
    });
  }
  // ⑧ (c) §97의2②3호 비교과세 시나리오 B 취득가액
  if (ct.giftDateValuation <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "giftDateValuation"],
      message: "이월과세 자산은 증여 당시 평가액 필수",
    });
  }
  // ⑧ (f-3) 당초 증여 때 인수한 채무 부분(매입분) — 시나리오 A 조각 규칙의 입력. ⑧ `validateCarryoverDebt`와 같은 규칙이다(UI 통과 ↔ ⑫ 400 모순 금지).
  const debt = ct.giftAssumedDebt ?? 0;
  if (debt > 0) {
    const debtIssue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "giftAssumedDebt"], message });
    if (donorPriceInCoDonorBasis) debtIssue(`지금 양도하는 자산도 부담부증여이면 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다(${DEBT_PIECES_REASON.burdenedGift})`);
    if (debt > ct.giftDateValuation) debtIssue("당초 증여 때 인수한 채무가 증여 당시 평가액보다 큽니다");
    else if (debt === ct.giftDateValuation && ((ct.giftTaxAmount ?? 0) > 0 || (ct.donorCapitalExpenditure ?? 0) > 0))
      debtIssue("당초 증여 때 인수한 채무가 증여 당시 평가액과 같으면 증여받은 부분이 없어 증여세 상당액·증여자 자본적지출을 적용할 곳이 없습니다 — 두 칸을 비우세요");
  }
  // ⑧ (d) 환산 미사용 시 증여자 취득가액 직접 입력 필수
  if (!donorPriceInCoDonorBasis && !ct.useEstimatedAcquisition && (!ct.donorAcquisitionPrice || ct.donorAcquisitionPrice <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "donorAcquisitionPrice"],
      message: "이월과세 자산은 증여자 취득가액 필수 (환산 사용 시 useEstimatedAcquisition=true)",
    });
  }
}
