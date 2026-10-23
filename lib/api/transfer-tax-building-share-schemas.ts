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

/**
 * 위 목록 중 **환산 경로(`actualPriceMode !== true`)만 싣는** 키 — 환산 지분끼리만 비교한다.
 *
 * ④는 지분마다 경로를 고른다(`buildGeneralBuildingValuation`). 실가 경로는 이 키들을 싣지 않는다 —
 *  - `buildingArea`: 엔진이 읽지 않는 값이라 실가 본문에 없다.
 *  - 최초공시 4칸: 실가 경로에 실으면 실가 취득가액이 환산주택가격으로 조용히 바뀌므로 일부러 막았다(`anyEstimated` 게이트 · 2026-08-13).
 *
 * 🔴 종전에는 전 지분 쌍을 비교해, 지분마다 실가·환산이 섞이면 같은 면적을 넣어도
 *    「지분 간 물건-수준 값이 다릅니다(buildingArea)」로 400이 났다 — ⑧은 통과해 화면에서 고칠 수 없는 막다른 길
 *    (`docs/00-pm/gb-share-mode-mix-and-inherited-estimate-guard.plan.md` S-1 · Q-1 a).
 *    「안 쓰는 경로라 안 실었다」와 「값이 다르다」를 가르는 축은 키의 존재가 아니라 지분의 경로다
 *    (존재로 가르면 버그로 빠진 값도 통과한다).
 */
export const GB_SHARE_ESTIMATED_PATH_ONLY: ReadonlySet<string> = new Set([
  "buildingArea",
  "hasFirstDisclosure",
  "firstDisclosurePrice",
  "firstDisclosureLandStdPrice",
  "firstDisclosureBuildingStdPrice",
] satisfies (typeof GB_SHARE_PROPERTY_LEVEL_PATHS)[number][]);

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
  burdenedGiftInfo: burdenedGiftInfoSchema
    .superRefine((info, ctx) => {
      // 당초 증여자 신축·증축 §114조의2(PR-5c)는 단건 일반건물(F27)만 받는다 — 지분 카드는 이월과세 §97의2 를 타지 않아 받아 놓고 무시하게 되므로 거부
      if (info.carryoverDonorBasis?.donorBuilt !== undefined)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["carryoverDonorBasis", "donorBuilt"], message: "지분 분할 취득의 부담부증여는 당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다" });
    })
    .optional(),
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
    // 환산 전용 키의 기준 — 첫 **환산** 지분(위 `GB_SHARE_ESTIMATED_PATH_ONLY`).
    const isEstimatedPath = (v: unknown) => (v as { actualPriceMode?: boolean }).actualPriceMode !== true;
    const firstEstimated = shares.find((s) => isEstimatedPath(s.valuation))?.valuation;
    if (first) {
      for (let i = 1; i < shares.length; i++) {
        for (const path of GB_SHARE_PROPERTY_LEVEL_PATHS) {
          const estimatedOnly = GB_SHARE_ESTIMATED_PATH_ONLY.has(path);
          if (estimatedOnly && (!isEstimatedPath(shares[i].valuation) || shares[i].valuation === firstEstimated)) continue;
          const a = atPath(estimatedOnly ? firstEstimated : first, path);
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
