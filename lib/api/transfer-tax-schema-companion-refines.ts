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
import type { companionAssetSchema } from "./transfer-tax-schema-sub";

type CompanionAsset = z.infer<typeof companionAssetSchema>;

export function addCompanionAcquisitionCauseRefines(
  companions: CompanionAsset[],
  /** 폼-전역 양도일 (YYYY-MM-DD) — 이월과세 날짜 순서 검증용. */
  transferDate: string,
  ctx: z.RefinementCtx,
): void {
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
    if (
      c.acquisitionCause === "purchase" &&
      c.burdenedGiftInfo === undefined &&
      c.generalBuildingValuation === undefined
    ) {
      if (c.useEstimatedAcquisition) {
        if (!c.standardPriceAtAcquisition || c.standardPriceAtAcquisition <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "standardPriceAtAcquisition"],
            message: "매매(환산) 시 취득시 기준시가 필수",
          });
        }
        if (!c.standardPriceAtTransfer || c.standardPriceAtTransfer <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "standardPriceAtTransfer"],
            message: "매매(환산) 시 양도시 기준시가 필수",
          });
        }
      } else {
        if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
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
      if (!c.fixedAcquisitionPrice || c.fixedAcquisitionPrice <= 0) {
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
       * ⚠️ **`acquisitionDate`는 요구하지 않는다** — ⑧이 이월과세 분기에서 일반 취득 검증을
       *    건너뛰고(`return null`), ⑭도 미제공 시 주 자산 취득일로 대체하기 때문이다.
       */
      const ct = c.carryoverTaxation;
      if (!ct) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companionAssets", i, "carryoverTaxation"],
          message: "이월과세(증여) 자산은 증여 정보(carryoverTaxation) 필수",
        });
      } else {
        // ⑧ (a) §97의2④ 가업상속공제 의제 취득가액 자산은 미지원
        if (ct.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "exclusionDeclared"],
            message: "가업상속공제 적용 자산은 지원하지 않습니다 (소득세법 §97조의2 ④)",
          });
        }
        // ⑧ (b-3a) §97의2① 본문 — 대상은 배우자·직계존비속뿐
        if (ct.donorRelation === "other") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "donorRelation"],
            message: "이월과세는 배우자 또는 직계존비속 증여만 대상입니다 (소득세법 §97조의2 ①)",
          });
        }
        // ⑧ (b-3) 사망을 선언했으면 관계가 있어야 판정이 갈린다
        if (ct.donorDeceased && !ct.donorRelation) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "donorRelation"],
            message: "증여자 사망 선언 시 증여자와의 관계 필수 (소득세법 §97조의2 ①)",
          });
        }
        // ⑧ (b-2) 날짜 순서 — 증여자 취득 → 증여 등기 → 양도
        // (YYYY-MM-DD 사전식 비교 = 날짜 비교 동치. Zod가 형식을 이미 강제한다.)
        if (ct.donorAcquisitionDate >= ct.giftRegistryDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "donorAcquisitionDate"],
            message: "증여자 취득일은 증여 등기접수일보다 이전이어야 합니다",
          });
        }
        if (ct.giftRegistryDate >= transferDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "giftRegistryDate"],
            message: "증여 등기접수일은 양도일보다 이전이어야 합니다",
          });
        }
        // ⑧ (c) §97의2②3호 비교과세 시나리오 B 취득가액
        if (ct.giftDateValuation <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "giftDateValuation"],
            message: "이월과세 자산은 증여 당시 평가액 필수",
          });
        }
        // ⑧ (d) 환산 미사용 시 증여자 취득가액 직접 입력 필수
        if (!ct.useEstimatedAcquisition && (!ct.donorAcquisitionPrice || ct.donorAcquisitionPrice <= 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["companionAssets", i, "carryoverTaxation", "donorAcquisitionPrice"],
            message: "이월과세 자산은 증여자 취득가액 필수 (환산 사용 시 useEstimatedAcquisition=true)",
          });
        }
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
    }
  }
}
