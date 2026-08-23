/**
 * ⑫ 토지·건물 **분리취득** 축의 Zod 필드 shape — 단건(주 자산)과 컴패니언 **공용**.
 *
 * ## 왜 shape을 따로 뽑았나 (N-6(A), 2026-08-23)
 *
 * 이 축은 ④에 이미 **자산 종류를 가리지 않는 공용 빌더**가 있다
 * (`lib/calc/transfer-tax-api-split.ts` `buildSplitPayload(asset, …)` — 인자가 `AssetForm`이다).
 * ⑤ UI도 자산 카드 공용이라 **컴패니언 카드에도 「토지·건물 취득일 다름」 토글이 렌더된다**
 * (`CompanionAcqPurchaseBlock.tsx` `isSplitable = assetKind === "housing" | "building"` —
 * 자산 인덱스를 보지 않는다).
 *
 * 그런데 ⑫ `companionAssetSchema`에 **필드가 하나도 없었다**. Zod는 모르는 키를 **조용히
 * 떼어내므로**(TypeScript가 못 잡는 층) 컴패니언에서 토글을 켜고 파트 값을 채워도
 * 세액이 1원도 움직이지 않았다 — 「④가 보내는데 ⑫가 버린다」의 전형이다.
 *
 * ⇒ 필드 목록을 **한 벌만** 두고 양쪽이 spread한다. 두 벌이면 단건에 필드가 늘 때 컴패니언만
 *   빠져 같은 결함이 재발한다(같은 실패가 `preHousingDisclosure`에서 이미 한 번 났다 — N-6 (B)).
 *
 * ⚠️ **선언 순서** — 이 shape은 leaf다(다른 스키마를 import하지 않는다). `transfer-tax-schema-sub.ts`
 *    안에 두면 `companionAssetSchema`(:287)가 그 아래 정의된 스키마를 참조하는 TDZ 위험이
 *    생긴다(N-7이 기록한 `preHousingDisclosureSchema` 사례). 그래서 별도 파일이다.
 */
import { z } from "zod";

export const splitAcquisitionShape = {
  // ─── 취득일 분리 (소득령 §166⑥·§168②) ────────────────────────────
  /** 토지 취득일 (건물 `acquisitionDate`와 다를 때) — `calcSplitGain` **진입 게이트**다. */
  landAcquisitionDate: z.string().date().optional(),
  /** 토지 파트 취득원인 — 「소득세법」 §104② 단서를 토지 파트에 적용 */
  landAcquisitionCause: z.enum(["purchase", "inheritance", "gift", "carryover_gift"]).optional(),
  /** 토지 파트 피상속인 취득일 (§104②1호) */
  landDecedentAcquisitionDate: z.string().date().optional(),
  /** 토지 파트 증여자 취득일 (§104②2호) */
  landDonorAcquisitionDate: z.string().date().optional(),
  /** 토지·건물 소유자 분리 (§166⑥) */
  selfOwns: z.enum(["both", "building_only", "land_only"]).optional(),

  // ─── 파트별 취득 방식 (4-way 독립) ────────────────────────────────
  landAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  buildingAcqMode: z.enum(["actual", "estimated", "appraisal", "salesCase"]).optional(),
  /** 별개 취득 — 취득가액 축 **파트별 완결** 게이트. ④가 `isSeparateAcquisition()`으로 파생한다. */
  isSeparateAcquisition: z.boolean().optional(),

  // ─── 파트별 금액 ──────────────────────────────────────────────────
  landAcquisitionPrice: z.number().int().nonnegative().optional(),
  buildingAcquisitionPrice: z.number().int().nonnegative().optional(),
  landDirectExpenses: z.number().int().nonnegative().optional(),
  buildingDirectExpenses: z.number().int().nonnegative().optional(),
  /** 토지 파트 매매사례가액(§176의2③1호) — `landAcqMode === "salesCase"` 시 */
  landSalesCaseValue: z.number().int().nonnegative().optional(),
  buildingSalesCaseValue: z.number().int().nonnegative().optional(),

  // ─── 양도가액 분리 ────────────────────────────────────────────────
  /** "apportioned"(기준시가 비율 안분) | "actual"(구분양도) | "appraisal"(감정가 안분) */
  saleSplitMode: z.enum(["apportioned", "actual", "appraisal"]).optional(),
  landTransferPrice: z.number().int().positive().optional(),
  buildingTransferPrice: z.number().int().positive().optional(),
  /**
   * 양도시 감정평가가액 — 안분 basis 1순위(부가령 §64①1호 단서 · 소령 §166⑥ 차용).
   * `nonnegative()`인 이유: 0은 「그 파트를 평가하지 않았다」는 뜻이고 엔진이 그것을
   * 배제 사유로 **기록**해야 화면이 이유를 말할 수 있다.
   */
  landAppraisalAtTransfer: z.number().int().nonnegative().optional(),
  buildingAppraisalAtTransfer: z.number().int().nonnegative().optional(),
  appraisalDateAtTransfer: z.string().optional(),
  /** 「소득세법 시행령」 §166⑧ 예외 — 선택 시 §100③ 30% 의제가 발동하지 않는다. */
  saleSplitExemption: z.enum(["other_law", "demolished_land_only"]).optional(),

  // ─── 파트별 기준시가 (환산·안분 분모) ─────────────────────────────
  landStandardPriceAtTransfer: z.number().int().positive().optional(),
  buildingStandardPriceAtTransfer: z.number().int().positive().optional(),
  /** 건물분 취득시 기준시가(§99①1호 나목) — **별개 취득 전용** */
  buildingStandardPriceAtAcquisition: z.number().int().positive().optional(),
} as const;
