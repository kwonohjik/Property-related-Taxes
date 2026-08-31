/**
 * STEP 2 (감면·공제) 검증 — §99의3 + 장기임대 §97 시리즈
 *
 * transfer-tax-validate.ts 800줄 정책 분리 (2026-06-11).
 * 반환: 실패 시 ValidationIssue, 통과 시 null.
 */

import { addYears } from "date-fns";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { isWithin5YearsCheck } from "@/lib/tax-engine/transfer-reductions/new-99-3";
import {
  isIncomeDeductionTrack,
  isTaxAmountTrack,
} from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { isReductionAllowedForAssetKind, REDUCTION_METADATA, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import { isGbClaimRouteAllowedForAssetKind } from "@/lib/tax-engine/transfer-reductions";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";

/**
 * 하이브리드 4조문(§99의2·§98의3·§98의5·§98의6·§98의7) 공용 — 취득 후 5년 경과 양도 시 5년 발생분
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
  /** PHD 환산 ON — 취득시 기준시가는 §164⑤ 환산으로 충족되므로 취득시 검증 skip(5년 시점만 검증) */
  phdSatisfiesAcq?: boolean,
): ValidationIssue | null {
  if (!asset.acquisitionDate || !form.transferDate) return null;
  if (isWithin5YearsCheck(new Date(asset.acquisitionDate), new Date(form.transferDate))) return null;
  if (!phdSatisfiesAcq && parseAmount(stdAcq || "0") <= 0)
    return fail(`${articleLabel} 적용: 취득 후 5년 경과 양도는 취득시 기준시가를 입력하세요 (5년 발생분 안분 — 미입력 시 감면이 적용되지 않습니다).`);
  if (parseAmount(std5Y || "0") <= 0)
    return fail(`${articleLabel} 적용: 취득 후 5년 경과 양도는 취득 5년 시점 기준시가를 입력하세요.`);
  return null;
}

