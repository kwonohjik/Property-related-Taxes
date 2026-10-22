/**
 * 양도세 ⑧ — **다주택 중과 축** 입력 검증 leaf (다주택 중과 판정 메뉴 P2 · 계획서 §5.9).
 *
 * 계산기 1단계(`transfer-tax-validate-step1.ts`)에서 그대로 옮겼다 — 로직·문구·순서 불변. 다주택 중과 판정 메뉴의 ⑧이
 * 같은 규칙을 다시 적지 않고 이 leaf를 부르기 위해서다(두 ⑧이 손으로 적은 사본을 따로 두면 한쪽만 갈라진다 — S09-1).
 *
 * - `houseRowSurchargeAxisIssue` — 명부 행의 중과 축 첫 오류(상속 5년 기산일·장기임대·3호·⑪·부득이·4호·8호의2·3호/7호 기산·§155⑧).
 *   호출부의 「행별 첫 오류 1건」 사슬 **가운데**에 끼운다 — 앞뒤 검사(취득일·기준시가 / 사실 답·합가·배우자 보유)는 호출부 몫이다.
 * - `collectSellingHouseSurchargeIssues` — 양도 주택 자체 중과배제 특례(§167의3①·§167의10①) + 공고 전 매매계약(11호).
 * - `collectGracePeriodIssues` — 한시 유예(§167의3①12의2 나·다목).
 *
 * 반환값에 `step`은 없다 — 호출부 단계에 붙인다. 파일 이름이 `transfer-tax-validate*`인 것은 앵커 커버리지 게이트
 * (`transfer-validation-field-anchor-coverage.test.ts`)가 이 이름으로 검증 키를 모으기 때문이다.
 */
