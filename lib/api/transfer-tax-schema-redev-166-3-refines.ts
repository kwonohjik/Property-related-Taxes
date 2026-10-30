/**
 * 양도세 ⑫ — 재개발·재건축 §166③ 환산취득가액 입력(분자·분모) 필수 (주 자산 · 컴패니언 공용).
 *
 * `addPropertyRefines`(주 자산 전용)에 있던 블록을 옮겼다 — 컴패니언 루프는 이 검사를 부르지 않아, 같은 자산을 함께 양도
 * 카드에 두면 분모가 빈 요청이 엔진 throw로 **500**이 됐다(계획서 `companion-redev-166-3-required.plan.md`).
 * 환산 여부는 엔진과 같은 신호로 본다 — `useEstimatedAcquisition`, 그리고 부담부증여는 §159 산정방식 「환산」
 * (`transfer-tax-burdened-gift-step.ts` `redevSec166Conversion` — 이 경우 본문의 `useEstimatedAcquisition`이 false여도 §166③을 쓴다).
 */
import { z } from "zod";
import { isHousingContribEstimatedAxes } from "@/lib/tax-engine/redevelopment-branch-gate";
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import { resolveBgAcquisitionBasis } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

type Redev166_3Like = {
  redevelopment?: unknown;
  useEstimatedAcquisition?: boolean;
  transferType?: string;
  burdenedGiftInfo?: unknown;
  propertyType?: string;
  /** 컴패니언은 `assetKind`로 온다 */
  assetKind?: string;
  acquisitionDate?: string | Date;
  carryoverTaxation?: { donorAcquisitionDate?: string | Date } | null;
};

const positive = (v: unknown) => typeof v === "number" && v > 0;
const dateKey = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : "");

