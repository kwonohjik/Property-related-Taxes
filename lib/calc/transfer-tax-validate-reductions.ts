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
import { isReductionAllowedForAssetKind, REDUCTION_METADATA, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
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
): ValidationIssue | null {
  if (!asset.acquisitionDate || !form.transferDate) return null;
  if (isWithin5YearsCheck(new Date(asset.acquisitionDate), new Date(form.transferDate))) return null;
  if (parseAmount(stdAcq || "0") <= 0)
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
      for (const r of asset.reductions ?? []) {
        // 주택 게이트 (2026-06-29): 비주택 자산에 stale 선택된 주택 감면(§97·§99·§98 시리즈) 차단.
        // UI disabled와 동일 판정 (단일 소스 isReductionAllowedForAssetKind). field별 검증보다 먼저.
        if (!isReductionAllowedForAssetKind(r.type, asset.assetKind)) {
          const gateLabel =
            REDUCTION_METADATA[r.type as keyof typeof REDUCTION_METADATA]?.uiLabel ?? "이 감면";
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
          if (r.hasVacancyOver6Months === null)
            return fail(`${label} 적용: 6개월 이상 공실 여부(없음/있음)를 선택하세요.`);
          if (r.hasVacancyOver6Months === true && (!r.vacancyPeriods || r.vacancyPeriods.length === 0))
            return fail(`${label} 적용: 공실 "있음" 선택 시 공실 구간을 1건 이상 입력하세요.`);
          if ((r.type === "rental_97_3" || r.type === "rental_97_5") && parseAmount((r as { officialPriceAtStart?: string }).officialPriceAtStart || "0") <= 0)
            return fail(`${label} 적용: 임대개시일 당시 기준시가(주택+부속토지 합계)를 입력하세요.`);
          if ((r.type === "rental_97_main" || r.type === "rental_97_proviso") && !(parseInt((r as { constructionYear?: string }).constructionYear || "") > 0))
            return fail(`${label} 적용: 신축 연도를 입력하세요.`);
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
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1).
          const i983 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition983, r.standardPriceAt5Years983, "§98의3");
          if (i983) return i983;
        }
        // P3 §98의5 (2026-06-12): 계약일·인하율 필수 (⑧).
        if (r.type === "unsold_98_5") {
          if (!r.contractDate985)
            return fail("§98의5 적용: 최초 매매계약일을 입력하세요 (~2011.4.30).");
          if (!(parseDecimal(r.priceReductionRatePct985 || "") > 0))
            return fail("§98의5 적용: 분양가격 인하율(%)을 입력하세요 — (최초 공시 분양가 − 매매가) ÷ 최초 분양가 × 100.");
          // 5년 경과 양도 시 안분용 기준시가 필수 (F-1).
          const i985 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition985, r.standardPriceAt5Years985, "§98의5");
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
          // 5년 경과 양도 시 안분용 기준시가 필수 (안분용 — stdPriceSumAtBase986과 별개 — F-1).
          const i986 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition986, r.standardPriceAt5Years986, "§98의6");
          if (i986) return i986;
        }
        // P2 §98의7 9억↓ 미분양 (2026-06-11): 계약일·취득가 필수 (⑧).
        // 자격 토글 4종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_7") {
          if (!r.contractDate987)
            return fail("§98의7 적용: 최초 매매계약일을 입력하세요 (2012.9.24~2012.12.31).");
          if (parseAmount(r.acquisitionPrice987 || "0") <= 0)
            return fail("§98의7 적용: 취득가액을 입력하세요 (9억원 이하 — 취득세·부대비용 제외).");
          // 취득 후 5년 경과 양도 시 안분용 기준시가 필수 (M-4 → F-1 헬퍼 단일화).
          const i987 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition987, r.standardPriceAt5Years987, "§98의7");
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
          // 5년 경과 양도 시 안분용 기준시가 필수 (5년 분기는 houseType 무관 공통 — F-1).
          const i992 = failIfStdPriceMissingOver5Y(fail, asset, form, r.standardPriceAtAcquisition992, r.standardPriceAt5Years992, "§99의2");
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
