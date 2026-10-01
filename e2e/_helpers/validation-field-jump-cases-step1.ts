/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 4 (step1: 보유 상황 나머지)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「step1: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-step1.ts` · `exemption-proviso-validate.ts` · `rental-4ho-proviso.ts` ·
 *       `residence-interval-validate.ts` · `final-house-restart.ts` · `pre-designation-contract-scope.ts`.
 *       한 메시지 = 한 케이스.
 *
 * ## 보유 주택 행(`houses.0`)은 **행 단위 앵커**다
 * 행 편집은 모달이라 입력칸이 닫힌 모달 안(DOM 밖)에 있다. 그래서 오류는 행의 「편집」 버튼(`data-field="houses.N"`)으로
 * 데려다 준다 — 사용자는 거기서 편집을 열어 칸을 채운다. 모달을 자동으로 여는 것은 이동 인프라(`validation-jump.ts`)의 몫이라
 * 이번 Phase에서는 하지 않았다(계획서 §7-4).
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const GANGNAM = "1168010100";

/** 모든 필수값이 찬 보유 주택 행 — 케이스마다 한 칸만 비운다 */
const row = (patch: Record<string, unknown> = {}) => ({
  id: "house_e2e_1",
  region: "capital",
  acquisitionDate: "2020-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionPrice: "",
  exclusiveArea: "",
  isUnsoldNewHouse: false,
  completionDate: "",
  isSpouseOwned: false,
  isCoInherited: false,
  decedentSameHouseholdAtInheritance: false,
  isRankingDisqualifiedInheritedHouse: false,
  ...patch,
});

/** 1세대 · 2채(양도 주택 + 다른 보유 주택 1행) */
const holding = (houses: Record<string, unknown>[], formPatch: Record<string, unknown> = {}, assetPatch: Record<string, unknown> = {}) => () =>
  withPrimary(assetPatch, { isOneHousehold: true, householdHousingCount: "2", houses, ...formPatch });

const rental = (patch: Record<string, unknown>) => row({ isLongTermRental: true, ...patch });
const sa = (patch: Record<string, unknown>) =>
  rental({
    rentalType: "G",
    rentalCancellationDate: "2020-06-01",
    rentalStartOfficialPrice: "300000000",
    acquisitionOfficialPrice: "300000000",
    rentalLandArea: "100",
    rentalTotalFloorArea: "80",
    firstSaleContractDate: "2015-01-01",
    saMokBaseArticle: "가",
    ...patch,
  });

const R = "houses.0";
const HOUSE_ROW_CASES: FieldJumpCase[] = [
  { name: "step1: 보유 주택 취득일", field: R, step: 1, message: /^보유 주택 1: 취득일을 입력하세요/, form: holding([row({ acquisitionDate: "" })]) },
  { name: "step1: 보유 주택 기준시가", field: R, step: 1, message: /^보유 주택 1: 기준시가\(공시가격\)를 입력하세요/, form: holding([row({ officialPrice: "" })]) },
  { name: "step1: 보유 주택 상속개시일", field: R, step: 1, message: /^보유 주택 1: 상속주택이면 상속개시일/, form: holding([row({ isInherited: true, inheritedDate: "" })]) },
  { name: "step1: 보유 주택 임대사업자 등록일", field: R, step: 1, message: /^보유 주택 1: 임대사업자 등록일을 입력하세요/, form: holding([rental({ isRegisteredRental: true, rentalRegistrationDate: "" })]) },
  {
    name: "step1: 보유 주택 사업자 등록일", field: R, step: 1, message: /^보유 주택 1: 사업자 등록일을 입력하세요/,
    form: holding([rental({ isRegisteredRental: true, rentalRegistrationDate: "2018-01-01", businessRegistrationDate: "" })]),
  },
  {
    name: "step1: 보유 주택 임대기간", field: R, step: 1, message: /^보유 주택 1: 임대기간\(년\)을 입력하세요/,
    form: holding([rental({ isRegisteredRental: true, rentalRegistrationDate: "2018-01-01", businessRegistrationDate: "2018-01-01", rentalPeriodYears: "" })]),
  },
  { name: "step1: 보유 주택 임대개시 당시 공시가격", field: R, step: 1, message: /^보유 주택 1: 임대개시 당시 공시가격을 입력하세요/, form: holding([rental({ rentalType: "A", rentalStartOfficialPrice: "" })]) },
  { name: "step1: 보유 주택 취득 당시 공시가격", field: R, step: 1, message: /^보유 주택 1: 취득 당시 공시가격을 입력하세요/, form: holding([rental({ rentalType: "B", acquisitionOfficialPrice: "" })]) },
  {
    name: "step1: 보유 주택 대지면적·연면적", field: R, step: 1, message: /^보유 주택 1: 대지면적·연면적\(㎡\)을 입력하세요/,
    form: holding([rental({ rentalType: "C", rentalStartOfficialPrice: "300000000", rentalLandArea: "", rentalTotalFloorArea: "" })]),
  },
  {
    name: "step1: 보유 주택 최초 분양계약일", field: R, step: 1, message: /^보유 주택 1: 최초 분양계약일을 입력하세요/,
    form: holding([rental({ rentalType: "D", acquisitionOfficialPrice: "300000000", rentalLandArea: "100", rentalTotalFloorArea: "80", firstSaleContractDate: "" })]),
  },
  { name: "step1: 보유 주택 말소일", field: R, step: 1, message: /^보유 주택 1: 자진·자동 말소일을 입력하세요/, form: holding([sa({ rentalCancellationDate: "" })]) },
  { name: "step1: 보유 주택 사목 base 목", field: R, step: 1, message: /^보유 주택 1: 사목 — 말소 전 base 목/, form: holding([sa({ saMokBaseArticle: "" })]) },
  { name: "step1: 보유 주택 사목 임대개시 공시가격", field: R, step: 1, message: /^보유 주택 1: 사목 base 목의 임대개시 당시 공시가격/, form: holding([sa({ saMokBaseArticle: "가", rentalStartOfficialPrice: "" })]) },
  { name: "step1: 보유 주택 사목 라목 취득 당시 공시가격", field: R, step: 1, message: /^보유 주택 1: 사목 base 라목의 취득 당시 공시가격/, form: holding([sa({ saMokBaseArticle: "라", acquisitionOfficialPrice: "" })]) },
  { name: "step1: 보유 주택 사목 면적", field: R, step: 1, message: /^보유 주택 1: 사목 base 목의 대지면적·연면적/, form: holding([sa({ saMokBaseArticle: "다", rentalLandArea: "", rentalTotalFloorArea: "" })]) },
  { name: "step1: 보유 주택 사목 라목 최초 분양계약일", field: R, step: 1, message: /^보유 주택 1: 사목 base 라목의 최초 분양계약일/, form: holding([sa({ saMokBaseArticle: "라", firstSaleContractDate: "" })]) },
  { name: "step1: 보유 주택 부득이 거주기간", field: R, step: 1, message: /^보유 주택 1: 부득이한 사유 주택의 거주기간\(년\)/, form: holding([row({ isUnavoidableReason: true, unavoidableResidenceYears: "", acquisitionOfficialPrice: "300000000" })]) },
  { name: "step1: 보유 주택 조특법 감면 임대주택 임대기간", field: R, step: 1, message: /^보유 주택 1: 조특법 감면 임대주택이면 임대기간/, form: holding([row({ isTaxIncentiveRental: true })]) },
  { name: "step1: 보유 주택 부득이 취득 당시 기준시가", field: R, step: 1, message: /^보유 주택 1: 부득이한 사유 주택의 취득 당시 기준시가/, form: holding([row({ isUnavoidableReason: true, unavoidableResidenceYears: "2", acquisitionOfficialPrice: "" })]) },
];

const SE = "sellingHouseExclusion";
const SELLING_CASES: FieldJumpCase[] = [
  { name: "step1: 양도 주택 사원용 주택 무상 제공 기간", field: `${SE}.freeProvisionYears`, step: 1, message: /^양도 주택 사원용 주택: 무상 제공 기간/, form: holding([row()], { householdHousingCount: "3", [SE]: { isEmployeeHousing: true } }) },
  { name: "step1: 양도 주택 어린이집 운영 기간", field: `${SE}.dayCareOperationYears`, step: 1, message: /^양도 주택 어린이집: 운영 기간/, form: holding([row()], { householdHousingCount: "3", [SE]: { isDayCareCenter: true } }) },
  {
    name: "step1: 양도 주택 부득이한 사유 거주기간", field: `${SE}.unavoidableResidenceYears`, step: 1, message: /^양도 주택 부득이한 사유: 거주기간/,
    form: holding([row()], { [SE]: { isUnavoidableReason: true, acquisitionOfficialPrice: "300000000" } }),
  },
  {
    name: "step1: 양도 주택 부득이한 사유 취득 당시 기준시가", field: `${SE}.acquisitionOfficialPrice`, step: 1, message: /^양도 주택 부득이한 사유: 취득 당시 기준시가/,
    form: holding([row()], { [SE]: { isUnavoidableReason: true, unavoidableResidenceYears: "2" } }),
  },
  {
    name: "step1: 양도 주택 조특법 감면 임대주택 임대기간", field: `${SE}.taxIncentiveRentalYears`, step: 1, message: /^양도 주택 조특법 감면 임대주택: 임대기간/,
    form: holding([row()], { [SE]: { taxIncentiveRental: { isTaxIncentiveRental: true } } }),
  },
  {
    name: "step1: 공고 전 매매계약 체결일", field: `${SE}.saleContractDate`, step: 1, message: /^양도 주택 공고 전 매매계약: 양도 매매계약 체결일/,
    form: holding([row()], { transferDate: "2018-09-01", filingDate: "2018-11-30", [SE]: { saleDepositReceived: true } }, { regionCode: GANGNAM }),
  },
  {
    name: "step1: 공고 전 매매계약 체결일 (양도일보다 늦음)", field: `${SE}.saleContractDate`, step: 1, message: /^양도 주택 공고 전 매매계약: 매매계약 체결일은 양도일보다/,
    form: holding([row()], { transferDate: "2018-09-01", filingDate: "2018-11-30", [SE]: { saleDepositReceived: true, saleContractDate: "2018-12-01" } }, { regionCode: GANGNAM }),
  },
];

/** 1세대1주택(1채) — §154① 단서 카드가 열리는 맥락 */
const proviso = (formPatch: Record<string, unknown>) => () => withPrimary({}, { isOneHousehold: true, householdHousingCount: "1", ...formPatch });
const rental4ho = (formPatch: Record<string, unknown>) =>
  proviso({
    provisoReason: "rental_registration_4ho",
    proviso4hoBusinessRegDate: "2019-06-01",
    proviso4hoRentalRegDate: "2019-06-01",
    proviso4hoRegulatedOneHouse: "yes",
    proviso4hoStatus: "auto_cancelled",
    ...formPatch,
  });
const P4 = /^§154① 단서\(4호 임대사업자 등록\): /;
const reEsc = (s: string) => new RegExp(`^§154① 단서\\(4호 임대사업자 등록\\): ${s}`);
void P4;

const INHERIT_CASES: FieldJumpCase[] = [
  {
    name: "step1: 피상속인 증여일", field: "generalHouseGiftDate", step: 1, message: /^피상속인으로부터 증여받은 날을 입력하세요/,
    form: holding([row({ isInherited: true, inheritedDate: "2010-01-01" })], { generalHouseGiftedFromDecedentWithin2yr: true, generalHouseGiftDate: "" }),
  },
  {
    name: "step1: 상속개시 후 취득 경위", field: "generalHouseRightAtInheritance", step: 1, message: /^양도 주택을 상속개시 후 취득했습니다/,
    form: holding([row({ isInherited: true, inheritedDate: "2010-01-01" })], { generalHouseRightAtInheritance: "" }),
  },
];

const PROVISO_CASES: FieldJumpCase[] = [
  { name: "step1: 단서 출국일", field: "provisoDepartureDate", step: 1, message: /^§154① 단서\(해외이주·국외거주\): 출국일/, form: proviso({ provisoReason: "overseas_migration", provisoDepartureDate: "" }) },
  { name: "step1: 단서 수용일", field: "provisoExpropriationDate", step: 1, message: /^§154① 단서\(공익사업 수용\): 수용일/, form: proviso({ provisoReason: "expropriation", provisoExpropriationDate: "" }) },
  { name: "step1: 단서 계약금 지급일 무주택", field: "provisoPreContractNoHouse", step: 1, message: /^§154① 단서\(조정 공고 전 계약\)/, form: proviso({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: false }) },
  { name: "step1: 4호 사업자등록 신청일", field: "proviso4hoBusinessRegDate", step: 1, message: reEsc("사업자등록 신청일을 입력하세요"), form: rental4ho({ proviso4hoBusinessRegDate: "" }) },
  { name: "step1: 4호 임대사업자 등록 신청일", field: "proviso4hoRentalRegDate", step: 1, message: reEsc("임대사업자 등록 신청일을 입력하세요"), form: rental4ho({ proviso4hoRentalRegDate: "" }) },
  { name: "step1: 4호 등록 신청일 양도일 이후", field: "proviso4hoBusinessRegDate", step: 1, message: reEsc("등록 신청일은 양도일 이전"), form: rental4ho({ proviso4hoBusinessRegDate: "2025-01-01" }) },
  { name: "step1: 4호 신청 당시 1주택", field: "proviso4hoRegulatedOneHouse", step: 1, message: reEsc("신청 당시 세대가 조정대상지역 1주택만"), form: rental4ho({ proviso4hoRegulatedOneHouse: "" }) },
  { name: "step1: 4호 등록 상태", field: "proviso4hoStatus", step: 1, message: reEsc("양도일 현재 임대사업자 등록 상태"), form: rental4ho({ proviso4hoStatus: "" }) },
  { name: "step1: 4호 임대의무기간 중 양도", field: "proviso4hoDuringMandatory", step: 1, message: reEsc("임대의무기간 중 양도인지"), form: rental4ho({ proviso4hoStatus: "maintained", proviso4hoDuringMandatory: "", proviso4hoRentOver5: "no" }) },
  { name: "step1: 4호 임대료 5% 초과", field: "proviso4hoRentOver5", step: 1, message: reEsc("임대료 연 5% 초과 증액 여부"), form: rental4ho({ proviso4hoStatus: "maintained", proviso4hoDuringMandatory: "no", proviso4hoRentOver5: "" }) },
  { name: "step1: 4호 증액 계약일", field: "proviso4hoRentOver5ContractDate", step: 1, message: reEsc("5% 초과 증액 계약의 체결·갱신일을 입력"), form: rental4ho({ proviso4hoStatus: "maintained", proviso4hoDuringMandatory: "no", proviso4hoRentOver5: "yes", proviso4hoRentOver5ContractDate: "" }) },
  { name: "step1: 4호 증액 계약일 양도일 이후", field: "proviso4hoRentOver5ContractDate", step: 1, message: reEsc("증액 계약의 체결·갱신일은 양도일 이전"), form: rental4ho({ proviso4hoStatus: "maintained", proviso4hoDuringMandatory: "no", proviso4hoRentOver5: "yes", proviso4hoRentOver5ContractDate: "2025-01-01" }) },
];

/** 2021.1.1.~2022.5.9. 양도 · 1세대1주택 — §154⑤ 단서 카드가 열리는 맥락 */
const FH = "finalHouseRestartDisposals";
const finalHouse = (disposals: Record<string, unknown>[]) => () =>
  withPrimary({}, {
    transferDate: "2021-06-01",
    filingDate: "2021-08-31",
    isOneHousehold: true,
    householdHousingCount: "1",
    finalHouseRestartHistory: "yes",
    finalHouseRestartDisposals: disposals,
  });
const disposal = (patch: Record<string, unknown>) => ({ id: "fhr_e2e_1", kind: "transfer", date: "2020-01-01", temporaryTwoHouse: "no", ...patch });
const FINAL_CASES: FieldJumpCase[] = [
  { name: "step1: 최종 1주택 처분 주택 없음", field: FH, step: 1, message: /^§154⑤ 단서\(최종 1주택 재기산\): 처분한 다른 주택을 1건 이상/, form: finalHouse([]) },
  { name: "step1: 최종 1주택 처분 유형", field: `${FH}.0.kind`, step: 1, message: /^§154⑤ 단서\(최종 1주택 재기산\): 1번째 처분의 유형/, form: finalHouse([disposal({ kind: "" })]) },
  { name: "step1: 최종 1주택 처분일", field: `${FH}.0.date`, step: 1, message: /^§154⑤ 단서\(최종 1주택 재기산\): 1번째 처분의 처분일을 입력/, form: finalHouse([disposal({ date: "" })]) },
  { name: "step1: 최종 1주택 처분일 양도일 이후", field: `${FH}.0.date`, step: 1, message: /^§154⑤ 단서\(최종 1주택 재기산\): 1번째 처분의 처분일은 이 주택 양도일 이전/, form: finalHouse([disposal({ date: "2021-12-01" })]) },
  { name: "step1: 최종 1주택 일시적 2주택 관계", field: `${FH}.0.temporaryTwoHouse`, step: 1, message: /^§154⑤ 단서\(최종 1주택 재기산\): 1번째 처분이 이 주택과 일시적 2주택/, form: finalHouse([disposal({ temporaryTwoHouse: "" })]) },
];

const interval = (periods: { moveInDate: string; moveOutDate: string }[]) => () =>
  withPrimary({ residenceInputMode: "interval", residencePeriods: periods }, { isOneHousehold: true, householdHousingCount: "1" });
const RP = "residencePeriods";
const RESIDENCE_CASES: FieldJumpCase[] = [
  { name: "step1: 거주 구간 입주일", field: `${RP}.0.moveInDate`, step: 1, message: /^거주 구간 #1: 입주일을 입력하세요/, form: interval([{ moveInDate: "", moveOutDate: "" }]) },
  { name: "step1: 거주 구간 퇴거일", field: `${RP}.0.moveOutDate`, step: 1, message: /^거주 구간 #1: 퇴거일을 입력하세요/, form: interval([{ moveInDate: "2016-01-01", moveOutDate: "" }]) },
  { name: "step1: 거주 구간 퇴거일이 입주일보다 빠름", field: `${RP}.0.moveOutDate`, step: 1, message: /^거주 구간 #1: 퇴거일은 입주일보다 이후/, form: interval([{ moveInDate: "2018-01-01", moveOutDate: "2017-01-01" }]) },
  { name: "step1: 거주 구간 입주일이 취득일보다 빠름", field: `${RP}.0.moveInDate`, step: 1, message: /^거주 구간 #1: 입주일이 취득일/, form: interval([{ moveInDate: "2014-01-01", moveOutDate: "2016-01-01" }]) },
  { name: "step1: 거주 구간 입주일이 양도일 이후", field: `${RP}.0.moveInDate`, step: 1, message: /^거주 구간 #1: 입주일은 양도일 이전/, form: interval([{ moveInDate: "2025-01-01", moveOutDate: "2026-01-01" }]) },
  { name: "step1: 거주 구간 퇴거일이 양도일 이후", field: `${RP}.0.moveOutDate`, step: 1, message: /^거주 구간 #1: 퇴거일은 양도일 이전/, form: interval([{ moveInDate: "2020-01-01", moveOutDate: "2025-01-01" }]) },
  {
    name: "step1: 거주 구간 겹침", field: `${RP}.1.moveInDate`, step: 1, message: /^거주 구간 #1\(퇴거 2019-01-01\)과 #2\(입주 2018-01-01\)이 겹칩니다/,
    form: interval([{ moveInDate: "2016-01-01", moveOutDate: "2019-01-01" }, { moveInDate: "2018-01-01", moveOutDate: "2020-01-01" }]),
  },
  {
    name: "step1: 승계조합원 신축주택 거주 개월 수 초과", field: "residencePeriodMonthsAsset", step: 1, message: /^거주기간: 승계조합원 신축주택 거주기간 99개월/,
    form: () =>
      withPrimary(
        { assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "yes", redevCompletionDate: "2022-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "99" },
        { isOneHousehold: true, householdHousingCount: "1" },
      ),
  },
];

export const STEP1_FIELD_JUMP_CASES: FieldJumpCase[] = [
  ...HOUSE_ROW_CASES,
  ...SELLING_CASES,
  ...INHERIT_CASES,
  ...PROVISO_CASES,
  ...FINAL_CASES,
  ...RESIDENCE_CASES,
];
