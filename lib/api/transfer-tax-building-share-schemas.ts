/**
 * ⑫ 일반건물 × 지분(%) 분할 취득 — `generalBuildingShares[]` Zod 스키마.
 *
 * `transfer-tax-building-schemas.ts`(749줄)가 800줄 정책의 위험구간이라 지분 블록을 **동작 무변경으로 옮겼다**(2026-10-23 · PR-3 선행 리팩터).
 * 정의·주석은 그대로다. 소비처는 이 경로에서 직접 import한다(원 파일 재export는 순환 import라 두지 않는다).
 */
import { z } from "zod";
import { generalBuildingValuationSchema } from "./transfer-tax-building-schemas";
import { reductionSchema } from "./transfer-tax-schema-reductions";
import { burdenedGiftInfoSchema } from "./transfer-tax-burdened-gift-schema";

// ── ⑫ 일반건물 × 지분(%) 분할 취득 ──────────────────────────────────────

/**
 * 전 지분에서 **동일해야 하는** payload 경로 (계획서 §3-1 「물건-수준」).
 *
 * 지분마다 `valuation`을 통째로 싣는 구조라, 물건-수준 값이 어긋나면 **조용히 다르게 계산된다**.
 * 클라이언트(`mergeGbPropertyLevel`)가 primary에서 복사해 채우고, 여기서 그 결과를 검증한다.
 *
 * ⚠️ **`extensionInfo.actualAcquisitionPrice`·`actualExpenses`는 일부러 뺐다** —
 *    증축 비용은 그 지분이 부담한 몫이라 **× 지분율** 대상이다(설계 D3). 동일성을 강제하면 충돌한다.
 *
 * ⚠️ 물건 사건(증축·용도변경)은 **동일하게 보내고 적용 여부는 route가 판정**한다(설계 D4).
 *    API 변환에서 지분별로 빼면 이 검증이 상시 실패한다.
 */
export const GB_SHARE_PROPERTY_LEVEL_PATHS = [
  // 면적 — 물건 전체(100%). 지분으로 나누지 않는다.
  "landArea",
  "buildingArea",
  "buildingFootprintArea",
  // 양도시 기준시가 — 양도 시점은 하나뿐
  "transferLandPricePerSqm",
  "transferBuildingStdPrice",
  // 양도 계약 단위 — §100③ 30% 판정·감정 서열·§166⑧ 예외
  "landTransferPrice",
  "buildingTransferPrice",
  "saleSplitExemption",
  "landAppraisalAtTransfer",
  "buildingAppraisalAtTransfer",
  "appraisalDateAtTransfer",
  // 물건 속성 — NBL 배율(「지방세법 시행령」 §101①2호·②)
  "zoneType",
  "isMetropolitan",
  "unapprovedBuilding",
  // 물건 속성 — §104의2② 지정지역 선언(배율초과 토지 카드의 8호 중과 유예 판정). 한 필지의 소재지 사실이라 지분이 같다.
  "isDesignatedArea",
  // 물건 속성 — §104③ 미등기양도자산(위 `unapprovedBuilding`과 별개 축)
  "unregisteredLand",
  "unregisteredBuilding",
  // 물건 사건 ① 증축 (실가 2필드 제외 — 위 주석)
  "extensionInfo.extensionDate",
  "extensionInfo.extensionArea",
  "extensionInfo.acquisitionMode",
  "extensionInfo.extensionAcquisitionCause",
  "extensionInfo.extensionFloorArea85",
  "extensionInfo.transferExtensionBuildingStdPrice",
  "extensionInfo.acquisitionExtensionBuildingStdPrice",
  // 물건 사건 ② 주택→상가 용도변경
  "houseToCommercialConversion",
  "conversionDate",
  "wasMultiHouseAtConversion",
  // 물건 사건 ③ §99-164-10 최초공시
  "hasFirstDisclosure",
  "firstDisclosurePrice",
  "firstDisclosureLandStdPrice",
  "firstDisclosureBuildingStdPrice",
] as const;