import { gracePeriodInScope } from "@/lib/calc/grace-period-scope";
import { collectPreDesignationContractErrors } from "./pre-designation-contract-scope";
import {
  effectiveSellingTaxIncentiveRental,
  taxIncentiveAptDeadlineIncomplete,
  taxIncentiveRentalPeriodMissing,
} from "./tax-incentive-rental-scope";
import { aptDeadlineExtensionIncomplete, rentalDeclarationAptDeadlineInScope } from "./apt-deadline-extension-scope";
import type { HouseEntry, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { twoHouseExclusionStatusIssue } from "./two-house-exclusion-status";
import { houseRentalTypeIssue } from "./house-row-required-issues";
import { houseUnavoidableIssue } from "./house-row-required-issues";
import { houseSpecialUseIssue } from "./house-row-required-issues";
import { dayCareUsageStatusIssue } from "./daycare-usage-status";
import { houseUnavoidableOutsideCapitalIssue } from "./house-row-required-issues";
import { duplicateUnavoidableOutsideCapitalMessage } from "./house-row-required-issues";

type SurchargeIssue = Omit<ValidationIssue, "step">;

/**
 * 명부 행의 중과 축 첫 오류 문구(`label: …`) 또는 null.
 *
 * @param uocFirst §155⑧ 「각각 1개씩」 — 이 행이 둘째 이후 ⑧ 행이면 첫 ⑧ 행의 인덱스(`duplicateOwnedUnavoidableOutsideCapitalRows`)
 */
export function houseRowSurchargeAxisIssue(
  h: HouseEntry,
  label: string,
  transferDate: string | undefined,
  uocFirst: number | undefined,
): string | null {
  // 상속주택 5년 배제는 상속개시일이 있어야 기산 (소령 §167의3①7호) — 미입력 시 배제 미발동 → 차단
  if (h.isInherited && !h.inheritedDate)
    return `${label}: 상속주택이면 상속개시일을 입력하세요. (상속 5년 중과배제 판정 기준)`;
  // 장기임대 등록 경로: 등록사업자 선택 시 등록일 2종·임대기간 필수
  if (h.isLongTermRental && h.isRegisteredRental) {
    if (!h.rentalRegistrationDate) return `${label}: 임대사업자 등록일을 입력하세요.`;
    if (!h.businessRegistrationDate) return `${label}: 사업자 등록일을 입력하세요.`;
    if (!h.rentalPeriodYears || parseFloat(h.rentalPeriodYears) <= 0)
      return `${label}: 임대기간(년)을 입력하세요.`;
  }
  // 장기임대 9유형: 유형별 필수 입력값(가액·면적·날짜) — 미입력 시 엔진 오판정
  // (특히 면적 미입력 → 엔진 0 간주 → 298㎡ 이하 통과 → 과대 적용). 판정 메뉴 ⑧과 **같은 leaf**(S09-1).
  const rentalTypeIssue = houseRentalTypeIssue(h);
  if (rentalTypeIssue) return `${label}: ${rentalTypeIssue.message}`;
  // §167의3①3호 감면대상장기임대주택 — 「5년 이상 임대」 판정 칸. 미입력이면 엔진이 0년으로 읽어 조용히 불적용.
  if (taxIncentiveRentalPeriodMissing(h))
    return `${label}: 조특법 감면 임대주택이면 임대기간(년)을 입력하세요.`;
  // §167의3⑪ 「연장 사유 있음」 입력이 덜 됐다(사실 없음 · 3호 이전고시 상태 없음) — 그대로면 선택이 조용히 사라지거나
  // 3호 기한을 정할 수 없다. 2호는 ⑤·④와 같은 범위 술어 안에서만, 3호는 ⑤가 칸을 여는 후단 대상에서만.
  const ext2Issue = rentalDeclarationAptDeadlineInScope(h) ? aptDeadlineExtensionIncomplete(h.rentalAptDeadlineExtension) : null;
  if (ext2Issue) return `${label}: 장기임대 아파트 양도기한 연장 사유(소령 §167의3⑪) — ${ext2Issue}`;
  const ext3Issue = taxIncentiveAptDeadlineIncomplete(h);
  if (ext3Issue) return `${label}: 조특법 감면 임대주택 양도기한 연장 사유(소령 §167의3⑪) — ${ext3Issue}`;
  // P2 부득이한 사유: 거주기간(년)·취득 당시 기준시가 필수 — 판정 메뉴 ⑧과 **같은 leaf**(S09-1).
  const unavoidableIssue = houseUnavoidableIssue(h);
  if (unavoidableIssue) return `${label}: ${unavoidableIssue.message}`;
  // D7 §167의3①4호·8호의2 — 기간(년)·어린이집 사용 상태(판정 메뉴 ⑧과 같은 leaf · ⑫ 거울).
  const specialUseIssue = houseSpecialUseIssue(h);
  if (specialUseIssue) return `${label}: ${specialUseIssue.message}`;
  // §167의10①3호·7호 기산 상태 — 날짜 또는 「양도일 현재 미해소·진행 중」 택일(⑫ 거울 · 빈 값 = 「모름」 차단)
  const statusIssue = twoHouseExclusionStatusIssue(h);
  if (statusIssue) return `${label}: ${statusIssue.message}`;
  // §155⑧ 사유 해소일 ↔ 「양도일 현재 미해소」 택일(#31) — 판정 메뉴 ⑧과 같은 leaf.
  const uocIssue = houseUnavoidableOutsideCapitalIssue(h, transferDate);
  if (uocIssue) return `${label}: ${uocIssue.message}`;
  if (uocFirst !== undefined)
    return `${label}: ${duplicateUnavoidableOutsideCapitalMessage(`보유 주택 ${uocFirst + 1}`)}`;
  return null;
}

/** 양도 주택 자체 중과배제 특례(2주택 이상)·공고 전 매매계약 — 화면 순서대로. */
export function collectSellingHouseSurchargeIssues(form: TransferFormData): SurchargeIssue[] {
  const out: SurchargeIssue[] = [];
  // ⑧ 양도 주택 자체 배제 특례(2주택 이상) — 사원주택/어린이집 선택 시 기간(년) 필수
  const se = form.sellingHouseExclusion;
  if (se?.isEmployeeHousing && (!se.freeProvisionYears || parseFloat(se.freeProvisionYears) <= 0))
    out.push({ field: "sellingHouseExclusion.freeProvisionYears", message: "양도 주택 사원용 주택: 무상 제공 기간(년)을 입력하세요." });
  if (se?.isDayCareCenter && (!se.dayCareOperationYears || parseFloat(se.dayCareOperationYears) <= 0))
    out.push({ field: "sellingHouseExclusion.dayCareOperationYears", message: "양도 주택 어린이집: 운영 기간(년)을 입력하세요." });
  // ⑧ 8호의2 사용 상태 — 종료일 또는 「양도일 현재 사용 중」 택일(⑫ 거울 · 빈 값 = 「모름」 차단)
  const sellDayCareIssue = se ? dayCareUsageStatusIssue(se) : null;
  if (sellDayCareIssue)
    out.push({ field: "sellingHouseExclusion.dayCareEndDate", message: `양도 주택 ${sellDayCareIssue.message}` });

  // ⑧ 양도 주택 §167의3①3호 — 2호 선언이 켜져 있으면 그 칸의 임대기간을 함께 쓴다(⑤·④와 같은 유효 사실).
  if (taxIncentiveRentalPeriodMissing(effectiveSellingTaxIncentiveRental(se)))
    out.push({ field: "sellingHouseExclusion.taxIncentiveRentalYears", message: "양도 주택 조특법 감면 임대주택: 임대기간(년)을 입력하세요." });
  // ⑧ 양도 주택 §167의3⑪ 「연장 사유 있음」 입력 미완 — 2호·3호 각자의 범위 술어(⑤·④와 같음)
  const sell2Issue = rentalDeclarationAptDeadlineInScope(se?.longTermRental)
    ? aptDeadlineExtensionIncomplete(se?.longTermRental?.rentalAptDeadlineExtension)
    : null;
  if (sell2Issue)
    out.push({ message: `양도 주택 장기임대 아파트: 양도기한 연장 사유(소령 §167의3⑪) — ${sell2Issue}` });
  const sell3Issue = taxIncentiveAptDeadlineIncomplete(effectiveSellingTaxIncentiveRental(se));
  if (sell3Issue)
    out.push({ message: `양도 주택 조특법 감면 임대주택: 양도기한 연장 사유(소령 §167의3⑪) — ${sell3Issue}` });

  // ⑧ 양도 주택 2주택 전용 배제 — §167의10①3호(F-16). 「다른 보유 주택」 행과 같은 요구다.
  //    3호·7호 기산 상태는 날짜 또는 「양도일 현재 미해소·진행 중」 택일이다 — 종전에는 7호 날짜 미입력을
  //    「진행 중」으로 읽어 요구하지 않았는데, 같은 빈 값에 「모름」이 겹쳤다(사용자 결정 2026-10-04).
  if (se?.isUnavoidableReason) {
    if (!se.unavoidableResidenceYears || parseFloat(se.unavoidableResidenceYears) <= 0)
      out.push({ field: "sellingHouseExclusion.unavoidableResidenceYears", message: "양도 주택 부득이한 사유: 거주기간(년)을 입력하세요." });
    if (!se.acquisitionOfficialPrice)
      out.push({ field: "sellingHouseExclusion.acquisitionOfficialPrice", message: "양도 주택 부득이한 사유: 취득 당시 기준시가를 입력하세요." });
  }
  const sellStatusIssue = se ? twoHouseExclusionStatusIssue(se) : null;
  if (sellStatusIssue?.field === "unavoidableReasonResolvedDate")
    out.push({ field: "sellingHouseExclusion.unavoidableReasonResolvedDate", message: `양도 주택 ${sellStatusIssue.message}` });
  else if (sellStatusIssue)
    out.push({ field: "sellingHouseExclusion.litigationAcquisitionDate", message: `양도 주택 ${sellStatusIssue.message}` });
  // ⑧ 공고 전 매매계약(영 §167의10①11호 등) — ⑤·④와 같은 범위 술어(`pre-designation-contract-scope.ts`).
  for (const message of collectPreDesignationContractErrors(form)) out.push({ message });
  return out;
}

export function collectGracePeriodIssues(form: TransferFormData): SurchargeIssue[] {
  const out: SurchargeIssue[] = [];
  /**
   * ⑧ 다주택 중과 한시 유예(§167의3①12의2 나·다목) — 입력(ON) 시 목별 필수 입력.
   * houses 0건이면 엔진이 gracePeriod를 소비하지 않고 위젯도 숨김 → 검증도 houses>0 게이트(보이지 않는 필드 차단 방지).
   * 허가·계약금 증빙 미확인은 silent 차단이 아닌 "경과조치 부적용으로 계산 진행"(원문 "모두 갖춘" 요건 —
   * 엔진 checkGracePeriodExemption이 미충족 시 자동으로 suspended:false 처리·차단 대상 아님).
   *
   * ⚠️ **한시배제 창 안에서는 건너뛴다** — 계산기 ⑧의 명부·분양권 검증과 달리 이 축만은 여전히
   * 중과 전용이고 창 안에서 **증명 가능한 no-op**이다(`checkGracePeriodExemption`의 가목 우선
   * 게이트가 `gracePeriod` 내용과 무관하게 `suspended: true`를 낸다). ⑤도 같은 조건으로
   * `HousesListSection hideGracePeriod`가 위젯을 닫으므로 짝이 맞는다.
   */
  // 술어는 ⑤ 위젯·④ 전송과 **같은 함수**다 (Q03). 종전에는 여기만 `houses.length > 0`이라
  // 「분양권·입주권만 있는 세대」에서 검증이 빠졌고, 그 상태로 ④가 보내 ⑫ Zod가 400을 냈다.
  if (gracePeriodInScope(form) && form.gracePeriod) {
    if (!form.gracePeriod.contractDate)
      out.push({ field: "gracePeriod.contractDate", message: "중과 한시 유예: 매매계약 체결일을 입력하세요." });
    if (form.gracePeriod.isLandPermitTarget === true && !form.gracePeriod.permitApplicationDate)
      out.push({ field: "gracePeriod.permitApplicationDate", message: "중과 한시 유예(나목): 토지거래허가 신청일을 입력하세요." });
  }
  return out;
}
