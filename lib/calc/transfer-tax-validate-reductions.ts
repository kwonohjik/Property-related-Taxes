/**
 * STEP 2 (감면·공제) 검증 — §99의3 + 장기임대 §97 시리즈
 *
 * transfer-tax-validate.ts 800줄 정책 분리 (2026-06-11).
 * 반환: 실패 시 ValidationIssue, 통과 시 null.
 */

import { addYears } from "date-fns";
import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import { isWithin5YearsCheck } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import { isAddenda29_2WindowIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { isNew993PriorRuleEraIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { needsFirstContractAnswer } from "@/lib/tax-engine/transfer-reductions/new-99-acquisition-cause";
import { redevMemberNewHouseScope } from "./redev-field-scope";
import { redevMemberNewHouseIssue } from "./transfer-tax-validate-new99-member";
import { NEW_99_3_ADDENDA_6762 } from "@/lib/tax-engine/legal-codes/transfer-house";
import {
  isIncomeDeductionTrack,
  isTaxAmountTrack,
} from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { axisBEffectiveAsset } from "./axis-b-effective-asset";
import { isReductionAllowedForAssetKind, REDUCTION_METADATA, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import { assetKindGateReason } from "@/lib/tax-engine/transfer-reductions";
import { asksInheritedPresaleQuestion } from "@/lib/tax-engine/transfer-reductions/unsold-98-acquisition-cause";
import { unsold98AcquisitionCauseReason } from "@/lib/tax-engine/transfer-reductions/unsold-98-acquisition-cause";
import { isGbClaimRouteAllowedForAssetKind } from "@/lib/tax-engine/transfer-reductions";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { isRowReduction } from "./house-count-exclusion-rows";
import { selfFarmingOwnYearsSufficient } from "./self-farming-own-years";
import { selfFarmingDecedentAggregable } from "./self-farming-own-years";
import { fieldError, type IssueField } from "./transfer-tax-validate-field";
import { primaryAcquisitionDateOf } from "./transfer-tax-api-carryover";
import { redevHiddenGeneralStdPrice } from "./redev-acquisition-price-source";
import { engineStdPriceAtTransfer } from "./engine-std-price-at-transfer";
import { rental97SeriesIssue } from "./transfer-tax-validate-rental-97";

/**
 * 「PHD 환산 모드」 메시지가 가리킬 입력칸 — 메시지는 5칸을 한꺼번에 묻지만(`canCalcReductionPhd`)
 * 화면은 한 칸씩 채우므로 **비어 있는 첫 칸**으로 보낸다. 앵커는 `ReductionPhdInput`이 조문 타입별로 단다.
 * (건물 칸은 취득시 건물 기준시가가 있을 때만 최초공시시 값을 요구한다 — `phd-helper.ts:189`)
 */
function phdField(
  type: string,
  i: {
    firstDisclosurePrice: number;
    landAreaSqm: number;
    landPricePerSqmAtAcquisition: number;
    landPricePerSqmAtFirstDisclosure: number;
  },
): IssueField {
  const prop =
    !(i.firstDisclosurePrice > 0) ? "phdFirstDisclosurePrice"
    : !(i.landAreaSqm > 0) ? "phdLandAreaSqm"
    : !(i.landPricePerSqmAtAcquisition > 0) ? "phdLandPricePerSqmAtAcq"
    : !(i.landPricePerSqmAtFirstDisclosure > 0) ? "phdLandPricePerSqmAtFirst"
    : "phdBuildingStdAtFirst";
  return `reduction.${type}.${prop}`;
}

/**
 * 하이브리드 4조문(§99의2·§98의3·§98의5·§98의6·§98의7)과 §98의8 공용 — 취득 후 5년 경과 양도 시 5년 발생분
 * 기준시가 안분(조특령 §40① 준용)에 필요한 취득시·5년시점 기준시가(자산-수준 fallback 없음) 필수 (F-1).
 *
 * ⚠ §99의3(:44·50)·§99(:103)의 **무조건 필수**와 다르다 — 그 둘은 차감(income_deduction) 전용이라
 * 기준시가가 항상 필요하지만, 하이브리드는 5년 이내 양도가 세액감면 경로라 기준시가가 불요하다.
 * 따라서 반드시 5년 분기 조건부로만 차단한다(5년 내 미입력 사용자를 오차단하면 UI↔validate 모순).
 * 일자 미입력 시 낙관 통과(일자 자체는 step0 검증 영역).
 */
function failIfStdPriceMissingOver5Y(
  fail: (message: string) => ValidationIssue,
  asset: AssetForm,
  form: TransferFormData,
  stdAcq: string | undefined,
  std5Y: string | undefined,
  articleLabel: string,
  /** PHD 환산 ON — 취득시 기준시가는 §164⑦ 환산으로 충족되므로 취득시 검증 skip(5년 시점만 검증) */
  phdSatisfiesAcq: boolean | undefined,
  /** 입력칸 이동 앵커의 조문 타입 — `ReductionStdPriceSection`이 `reduction.${fieldType}.standardPriceAt…`로 단다 */
  fieldType: string,
  /** 감면 카드의 양도시 기준시가 */
  stdTransfer: string | undefined,
  /** ④가 엔진에 싣는 자산 양도시 기준시가(`engineStdPriceAtTransfer` — 엔진 `?? ctx.standardPriceAtTransfer` 폴백과 같은 값) */
  engineStdTransfer: number,
): ValidationIssue | null {
  // 이월과세는 증여 등기접수일 — 화면(⑤ 패널)·④와 같은 leaf (L23). 칸 없는 `acquisitionDate` 잔재를 읽지 않는다.
  const acquisitionDate = primaryAcquisitionDateOf(asset);
  if (!acquisitionDate || !form.transferDate) return null;
  if (isWithin5YearsCheck(new Date(acquisitionDate), new Date(form.transferDate))) return null;
  if (!phdSatisfiesAcq && parseAmount(stdAcq || "0") <= 0)
    return fail(fieldError(`reduction.${fieldType}.standardPriceAtAcquisition`, `${articleLabel} 적용: 취득 후 5년 경과 양도는 취득시 기준시가를 입력하세요 (5년 발생분 안분 — 미입력 시 감면이 적용되지 않습니다).`));
  if (parseAmount(std5Y || "0") <= 0)
    return fail(fieldError(`reduction.${fieldType}.standardPriceAt5Years`, `${articleLabel} 적용: 취득 후 5년 경과 양도는 취득 5년 시점 기준시가를 입력하세요.`));
  /**
   * 양도시 기준시가도 안분의 분모라 필수다(리뷰 US-35). 종전에는 이 칸을 보지 않아, 실가 모드처럼 ④가 자산값을 싣지 않으면 ⑧은 통과하고
   * 엔진이 `MISSING_STD_PRICE`로 차감을 0으로 냈다(⑤ hint는 이미 「필수」라 ⑤↔⑧ 모순). §99의3 블록과 같은 leaf·같은 규칙이다.
   */
  if (!(parseAmount(stdTransfer || "0") > 0 || engineStdTransfer > 0))
    return fail(fieldError(`reduction.${fieldType}.standardPriceAtTransfer`, `${articleLabel} 적용: 취득 후 5년 경과 양도는 양도시 기준시가를 입력하세요 (5년 발생분 안분의 분모 — 환산취득가액·기준시가 안분 모드가 아니면 자산값이 전달되지 않습니다).`));
  return null;
}

export function validateStep2Reductions(step: number, form: TransferFormData): ValidationIssue | null {
  // step 2: 감면·공제 (구 step 4)
  if (step === 2) {
    const assets = form.assets ?? [];
    for (let ai = 0; ai < assets.length; ai++) {
      // 축 B 지분 카드는 첫 카드의 물건 값으로 본다 — ④·⑤ 감면 패널과 같은 leaf(저장 `assetKind`는 기본값 «주택»이다).
      const asset = axisBEffectiveAsset(form, ai);
      const fail = (message: string): ValidationIssue => ({ step, assetIndex: ai, message });
      // 원조합원 §166 자산의 화면에 없는 기준시가 칸 — 감면 기준시가 폴백으로 인정하지 않는다(④는 싣지 않는다, ⑤⑧과 같은 leaf).
      const redevHiddenStd = redevHiddenGeneralStdPrice(asset, form);

      /**
       * §127⑦ **트랙 교차** 차단 (코드리뷰 D10-01).
       *
       * §127⑦ 중복배제 max는 `calcReductions`의 **세액감면형 후보 안에서만** 돈다.
       * 소득차감형(§90② — 양도소득금액 차감)은 STEP 4.6에서 별도로 소득을 깎으므로
       * 두 트랙을 동시에 선택하면 §127⑦을 우회해 **이중 혜택**이 된다.
       * 실측(§99 차감형 + §77 세액감면형, 양도 9억): 결정세액 16,035,410 과소.
       *
       * §127⑦은 「…**그 거주자가 선택하는** 하나의 감면규정만을 적용한다」로 납세자에게
       * 선택권을 준다 ⇒ 엔진이 임의로 고르지 않고 여기서 차단해 사용자가 택하게 한다.
       *
       * 트랙 판정은 엔진 단일 소스(`isIncomeDeductionTrack`/`isTaxAmountTrack`)를 **재사용**한다.
       * 하이브리드 8종은 5년 이내면 세액감면형이라 §127⑦ max에 합류하므로 차단 대상이 아니다.
       * anchor: `__tests__/tax-engine/transfer/reduction-track-crossing-127-7.anchor.test.ts`
       */
      const trackAcquisitionDate = primaryAcquisitionDateOf(asset);
      if (trackAcquisitionDate && form.transferDate) {
        const within5 = isWithin5YearsCheck(
          new Date(trackAcquisitionDate),
          new Date(form.transferDate),
        );
        const selected = (asset.reductions ?? []).map((x) => x.type);
        const deduction = selected.filter((t) => isIncomeDeductionTrack(t, within5));
        const taxAmount = selected.filter((t) => isTaxAmountTrack(t, within5));
        if (deduction.length > 0 && taxAmount.length > 0) {
          const label = (t: string) =>
            REDUCTION_METADATA[t as keyof typeof REDUCTION_METADATA]?.uiLabel ?? t;
          return fail(
            `조특법 §127⑦ 중복배제: 「${label(deduction[0])}」(양도소득금액 차감)과 ` +
              `「${label(taxAmount[0])}」(산출세액 감면)은 동시에 적용받을 수 없습니다. ` +
              "둘 중 하나만 선택하세요 — 어느 쪽이 유리한지는 각각 선택해 계산한 뒤 총 납부세액을 비교하면 됩니다.",
          );
        }
      }

      for (const r of asset.reductions ?? []) {
        // 조특법 주택 수 제외 3유형은 ③ 패널에 입력 칸이 없다 — 명부 행 ⑥이 받고 ② 단계가 검증한다.
        //   남은 옛 선언도 ② 단계가 막는다(`transfer-tax-validate-count-exclusion.ts`, 계획서 Q-3).
        if (isRowReduction(r)) continue;
        /**
         * Q-1(D15): 조특법 §129②는 미등기양도자산의 감면을 끄지만, 자경농지(조특법 §69①) 토지는
         * 애초에 미등기양도자산이 아니다(소득세법 시행령 §168①3호). 둘이 함께 오면 모순 입력이라
         * 엔진이 조용히 해석하지 않도록 여기서 막는다 — ⑫ `addPropertyRefines`도 같은 조건으로 거부한다.
         * 미등기 축은 ④와 같다: 주 자산은 폼-전역 `form.isUnregistered`, 컴패니언은 자산 값.
         */
        if (r.type === "self_farming" && (ai === 0 ? form.isUnregistered : asset.isUnregistered)) {
          return fail(
            "자경농지 감면 대상 토지는 미등기양도자산이 아닙니다(소득세법 시행령 §168①3호). 미등기 체크를 해제하세요.",
          );
        }
        // 주택 게이트 (2026-06-29): 비주택 자산에 stale 선택된 주택 감면(§97·§99·§98 시리즈) 차단.
        // UI disabled와 동일 판정 (단일 소스 isReductionAllowedForAssetKind). field별 검증보다 먼저.
        if (!isReductionAllowedForAssetKind(r.type, asset.assetKind)) {
          const gateLabel =
            REDUCTION_METADATA[r.type as keyof typeof REDUCTION_METADATA]?.uiLabel ?? "이 감면";
          // §69는 반대 방향 게이트다 — 「토지 전용」이라 주택 문구를 쓰면 사유가 거꾸로 안내된다.
          if (r.type === "self_farming")
            return fail(
              "자경농지 감면(조특법 §69)은 토지 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.",
            );
          // §98 시리즈 6조문 × 조합원 경로·분양권은 「주택 양도」 문구가 사유와 맞지 않는다(US-44) — 엔진 고지와 같은 문구.
          const articleReason = assetKindGateReason(r.type, asset.assetKind);
          if (articleReason) return fail(`${articleReason} 감면 선택을 해제하세요.`);
          return fail(`${gateLabel} 감면은 주택 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.`);
        }
        // US-07 — §98 시리즈 취득 원인 게이트(⑤·엔진과 같은 leaf). 답이 비면 묻고, 불성립이 확정되면 막는다. 「모름」은 엔진이 확인 필요로 안내한다.
        if (asksInheritedPresaleQuestion(r.type, asset.acquisitionCause) && !asset.inheritedPresaleCompletedByHeir) {
          return fail("상속받은 주택입니다. 상속 당시 분양권이었고 본인(상속인)이 잔금을 내고 취득했는지 선택하세요.");
        }
        {
          // §98의6은 호(1호·2호)로 갈린다 — 엔진과 같은 값을 그대로 넘긴다(호가 비면 엔진도 1호로 보고 불성립 — 같은 결론).
          const ho986 = r.type === "unsold_98_6" ? (r as { hoType986?: string }).hoType986 : undefined;
          const causeReason = unsold98AcquisitionCauseReason(r.type, asset.acquisitionCause, {
            inheritedPresaleCompletedByHeir: asset.inheritedPresaleCompletedByHeir,
            hoType986: ho986,
          });
          if (causeReason && !causeReason.unconfirmed) return fail(`${causeReason.message} 감면 선택을 해제하세요.`);
        }
        if (r.type === "public_expropriation") {
          const cash = parseAmount(r.expropriationCash || "0");
          const bond = parseAmount(r.expropriationBond || "0");
          if (cash + bond <= 0) return fail(fieldError("reduction.public_expropriation.expropriationCash", "현금 또는 채권 보상액 중 최소 하나를 입력하세요."));
          // 고시일 fallback: reduction 미입력 시 Step1 단일 소스(expropriationNoticeDate) — UI↔validate 모순 방지
          const approvalDate = r.expropriationApprovalDate || asset.expropriationNoticeDate;
          if (!approvalDate) return fail(fieldError("reduction.public_expropriation.expropriationApprovalDate", "사업인정고시일을 선택하세요."));
          if (form.transferDate && approvalDate >= form.transferDate)
            return fail(fieldError("reduction.public_expropriation.expropriationApprovalDate", "사업인정고시일은 양도일보다 이전이어야 합니다."));
        }
        if (r.type === "gb_designated_land") {
          // ① 매수 경로 — §17(매수대상토지)과 §20(토지등)은 대상 범위가 달라 사용자 사실 입력이 필요하다.
          if (r.gbBranch === "in_zone") {
            if (!r.gbPurchaseRoute)
              return fail(fieldError("reduction.gb_designated_land.gbPurchaseRoute", "개발제한구역 매수 경로(매수청구 §17 / 협의매수 §20)를 선택하세요."));
            if (r.gbPurchaseRoute === "claim" && !isGbClaimRouteAllowedForAssetKind(asset.assetKind))
              return fail(fieldError("reduction.gb_designated_land.gbPurchaseRoute", "토지매수 청구(개발제한구역법 §17)는 「매수대상토지」에 대한 제도라 토지분만 감면 대상입니다. 협의매수(§20)를 선택했는지 확인하거나 토지 자산으로 입력하세요.",
              ));
          }
          if (!r.gbDesignationDate) return fail(fieldError("reduction.gb_designated_land.gbDesignationDate", "개발제한구역 지정일을 선택하세요."));
          if (!r.gbTriggerDate) return fail(fieldError("reduction.gb_designated_land.gbTriggerDate", r.gbBranch === "released" ? "사업인정고시일을 선택하세요." : "매수청구·협의매수일을 선택하세요."));
          if (r.gbBranch === "released" && !r.gbReleasedDate) return fail(fieldError("reduction.gb_designated_land.gbReleasedDate", "개발제한구역 해제일을 선택하세요."));
        }
        if (r.type === "replacement_land_comp") {
          if (parseAmount(r.rlLandComp || "0") <= 0)
            return fail(fieldError("reduction.replacement_land_comp.rlLandComp", "대토(토지) 보상액을 입력하세요 (대토보상분만 감면 대상)."));
        }
        if (r.type === "self_farming") {
          // 조특령 §66⑪·⑫ — 피상속인 경작기간을 합산하려면 「1년 이상 계속 경작」 또는
          // ⑫ 대체요건 중 하나가 성립해야 한다. 둘 다 미선언이면 엔진이 합산하지 않으므로
          // 여기서 먼저 막는다(⑧↔엔진 대칭 · D7-09).
          if (
            // 수유자는 합산 칸이 숨겨져 있다 — 숨긴 칸으로 막지 않는다(⑤·④와 같은 술어).
            selfFarmingDecedentAggregable(asset) &&
            !selfFarmingOwnYearsSufficient(r.farmingYears, r.disqualifiedTaxPeriodsSelf) &&
            parseInt(r.decedentFarmingYears ?? "0") > 0 &&
            r.heirContinuedFarming1Year !== true &&
            r.meetsDecedentAggregationAlt !== true
          ) {
            return fail(fieldError("reduction.self_farming.heirContinuedFarming1Year", "자경농지: 피상속인 경작기간을 합산하려면 「상속받은 농지를 1년 이상 계속 경작」(조특령 §66⑪) 또는 §66⑫ 대체요건 중 하나를 확인하세요.",
            ));
          }
          // 조특령 §66④1호 3년 배제의 **소재지 요건** — 편입 후 3년이 지난 경우에만 필요하다 (D7-07).
          // 3년 이내면 소재지와 무관하게 배제가 성립하지 않으므로 묻지 않는다(엔진 게이트와 동일 조건).
          if (
            r.useSelfFarmingIncorporation &&
            r.selfFarmingIncorporationDate &&
            form.transferDate &&
            new Date(form.transferDate) > addYears(new Date(r.selfFarmingIncorporationDate), 3) &&
            !r.selfFarmingIncorporationLocation
          ) {
            return fail(fieldError("reduction.self_farming.selfFarmingIncorporationLocation", "자경농지 편입: 양도일 현재 농지 소재지 구분(특별시·광역시(군 제외)·시 / 그 밖의 지역)을 선택하세요 (조특령 §66④1호).",
            ));
          }
          // 편입 부분감면(영 §66⑦) 기준시가 3점 필수 — 엔진 silent-0 정확 미러.
          // 발동 조건: 편입 ON + 편입일≥2002-01-01 + 양도일≤편입일+3년(유예 내). 그 외는 엔진이
          // 전액감면/graceExpired로 별도 처리하므로 차단 금지(UI↔validate 모순 방지).
          if (r.useSelfFarmingIncorporation && r.selfFarmingIncorporationDate && form.transferDate) {
            const incorpDate = new Date(r.selfFarmingIncorporationDate);
            const transferDate = new Date(form.transferDate);
            if (incorpDate >= new Date("2002-01-01") && transferDate <= addYears(incorpDate, 3)) {
              // 3점: 취득·양도시는 reduction 전용 입력 OR 자산-수준 fallback. 양도시는 ④가 엔진에 싣는 값과 같은 leaf다(`engineStdPriceAtTransfer`).
              const hasAcq =
                parseAmount(r.selfFarmingStandardPriceAtAcquisition || "") > 0 ||
                parseAmount(asset.standardPriceAtAcq || "") > 0;
              const hasIncorp = parseAmount(r.selfFarmingStandardPriceAtIncorporation || "") > 0;
              const hasTransfer =
                parseAmount(r.selfFarmingStandardPriceAtTransfer || "") > 0 ||
                engineStdPriceAtTransfer(form, ai) > 0;
              if (!hasAcq || !hasIncorp || !hasTransfer)
                return fail(fieldError(!hasAcq ? "reduction.self_farming.selfFarmingStandardPriceAtAcquisition" : !hasIncorp ? "reduction.self_farming.selfFarmingStandardPriceAtIncorporation" : "reduction.self_farming.selfFarmingStandardPriceAtTransfer", "편입일 부분감면(조특령 §66⑦): 취득·편입·양도 시점 기준시가를 모두 입력하세요.",
                ));
            }
          }
        }
        // Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본 요건 검증
        if (r.type === "new_99_3") {
          // 취득 유형별 필수 일자 검증
          // Round 9 (2026-05-06): 1호 매매계약일은 자산-수준 assetContractDate fallback
          // 메모리 feedback_validation_sync_8th_point.md ⑧ 정책 (UI/API fallback ↔ validate 동기화)
          // §4.3(2026-09-30): ⑫(`transfer-tax-schema-reduction-refines.ts`)·라우터(`income-deduction-router.ts`
          // 기본값 from_builder)와 같은 술어 — 2호(self_built)가 아니면 1호다. 화면(`New993InputForm`)도 미선택을
          // 「1호」로 표시하고, 1호 매매계약일은 자산-수준 칸이라 항상 열려 있다(막다른 길 아님).
          // 재개발 완공 아파트 조합원 갈래(NH-36 · NH-16) — 준공일·잔여주택 계약 사실로 판정한다. 엔진·④·⑫와 같은 술어.
          const member993 = redevMemberNewHouseScope(asset);
          if (member993) {
            const memberIssue = redevMemberNewHouseIssue(asset, r);
            if (memberIssue) return fail(memberIssue);
          } else if (r.acquisitionType993 === "self_built") {
            if (!r.usageApprovalDate993) return fail(fieldError("reduction.new_99_3.usageApprovalDate993", "§99의3 2호 적용: 사용승인일을 선택하세요."));
            // 법률 제6762호 부칙 §29② — 사용승인 2003.1.1.~6.30.이면 2003.1.1. 전 착공 여부 필수 (⑫ refine과 같은 술어 — 자동 fallback 금지).
            if (isAddenda29_2WindowIso(r.acquisitionType993, r.usageApprovalDate993) && !r.constructionStartedBefore2003_993)
              return fail(fieldError("reduction.new_99_3.constructionStartedBefore2003_993", `§99의3 2호 적용: 사용승인일이 2003.1.1.~2003.6.30.이면 2003.1.1. 전에 공사에 착수했는지(예·아니오·모름) 선택하세요 (${NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED}).`));
          } else {
            const hasContractDate = !!(r.contractDate993 || asset.assetContractDate);
            if (!hasContractDate) return fail(fieldError("assetContractDate", "§99의3 1호 적용: 매매계약일을 펼침 영역 상단에 입력하세요."));
          }
          // 취득시 기준시가 필수 — PHD 환산 ON이면 환산 입력 충분성으로 검증(API source ternary와 동일 소스).
          // 상단 수동 필드는 PHD ON 시 숨겨지므로 빈 값 — canCalcReductionPhd로 대체 검증(UI/API/validate 3중 미러).
          if (r.phdMode993) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice993 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm993 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq993 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst993 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq993 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst993 || "0"),
            };
            if (!canCalcReductionPhd(phdInput)) {
              return fail(fieldError(phdField(r.type, phdInput), "§99의3 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            }
          } else if (parseAmount(r.standardPriceAtAcquisition993 || "0") <= 0) {
            return fail(fieldError("reduction.new_99_3.standardPriceAtAcquisition", "§99의3 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)"));
          }
          // 전용면적 필수 — 2002.12.31 이전 취득 고가주택(165/149㎡ AND 6억) 판정. §99/§98의8/§99의2와 동일 패턴.
          // 단독주택(NH-02)은 전용면적이 아니라 연면적·딸린 토지로 판정한다 — 아래 단독주택 칸이 묻는다.
          if (r.houseType993 !== "detached" && !(parseDecimal(r.exclusiveAreaSqm993 || "") > 0))
            return fail(fieldError("reduction.new_99_3.exclusiveAreaSqm993", "§99의3 적용: 전용면적(㎡)을 입력하세요 (고가주택 판정)."));
          // NH-02 — 종전 규정 적용분(2003.1.1. 전 계약·승인 등)은 당시 소득세법 시행령 §156 고급주택 기준(공동·단독·시설)이라 주택 유형을 묻는다.
          //   UI(`New993InputForm`)·⑫와 같은 술어(`isNew993PriorRuleEraIso`).
          if (
            member993
              ? isNew993PriorRuleEraIso("self_built", undefined, member993.completionDate, member993.completionDate, r.constructionStartedBefore2003_993)
              : isNew993PriorRuleEraIso(r.acquisitionType993, r.contractDate993 || asset.assetContractDate, r.usageApprovalDate993, primaryAcquisitionDateOf(asset), r.constructionStartedBefore2003_993)
          ) {
            const luxuryIssue = luxuryFactsIssue("new_99_3", "993", "§99의3", r.houseType993, r.grossFloorAreaSqm993, r.attachedLandAreaSqm993, r.stdPriceFloorMet993, r.luxuryFacility993);
            if (luxuryIssue) return fail(luxuryIssue);
          }
          // NH-17 — 1호 매매 취득은 «최초로 매매계약을 체결하고 계약금을 납부한 자»인지 묻는다(분양권 승계는 불성립). 상속·증여는 엔진이 불성립으로 판정한다.
          if (!member993 && needsFirstContractAnswer(r.acquisitionType993, asset.acquisitionCause) && !r.firstContract993)
            return fail(fieldError("reduction.new_99_3.firstContract993", "§99의3 1호 적용: 주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 사람이 본인인지(예·아니오·모름) 선택하세요 (조세특례제한법 §99의3①1호)."));
          // 5년 시점 기준시가 필수 (5년 후 양도인 경우 안분 산식에 사용)
          if (parseAmount(r.standardPriceAt5Years || "0") <= 0) {
            return fail(fieldError("reduction.new_99_3.standardPriceAt5Years", "§99의3 적용: 5년 시점 기준시가를 입력하세요. (취득일+5년 인접 고시일 가격)"));
          }
          // 양도시 기준시가 — 5년 **후** 양도만 필수 (조특령 §99의3②2호 안분의 분모).
          //
          // 🔴 자산-수준 fallback을 믿을 수 없다: ④ 변환(`transfer-tax-api.ts:416-425`)이
          //    자산의 `standardPriceAtTransfer`를 **환산취득가액 모드에서만** 전송한다.
          //    실지거래가·감정·매매사례 모드에서는 undefined가 되어 분모가 음수로 떨어지고,
          //    엔진이 `pos_neg`(부동산-525 해석)로 오분류해 **양도소득금액 전액 감면**이 됐다.
          //    엔진 가드(`new-99-3.ts` MISSING_STD_PRICE)와 **같은 조건**으로 앞단에서 막는다.
          //    (5년 이내 양도는 기준시가를 보지 않으므로 차단하지 않는다 — UI↔validate 모순 방지)
          //    자산-수준 fallback은 엔진이 `?? ctx.standardPriceAtTransfer`로 폴백하므로(income-deduction-router.ts:249-250)
          //    인정한다 — 다만 **④가 엔진에 싣는 값**만이다(`engineStdPriceAtTransfer` — ④와 같은 leaf). 종전에는 자산의 일반 칸
          //    값을 그대로 인정해, 실가 모드처럼 ④가 싣지 않는 경우 여기서는 통과하고 엔진이 `MISSING_STD_PRICE`로 감면을 뺐다
          //    (2026-08-31 의도 설계를 2026-10-21 사용자 결정 Q-1 a로 바꿨다 — 계획서 `burdened-gift-bundle-hidden-stdprice.plan.md`).
          // 재개발·재건축 변형 ON 시 종전주택 기준시가 필수 (§99 선례 — 자동 안분 fallback 금지)
          // 조합원 갈래는 재개발 변형을 출자 자산 사실에서 정한다 — 주택 출자 원조합원만(NH-32 · 엔진 `redevMemberNewHouseOf`)
          const variant993 = member993 ? member993.houseContributed : !!r.isRedevelopedNewHouse993;
          if (variant993 && parseAmount(r.previousHouseStdPrice993 || "0") <= 0)
            return fail(fieldError("reduction.new_99_3.previousHouseStdPrice993", "§99의3 적용: 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 입력하세요 (조특령 §99의3② 1호 단서·2호 괄호).",
            ));
          // 승계조합원 입주권 환산의 §165① 합계(#2351 Q-2 a)·원조합원 §166 숨은 칸(#2346)도 그 leaf 안에 있다.
          const assetStdAtTransfer993 = engineStdPriceAtTransfer(form, ai);
          const hasStdPriceAtTransfer993 =
            parseAmount(r.standardPriceAtTransfer993 || "0") > 0 || assetStdAtTransfer993 > 0;
          /**
           * 🔴 **재개발 변형이면 5년 이내에도 필수다** (2026-09-07 UI 리뷰).
           *
           * 엔진은 `if (isWithin5Years && !variant)`에서만 전액 차감 경로로 빠지고
           * (`new-99-3.ts:504`), 그 밖에서는 `standardPriceAtTransfer <= 0`이면
           * `MISSING_STD_PRICE`로 **감면 0**을 반환한다(:531~537). 종전 ⑧은 `!isWithin5Years`만
           * 봐서, 재개발 토글을 켠 5년 이내 양도는 **경고 없이 감면이 통째로 사라졌다**.
           */
          // 5년 기산 — 조합원 갈래는 준공일(서면인터넷방문상담4팀-2145 · NH-63), 아니면 취득일
          const newHouseAcq993 = member993 ? member993.completionDate : primaryAcquisitionDateOf(asset);
          const needsStdPriceAtTransfer =
            variant993 ||
            (!!newHouseAcq993 &&
              !!form.transferDate &&
              !isWithin5YearsCheck(new Date(newHouseAcq993), new Date(form.transferDate)));
          if (needsStdPriceAtTransfer && !hasStdPriceAtTransfer993) {
            return fail(fieldError("reduction.new_99_3.standardPriceAtTransfer993", variant993
                ? "§99의3 적용: 재개발·재건축 신축주택 변형은 5년 이내 양도에도 양도시 기준시가가 필요합니다 (조특령 §99의3②1호 단서 안분)."
                : "§99의3 적용: 취득 후 5년 경과 양도는 양도시 기준시가를 입력하세요 (5년 발생분 안분의 분모 — 환산취득가액·기준시가 안분 모드가 아니거나 재개발·재건축 원조합원 자산이면 자산값이 전달되지 않습니다).",
            ));
          }
        }
        // 장기임대 §97 시리즈 — `transfer-tax-validate-rental-97.ts`
        const rental97Issue = rental97SeriesIssue({ fail, r, asset, assetIndex: ai, form, redevHiddenStd });
        if (rental97Issue) return rental97Issue;
        // P1 §99 신축주택 IMF 1차 (2026-06-11): 유형별 기준일·기준시가·면적 필수 (⑧).
        // 배제 토글은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "new_99") {
          // 재개발 완공 아파트 조합원 갈래(NH-36 · NH-27) — 준공일·잔여주택 계약 사실로 판정한다. 엔진·④·⑫와 같은 술어.
          const member99 = redevMemberNewHouseScope(asset);
          if (member99) {
            const memberIssue = redevMemberNewHouseIssue(asset, r);
            if (memberIssue) return fail(memberIssue);
          }
          if (!member99 && r.acquisitionType99 === "self_built" && !r.usageApprovalDate99)
            return fail(fieldError("reduction.new_99.usageApprovalDate99", "§99 적용: 자기건설 주택의 사용승인일을 입력하세요."));
          // 조특법 §99①2호 — 「최초로 매매계약을 체결하고 계약금을 납부한 자」. 비우면 엔진이 취득일로
          // 대신 읽어 기간 판정이 바뀌었다. §99의3(위)과 같은 자산-수준 fallback 규약.
          if (!member99 && r.acquisitionType99 !== "self_built" && !(r.contractDate99 || asset.assetContractDate))
            return fail(fieldError("reduction.new_99.contractDate99", "§99 적용: 매매계약일을 입력하세요 (자산 매매계약일도 비어 있습니다)."));
          // 취득시 기준시가 필수 — PHD 환산 ON이면 환산 입력 충분성으로 검증(API source ternary·UI echo와 동일 소스, ⑧ 3중 미러).
          if (r.phdMode99) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice99 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm99 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq99 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst99 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq99 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst99 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§99 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
          } else if (parseAmount(r.standardPriceAtAcquisition99 || "0") <= 0) {
            return fail(fieldError(`reduction.${r.type}.standardPriceAtAcquisition`, "§99 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)"));
          }
          if (r.houseType99 !== "detached" && !(parseDecimal(r.exclusiveAreaSqm99 || "") > 0))
            return fail(fieldError(`reduction.${r.type}.exclusiveAreaSqm`, "§99 적용: 전용면적(㎡)을 입력하세요 (고가주택 판정)."));
          // NH-02 — 기준일(1998~1999)이 모두 종전 «고급주택» 시기라 주택 유형(공동·단독)과 단독주택 사실을 묻는다.
          const luxuryIssue99 = luxuryFactsIssue("new_99", "99", "§99", r.houseType99, r.grossFloorAreaSqm99, r.attachedLandAreaSqm99, r.stdPriceFloorMet99, r.luxuryFacility99);
          if (luxuryIssue99) return fail(luxuryIssue99);
          // NH-03 — 2호 매매 취득은 «최초로 매매계약을 체결하고 계약금을 납부한 자»인지 묻는다.
          if (!member99 && needsFirstContractAnswer(r.acquisitionType99, asset.acquisitionCause) && !r.firstContract99)
            return fail(fieldError("reduction.new_99.firstContract99", "§99 2호 적용: 주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 사람이 본인인지(예·아니오·모름) 선택하세요 (조세특례제한법 §99①2호)."));
          // 재개발·재건축 변형 ON 시 종전주택 기준시가 필수 (B-11 — 자동 안분 fallback 금지)
          const variant99 = member99 ? member99.houseContributed : !!r.isRedevelopedNewHouse99;
          if (variant99 && parseAmount(r.previousHouseStdPrice99 || "0") <= 0)
            return fail(fieldError("reduction.new_99.previousHouseStdPrice99", "§99 적용: 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 입력하세요."));
          /**
           * 안분 기준시가 — 엔진(`new-99.ts` MISSING_STD_PRICE)과 **같은 조건**으로 앞단에서 막는다 (리뷰 NH-25).
           * 종전에는 ⑧이 묻지 않아 계산은 통과하고 엔진이 감면을 0으로 냈다(실측 155,166,000 vs 95,595,000).
           *   - 5년시점: 5년 **후** 양도만(조특령 §99①2호 분자). 라우터에 자산값 fallback이 없다.
           *   - 양도시: 5년 후 양도 또는 재개발 변형(①1호 단서 분자·분모). 라우터가 자산값으로 대신하므로 ④가 싣는 값만 인정(§99의3과 같은 leaf).
           * 일자 미입력이면 5년 판정을 하지 않는다(변형만 본다) — 일자는 step0 영역.
           */
          const newHouseAcq99 = member99 ? member99.completionDate : primaryAcquisitionDateOf(asset);
          const hasDates99 = !!newHouseAcq99 && !!form.transferDate;
          const over5Y99 =
            hasDates99 && !isWithin5YearsCheck(new Date(newHouseAcq99), new Date(form.transferDate));
          if (over5Y99 && parseAmount(r.standardPriceAt5Years99 || "0") <= 0)
            return fail(fieldError(`reduction.${r.type}.standardPriceAt5Years`, "§99 적용: 취득 후 5년 경과 양도는 취득일부터 5년이 되는 날의 기준시가를 입력하세요 (조특령 §99①2호 — 미입력 시 감면이 적용되지 않습니다)."));
          if (
            (over5Y99 || variant99) &&
            !(parseAmount(r.standardPriceAtTransfer99 || "0") > 0 || engineStdPriceAtTransfer(form, ai) > 0)
          )
            return fail(fieldError(`reduction.${r.type}.standardPriceAtTransfer`, variant99
              ? "§99 적용: 재개발·재건축 신축주택은 5년 이내 양도에도 양도시 기준시가가 필요합니다 (조특령 §99①1호 단서)."
              : "§99 적용: 취득 후 5년 경과 양도는 양도시 기준시가를 입력하세요 (조특령 §99①2호 안분의 분모 — 환산취득가액·기준시가 안분 모드가 아니면 자산값이 전달되지 않습니다)."));
        }
        // P1 §98의8 준공후미분양 50% (2026-06-11): 계약일·취득가·면적·임대개시일 필수 (⑧).
        // 자격 토글 3종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_8") {
          // ⑧ 자산-수준 `assetContractDate` fallback — §99의3(:188)과 **같은 규약**이다 (Q15).
          //    엔진도 같은 fallback을 읽으므로(income-deduction-router `evalUnsold988`) 3중이 맞는다.
          //    종전에는 여기만 조문 전용 필드를 요구해 **같은 날짜를 두 번** 입력해야 했다.
          if (!(r.contractDate988 || asset.assetContractDate))
            return fail(fieldError("assetContractDate", "§98의8 적용: 최초 매매계약일을 펼침 영역 상단에 입력하세요."));
          if (parseAmount(r.acquisitionPrice988 || "0") <= 0)
            return fail(fieldError("reduction.unsold_98_8.acquisitionPrice988", "§98의8 적용: 취득가액을 입력하세요."));
          if (!(parseDecimal(r.exclusiveAreaSqm988 || "") > 0))
            return fail(fieldError("reduction.unsold_98_8.exclusiveAreaSqm988", "§98의8 적용: 연면적(공동주택은 전용면적, ㎡)을 입력하세요."));
          if (!r.rentalContractDate988)
            return fail(fieldError("reduction.unsold_98_8.rentalContractDate988", "§98의8 적용: 임대계약 체결일을 입력하세요 (2015.12.31 이전 체결에 한정 — 법 §98의8① 괄호)."));
          if (!r.rentalStartDate988)
            return fail(fieldError("reduction.unsold_98_8.rentalStartDate988", "§98의8 적용: 임대개시일을 입력하세요 (사업자등록과 임대사업자등록 후 임대를 개시한 날)."));
          // 5년 후 양도 안분 기준시가 — ⑤ 제목이 「필수」인데 ⑧이 묻지 않아 엔진이 `MISSING_STD_PRICE`로 차감을 0으로 냈다(하이브리드와 같은 헬퍼 · 리뷰 Q-3 (A)).
          //   PHD 환산 ON이면 취득시 기준시가는 환산 입력 충분성으로 검증한다(④ `transfer-tax-api-reductions.ts`와 같은 leaf · §98의7과 같은 규칙).
          let phdOk988 = false;
          if (r.phdMode988) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice988 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm988 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq988 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst988 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq988 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst988 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§98의8 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk988 = true;
          }
          const i988 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition988, r.standardPriceAt5Years988, "§98의8", phdOk988, r.type, r.standardPriceAtTransfer988, engineStdPriceAtTransfer(form, ai));
          if (i988) return i988;
        }
        // P3 §98의3 (2026-06-12): 분기별 일자 + 과밀 면적 필수 (⑧). 토글은 낙관 — 엔진 사유.
        if (r.type === "unsold_98_3") {
          if (r.houseType983 === "self_built") {
            if (!r.constructionStartDate983 || !r.usageApprovalDate983)
              return fail(fieldError(!r.constructionStartDate983 ? "reduction.unsold_98_3.constructionStartDate983" : "reduction.unsold_98_3.usageApprovalDate983", "§98의3 적용: 자기건설 주택의 착공일과 사용승인일을 입력하세요 (2009.2.12~2010.2.11)."));
          } else if (!r.contractDate983) {
            return fail(fieldError("reduction.unsold_98_3.contractDate983", "§98의3 적용: 최초 매매계약일을 입력하세요 (거주자 2009.2.12~ / 비거주자 2009.3.16~2010.2.11)."));
          }
          // 면적 한정(령 §98의3① 단서)은 각 호 주택 = 사업주체 취득분에만 적용된다 (D5-03).
          if (r.isOverconcentration983 && r.houseType983 !== "self_built") {
            if (!(parseDecimal(r.landAreaSqm983 || "") > 0))
              return fail(fieldError("reduction.unsold_98_3.landAreaSqm983", "§98의3 적용: 수도권과밀억제권역 주택은 대지면적(㎡)을 입력하세요 (660㎡ 이내 한정)."));
            if (!(parseDecimal(r.floorAreaSqm983 || "") > 0))
              return fail(fieldError("reduction.unsold_98_3.floorAreaSqm983", "§98의3 적용: 수도권과밀억제권역 주택은 연면적(전용면적, ㎡)을 입력하세요 (149㎡ 이내 한정)."));
          }
          // 취득시 기준시가 — PHD 환산 ON이면 환산 입력 충분성으로 검증(API·UI echo와 동일 소스, ⑧ 3중 미러).
          let phdOk983 = false;
          if (r.phdMode983) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice983 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm983 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq983 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst983 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq983 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst983 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§98의3 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk983 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1). PHD ON이면 취득시 검증 skip.
          const i983 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition983, r.standardPriceAt5Years983, "§98의3", phdOk983, r.type, r.standardPriceAtTransfer983, engineStdPriceAtTransfer(form, ai));
          if (i983) return i983;
        }
        // P3 §98의5 (2026-06-12): 계약일·인하율 필수 (⑧).
        if (r.type === "unsold_98_5") {
          if (!r.contractDate985)
            return fail(fieldError("reduction.unsold_98_5.contractDate985", "§98의5 적용: 최초 매매계약일을 입력하세요 (~2011.4.30)."));
          // D5-02 — **0%도 유효한 값**이다. 조특법 §98의5①1호는 「인하율이 100분의 10 **이하**」로
          //          하한 문언이 없다. 종전의 `> 0`은 정가 매입 사안을 부당 차단했다.
          //          ⑧과 엔진이 같은 게이트를 복제하고 있으므로 **함께** 고쳐야 no-op가 아니다.
          if ((r.priceReductionRatePct985 ?? "").trim() === "")
            return fail(fieldError("reduction.unsold_98_5.priceReductionRatePct985", "§98의5 적용: 분양가격 인하율(%)을 입력하세요 — (최초 공시 분양가 − 매매가) ÷ 최초 분양가 × 100. 인하가 없으면 0을 입력하세요.",
            ));
          if (parseDecimal(r.priceReductionRatePct985 || "") < 0)
            return fail(fieldError("reduction.unsold_98_5.priceReductionRatePct985", "§98의5 적용: 분양가격 인하율은 음수일 수 없습니다."));
          // 취득시 기준시가 — PHD 환산 ON이면 환산 입력 충분성으로 검증(⑧ 3중 미러).
          let phdOk985 = false;
          if (r.phdMode985) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice985 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm985 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq985 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst985 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq985 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst985 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§98의5 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk985 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1). PHD ON이면 취득시 검증 skip.
          const i985 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition985, r.standardPriceAt5Years985, "§98의5", phdOk985, r.type, r.standardPriceAtTransfer985, engineStdPriceAtTransfer(form, ai));
          if (i985) return i985;
        }
        // P3 §98의6 (2026-06-12): 계약일·기준시가 합계·면적 + 2호 임대 일자 필수 (⑧).
        if (r.type === "unsold_98_6") {
          if (parseAmount(r.stdPriceSumAtBase986 || "0") <= 0)
            return fail(fieldError("reduction.unsold_98_6.stdPriceSumAtBase986", "§98의6 적용: 주택과 부수토지의 기준시가 합계를 입력하세요 (6억 한도)."));
          if (!(parseDecimal(r.floorAreaSqm986 || "") > 0))
            return fail(fieldError("reduction.unsold_98_6.floorAreaSqm986", "§98의6 적용: 연면적(공동주택은 전용면적, ㎡)을 입력하세요 (149㎡ 한도)."));
          if (r.hoType986 === "buyer_rented") {
            if (!r.rentalContractDate986)
              return fail(fieldError("reduction.unsold_98_6.rentalContractDate986", "§98의6 2호 적용: 임대계약 체결일을 입력하세요 (2011.12.31 이전 한정)."));
            if (!r.rentalStartDate986)
              return fail(fieldError("reduction.unsold_98_6.rentalStartDate986", "§98의6 2호 적용: 임대개시일을 입력하세요 (사업자등록과 임대사업자등록 후 임대를 개시한 날)."));
          }
          // 취득시 기준시가 — PHD 환산 ON이면 환산 입력 충분성으로 검증(⑧ 3중 미러).
          let phdOk986 = false;
          if (r.phdMode986) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice986 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm986 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq986 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst986 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq986 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst986 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§98의6 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk986 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (안분용 — stdPriceSumAtBase986과 별개 — F-1). PHD ON이면 취득시 검증 skip.
          const i986 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition986, r.standardPriceAt5Years986, "§98의6", phdOk986, r.type, r.standardPriceAtTransfer986, engineStdPriceAtTransfer(form, ai));
          if (i986) return i986;
        }
        // P2 §98의7 9억↓ 미분양 (2026-06-11): 계약일·취득가 필수 (⑧).
        // 자격 토글 4종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_7") {
          if (!r.contractDate987)
            return fail(fieldError("reduction.unsold_98_7.contractDate987", "§98의7 적용: 최초 매매계약일을 입력하세요 (2012.9.24~2012.12.31)."));
          if (parseAmount(r.acquisitionPrice987 || "0") <= 0)
            return fail(fieldError("reduction.unsold_98_7.acquisitionPrice987", "§98의7 적용: 취득가액을 입력하세요 (9억원 이하 — 취득세·부대비용 제외)."));
          // 취득시 기준시가 — PHD 환산 ON이면 환산 입력 충분성으로 검증(⑧ 3중 미러).
          let phdOk987 = false;
          if (r.phdMode987) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice987 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm987 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq987 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst987 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq987 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst987 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§98의7 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk987 = true;
          }
          // 취득 후 5년 경과 양도 시 안분용 기준시가 필수 (M-4 → F-1 헬퍼 단일화). PHD ON이면 취득시 검증 skip.
          const i987 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition987, r.standardPriceAt5Years987, "§98의7", phdOk987, r.type, r.standardPriceAtTransfer987, engineStdPriceAtTransfer(form, ai));
          if (i987) return i987;
        }
        // P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): 유형별 일자 + 취득가·면적 필수 (⑧).
        // 자격 토글은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_99_2") {
          if (r.houseType992 === "self_built") {
            if (!r.usageApprovalDate992)
              return fail(fieldError("reduction.unsold_99_2.usageApprovalDate992", "§99의2 적용: 자기건설 주택의 사용승인·사용검사일을 입력하세요 (2013.4.1~2013.12.31)."));
          } else if (!r.contractDate992) {
            return fail(fieldError("reduction.unsold_99_2.contractDate992", "§99의2 적용: 최초 매매계약일을 입력하세요 (2013.4.1~2013.12.31)."));
          }
          if (parseAmount(r.acquisitionPrice992 || "0") <= 0)
            return fail(fieldError("reduction.unsold_99_2.acquisitionPrice992", "§99의2 적용: 실거래 취득가액을 입력하세요 (6억 이하 OR 85㎡ 이하 판정에 필요)."));
          if (!(parseDecimal(r.exclusiveAreaSqm992 || "") > 0))
            return fail(fieldError("reduction.unsold_99_2.exclusiveAreaSqm992", "§99의2 적용: 연면적(공동주택·오피스텔은 전용면적, ㎡)을 입력하세요."));
          // 취득시 기준시가 — PHD 환산 ON이면 환산 입력 충분성으로 검증(API source ternary·UI echo와 동일 소스, ⑧ 3중 미러).
          let phdOk992 = false;
          if (r.phdMode992) {
            const phdInput = {
              firstDisclosurePrice: parseAmount(r.phdFirstDisclosurePrice992 || "0"),
              landAreaSqm: parseDecimal(r.phdLandAreaSqm992 || "0"),
              landPricePerSqmAtAcquisition: parseAmount(r.phdLandPricePerSqmAtAcq992 || "0"),
              landPricePerSqmAtFirstDisclosure: parseAmount(r.phdLandPricePerSqmAtFirst992 || "0"),
              buildingStdPriceAtAcquisition: parseAmount(r.phdBuildingStdAtAcq992 || "0"),
              buildingStdPriceAtFirstDisclosure: parseAmount(r.phdBuildingStdAtFirst992 || "0"),
            };
            if (!canCalcReductionPhd(phdInput))
              return fail(fieldError(phdField(r.type, phdInput), "§99의2 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요."));
            phdOk992 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (5년 분기는 houseType 무관 공통 — F-1). PHD ON이면 취득시 검증 skip.
          const i992 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition992, r.standardPriceAt5Years992, "§99의2", phdOk992, r.type, r.standardPriceAtTransfer992, engineStdPriceAtTransfer(form, ai));
          if (i992) return i992;
        }
      }
    }
  }

  return null;
}

