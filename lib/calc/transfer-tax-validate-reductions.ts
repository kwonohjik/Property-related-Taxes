/**
 * STEP 2 (감면·공제) 검증 — §99의3 + 장기임대 §97 시리즈
 *
 * transfer-tax-validate.ts 800줄 정책 분리 (2026-06-11).
 * 반환: 실패 시 ValidationIssue, 통과 시 null.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";

export function validateStep2Reductions(step: number, form: TransferFormData): ValidationIssue | null {
  // step 2: 감면·공제 (구 step 4)
  if (step === 2) {
    const assets = form.assets ?? [];
    for (let ai = 0; ai < assets.length; ai++) {
      const asset = assets[ai];
      const fail = (message: string): ValidationIssue => ({ step, assetIndex: ai, message });
      for (const r of asset.reductions ?? []) {
        if (r.type === "public_expropriation") {
          const cash = parseAmount(r.expropriationCash || "0");
          const bond = parseAmount(r.expropriationBond || "0");
          if (cash + bond <= 0) return fail("현금 또는 채권 보상액 중 최소 하나를 입력하세요.");
          if (!r.expropriationApprovalDate) return fail("사업인정고시일을 선택하세요.");
          if (form.transferDate && r.expropriationApprovalDate >= form.transferDate)
            return fail("사업인정고시일은 양도일보다 이전이어야 합니다.");
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
          // 취득시 기준시가 필수 (PHD 환산 결과 또는 직접 입력)
          // Round 10 (2026-05-06): PHD 모드 ON 시 자동 산출되어 standardPriceAtAcquisition993에 적용됨
          // PHD 모드 ON + 입력 부족 시 자동 적용 안 되므로 동일 검증으로 차단됨 (UI/API fallback ↔ validate 동기화 정책)
          if (parseAmount(r.standardPriceAtAcquisition993 || "0") <= 0) {
            return fail(r.phdMode993
              ? "§99의3 PHD 환산 모드: 환산 결과가 0입니다. 토지 공시지가·면적·최초공시 정보를 모두 입력했는지 확인 후 '적용' 버튼을 클릭하세요."
              : "§99의3 적용: 취득시 기준시가를 입력하세요. (공동주택 최초고시 전 취득 시 PHD 환산 모드 ON 권장)");
          }
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
          if (parseAmount(r.standardPriceAtAcquisition99 || "0") <= 0)
            return fail("§99 적용: 취득시 기준시가를 입력하세요.");
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
        // P2 §98의7 9억↓ 미분양 (2026-06-11): 계약일·취득가 필수 (⑧).
        // 자격 토글 4종은 차단하지 않음 — 엔진 불적용 사유 (낙관 입력 패턴).
        if (r.type === "unsold_98_7") {
          if (!r.contractDate987)
            return fail("§98의7 적용: 최초 매매계약일을 입력하세요 (2012.9.24~2012.12.31).");
          if (parseAmount(r.acquisitionPrice987 || "0") <= 0)
            return fail("§98의7 적용: 취득가액을 입력하세요 (9억원 이하 — 취득세·부대비용 제외).");
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
