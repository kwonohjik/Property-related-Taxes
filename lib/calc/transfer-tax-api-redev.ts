/**
 * 재개발/재건축 (시행령 §166) — RedevelopmentInfo 서브객체 변환.
 *
 * transfer-tax-api-helpers.ts 800줄 정책에 따라 분리 (2026-05-15).
 * buildRedevelopmentPayload 단일 함수만 포함.
 *
 * assetKind === "redevelopment_apt" || "right_to_move_in" + redevSubject 입력 시 호출.
 *
 * 빈값/0 필드 fallback:
 * - postApprovalExpenses 미입력 → 0 (사례 44)
 * - 환산 케이스 외 acquisitionStdPrice/managementDisposalStdPrice 미입력 → undefined
 * - firstDisclosureDate/Price → undefined (단서 미발동)
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { applyRatio } from "./transfer-tax-api-helpers";
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  resolveRedevSubject,
  exemptionAtApprovalInScope,
  postApprovalExpensesInScope,
  settlementOneHouseAtSaleInScope,
  redevCompletionDateInScope,
  householdBuildingCarryoverApplied,
  landContributedOriginalApt,
  landHouseholdBuildingInScope,
  successorGiftHouseholdApplies,
  successorGiftHouseholdInScope,
} from "./redev-field-scope";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { isRedevPhdTriggered } from "./redev-phd-trigger";

/**
 * AssetForm redev* 필드 → RedevelopmentInfo 서브객체 변환.
 *
 * 사례 37 land 분기 3중 패턴(UI/API/validate):
 *   LandPriceLookupField(단가×면적) 우선 > legacy 총액 직접 입력 fallback.
 *   UI·validate와 동일 우선순위 — API layer 단독 변환 금지(silent stripping 차단).
 */
/**
 * 공유지분 스케일 — **§166 필드별로 갈린다**(2026-09-03, 근거 실측).
 *
 * ## 스케일 O — 「관리처분계획등에 따라 **정하여진 가격**」(§166④1호)
 *
 * `rightsValue`(평가액)는 관리처분계획이 **물건 단위**로 정한 가격이다.
 * 「도시 및 주거환경정비법」 §39①1호가 **공유는 그 여러 명을 대표하는 1명을 조합원으로 본다**고
 * 하므로, 계획은 공유자별로 가격을 따로 정하지 않는다 ⇒ 각자의 몫은 **지분율로 귀속**된다.
 * 필요경비(§97①2·3호)도 화면 규약(「필요경비는 100% 기준 입력」)과 상위
 * `transfer-tax-api.ts`의 `transferExpense` 처리에 맞춘다.
 *
 * ## 🔴 스케일 X — 「**납부한** 청산금」(§166①1호)
 *
 * 법문이 **사실**(실제 납부·수령액)을 지목한다. 조합은 청산금을 **대표조합원 1인에게** 부과하고
 * (같은 §39①1호), 공유자 사이의 실제 분담은 **내부 약정**이라 지분율로 파생된다고 단정할 수 없다.
 * 엔진이 ×지분율로 쪼개면 **자동 안분 fallback**이 된다(정책 위반 —
 * `feedback_no_silent_apportion_fallback`).
 *
 * ⇒ 사용자가 **자기 지분 납부·수령분을 직접 입력**한다. 부담부증여 인수채무와 **같은 구조**이며
 *   (`burdened-gift-valuation.ts` 「스케일하지 않는 것」), UI도 같은 방식으로 라벨을 바꾼다.
 *
 * ## 스케일 X — 기준시가·면적 (비율 성분)
 *
 * §166③ 환산은 `평가액 × (취득일 기준시가 ÷ 인가일 기준시가)`라 기준시가가 **분자·분모로 함께**
 * 나타나 약분된다. 평가액이 이미 지분분이면 결과도 지분분이다. 기준시가까지 줄이면 **이중 축소**다
 * (이월과세 R-3·`transfer-tax-api-gb-shares.ts` `applyShareScale`과 같은 규율).
 *
 * ⚠️ 이 규율은 **§166⑦(기준시가 과세)이 미구현**이라는 전제 위에 선다. ⑦은 기준시가를 **절대값으로
 *    차감**해 약분되지 않으므로, 구현하게 되면 이 판단을 **다시 해야 한다**.
 *
 * @param ownershipRatio 공유지분율(0<r<1). 미전달·1.0이면 완전 무변경(단독 소유).
 */
