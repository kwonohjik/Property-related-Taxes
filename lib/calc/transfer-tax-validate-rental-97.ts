/**
 * STEP 2 (감면·공제) 검증 — 장기임대 §97 시리즈(§97 본문·단서·§97의2·§97의3·§97의4·§97의5)
 *
 * `transfer-tax-validate-reductions.ts` 800줄 정책 분리 (2026-11-04). 문장은 옮기기 전과 같다 —
 * `fail`을 받아 같은 `ValidationIssue`를 돌려주고, 해당 없으면 null(호출부는 다음 조문 검사로 넘어간다).
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { fieldError } from "./transfer-tax-validate-field";
import { rentalProrationIssue } from "./transfer-tax-validate-rental-proration";
import { rentalConversionIssue } from "./transfer-tax-validate-rental-conversion";
import { rental973LongRegistrationDate } from "./transfer-tax-validate-rental-conversion";
import { findRental97StatutoryOverlap } from "@/lib/tax-engine/transfer-reductions/rental-97-statutory-overlap";
import { findRental97TaxAmountOverlap } from "@/lib/tax-engine/transfer-reductions/rental-97-tax-amount-overlap";
import { rental97TaxAmountOverlapMessage } from "@/lib/tax-engine/transfer-reductions/rental-97-tax-amount-overlap";
import { rental97StatutoryOverlapMessage } from "@/lib/tax-engine/transfer-reductions/rental-97-statutory-overlap";
import { hasRentIncreaseRule } from "./rental-rent-increase-label";
import { RENT_INCREASE_VIOLATION_LABEL } from "./rental-rent-increase-label";
import { rental974AptDeadlineIssue } from "./apt-deadline-extension-scope";
import { rental975InheritanceInScope } from "./rental-97-5-inheritance";
import { rental973InheritanceInScope } from "./rental-97-3-inheritance";
import { rental973InheritanceConflictsConversion } from "./rental-97-3-inheritance";

export function rental97SeriesIssue(args: {
  fail: (message: string) => ValidationIssue;
  r: AssetReductionForm;
  asset: AssetForm;
  assetIndex: number;
  form: TransferFormData;
  redevHiddenStd: { acq: boolean; transfer: boolean };
}): ValidationIssue | null {
  const { fail, r, asset, assetIndex: ai, form, redevHiddenStd } = args;
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
    if (!r.rentalStartDate) return fail(fieldError(`reduction.${r.type}.rentalStartDate`, `${label} 적용: 임대개시일을 입력하세요.`));
    if ((r.type === "rental_97_3" || r.type === "rental_97_4" || r.type === "rental_97_5") && !r.registrationDate)
      return fail(fieldError(`reduction.${r.type}.registrationDate`, `${label} 적용: 임대사업자 등록일을 입력하세요.`));
    // §97의5①1호 — 매입임대 확인(3-state). 미선택을 매입임대로 읽지 않는다. 「건설임대」 선택은 엔진이 불적용 사유로 보인다.
    if (r.type === "rental_97_5" && (r.isPurchaseRental === null || r.isPurchaseRental === undefined))
      return fail(fieldError(`reduction.${r.type}.isPurchaseRental`, `${label} 적용: 임대주택 취득 유형(매입임대/건설임대)을 선택하세요 (§97의5①1호).`));
    // 조특령 §97의5③ — 사업자등록을 확인했으면 그 날짜가 임대개시 기산의 한 축이다(엔진 MISSING_TAX_REGISTRATION_DATE)
    if ((r.type === "rental_97_5" || r.type === "rental_97_3" || r.type === "rental_97_4") && r.isTaxRegistered && !r.taxRegistrationDate)
      return fail(fieldError(`reduction.${r.type}.taxRegistrationDate`, `${label} 적용: 세무서 사업자등록일을 입력하세요 (조특령 ${r.type === "rental_97_5" ? "§97의5③" : r.type === "rental_97_4" ? "§97의4②" : "§97의3④"} — 늦으면 그날부터 임대 개시).`));
    // 3-state: "" = 미선택 → 차단 (간소화 모드 명시 선택 강제)
    // 임대료 증액 제한은 §97의3·§97의4·§97의5만 — §97(본문·단서)·§97의2는 묻지도 막지도 않는다 (`hasRentIncreaseRule`)
    const rentRule = hasRentIncreaseRule(r.type);
    if (rentRule && r.rentIncreaseViolationMode === "")
      return fail(fieldError(`reduction.${r.type}.rentIncreaseViolationMode`, `${label} 적용: ${RENT_INCREASE_VIOLATION_LABEL} 여부(없음/있음)를 선택하세요.`));
    if (rentRule && r.rentIncreaseViolationMode === "has_violation" && (!r.rentHistory || r.rentHistory.length < 2))
      return fail(fieldError(`reduction.${r.type}.rentHistory`, `${label} 적용: 위반 이력 "있음" 선택 시 계약별 임대료 이력을 2건 이상 입력하세요.`));
    // 빈 계약일 — 공실 구간과 같은 이유(아래). 개수만 보면 ⑧을 통과한 뒤 Zod가 영문 경로로 400을 냈다(리뷰 게이트 2026-11-01).
    if (rentRule && r.rentIncreaseViolationMode === "has_violation" && r.rentHistory?.some((h) => !h.contractDate))
      return fail(fieldError(`reduction.${r.type}.rentHistory`, `${label} 적용: 임대료 계약 이력의 계약일을 모두 입력하세요. 해당 없으면 행을 삭제하세요.`));
    if (r.hasVacancyOverGrace === null) {
      // D1-03 — 유예는 조문마다 다르다: §97의5만 6개월(조특령 §97의5①1호),
      // 나머지 넷은 3월(조특령 §97⑤5호 → 조특칙 §44). ⑤UI 질문 문구와 같은 값이어야 한다.
      const grace = r.type === "rental_97_5" ? "6개월" : "3개월";
      return fail(fieldError(`reduction.${r.type}.hasVacancyOverGrace`, `${label} 적용: ${grace}을 초과하는 공실 여부(없음/있음)를 선택하세요.`));
    }
    if (r.hasVacancyOverGrace === true && (!r.vacancyPeriods || r.vacancyPeriods.length === 0))
      return fail(fieldError(`reduction.${r.type}.vacancyPeriods`, `${label} 적용: 공실 "있음" 선택 시 공실 구간을 1건 이상 입력하세요.`));
    /**
     * 🔴 **빈 날짜도 막는다** (2026-09-07 대장 재대조). 종전에는 구간 **개수**만 봤다.
     *
     * 형제 축인 5호 미만 임대 기간(:아래 `belowMin5UnitsPeriods`)은 이미 같은 이유로
     * 「구간을 열어 놓고 비워 두면 엔진에 NaN이 흘러간다」며 시작일·종료일을 요구한다.
     * 공실 구간만 그 짝이 없어, 「+ 구간 추가」만 누르고 날짜를 안 채우면 ⑧을 통과한 뒤
     * Zod가 영문 필드 경로로 400을 냈다 — 사용자는 어느 칸인지 알 수 없었다.
     */
    if (r.hasVacancyOverGrace === true && r.vacancyPeriods?.some((p) => !p.startDate || !p.endDate))
      return fail(fieldError(`reduction.${r.type}.vacancyPeriods`, `${label} 적용: 공실 구간의 시작일·종료일을 모두 입력하세요. 해당 없으면 구간을 삭제하세요.`,
      ));
    // 조특령 §97의5①2호·3호 간주기간 — 켰으면 행마다 두 날짜가 있어야 하고 시작 ≤ 종료
    if (r.type === "rental_97_5" && r.hasDeemedRentalPeriod) {
      const rows = r.deemedRentalPeriods ?? [];
      if (rows.length === 0 || rows.some((p) => !p.startDate || !p.endDate || p.startDate > p.endDate))
        return fail(fieldError(`reduction.${r.type}.deemedRentalPeriods`, `${label} 적용: 수용·정비사업으로 임대할 수 없던 기간의 시작일·종료일(정비사업은 인가일·준공일)을 확인하세요 (조특령 §97의5①2호·3호).`));
    }
    // V-13 — §97의5 상속 합산(조특령 §97의5③ → §97⑤3호). ④는 상속 자산·세 날짜가 다 있을 때만 싣는다 → 빈 칸은 여기서 막는다.
    //   상속개시일은 자산 카드 취득일이다(`rental975InheritancePayload` — ⑤④와 같은 leaf). 상속 자산이 아니면 토글이 숨어 읽지 않는다.
    if (r.type === "rental_97_5" && r.isInherited975 && rental975InheritanceInScope(asset.acquisitionCause)) {
      if (!asset.acquisitionDate)
        return fail(fieldError("acquisitionDate", `${label} 적용: 피상속인 임대기간을 합산하려면 자산의 상속개시일을 먼저 입력하세요.`));
      if (!r.decedentRegistrationDate975)
        return fail(fieldError(`reduction.${r.type}.decedentRegistrationDate975`, `${label} 적용: 피상속인의 장기일반·공공지원 등록등일(임대사업자 등록·세무서 사업자등록 중 늦은 날)을 입력하세요.`));
      if (!r.decedentRentalStartDate975)
        return fail(fieldError(`reduction.${r.type}.decedentRentalStartDate975`, `${label} 적용: 피상속인의 임대개시일을 입력하세요.`));
      // 엔진 INVALID_INHERITANCE_DATES와 같은 조건 (YYYY-MM-DD 문자열 비교) — 상속개시일 > 양도일은 자산 날짜 검증이 먼저 막는다
      if (r.decedentRegistrationDate975 >= asset.acquisitionDate || r.decedentRentalStartDate975 >= asset.acquisitionDate)
        return fail(fieldError(`reduction.${r.type}.decedentRentalStartDate975`, `${label} 적용: 피상속인의 임대개시일·등록등일은 상속개시일(${asset.acquisitionDate})보다 앞서야 합니다.`));
    }
    // V-14 — §97의3 상속 합산(조특령 §97의3④ → §97⑤3호). §97의5와 같은 규칙 + 단기→장기 변경신고와 함께 쓸 수 없다(Q-2 · 엔진 사유와 같은 조건).
    if (r.type === "rental_97_3" && r.isInherited973 && rental973InheritanceInScope(asset.acquisitionCause)) {
      if (rental973InheritanceConflictsConversion(r))
        return fail(fieldError(`reduction.${r.type}.isInherited973`, `${label} 적용: 피상속인 임대기간 합산과 2020.7.10 이전 단기→장기 변경신고 산입은 함께 계산하지 않습니다 — 둘 중 하나를 끄세요 (조특령 §97의3④).`));
      if (!asset.acquisitionDate)
        return fail(fieldError("acquisitionDate", `${label} 적용: 피상속인 임대기간을 합산하려면 자산의 상속개시일을 먼저 입력하세요.`));
      if (!r.decedentRegistrationDate973)
        return fail(fieldError(`reduction.${r.type}.decedentRegistrationDate973`, `${label} 적용: 피상속인의 장기일반·공공지원 등록등일(임대사업자 등록·세무서 사업자등록 중 늦은 날)을 입력하세요.`));
      if (!r.decedentRentalStartDate973)
        return fail(fieldError(`reduction.${r.type}.decedentRentalStartDate973`, `${label} 적용: 피상속인의 임대개시일을 입력하세요.`));
      // 엔진 INVALID_INHERITANCE_DATES와 같은 조건 (YYYY-MM-DD 문자열 비교)
      if (r.decedentRegistrationDate973 >= asset.acquisitionDate || r.decedentRentalStartDate973 >= asset.acquisitionDate)
        return fail(fieldError(`reduction.${r.type}.decedentRentalStartDate973`, `${label} 적용: 피상속인의 임대개시일·등록등일은 상속개시일(${asset.acquisitionDate})보다 앞서야 합니다.`));
    }
    // D2-07 — 2023.1.1 이후 등록분은 §97의3①이 민간건설임대주택에 한정한다.
    //          그 전 등록분은 법률 제19199호 부칙 §38 경과조치로 종전 규정을 따른다.
    // ⚠️ 종전 규정에도 **등록 시한**이 있다 — 매입임대는 2020.12.31, 건설임대는 2022.12.31
    //    (법률 제17759호로 신설된 괄호). 그래서 2021.1.1~2022.12.31 등록 매입임대는
    //    「한정」이 아니라 **시한** 축에서 배제된다. 엔진 `rental-97-3.ts`의 두 분기와 동형.
    // PR-C — 변경신고 주택은 「등록」일이 수리일이다(엔진 `longRegistrationDate`). 변경신고 입력 검사도 여기서.
    const conversionIssue = r.type === "rental_97_3" ? rentalConversionIssue(r, label) : null;
    if (conversionIssue) return fail(conversionIssue);
    const longReg = r.type === "rental_97_3" ? rental973LongRegistrationDate(r) : "";
    if (
      r.type === "rental_97_3" &&
      longReg > "2020-12-31" &&
      (r as { isPrivateConstructionRental?: boolean }).isPrivateConstructionRental !== true
    )
      return fail(fieldError(`reduction.${r.type}.isPrivateConstructionRental`, longReg >= "2023-01-01"
          ? `${label} 적용: 2023.1.1 이후 등록분은 민간건설임대주택(민특법 §2 2호)에 한정합니다 — 해당 여부를 확인하세요 (조특법 §97의3①).`
          : `${label} 적용: 민간건설임대주택이 아닌 임대주택(민간매입임대)의 등록 시한은 2020.12.31입니다 — 2021.1.1 이후 등록분은 적용되지 않습니다. 민간건설임대주택이면 해당 여부를 확인하세요 (조특법 §97의3① 종전 규정).`,
      ));
    // CA-01 — §97의5①3호가 조특령 §97의3③2호를 준용한다. §97의3과 같은 규칙.
    if (
      (r.type === "rental_97_3" || r.type === "rental_97_5") &&
      (r as { isNationalHousingScale?: boolean }).isNationalHousingScale !== true
    )
      return fail(fieldError(`reduction.${r.type}.isNationalHousingScale`, `${label} 적용: 국민주택규모 이하 요건을 확인하세요 (${r.type === "rental_97_5" ? "§97의5①3호 → " : ""}조특령 §97의3③2호).`,
      ));
    if ((r.type === "rental_97_3" || r.type === "rental_97_5") && parseAmount((r as { officialPriceAtStart?: string }).officialPriceAtStart || "0") <= 0)
      return fail(fieldError(`reduction.${r.type}.officialPriceAtStart`, `${label} 적용: 임대개시일 당시 기준시가(주택+부속토지 합계)를 입력하세요.`));
    // D2-04 — §97의4 대상 요건 (조특령 §97의4① → 소령 §167의3①2호 가목·다목)
    if (r.type === "rental_97_4") {
      const cat = (r as { rental974Category?: string }).rental974Category;
      if (!cat)
        return fail(fieldError(`reduction.${r.type}.rental974Category`, `${label} 적용: 장기임대주택 유형(가목 민간매입 1호↑ / 다목 건설임대 2호↑)을 선택하세요 (소령 §167의3①2호).`,
        ));
      const std = parseAmount((r as { officialPriceAtStart?: string }).officialPriceAtStart || "0");
      if (std <= 0)
        return fail(fieldError(`reduction.${r.type}.officialPriceAtStart`, `${label} 적용: 임대개시일 당시 기준시가(주택+부수토지 합계)를 입력하세요.`));
      // ⑧은 API/UI와 동일한 한도를 써야 한다 — 가목만 수도권 밖 3억 분기가 있다.
      const cap =
        cat === "purchase_a" && (r as { region?: string }).region === "non_capital"
          ? 300_000_000
          : 600_000_000;
      if (std > cap)
        return fail(fieldError(`reduction.${r.type}.officialPriceAtStart`, `${label} 적용: 임대개시일 당시 기준시가 합계가 한도 ${(cap / 100_000_000).toFixed(0)}억원을 초과합니다 — 장기임대주택에 해당하지 않습니다 (소령 §167의3①2호 ${cat === "purchase_a" ? "가목" : "다목"}).`,
        ));
      // 조특령 §97⑤3호 — 상속 합산. ④는 세 날짜가 다 있을 때만 싣는다 → 빈 칸은 여기서 막는다(조용히 합산 누락 방지).
      if (r.isInherited974) {
        if (!r.inheritanceDate974)
          return fail(fieldError(`reduction.${r.type}.inheritanceDate974`, `${label} 적용: 상속개시일을 입력하세요 (조특령 §97⑤3호 — 피상속인 임대기간 합산).`));
        if (!r.decedentRegistrationDate974)
          return fail(fieldError(`reduction.${r.type}.decedentRegistrationDate974`, `${label} 적용: 피상속인의 사업자등록등일(세무서 사업자등록·임대사업자등록 중 늦은 날)을 입력하세요.`));
        if (!r.decedentRentalStartDate974)
          return fail(fieldError(`reduction.${r.type}.decedentRentalStartDate974`, `${label} 적용: 피상속인의 임대개시일을 입력하세요.`));
        // 엔진 INVALID_INHERITANCE_DATES와 같은 조건 (YYYY-MM-DD 문자열 비교)
        if (r.decedentRegistrationDate974 >= r.inheritanceDate974 || r.decedentRentalStartDate974 >= r.inheritanceDate974)
          return fail(fieldError(`reduction.${r.type}.inheritanceDate974`, `${label} 적용: 피상속인의 임대개시일·사업자등록등일은 상속개시일보다 앞서야 합니다.`));
        if (form.transferDate && r.inheritanceDate974 > form.transferDate)
          return fail(fieldError(`reduction.${r.type}.inheritanceDate974`, `${label} 적용: 상속개시일은 양도일 이전이어야 합니다.`));
      }
      // 민특법 §6⑤ 자동말소 — ④는 날짜가 있을 때만 싣는다
      if (r.isAutoCancelled974) {
        if (!r.autoCancelledDate974)
          return fail(fieldError(`reduction.${r.type}.autoCancelledDate974`, `${label} 적용: 임대사업자 등록 자동말소일을 입력하세요 (임대기간 종점).`));
        if (form.transferDate && r.autoCancelledDate974 > form.transferDate)
          return fail(fieldError(`reduction.${r.type}.autoCancelledDate974`, `${label} 적용: 자동말소일은 양도일 이전이어야 합니다.`));
      }
      // 민특법 §6①11호 자진말소 — ④는 날짜가 있을 때만 싣는다. 자동말소와 함께 고를 수 없다(⑤가 서로 끈다).
      if (r.isVoluntaryCancelled974) {
        if (r.isAutoCancelled974)
          return fail(fieldError(`reduction.${r.type}.voluntaryCancelledDate974`, `${label} 적용: 자동말소와 자진말소 중 하나만 고르세요.`));
        if (!r.voluntaryCancelledDate974)
          return fail(fieldError(`reduction.${r.type}.voluntaryCancelledDate974`, `${label} 적용: 임대사업자 등록 자진말소일을 입력하세요 (임대기간 종점).`));
        if (form.transferDate && r.voluntaryCancelledDate974 > form.transferDate)
          return fail(fieldError(`reduction.${r.type}.voluntaryCancelledDate974`, `${label} 적용: 자진말소일은 양도일 이전이어야 합니다.`));
      }
      // 소령 §167의3①2호 가목2) 아파트 양도기한(⑪) — 리뷰 R-2
      const aptIssue = rental974AptDeadlineIssue(r, form.transferDate);
      if (aptIssue?.key === "isApartment974") return fail(fieldError(`reduction.${r.type}.isApartment974`, `${label} 적용: ${aptIssue.message}`));
      if (aptIssue) return fail(fieldError(`reduction.${r.type}.aptDeadlineExtension974`, `${label} 적용: ${aptIssue.message}`));
    }
    // D2-05 — 명문 배제 쌍: 조특법 §97의5②(§97의5 × §97의3·§97의4) · §97의3②(§97의3 × §97의4). ⑫와 같은 단일 소스(`rental-97-statutory-overlap.ts`).
    // ⑧에도 같은 상호배타를 둬야 「UI 통과 ↔ 엔진 배제」 모순이 생기지 않는다.
    const overlapTypes = (asset.reductions ?? []).map((o) => o.type);
    const overlap = findRental97StatutoryOverlap(overlapTypes);
    if (overlap && overlap.subject === r.type) return fail(rental97StatutoryOverlapMessage(overlap));
    // 세액감면 계열(§97 본문·단서·§97의2·§97의5) 안 쌍 — 엔진이 첫 항목만 평가해 순서로 세액이 갈리던 것을 막는다(V-6 미측정분 Q-2 b).
    // 명문 배제 쌍과 한 카드에 함께 있으면 §127⑦ 트랙 교차(본문·단서·§97의2 × §97의3/4)가 항상 먼저 걸려 여기까지 오지 않는다 —
    // 세액감면 쌍에는 §97의5가 아닌 구성원이 반드시 있고 그 구성원이 §97의3/4와 트랙 충돌이다. ⑫도 같은 순서라 문구가 일치한다.
    const taxOverlap = findRental97TaxAmountOverlap(overlapTypes);
    if (taxOverlap && taxOverlap.subject === r.type) return fail(rental97TaxAmountOverlapMessage(taxOverlap));
    // D2-06 — 안분이 있는 두 조문만(§97의3⑤·§97의5②). 안분 축 검사는 leaf로 분리했다 — 엔진과 같은 의제 개시일·양도일 구간.
    if (r.type === "rental_97_3" || r.type === "rental_97_5") {
      const prorationIssue = rentalProrationIssue({ r, label, asset, assetIndex: ai, form, redevHiddenStd });
      if (prorationIssue) return fail(prorationIssue);
    }
    if ((r.type === "rental_97_main" || r.type === "rental_97_proviso") && !(parseInt((r as { constructionYear?: string }).constructionYear || "") > 0))
      return fail(fieldError(`reduction.${r.type}.constructionYear`, `${label} 적용: 신축 연도를 입력하세요.`));
    // D1-01 — 조특령 §97① 주체 요건. 3-state 미선택을 「충족」으로 읽지 않는다.
    if (r.type === "rental_97_main" || r.type === "rental_97_proviso") {
      const m5 = (r as { hasMin5RentalUnits?: boolean | null }).hasMin5RentalUnits;
      if (m5 === null || m5 === undefined)
        return fail(fieldError(`reduction.${r.type}.hasMin5RentalUnits`, `${label} 적용: 임대주택 5호 이상 임대 여부를 선택하세요 (조특령 §97①).`));
      // 구간을 열어 놓고 비워 두면 엔진에 NaN이 흘러가므로 여기서 차단한다.
      // 🔴 단, **「5호 이상」일 때만** 요구한다 — ⑤는 이 구간 편집·삭제 UI를
      //    `hasMin5RentalUnits === true` 안에만 두므로(`Rental97MainInputForm.tsx:246`),
      //    「미해당」을 고른 뒤에는 남은 빈 행을 지울 수단이 사라져 **막다른 길**이 됐다.
      //    엔진도 `hasMin5RentalUnits !== true`면 감면 자체를 적용하지 않아
      //    (`rental-97-main.ts:107`) 그 구간은 계산에 도달하지 않는다.
      const below =
        m5 === true
          ? (r as { belowMin5UnitsPeriods?: { startDate: string; endDate: string }[] })
              .belowMin5UnitsPeriods
          : undefined;
      if (below?.some((p) => !p.startDate || !p.endDate))
        return fail(fieldError(`reduction.${r.type}.belowMin5UnitsPeriods`, `${label} 적용: 5호 미만 임대 기간의 시작일·종료일을 모두 입력하세요 (조특령 §97⑤4호). 해당 없으면 구간을 삭제하세요.`,
        ));
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
          return fail(fieldError(`reduction.${r.type}.isMultiUnitHousing`, `${label} 적용: 공동주택 여부를 선택하세요 (조특법 §97①2호).`));
        if (rr.isUnoccupiedAt1986 === null || rr.isUnoccupiedAt1986 === undefined)
          return fail(fieldError(`reduction.${r.type}.isUnoccupiedAt1986`, `${label} 적용: 1986.1.1 현재 입주 사실 여부를 선택하세요 (조특법 §97①2호).`,
          ));
      }
      // D1-07 — §97① 단서 나목(매입임대)은 「취득 당시 입주된 사실이 없는 주택만 해당」
      if (
        r.type === "rental_97_proviso" &&
        (r as { provisoCase?: string }).provisoCase === "b_purchase"
      ) {
        const u = (r as { isUnoccupiedAtAcquisition?: boolean | null })
          .isUnoccupiedAtAcquisition;
        if (u === null || u === undefined)
          return fail(fieldError(`reduction.${r.type}.isUnoccupiedAtAcquisition`, `${label} 적용: 취득 당시 입주 사실 여부를 선택하세요 (조특법 §97① 단서 나목).`,
          ));
      }
    }
    // D9-01 — §97의2①1호 나목: 1999.8.19 이전 신축 건설임대는 두 사실을 모두 요구한다.
    //          시한 게이트만 열고 이 검사를 빼면 1999.8.20 현재 입주돼 있던 구축까지
    //          적격이 되어 **과다포섭**이 된다.
    if (
      r.type === "rental_97_2" &&
      (r as { rental972Type?: string }).rental972Type === "construction" &&
      asset.acquisitionDate &&
      new Date(asset.acquisitionDate) < new Date("1999-08-20")
    ) {
      const rr = r as {
        isMultiUnitHousing972?: boolean | null;
        isUnoccupiedAt19990820?: boolean | null;
      };
      if (rr.isMultiUnitHousing972 === null || rr.isMultiUnitHousing972 === undefined)
        return fail(fieldError(`reduction.${r.type}.isMultiUnitHousing972`, `${label} 적용: 공동주택 여부를 선택하세요 (조특법 §97의2①1호 나목).`));
      if (rr.isUnoccupiedAt19990820 === null || rr.isUnoccupiedAt19990820 === undefined)
        return fail(fieldError(`reduction.${r.type}.isUnoccupiedAt19990820`, `${label} 적용: 1999.8.20 현재 입주 사실 여부를 선택하세요 (조특법 §97의2①1호 나목).`,
        ));
    }
    // D1-07 — §97의2①2호(매입임대)도 같은 요건
    if (r.type === "rental_97_2" && (r as { rental972Type?: string }).rental972Type === "purchase") {
      const u = (r as { isUnoccupiedAtAcquisition?: boolean | null }).isUnoccupiedAtAcquisition;
      if (u === null || u === undefined)
        return fail(fieldError(`reduction.${r.type}.isUnoccupiedAtAcquisition`, `${label} 적용: 취득 당시 입주 사실 여부를 선택하세요 (조특법 §97의2①2호).`,
        ));
    }
    // D1-02 — 조특령 §97의2① 주체 요건 (§97의 5호와 다른 조문·다른 숫자)
    if (r.type === "rental_97_2") {
      const u2 = (r as { hasNewRentalPlus2Units?: boolean | null }).hasNewRentalPlus2Units;
      if (u2 === null || u2 === undefined)
        return fail(fieldError(`reduction.${r.type}.hasNewRentalPlus2Units`, `${label} 적용: 신축임대주택 1호 이상을 포함한 2호 이상 임대 여부를 선택하세요 (조특령 §97의2①).`,
        ));
    }
    if (r.type === "rental_97_proviso" && !(r as { provisoCase?: string }).provisoCase)
      return fail(fieldError(`reduction.${r.type}.provisoCase`, `${label} 적용: 단서 유형(건설임대/매입임대/10년 이상)을 선택하세요.`));
    if (r.type === "rental_97_2" && !(r as { rental972Type?: string }).rental972Type)
      return fail(fieldError(`reduction.${r.type}.rental972Type`, `${label} 적용: 건설임대(1호)/매입임대(2호) 유형을 선택하세요.`));
  }
  return null;
}