export function refineRedevelopment166_3Inputs(
  data: Redev166_3Like,
  ctx: z.RefinementCtx,
  prefix: (string | number)[] = [],
) {
  if (!data.redevelopment) return;
  const rd = data.redevelopment as Record<string, unknown>;
  const issue = (field: string, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...prefix, "redevelopment", field], message });
  const useEstimated = data.useEstimatedAcquisition === true;
  // ⑩ 사례 39 — 단독주택 출자 §166③ 2-point 환산취득가 필수 검증
  // 분기 활성 조건: originalAssetType="housing" + subject="right" + useEstimated=true
  // 3중 패턴(UI/API/validate) 동기화 — UI 통과 ↔ validate 차단 모순 방지
  {
    // 🔴 2026-08-25 정정(E1-04): 종전에는 여기서 축을 직접 나열하면서 **청산금 방향을 빠뜨려**
    //    납부 조합이 400으로 막혔다(입력 UI도 없어 dead-end). 네 지점이 같은 leaf를 본다.
    const isHousingEstimated = isHousingContribEstimatedAxes({
      originalAssetType: rd.originalAssetType as string | undefined,
      subject: rd.subject as string | undefined,
      settlementDirection: rd.settlementDirection as string | undefined,
      useEstimatedAcquisition: data.useEstimatedAcquisition,
    });
    if (isHousingEstimated) {
      if (!rd.housingStdPriceAtAcq || (rd.housingStdPriceAtAcq as number) <= 0) {
        issue("housingStdPriceAtAcq", "단독주택 출자 환산취득가 — 취득당시 개별주택가격(§166③ 분자) 필수");
      }
      if (!rd.housingStdPriceAtApproval || (rd.housingStdPriceAtApproval as number) <= 0) {
        issue("housingStdPriceAtApproval", "단독주택 출자 환산취득가 — 인가당시 개별주택가격(§166③ 분모) 필수");
      }
    }

    /**
     * ⑩ §166③ 일반 환산 — **분모 필수** (2026-08-26 신설, E1-07).
     *
     * 종전에는 이 요구가 ⑧ 클라이언트에만 있었다. 분모가 없으면 엔진
     * (`redevelopment-split.ts` Step A)이 취득가액을 0으로 두고 **오류 없이** 계산해
     * 인가전 양도차익이 권리가액 전액이 됐다(사례 44 기준 산출세액 +38,244,566원 과대).
     * 엔진은 이제 던지지만, 500이 아니라 **여기서 400**으로 막는 것이 정본이다.
     *
     * ⚠️ ⑧보다 **넓게 막지 않는다** — 승계조합원은 `runSuccessorMember`가 §166 안분 자체를
     *    건너뛰므로 분모를 쓰지 않는다. 요구하면 화면에 없는 칸을 채우라는 dead-end가 된다.
     * ⚠️ 위 §166③ 2-point 분기(`isHousingEstimated`)는 D가 아니라 전용 2필드를 쓴다 — 배제.
     */
    // 부담부증여는 엔진이 §159 산정방식 「환산」으로 §166③을 쓴다 — 본문 `useEstimatedAcquisition`과 무관하다(`redevSec166Conversion`).
    // 엔진 판정 그대로: 괄호 미발동(시가 평가 · 담보 승 아님 — `resolveBgAcquisitionBasis`) ∧ 「환산」 ∧ 재개발 완공 아파트(입주권 아님).
    // 기준시가 평가·담보 승은 취득가액을 취득시 기준시가로 강제해 §166③을 쓰지 않는다 — 남은 「환산」 값으로 막으면 화면에 칸이 없는
    // 400이다(리뷰 게이트 D-1 · 실측 10,824,283 · 100,661,180).
    const info = data.burdenedGiftInfo as BurdenedGiftInfo | null | undefined;
    const bgConverted =
      data.transferType === "burdened_gift" &&
      !!info &&
      info.acquisitionMethod === "converted" &&
      rd.subject !== "right" &&
      data.propertyType !== "right_to_move_in" &&
      data.assetKind !== "right_to_move_in" &&
      !resolveBgAcquisitionBasis(
        info,
        computeSangjeungbeopValuation(info.landStdPriceAtTransfer, info.buildingStdPriceAtTransfer, info).selectedMode,
      ).acqStdPriceForced;
    if ((useEstimated || bgConverted) && !isHousingEstimated && rd.isSuccessorMember !== true) {
      if (rd.originalAssetType === "land") {
        if (!rd.landStdPriceAtAcq || (rd.landStdPriceAtAcq as number) <= 0) {
          issue("landStdPriceAtAcq", "토지 출자 환산취득가 — 취득당시 개별공시지가(§166③ 분자) 필수");
        }
        if (!rd.landStdPriceAtApproval || (rd.landStdPriceAtApproval as number) <= 0) {
          issue("landStdPriceAtApproval", "토지 출자 환산취득가 — 인가당시 개별공시지가(§166③ 분모) 필수");
        }
      } else if (
        !rd.managementDisposalHousingPrice ||
        (rd.managementDisposalHousingPrice as number) <= 0
      ) {
        issue("managementDisposalHousingPrice", "환산 모드 — D(관리처분 인가일 개별주택공시가격, §166③ 분모) 필수");
      }
      // 분자(취득당시 개별주택가격 P_A)도 엔진이 쓰는 그대로 — 최초공시일 전 취득이면 §164⑦ 본문 입력으로 만들고, 아니면 직접 입력.
      // 비면 엔진은 P_A = 0으로 취득가액 0을 오류 없이 계산했다(⑧은 막는다 — 계획서 같은 곳).
      if (rd.originalAssetType !== "land" && !positive(rd.acquisitionHousingPrice)) {
        // 이월과세(부담부증여 아님)면 당초 증여자 취득일로 본다 — 엔진 A의 취득일·⑧(`redevPreApprovalAcquisitionDate`)과 같다
        //   (「소득세법」 제97조의2①1호 · 계획서 `redev-carryover-phd-donor-date.plan.md` D-2). 컴패니언은 `transferType` 대신 `burdenedGiftInfo`로 부담부증여를 안다.
        const donorDate = data.carryoverTaxation?.donorAcquisitionDate;
        const burdenedGift = data.burdenedGiftInfo != null || data.transferType === "burdened_gift";
        const acq = dateKey(donorDate && !burdenedGift ? donorDate : data.acquisitionDate);
        const first = dateKey(rd.firstDisclosureDate);
        const preDisclosureMain =
          !!first && !!acq && acq < first &&
          positive(rd.firstDisclosureHousingPrice) && positive(rd.landArea) &&
          positive(rd.landPricePerSqmAtAcq) && typeof rd.buildingStdPriceAtAcq === "number" && rd.buildingStdPriceAtAcq >= 0 &&
          positive(rd.landPricePerSqmAtFirst) && typeof rd.buildingStdPriceAtFirst === "number" && rd.buildingStdPriceAtFirst >= 0;
        if (!preDisclosureMain)
          issue("acquisitionHousingPrice", "환산 모드 — 취득당시 개별주택공시가격(§166③ 분자) 필수 — 최초공시일 전 취득이면 §164⑦ 본문 입력(최초공시 주택가격·토지·건물 기준시가)");
      }
    }
  }
}