export function validateStep2Reductions(step: number, form: TransferFormData): ValidationIssue | null {
  // step 2: 감면·공제 (구 step 4)
  if (step === 2) {
    const assets = form.assets ?? [];
    for (let ai = 0; ai < assets.length; ai++) {
      const asset = assets[ai];
      const fail = (message: string): ValidationIssue => ({ step, assetIndex: ai, message });

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
      if (asset.acquisitionDate && form.transferDate) {
        const within5 = isWithin5YearsCheck(
          new Date(asset.acquisitionDate),
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
          return fail(`${gateLabel} 감면은 주택 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.`);
        }
        if (r.type === "public_expropriation") {
          const cash = parseAmount(r.expropriationCash || "0");
          const bond = parseAmount(r.expropriationBond || "0");
          if (cash + bond <= 0) return fail("현금 또는 채권 보상액 중 최소 하나를 입력하세요.");
          // 고시일 fallback: reduction 미입력 시 Step1 단일 소스(expropriationNoticeDate) — UI↔validate 모순 방지
          const approvalDate = r.expropriationApprovalDate || asset.expropriationNoticeDate;
          if (!approvalDate) return fail("사업인정고시일을 선택하세요.");
          if (form.transferDate && approvalDate >= form.transferDate)
            return fail("사업인정고시일은 양도일보다 이전이어야 합니다.");
        }
        if (r.type === "gb_designated_land") {
          // ① 매수 경로 — §17(매수대상토지)과 §20(토지등)은 대상 범위가 달라 사용자 사실 입력이 필요하다.
          if (r.gbBranch === "in_zone") {
            if (!r.gbPurchaseRoute)
              return fail("개발제한구역 매수 경로(매수청구 §17 / 협의매수 §20)를 선택하세요.");
            if (r.gbPurchaseRoute === "claim" && !isGbClaimRouteAllowedForAssetKind(asset.assetKind))
              return fail(
                "토지매수 청구(개발제한구역법 §17)는 「매수대상토지」에 대한 제도라 토지분만 감면 대상입니다. 협의매수(§20)를 선택했는지 확인하거나 토지 자산으로 입력하세요.",
              );
          }
          if (!r.gbDesignationDate) return fail("개발제한구역 지정일을 선택하세요.");
          if (!r.gbTriggerDate) return fail(r.gbBranch === "released" ? "사업인정고시일을 선택하세요." : "매수청구·협의매수일을 선택하세요.");
          if (r.gbBranch === "released" && !r.gbReleasedDate) return fail("개발제한구역 해제일을 선택하세요.");
        }
        if (r.type === "replacement_land_comp") {
          if (parseAmount(r.rlLandComp || "0") <= 0)
            return fail("대토(토지) 보상액을 입력하세요 (대토보상분만 감면 대상).");
        }
        if (r.type === "self_farming") {
          // 편입 부분감면(조특령 §66⑤⑥) 기준시가 3점 필수 — 엔진 silent-0 정확 미러.
          // 발동 조건: 편입 ON + 편입일≥2002-01-01 + 양도일≤편입일+3년(유예 내). 그 외는 엔진이
          // 전액감면/graceExpired로 별도 처리하므로 차단 금지(UI↔validate 모순 방지).
          if (r.useSelfFarmingIncorporation && r.selfFarmingIncorporationDate && form.transferDate) {
            const incorpDate = new Date(r.selfFarmingIncorporationDate);
            const transferDate = new Date(form.transferDate);
            if (incorpDate >= new Date("2002-01-01") && transferDate <= addYears(incorpDate, 3)) {
              // 3점: 취득·양도시는 reduction 전용 입력 OR 자산-수준(환산 모드) fallback — API·엔진 동일 소스
              const hasAcq =
                parseAmount(r.selfFarmingStandardPriceAtAcquisition || "") > 0 ||
                parseAmount(asset.standardPriceAtAcq || "") > 0;
              const hasIncorp = parseAmount(r.selfFarmingStandardPriceAtIncorporation || "") > 0;
              const hasTransfer =
                parseAmount(r.selfFarmingStandardPriceAtTransfer || "") > 0 ||
                parseAmount(asset.standardPriceAtTransfer || "") > 0;
              if (!hasAcq || !hasIncorp || !hasTransfer)
                return fail(
                  "편입일 부분감면(조특령 §66⑤⑥): 취득·편입·양도 시점 기준시가를 모두 입력하세요.",
                );
            }
          }
        }
        // Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본 요건 검증
        if (r.type === "new_99_3") {
          // 취득 유형별 필수 일자 검증
          // Round 9 (2026-05-06): 1호 매매계약일은 자산-수준 assetContractDate fallback
          // 메모리 feedback_validation_sync_8th_point.md ⑧ 정책 (UI/API fallback ↔ validate 동기화)
          if (r.acquisitionType993 === "from_builder") {
            const hasContractDate = !!(r.contractDate993 || asset.assetContractDate);
            if (!hasContractDate) return fail("§99의3 1호 적용: 매매계약일을 펼침 영역 상단에 입력하세요.");
          } else if (r.acquisitionType993 === "self_built") {
            if (!r.usageApprovalDate993) return fail("§99의3 2호 적용: 사용승인일을 선택하세요.");
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
              return fail("§99의3 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            }
          } else if (parseAmount(r.standardPriceAtAcquisition993 || "0") <= 0) {
            return fail("§99의3 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)");
          }
          // 전용면적 필수 — 2002.12.31 이전 취득 고가주택(165/149㎡ AND 6억) 판정. §99/§98의8/§99의2와 동일 패턴.
          if (!(parseDecimal(r.exclusiveAreaSqm993 || "") > 0))
            return fail("§99의3 적용: 전용면적(㎡)을 입력하세요 (고가주택 판정).");
          // 5년 시점 기준시가 필수 (5년 후 양도인 경우 안분 산식에 사용)
          if (parseAmount(r.standardPriceAt5Years || "0") <= 0) {
            return fail("§99의3 적용: 5년 시점 기준시가를 입력하세요. (취득일+5년 인접 고시일 가격)");
          }
          // 양도시 기준시가 — 5년 **후** 양도만 필수 (조특령 §99의3②2호 안분의 분모).
          //
          // 🔴 자산-수준 fallback을 믿을 수 없다: ④ 변환(`transfer-tax-api.ts:416-425`)이
          //    자산의 `standardPriceAtTransfer`를 **환산취득가액 모드에서만** 전송한다.
          //    실지거래가·감정·매매사례 모드에서는 undefined가 되어 분모가 음수로 떨어지고,
          //    엔진이 `pos_neg`(부동산-525 해석)로 오분류해 **양도소득금액 전액 감면**이 됐다.
          //    엔진 가드(`new-99-3.ts` MISSING_STD_PRICE)와 **같은 조건**으로 앞단에서 막는다.
          //    (5년 이내 양도는 기준시가를 보지 않으므로 차단하지 않는다 — UI↔validate 모순 방지)
          //    자산-수준 fallback은 `self_farming`(:107-109)과 **같은 방식**으로 인정한다 —
          //    엔진이 `?? ctx.standardPriceAtTransfer`로 폴백하므로(income-deduction-router.ts:204)
          //    여기서 무시하면 환산 모드 사용자를 부당하게 차단한다(UI↔validate 모순).
          //    비-환산 모드에서 자산값이 채워져 있으면 여기서는 통과하고 엔진 가드가
          //    `MISSING_STD_PRICE`로 명시 차단한다 — 조용한 오계산이 아니라 분명한 오류다.
          // 재개발·재건축 변형 ON 시 종전주택 기준시가 필수 (§99 선례 — 자동 안분 fallback 금지)
          if (r.isRedevelopedNewHouse993 && parseAmount(r.previousHouseStdPrice993 || "0") <= 0)
            return fail(
              "§99의3 적용: 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 입력하세요 (조특령 §99의3② 1호 단서·2호 괄호).",
            );
          const hasStdPriceAtTransfer993 =
            parseAmount(r.standardPriceAtTransfer993 || "0") > 0 ||
            parseAmount(asset.standardPriceAtTransfer || "0") > 0;
          if (
            asset.acquisitionDate &&
            form.transferDate &&
            !isWithin5YearsCheck(new Date(asset.acquisitionDate), new Date(form.transferDate)) &&
            !hasStdPriceAtTransfer993
          ) {
            return fail(
              "§99의3 적용: 취득 후 5년 경과 양도는 양도시 기준시가를 입력하세요 (5년 발생분 안분의 분모 — 환산취득가액 모드가 아니면 자산값이 전달되지 않습니다).",
            );
          }
        }
        // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — 3-state 미선택 차단 (자동 안분 fallback 금지)
        if (
          r.type === "rental_97_3" ||
          r.type === "rental_97_4" ||
          r.type === "rental_97_5" ||
          r.type === "rental_97_main" ||
          r.type === "rental_97_proviso" ||
          r.type === "rental_97_2"
        ) {
          const articleLabel: Record<string, string> = {
            rental_97_3: "§97의3", rental_97_4: "§97의4", rental_97_5: "§97의5",
            rental_97_main: "§97 본문", rental_97_proviso: "§97 단서", rental_97_2: "§97의2",
          };
          const label = articleLabel[r.type];
          if (!r.rentalStartDate) return fail(`${label} 적용: 임대개시일을 입력하세요.`);
          if ((r.type === "rental_97_3" || r.type === "rental_97_4" || r.type === "rental_97_5") && !r.registrationDate)
            return fail(`${label} 적용: 임대사업자 등록일을 입력하세요.`);
          // 3-state: "" = 미선택 → 차단 (간소화 모드 명시 선택 강제)
          if (r.rentIncreaseViolationMode === "")
            return fail(`${label} 적용: 임대료 5% 증액 위반 이력 여부(없음/있음)를 선택하세요.`);
          if (r.rentIncreaseViolationMode === "has_violation" && (!r.rentHistory || r.rentHistory.length < 2))
            return fail(`${label} 적용: 위반 이력 "있음" 선택 시 계약별 임대료 이력을 2건 이상 입력하세요.`);
          if (r.hasVacancyOverGrace === null) {
            // D1-03 — 유예는 조문마다 다르다: §97의5만 6개월(조특령 §97의5①1호),
            // 나머지 넷은 3월(조특령 §97⑤5호 → 조특칙 §44). ⑤UI 질문 문구와 같은 값이어야 한다.
            const grace = r.type === "rental_97_5" ? "6개월" : "3개월";
            return fail(`${label} 적용: ${grace}을 초과하는 공실 여부(없음/있음)를 선택하세요.`);
          }
          if (r.hasVacancyOverGrace === true && (!r.vacancyPeriods || r.vacancyPeriods.length === 0))
            return fail(`${label} 적용: 공실 "있음" 선택 시 공실 구간을 1건 이상 입력하세요.`);
          // CA-01 — §97의5①3호가 조특령 §97의3③2호를 준용한다. §97의3과 같은 규칙.
          if (
            (r.type === "rental_97_3" || r.type === "rental_97_5") &&
            (r as { isNationalHousingScale?: boolean }).isNationalHousingScale !== true
          )
            return fail(
              `${label} 적용: 국민주택규모 이하 요건을 확인하세요 (${r.type === "rental_97_5" ? "§97의5①3호 → " : ""}조특령 §97의3③2호).`,
            );
          if ((r.type === "rental_97_3" || r.type === "rental_97_5") && parseAmount((r as { officialPriceAtStart?: string }).officialPriceAtStart || "0") <= 0)
            return fail(`${label} 적용: 임대개시일 당시 기준시가(주택+부속토지 합계)를 입력하세요.`);
          // D2-04 — §97의4 대상 요건 (조특령 §97의4① → 소령 §167의3①2호 가목·다목)
          if (r.type === "rental_97_4") {
            const cat = (r as { rental974Category?: string }).rental974Category;
            if (!cat)
              return fail(
                `${label} 적용: 장기임대주택 유형(가목 민간매입 1호↑ / 다목 건설임대 2호↑)을 선택하세요 (소령 §167의3①2호).`,
              );
            const std = parseAmount((r as { officialPriceAtStart?: string }).officialPriceAtStart || "0");
            if (std <= 0)
              return fail(`${label} 적용: 임대개시일 당시 기준시가(주택+부수토지 합계)를 입력하세요.`);
            // ⑧은 API/UI와 동일한 한도를 써야 한다 — 가목만 수도권 밖 3억 분기가 있다.
            const cap =
              cat === "purchase_a" && (r as { region?: string }).region === "non_capital"
                ? 300_000_000
                : 600_000_000;
            if (std > cap)
              return fail(
                `${label} 적용: 임대개시일 당시 기준시가 합계가 한도 ${(cap / 100_000_000).toFixed(0)}억원을 초과합니다 — 장기임대주택에 해당하지 않습니다 (소령 §167의3①2호 ${cat === "purchase_a" ? "가목" : "다목"}).`,
              );
          }
          // D2-05 — 조특법 §97의5②: §97의5 세액감면은 §97의3·§97의4 과세특례와 중복 적용 불가.
          // ⑧에도 같은 상호배타를 둬야 「UI 통과 ↔ 엔진 배제」 모순이 생기지 않는다.
          if (
            (r.type === "rental_97_3" || r.type === "rental_97_4") &&
(asset.reductions ?? []).some((o) => o.type === "rental_97_5")
          )
            return fail(
              `${label} 적용: §97의5 세액감면과 중복하여 적용할 수 없습니다 (조특법 §97의5②). 하나만 선택하세요.`,
            );
          // D2-06 — 안분이 있는 두 조문만. 3-state 미선택을 「계속 임대」로 읽지 않는다.
          if (r.type === "rental_97_3" || r.type === "rental_97_5") {
            if (r.rentalContinuesToTransfer === null || r.rentalContinuesToTransfer === undefined)
              return fail(
                `${label} 적용: 임대가 양도일까지 계속되었는지 선택하세요 (조특령 ${r.type === "rental_97_5" ? "§97의5②" : "§97의3⑤"}).`,
              );
            if (
              r.rentalContinuesToTransfer === false &&
              parseAmount(r.stdPriceAtRentalEnd || "0") <= 0
            )
              return fail(
                `${label} 적용: 임대 종료일 당시 기준시가를 입력하세요 (안분 산식의 B). 자동 안분은 수행하지 않습니다.`,
              );
          }
          if ((r.type === "rental_97_main" || r.type === "rental_97_proviso") && !(parseInt((r as { constructionYear?: string }).constructionYear || "") > 0))
            return fail(`${label} 적용: 신축 연도를 입력하세요.`);
          // D1-01 — 조특령 §97① 주체 요건. 3-state 미선택을 「충족」으로 읽지 않는다.
          if (r.type === "rental_97_main" || r.type === "rental_97_proviso") {
            const m5 = (r as { hasMin5RentalUnits?: boolean | null }).hasMin5RentalUnits;
            if (m5 === null || m5 === undefined)
              return fail(`${label} 적용: 임대주택 5호 이상 임대 여부를 선택하세요 (조특령 §97①).`);
            // 구간을 열어 놓고 비워 두면 엔진에 NaN이 흘러가므로 여기서 차단한다.
            const below = (r as { belowMin5UnitsPeriods?: { startDate: string; endDate: string }[] })
              .belowMin5UnitsPeriods;
            if (below?.some((p) => !p.startDate || !p.endDate))
              return fail(
                `${label} 적용: 5호 미만 임대 기간의 시작일·종료일을 모두 입력하세요 (조특령 §97⑤4호). 해당 없으면 구간을 삭제하세요.`,
              );
          }
          // D1-06 — §97①2호(1985.12.31 이전 신축 공동주택)는 두 사실을 모두 요구한다.
          if (r.type === "rental_97_main" || r.type === "rental_97_proviso") {
            const year = parseInt((r as { constructionYear?: string }).constructionYear || "0");
            if (year > 0 && year <= 1985) {
              const rr = r as {
                isMultiUnitHousing?: boolean | null;
                isUnoccupiedAt1986?: boolean | null;
              };
              if (rr.isMultiUnitHousing === null || rr.isMultiUnitHousing === undefined)
                return fail(`${label} 적용: 공동주택 여부를 선택하세요 (조특법 §97①2호).`);
              if (rr.isUnoccupiedAt1986 === null || rr.isUnoccupiedAt1986 === undefined)
                return fail(
                  `${label} 적용: 1986.1.1 현재 입주 사실 여부를 선택하세요 (조특법 §97①2호).`,
                );
            }
            // D1-07 — §97① 단서 나목(매입임대)은 「취득 당시 입주된 사실이 없는 주택만 해당」
            if (
              r.type === "rental_97_proviso" &&
              (r as { provisoCase?: string }).provisoCase === "b_purchase"
            ) {
              const u = (r as { isUnoccupiedAtAcquisition?: boolean | null })
                .isUnoccupiedAtAcquisition;
              if (u === null || u === undefined)
                return fail(
                  `${label} 적용: 취득 당시 입주 사실 여부를 선택하세요 (조특법 §97① 단서 나목).`,
                );
            }
          }
          // D1-07 — §97의2①2호(매입임대)도 같은 요건
          if (r.type === "rental_97_2" && (r as { rental972Type?: string }).rental972Type === "purchase") {
            const u = (r as { isUnoccupiedAtAcquisition?: boolean | null }).isUnoccupiedAtAcquisition;
            if (u === null || u === undefined)
              return fail(
                `${label} 적용: 취득 당시 입주 사실 여부를 선택하세요 (조특법 §97의2①2호).`,
              );
          }
          // D1-02 — 조특령 §97의2① 주체 요건 (§97의 5호와 다른 조문·다른 숫자)
          if (r.type === "rental_97_2") {
            const u2 = (r as { hasNewRentalPlus2Units?: boolean | null }).hasNewRentalPlus2Units;
            if (u2 === null || u2 === undefined)
              return fail(
                `${label} 적용: 신축임대주택 1호 이상을 포함한 2호 이상 임대 여부를 선택하세요 (조특령 §97의2①).`,
              );
          }
          if (r.type === "rental_97_proviso" && !(r as { provisoCase?: string }).provisoCase)
            return fail(`${label} 적용: 단서 유형(건설임대/매입임대/10년 이상)을 선택하세요.`);
          if (r.type === "rental_97_2" && !(r as { rental972Type?: string }).rental972Type)
            return fail(`${label} 적용: 건설임대(1호)/매입임대(2호) 유형을 선택하세요.`);
        }
        // §99의4 농어촌·고향주택 (2026-06-11): 취득일·기준시가 필수 (⑧).
        // 소재지·연접·고향 토글은 차단하지 않음 — 엔진 불적용 사유로 안내 (낙관 입력 패턴).
        if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") {
          const label994 = r.type === "new_99_4_rural" ? "§99의4 농어촌주택" : "§99의4 고향주택";
          if (!r.ruralHouseAcquisitionDate)
            return fail(`${label994} 적용: ${r.type === "new_99_4_rural" ? "농어촌주택" : "고향주택"} 취득일을 입력하세요.`);
          if (parseAmount(r.ruralHouseStdPrice || "0") <= 0)
            return fail(`${label994} 적용: 취득 당시 기준시가 합계(주택+부속토지)를 입력하세요.`);
        }
        // P1 §99 신축주택 IMF 1차 (2026-06-11): 유형별 기준일·기준시가·면적 필수 (⑧).
        // 배제 토글은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "new_99") {
          if (r.acquisitionType99 === "self_built" && !r.usageApprovalDate99)
            return fail("§99 적용: 자기건설 주택의 사용승인일을 입력하세요.");
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
              return fail("§99 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
          } else if (parseAmount(r.standardPriceAtAcquisition99 || "0") <= 0) {
            return fail("§99 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)");
          }
          if (!(parseDecimal(r.exclusiveAreaSqm99 || "") > 0))
            return fail("§99 적용: 전용면적(㎡)을 입력하세요 (고가주택 판정).");
          // 재개발·재건축 변형 ON 시 종전주택 기준시가 필수 (B-11 — 자동 안분 fallback 금지)
          if (r.isRedevelopedNewHouse99 && parseAmount(r.previousHouseStdPrice99 || "0") <= 0)
            return fail("§99 적용: 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 입력하세요.");
        }
        // P1 §98의8 준공후미분양 50% (2026-06-11): 계약일·취득가·면적·임대개시일 필수 (⑧).
        // 자격 토글 3종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_8") {
          if (!r.contractDate988)
            return fail("§98의8 적용: 최초 매매계약일을 입력하세요.");
          if (parseAmount(r.acquisitionPrice988 || "0") <= 0)
            return fail("§98의8 적용: 취득가액을 입력하세요.");
          if (!(parseDecimal(r.exclusiveAreaSqm988 || "") > 0))
            return fail("§98의8 적용: 연면적(공동주택은 전용면적, ㎡)을 입력하세요.");
          if (!r.rentalStartDate988)
            return fail("§98의8 적용: 임대개시일을 입력하세요 (사업자등록과 임대사업자등록 후 임대를 개시한 날).");
        }
        // P3 §98의3 (2026-06-12): 분기별 일자 + 과밀 면적 필수 (⑧). 토글은 낙관 — 엔진 사유.
        if (r.type === "unsold_98_3") {
          if (r.houseType983 === "self_built") {
            if (!r.constructionStartDate983 || !r.usageApprovalDate983)
              return fail("§98의3 적용: 자기건설 주택의 착공일과 사용승인일을 입력하세요 (2009.2.12~2010.2.11).");
          } else if (!r.contractDate983) {
            return fail("§98의3 적용: 최초 매매계약일을 입력하세요 (거주자 2009.2.12~ / 비거주자 2009.3.16~2010.2.11).");
          }
          if (r.isOverconcentration983) {
            if (!(parseDecimal(r.landAreaSqm983 || "") > 0))
              return fail("§98의3 적용: 수도권과밀억제권역 주택은 대지면적(㎡)을 입력하세요 (660㎡ 이내 한정).");
            if (!(parseDecimal(r.floorAreaSqm983 || "") > 0))
              return fail("§98의3 적용: 수도권과밀억제권역 주택은 연면적(전용면적, ㎡)을 입력하세요 (149㎡ 이내 한정).");
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
              return fail("§98의3 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            phdOk983 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1). PHD ON이면 취득시 검증 skip.
          const i983 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition983, r.standardPriceAt5Years983, "§98의3", phdOk983);
          if (i983) return i983;
        }
        // P3 §98의5 (2026-06-12): 계약일·인하율 필수 (⑧).
        if (r.type === "unsold_98_5") {
          if (!r.contractDate985)
            return fail("§98의5 적용: 최초 매매계약일을 입력하세요 (~2011.4.30).");
          if (!(parseDecimal(r.priceReductionRatePct985 || "") > 0))
            return fail("§98의5 적용: 분양가격 인하율(%)을 입력하세요 — (최초 공시 분양가 − 매매가) ÷ 최초 분양가 × 100.");
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
              return fail("§98의5 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            phdOk985 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1). PHD ON이면 취득시 검증 skip.
          const i985 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition985, r.standardPriceAt5Years985, "§98의5", phdOk985);
          if (i985) return i985;
        }
        // P3 §98의6 (2026-06-12): 계약일·기준시가 합계·면적 + 2호 임대 일자 필수 (⑧).
        if (r.type === "unsold_98_6") {
          if (!r.contractDate986)
            return fail("§98의6 적용: 최초 매매계약일을 입력하세요.");
          if (parseAmount(r.stdPriceSumAtBase986 || "0") <= 0)
            return fail("§98의6 적용: 주택과 부수토지의 기준시가 합계를 입력하세요 (6억 한도).");
          if (!(parseDecimal(r.floorAreaSqm986 || "") > 0))
            return fail("§98의6 적용: 연면적(공동주택은 전용면적, ㎡)을 입력하세요 (149㎡ 한도).");
          if (r.hoType986 === "buyer_rented") {
            if (!r.rentalContractDate986)
              return fail("§98의6 2호 적용: 임대계약 체결일을 입력하세요 (2011.12.31 이전 한정).");
            if (!r.rentalStartDate986)
              return fail("§98의6 2호 적용: 임대개시일을 입력하세요 (사업자등록과 임대사업자등록 후 임대를 개시한 날).");
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
              return fail("§98의6 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            phdOk986 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (안분용 — stdPriceSumAtBase986과 별개 — F-1). PHD ON이면 취득시 검증 skip.
          const i986 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition986, r.standardPriceAt5Years986, "§98의6", phdOk986);
          if (i986) return i986;
        }
        // P2 §98의7 9억↓ 미분양 (2026-06-11): 계약일·취득가 필수 (⑧).
        // 자격 토글 4종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_7") {
          if (!r.contractDate987)
            return fail("§98의7 적용: 최초 매매계약일을 입력하세요 (2012.9.24~2012.12.31).");
          if (parseAmount(r.acquisitionPrice987 || "0") <= 0)
            return fail("§98의7 적용: 취득가액을 입력하세요 (9억원 이하 — 취득세·부대비용 제외).");
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
              return fail("§98의7 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            phdOk987 = true;
          }
          // 취득 후 5년 경과 양도 시 안분용 기준시가 필수 (M-4 → F-1 헬퍼 단일화). PHD ON이면 취득시 검증 skip.
          const i987 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition987, r.standardPriceAt5Years987, "§98의7", phdOk987);
          if (i987) return i987;
        }
        // P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): 유형별 일자 + 취득가·면적 필수 (⑧).
        // 자격 토글은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_99_2") {
          if (r.houseType992 === "self_built") {
            if (!r.usageApprovalDate992)
              return fail("§99의2 적용: 자기건설 주택의 사용승인·사용검사일을 입력하세요 (2013.4.1~2013.12.31).");
          } else if (!r.contractDate992) {
            return fail("§99의2 적용: 최초 매매계약일을 입력하세요 (2013.4.1~2013.12.31).");
          }
          if (parseAmount(r.acquisitionPrice992 || "0") <= 0)
            return fail("§99의2 적용: 실거래 취득가액을 입력하세요 (6억 이하 OR 85㎡ 이하 판정에 필요).");
          if (!(parseDecimal(r.exclusiveAreaSqm992 || "") > 0))
            return fail("§99의2 적용: 연면적(공동주택·오피스텔은 전용면적, ㎡)을 입력하세요.");
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
              return fail("§99의2 PHD 환산 모드: 최초공시일·최초공시가격·토지면적·취득시/최초공시시 토지 공시지가를 모두 입력하세요.");
            phdOk992 = true;
          }
          // 5년 경과 양도 시 안분용 기준시가 필수 (5년 분기는 houseType 무관 공통 — F-1). PHD ON이면 취득시 검증 skip.
          const i992 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition992, r.standardPriceAt5Years992, "§99의2", phdOk992);
          if (i992) return i992;
        }
        // §98의9 수도권 밖 준공후미분양 (2026-06-11): 취득일·취득가·전용면적 필수 (⑧).
        // 토글 3종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_9") {
          if (!r.unsoldHouseAcquisitionDate)
            return fail("§98의9 적용: 준공후미분양주택 취득일을 입력하세요.");
          if (parseAmount(r.unsoldHouseAcquisitionPrice || "0") <= 0)
            return fail("§98의9 적용: 준공후미분양주택 취득가액을 입력하세요.");
          if (!(parseDecimal(r.unsoldHouseExclusiveArea || "") > 0))
            return fail("§98의9 적용: 준공후미분양주택 전용면적(㎡)을 입력하세요.");
        }
      }
    }
  }

  return null;
}