export function buildRedevelopmentPayload(asset: AssetForm, ownershipRatio?: number) {
  const fractional =
    ownershipRatio !== undefined && ownershipRatio > 0 && ownershipRatio < 1;
  /** 절대금액 성분 전용 스케일러. 비율 성분·사실 금액(청산금)에는 쓰지 않는다. */
  const share = (v: number): number => (fractional ? applyRatio(v, ownershipRatio!) : v);
  // UI display fallback과 동일(RedevelopmentBlock.tsx). 3중 패턴(UI/API/validate).
  // assetKind="right_to_move_in" 시 redevSubject 미입력이면 "right" fallback
  // (경로 A 버그 수정: assetKind="right_to_move_in" + redevSubject="" → "apt" 오변환 차단)
  const subject = resolveRedevSubject(asset);
  /**
   * 완공 APT 양도 전용 필드 게이트.
   *
   * `receiveOnlyMode`(사례 46) · `newHouseResidenceMonths`(사례 45)는 **신축 APT가 존재해야**
   * 성립하는 사실이다. 입주권은 완공 전 권리 양도라 두 개념이 성립하지 않으며, 엔진도
   * 입주권 분기에서 receiveOnlyMode를 읽지 않는다(`computeAptReceive` 전용).
   * 게이트가 없으면 stale 저장값이 그대로 흘러 양도가액·LTHD를 조용히 바꾼다.
   */
  const isApt = subject === "apt";
  /** §164⑦ 본문 발동 — ⑧·⑤와 같은 술어(`isRedevPhdTriggered`). */
  const phdTriggered = isRedevPhdTriggered(asset);
  const rightsValueRaw =
    asset.redevIsSuccessorMember === "yes"
      ? parseAmount(asset.fixedAcquisitionPrice)
      : parseAmount(asset.redevRightsValue);
  return {
    subject,
    approvalLawBasis: (asset.redevApprovalLawBasis || "urban_renovation_art_74") as "urban_renovation_art_74" | "small_housing_art_29",
    approvalDate: asset.redevApprovalDate,
    // 사례 48 — 승계조합원 모드: redev 권리가액 필드 숨김 → 자산 카드 fixedAcquisitionPrice 자동 미러 (UI 무결성용).
    // 엔진 runSuccessorMember는 input.actualAcquisitionPrice 우선 사용하므로 본 값은 fallback.
    // 스케일 O — §166④1호 평가액(관리처분계획상 물건 단위 가격).
    // 승계조합원 갈래도 함께 감싼다: 엔진은 `input.actualAcquisitionPrice`(상위에서 이미 지분
    // 스케일됨)를 우선하고 이 값은 fallback이라, 스케일하지 않으면 fallback만 100%로 남는다.
    rightsValue: share(rightsValueRaw),
    // 공유지분이면 **물건 전체 권리가액**도 싣는다 — 청산금 수령분의 고가(12억) 비교·안분은 물건 전체 기준이다(#11 · 영 §156①·§160①).
    //   단독 소유는 싣지 않는다(rightsValue가 곧 물건 전체). 엔진·⑫가 같은 의미로 읽는다.
    ...(fractional && rightsValueRaw > 0 ? { rightsValueWhole: rightsValueRaw } : {}),
    settlementDirection: (asset.redevSettlementDirection || "pay") as "pay" | "receive",
    // 🔴 스케일 X — §166①1호 「**납부한** 청산금」은 사실이다. 사용자가 지분 납부·수령분을
    //    직접 입력한다(UI 라벨이 지분 모드에서 「(지분 납부분)」으로 바뀐다).
    settlementAmount: parseAmount(asset.redevSettlementAmount),
    settlementSaleDate: asset.redevSettlementSaleDate || undefined,
    // 스케일 O — 필요경비(§97①2·3호). 화면 규약 「필요경비는 100% 기준 입력」.
    preApprovalExpenses: share(parseAmount(asset.redevPreApprovalExpenses)),
    // 인가후 분 필요경비 = redev 전용 입력 + 자본적지출(§97① 가목) + 양도비(§97① 나목)
    // 신축APT 양도 시점에 발생한 자본적지출·양도비는 인가후 분에 귀속.
    postApprovalExpenses: (() => {
      // U1-02 — 승계조합원 전용 칸이다. 원조합원으로 되돌리면 화면에서 사라지지만 저장값은 남고,
      //         그 축에는 지울 위젯이 없다 ⇒ **범위 밖이면 합산하지 않는다**(마이그레이션과 2중선).
      const redevPost =
        postApprovalExpensesInScope(asset) && asset.redevPostApprovalExpenses
          ? parseAmount(asset.redevPostApprovalExpenses)
          : 0;
      const capex = parseAmount(asset.capitalExpenditure);
      const transferExp = parseAmount(asset.transferExpense);
      // 스케일 O — 세 성분 모두 100% 기준 입력이다. 합친 뒤 한 번만 적용한다
      // (성분별로 나눠 적용하면 floor가 세 번 걸려 잔액이 새 나간다).
      const total = share(redevPost + capex + transferExp);
      return total > 0 ? total : undefined;
    })(),
    originalAssetType: (asset.redevOriginalAssetType || "housing") as "land" | "housing" | undefined,
    acquisitionStdPrice: asset.redevAcquisitionStdPrice
      ? parseAmount(asset.redevAcquisitionStdPrice)
      : undefined,
    managementDisposalStdPrice: asset.redevManagementDisposalStdPrice
      ? parseAmount(asset.redevManagementDisposalStdPrice)
      : undefined,
    firstDisclosureDate: asset.redevFirstDisclosureDate || undefined,
    firstDisclosureHousingPrice: asset.redevFirstDisclosureHousingPrice
      ? parseAmount(asset.redevFirstDisclosureHousingPrice)
      : undefined,
    // PHD 패턴 — Sum_A·Sum_F 산정용 (housing 분기)
    landArea: asset.redevLandArea
      ? parseFloat(asset.redevLandArea.replace(/,/g, ""))
      : undefined,
    landPricePerSqmAtAcq: asset.redevLandPricePerSqmAtAcq
      ? parseAmount(asset.redevLandPricePerSqmAtAcq)
      : undefined,
    // 건물 기준시가는 §164⑦ 본문이 발동한 동안 빈 칸을 0으로 싣는다 — ⑧(`transfer-tax-validate-redev.ts` `< 0`만 막음)과 화면 미리보기
    // (`RedevelopmentValuationSection`)가 빈 칸을 0으로 보는데 여기만 미전송해, 엔진 본문이 발동하지 않고 숨은 분자 칸(0)으로
    // 취득가액 0을 계산했다(계획서 companion-redev-166-3-required.plan.md · 리뷰 게이트 D-2). 3중 패턴(UI/API/validate).
    buildingStdPriceAtAcq: asset.redevBuildingStdPriceAtAcq
      ? parseAmount(asset.redevBuildingStdPriceAtAcq)
      : phdTriggered
        ? 0
        : undefined,
    landPricePerSqmAtFirst: asset.redevLandPricePerSqmAtFirst
      ? parseAmount(asset.redevLandPricePerSqmAtFirst)
      : undefined,
    buildingStdPriceAtFirst: asset.redevBuildingStdPriceAtFirst
      ? parseAmount(asset.redevBuildingStdPriceAtFirst)
      : phdTriggered
        ? 0
        : undefined,
    // 단일 라목값
    managementDisposalHousingPrice: asset.redevManagementDisposalHousingPrice
      ? parseAmount(asset.redevManagementDisposalHousingPrice)
      : undefined,
    acquisitionHousingPrice: asset.redevAcquisitionHousingPrice
      ? parseAmount(asset.redevAcquisitionHousingPrice)
      : undefined,
    // 사례 45 — 거주월수 분리 입력 (§154⑧1호 통산 + 해석례 2020-386)
    // 빈문자열 → undefined (legacy fallback 의도 — 엔진에서 residencePeriodMonths 단일값 사용)
    // #12 — 토지만 출자한 원조합원 완공APT는 멸실된 주택이 없어 종전주택 거주 칸이 화면에 없다(엔진도 신축 거주만 읽는다).
    //   남은 값이 표2 거주(통산)에 섞이지 않도록 이 축에서는 보내지 않는다.
    // 승계조합원은 증여자와 같은 세대로 보유한 증여 승계(`successorGiftHouseholdApplies`)일 때만 — 그 밖의 승계에서 종전주택 거주는 승계 전 타인의 거주라 엔진이 읽지 않는다.
    priorHouseResidenceMonths:
      asset.redevPriorHouseResidenceMonths &&
      !landContributedOriginalApt(asset) &&
      (asset.redevIsSuccessorMember !== "yes" || successorGiftHouseholdApplies(asset))
        ? parseInt(asset.redevPriorHouseResidenceMonths.replace(/,/g, ""), 10)
        : undefined,
    // 신축 APT 거주월수 — 완공 APT 양도 전용(위 `isApt` 주석).
    newHouseResidenceMonths: isApt && asset.redevNewHouseResidenceMonths
      ? parseInt(asset.redevNewHouseResidenceMonths.replace(/,/g, ""), 10)
      : undefined,
    // 거주기간(입주일·퇴거일) — 결과 카드 산정 근거 표시용 pass-through
    priorResidenceStartDate: landContributedOriginalApt(asset) ? undefined : asset.redevPriorResidenceStartDate || undefined,
    priorResidenceEndDate: landContributedOriginalApt(asset) ? undefined : asset.redevPriorResidenceEndDate || undefined,
    newResidenceStartDate: asset.redevNewResidenceStartDate || undefined,
    newResidenceEndDate: asset.redevNewResidenceEndDate || undefined,
    // 사례 46 — 청산금 수령분 단독 신고 + 비과세 판정 시점 override
    // receiveOnlyMode는 완공 APT 양도 전용(위 `isApt` 주석) — 입주권은 미송신.
    receiveOnlyMode:
      !isApt
        ? undefined
        : asset.redevReceiveOnlyMode === "yes"
        ? true
        : asset.redevReceiveOnlyMode === "no"
          ? false
          : undefined,
    // U1-01 — ③-c 카드는 「완공APT + 청산금 수령 + 원조합원」에서만 열린다. 방향을 되돌리면
    //         카드가 사라지는데 완공APT에는 이 값을 지울 다른 위젯이 없다(§⑥ 토글은 입주권 전용)
    //         ⇒ **범위 밖이면 보내지 않는다**. 남으면 엔진이 입주권 인가전 분 LTHD를 표1로 강등한다(§95② 표1·표2).
    exemptionEligibleAtApproval: !exemptionAtApprovalInScope(asset)
      ? undefined
      : asset.redevExemptionEligibleAtApproval === "yes"
        ? true
        : asset.redevExemptionEligibleAtApproval === "no"
          ? false
          : undefined,
    // L-12 — 청산금분 양도일 현재 1세대1주택 자기선언. 동시신고 축 밖이면 보내지 않는다(stale 가드 —
    //         단독신고 전환·방향 되돌림 뒤 남은 값이 엔진 판정을 바꾸지 않게).
    oneHouseAtSettlementSale: !settlementOneHouseAtSaleInScope(asset)
      ? undefined
      : asset.redevOneHouseAtSettlementSale === "yes"
        ? true
        : asset.redevOneHouseAtSettlementSale === "no"
          ? false
          : undefined,
    // #13 — 토지만 출자한 입주권의 세대원 건물 소유 선언(§89①4호 본문). 토지 출자 입주권 축 밖이면 보내지 않는다
    //       (출자 자산을 주택으로 되돌린 뒤 남은 값이 엔진에 닿지 않게 — stale 가드). 엔진도 토지 출자일 때만 읽는다.
    landHouseholdOwnedBuilding: !landHouseholdBuildingInScope(asset)
      ? undefined
      : asset.redevLandHouseholdOwnedBuilding === "yes"
        ? true
        : asset.redevLandHouseholdOwnedBuilding === "no"
          ? false
          : undefined,
    // 사례 36 — 1세대1입주권 비과세 C-1 안전장치 (a) — 인가일 기준 종전주택 보유월수
    // UI 경고 카드(b) 자동 검증용. 엔진 계산에는 미사용 (비과세 판단 = exemptionEligibleAtApproval).
    priorHouseHoldingMonths:
      asset.redevPriorHouseHoldingMonths
        ? parseInt(asset.redevPriorHouseHoldingMonths.replace(/,/g, ""), 10) || undefined
        : undefined,
    // §89①4호 나목 — 그 1주택 취득일. 미입력이면 undefined로 두어 나목을 적용하지 않는다
    // (엔진이 판정 불가 → 비과세·12억 안분 모두 미적용). ⑫ Zod는 date string을 받고
    // ⑭ route가 Date로 바꾼다 — 그 변환이 빠지면 `Date < string` 비교가 조용히 false가 된다.
    otherHouseAcquisitionDate: asset.redevOtherHouseAcquisitionDate || undefined,
    // 나목 괄호 「대통령령으로 정하는 사유」(시행령 §155⑱ 1~5호) — 판정 메뉴 값을 그대로 싣는다(S05-4).
    otherHouseDisposalDelayReason: asset.redevOtherHouseDisposalDelayReason || undefined,
    // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
    // 3중 패턴(UI/API/validate): LandPriceLookupField(단가×면적) 우선 > legacy 총액 직접 입력 fallback.
    // UI·validate와 동일 우선순위 — API layer 단독 변환 금지(silent stripping 차단).
    landStdPriceAtAcq: (() => {
      const landArea = parseDecimal(asset.redevLandArea) || 0;
      const pricePerSqmAcq = parseAmount(asset.redevLandPricePerSqmAtAcq) || 0;
      // 단가×면적 계산 우선 (land 분기 §166③ 분자)
      if (pricePerSqmAcq > 0 && landArea > 0) {
        return multiplyByArea(pricePerSqmAcq, landArea);
      }
      // legacy fallback: 총액 직접 입력 (redevLandStdPriceAtAcq @deprecated)
      const legacyAcq = asset.redevLandStdPriceAtAcq ? parseAmount(asset.redevLandStdPriceAtAcq) : 0;
      return legacyAcq > 0 ? legacyAcq : undefined;
    })(),
    landStdPriceAtApproval: (() => {
      const landArea = parseDecimal(asset.redevLandArea) || 0;
      const pricePerSqmApproval = parseAmount(asset.redevLandPricePerSqmAtApproval) || 0;
      // 단가×면적 계산 우선 (land 분기 §166③ 분모)
      if (pricePerSqmApproval > 0 && landArea > 0) {
        return multiplyByArea(pricePerSqmApproval, landArea);
      }
      // legacy fallback: 총액 직접 입력 (redevLandStdPriceAtApproval @deprecated)
      const legacyApproval = asset.redevLandStdPriceAtApproval ? parseAmount(asset.redevLandStdPriceAtApproval) : 0;
      return legacyApproval > 0 ? legacyApproval : undefined;
    })(),
    // 사례 38/39 — 단독주택 출자 §166③ 2-point 환산취득가
    // 3중 패턴(UI/API/validate): 미입력 → undefined (엔진 분기 미발동)
    housingStdPriceAtAcq: asset.redevHousingStdPriceAtAcq
      ? parseAmount(asset.redevHousingStdPriceAtAcq)
      : undefined,
    housingStdPriceAtApproval: asset.redevHousingStdPriceAtApproval
      ? parseAmount(asset.redevHousingStdPriceAtApproval)
      : undefined,
    // 사례 48 — 승계조합원 신축APT 양도
    isSuccessorMember:
      asset.redevIsSuccessorMember === "yes"
        ? true
        : asset.redevIsSuccessorMember === "no"
          ? false
          : undefined,
    // 증여 승계의 「증여자와 계속 같은 세대」 선언(사전-2020-법령해석재산-0691) — 범위 밖이면 보내지 않는다(stale 가드). 미답은 보내지 않는다(통산 없이 계산 + 확인 필요).
    successorGiftSameHousehold: !successorGiftHouseholdInScope(asset)
      ? undefined
      : asset.redevSuccessorGiftSameHousehold === "yes"
        ? true
        : asset.redevSuccessorGiftSameHousehold === "no"
          ? false
          : undefined,
    // 준공일 — 승계조합원(취득시기 · 영 §162①4호) 또는 토지만 출자한 원조합원(§154① 보유 기산일 — G3-4)에서만 의미가 있다.
    // 범위 밖이면 보내지 않는다(카드가 사라진 뒤 남은 값이 엔진 판정을 바꾸지 않게 — U1-01 규약).
    completionDate: redevCompletionDateInScope(asset) ? asset.redevCompletionDate || undefined : undefined,
    // #12 — 세대원 건물 출자 통산: 토지 출자 원조합원 완공APT가 선언했을 때만(stale 가드). 취득일이 없으면 통산할 기산일이 없어 보내지 않는다(⑧이 먼저 막는다).
    householdBuilding:
      householdBuildingCarryoverApplied(asset) && asset.redevHouseholdBuildingAcquisitionDate
        ? {
            acquisitionDate: asset.redevHouseholdBuildingAcquisitionDate,
            residenceMonths: asset.redevHouseholdBuildingResidenceMonths
              ? parseInt(asset.redevHouseholdBuildingResidenceMonths.replace(/,/g, ""), 10)
              : undefined,
          }
        : undefined,
  };
}