/**
 * §99·§99의3 종전 고급주택 판정 사실(⑧ — NH-02). 주택 유형 필수, 단독주택이면 연면적·딸린 토지·하한·시설 필수.
 * ⑫ `detachedFactsIssues`의 거울이다(⑫는 유형 자체가 없는 직접 API를 종전 공동주택 기준으로 계산한다 — 화면은 유형을 반드시 받는다).
 */
function luxuryFactsIssue(
  type: "new_99" | "new_99_3",
  suffix: "99" | "993",
  label: string,
  houseType: string | undefined,
  grossFloorArea: string | undefined,
  attachedLandArea: string | undefined,
  stdPriceFloorMet: string | undefined,
  luxuryFacility: string | undefined,
): string | undefined {
  if (!houseType)
    return fieldError(`reduction.${type}.houseType${suffix}`, `${label} 적용: 고급주택 판정을 위해 주택 유형(공동주택·단독주택)을 선택하세요 (기준일 당시 소득세법 시행령 §156).`);
  if (houseType !== "detached") return undefined;
  if (!(parseDecimal(grossFloorArea || "") > 0))
    return fieldError(`reduction.${type}.grossFloorAreaSqm${suffix}`, `${label} 적용: 단독주택 연면적(㎡)을 입력하세요 (고급주택 판정).`);
  if (!(parseDecimal(attachedLandArea || "") > 0))
    return fieldError(`reduction.${type}.attachedLandAreaSqm${suffix}`, `${label} 적용: 단독주택에 딸린 토지 면적(㎡)을 입력하세요 (고급주택 판정).`);
  if (!stdPriceFloorMet)
    return fieldError(`reduction.${type}.stdPriceFloorMet${suffix}`, `${label} 적용: 단독주택 시가표준액·기준시가 하한을 넘는지(예·아니오·모름) 선택하세요 (고급주택 판정).`);
  if (!luxuryFacility)
    return fieldError(`reduction.${type}.luxuryFacility${suffix}`, `${label} 적용: 엘리베이터·에스컬레이터·67㎡ 이상 수영장 설치 여부(예·아니오·모름)를 선택하세요 (고급주택 판정).`);
  return undefined;
}