/** 지분 1건. `valuation`은 물건-수준 병합이 끝난 **완결** payload다. */
export const generalBuildingShareSchema = z.object({
  shareId: z.string().min(1),
  shareLabel: z.string().min(1),
  /** 지분율 0 < r ≤ 1. Σ = 1 검증은 배열 레벨 superRefine이 한다. */
  ownershipRatio: z.number().positive().max(1),
  /** 그 지분의 **토지** 취득일 (M-1a). 건물 취득일은 `valuation.buildingAcquisitionDate`. */
  acquisitionDate: z.string().date(),
  /**
   * ⑫ 그 지분의 자산 단위 실지 취득가액·필요경비(× 지분율 완료) — 단건 top-level `acquisitionPrice`·`expenses`의 지분판.
   * `valuation`에 없는 값이라 중복이 아니다. 빠지면 실가 분기가 NaN(500)·취득가액 0이 된다(⑭ `buildGbPartCards`).
   */
  acquisitionPrice: z.number().int().nonnegative().optional(),
  expenses: z.number().int().nonnegative().optional(),
  /**
   * 그 지분의 **완결된** GB payload.
   *
   * 🔑 자본적지출·양도비(§97②2호 나목)도 **이 안에** 있다 —
   *    `buildGeneralBuildingValuation`이 넣고 `applyShareScale`이 × 지분율 한다.
   *    share 레벨에 같은 필드를 다시 두지 않는다(단일 진실).
   */
  valuation: generalBuildingValuationSchema,
  /**
   * ⑫ 그 지분의 조특법 감면 — **둘째 지분부터**(첫 지분은 최상위 `reductions`). 정의가 없으면 침묵 stripping으로
   * 감면이 엔진에 닿지 않는다(계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` §1.2).
   */
  reductions: z.array(reductionSchema).optional(),
  /**
   * ⑫ 그 지분의 부담부증여(소령 §159) 정보 — 부담부증여일 때 **모든 지분**이 갖는다(없으면 `refineGbBurdenedGiftActualPath`가 400).
   * 채무는 ④가 이미 그 지분율로 안분했고(`buildBurdenedGiftInfo`의 `debtScaleRatio`), 평가액·기준시가는 물건 전체 값이며 엔진
   * `scaleBurdenedGiftInfo`가 지분율만큼 줄인다 — 저장소 축 B 규약(법문 직접 근거 아님). 정의가 없으면 침묵 stripping으로 §159가 사라진다.
   */
  burdenedGiftInfo: burdenedGiftInfoSchema.optional(),
});

/** 점 표기 경로로 중첩 값을 꺼낸다. */
function atPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * 지분 배열 — 물건-수준 동일성 + 지분율 합계 100%.
 *
 * `.min(2)`인 이유: 지분 1건은 **기존 단건 경로**(route 5-a-3)가 처리한다.
 * 이 배열이 있으면 항상 다지분이다.
 */
export const generalBuildingSharesSchema = z
  .array(generalBuildingShareSchema)
  .min(2)
  .max(10)
  .superRefine((shares, ctx) => {
    // (1) 물건-수준 동일성 — 어긋나면 지분마다 다른 물건을 계산하게 된다.
    const first = shares[0]?.valuation as Record<string, unknown> | undefined;
    if (first) {
      for (let i = 1; i < shares.length; i++) {
        for (const path of GB_SHARE_PROPERTY_LEVEL_PATHS) {
          const a = atPath(first, path);
          const b = atPath(shares[i].valuation, path);
          const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v);
          if (norm(a) !== norm(b)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, "valuation", ...path.split(".")],
              message: `지분 간 물건-수준 값이 다릅니다(${path}). 면적·양도시 기준시가·용도지역·물건 사건은 전 지분 동일해야 합니다.`,
            });
          }
        }
      }
    }
    // (2) 지분율 합계 100% — 허용오차는 클라 validate(`transfer-tax-validate.ts`)와 **같은 값**.
    const sum = shares.reduce((s, x) => s + x.ownershipRatio, 0);
    if (Math.abs(sum - 1) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: `지분율 합계가 100%가 되어야 합니다 (현재 ${(sum * 100).toFixed(2)}%).`,
      });
    }
  });

export type GeneralBuildingShareSchemaInput = z.infer<typeof generalBuildingShareSchema>;
