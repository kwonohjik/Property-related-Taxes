/**
 * 양도세 마법사 **폼 타입** — `TransferFormData`.
 *
 * `calc-wizard-store.ts`에서 분리했다(800줄 정책). 그 파일은 **초기값·스토어·요약 계산**을 맡고,
 * 여기는 선언만 둔다(로직 없음 — CLAUDE.md의 「타입 전용 파일」 층위).
 *
 * 종전 import 경로 호환을 위해 `calc-wizard-store.ts`가 재export한다.
 */
import type {
  AssetForm,
  HouseEntry,
  RentalDeclaration,
  PresaleRightEntry,
  PriorReductionUsageItem,
  SpecialHouseExclusionFormItem,
} from "./calc-wizard-asset";
import type { TaxIncentiveRentalFacts } from "./calc-wizard-asset-nbl";
import type { OneHouseJudgmentExtraFields } from "./one-house-extra-fields.types";

/** §154⑤ 단서 처분 이력 1행(OH-22). 3-state 칸은 `""` = 미선택. */
export interface FinalHouseDisposalRow {
  id: string;
  /** 양도 · 증여 · 용도변경 · 그 밖(멸실 등 — 처분이 아니다) */
  kind: "" | "transfer" | "gift" | "conversion" | "other";
  /** 처분일 YYYY-MM-DD */
  date: string;
  /** 처분 당시 이 주택과 일시적 2주택(§155·§155의2·§156의2·§156의3) 관계였는가 */
  temporaryTwoHouse: "" | "yes" | "no";
}

export interface TransferFormData {
  // ── Step 1: 자산 목록 + 양도 기본 정보 ──
  /** 모든 양도 자산 (최소 1건). assets[0]이 대표 자산. */
  assets: AssetForm[];
  /** 계약서 단위 총 양도가액 (모든 자산 합계) */
  contractTotalPrice: string;
  /**
   * 폼-수준 총 양도비 (지분 모드 자동 안분용, 선택).
   * 양도 시 1회 발생하는 부대비용(중개수수료·인지대 등)을 한 번만 입력.
   * 지분 모드에서 시스템이 자산별 ratio 비율로 자동 안분 (assets[i].transferExpense 우선 — 자산별 직접 입력이 있으면 우선).
   * 단독 소유는 자산-수준 transferExpense 그대로 사용.
   */
  totalTransferExpense: string;
  /**
   * 일괄양도 양도가액 결정 모드 (계약서 단위 단일 결정).
   * - "actual": 계약서에 자산별 가액이 구분 기재된 경우 (§166⑥ 본문)
   * - "apportioned": 구분 불분명 → 기준시가 비율 안분 (§166⑥ 단서)
   */
  bundledSaleMode: "actual" | "apportioned";
  /** 양도일 (YYYY-MM-DD) */
  transferDate: string;
  /** 양도소득세 신고일 (YYYY-MM-DD) */
  filingDate: string;

  // ── Step 2 (구 Step3 잔여): 대표 자산 고급 취득 정보 ──
  /**
   * @deprecated 자산-수준 `useEstimatedAcquisition`/`isAppraisalAcquisition`로 대체됨(2026-04-25).
   *
   * **읽지 말 것** — `defaultFormData`(calc-wizard-store.ts:56)에서 `"actual"`로 한 번 정해진 뒤
   * 갱신하는 코드가 0건이다(「동기화」한다는 종전 서술은 사실이 아니었다).
   * 필드를 남겨 두는 것은 구 스키마 sessionStorage를 `migrateLegacyForm`이 읽기 위해서다
   * (calc-wizard-migration.ts:93 — 구 폼의 `"appraisal"` → `assets[0].isAppraisalAcquisition`).
   */
  acquisitionMethod: "actual" | "estimated" | "appraisal";
  appraisalValue: string;
  isSelfBuilt: boolean;
  buildingType: "new" | "extension" | "";
  constructionDate: string;
  extensionFloorArea: string;
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";

  // ── Step 3 (구 Step4): 보유 상황 (세대·납세자 단위) ──
  isOneHousehold: boolean;
  householdHousingCount: string;
  /**
   * 「세대 보유 주택이 양도 주택뿐이고 다른 주택이 없습니다」 확정(Q-5, #1919 선례와 같은 모양).
   *
   * 명부 필수화(PR-1, `docs/00-pm/merge-composition-unknown-unfavorable.plan.md`) — 주택 양도에서
   * 세대 주택 수는 **명부에서 도출**한다(1 + 명부 행 수). 명부가 0행이면 「1채뿐」인지 「입력을
   * 안 했을 뿐」인지 코드로 구별할 수 없어(자동 안분 fallback 금지와 같은 층위) 이 확정이 필요하다.
   *
   * - `false`(기본값) — 미확정. 주택 양도 + 명부 0행 + legacy 표식 없음이면 ⑧이 차단한다.
   * - `true` — 확정. 명부에 행을 추가하면 onChange에서 **다시 false로 해제**한다(#1919 패턴).
   *
   * ⚠️ 엔진은 이 필드를 모른다 — 도출값(항상 1 + 명부 행 수)에 영향을 주지 않는 UI·validate 전용
   *    게이트다. 0행이면 확정 여부와 무관하게 1채로 계산된다.
   */
  householdNoOtherHousesConfirmed: boolean;
  /**
   * 「세대가 보유한 분양권·입주권이 없습니다」 확정 (PR-D, Q-17 — 위 `householdNoOtherHousesConfirmed`
   * · #1919와 같은 모양).
   *
   * 명부 필수화 확장(`docs/00-pm/roster-required-other-assets.plan.md` §4-5·§4-6) — 주택(겸용 포함)·
   * 재개발APT·조합원입주권 양도에서 세대 보유 분양권·입주권 목록(`presaleRights`)이 비어 있으면
   * 「입력을 안 했을 뿐」과 「정말 없음」을 코드로 구별할 수 없다. 위 주택 확정과 **합치지 않는다** —
   * 주택은 있고 분양권·입주권은 없는 세대가 흔하다(Q-17).
   *
   * - `false`(기본값) — 미확정. 대상 자산(`requiresPresaleRightsConfirmation`) + 목록 0행이면
   *   ⑧이 차단한다.
   * - `true` — 확정. 목록에 행이 생기면 추가 즉시 다시 false로 해제한다(#1919 패턴).
   *
   * 분양권 **자신**의 양도(`presale_right`)는 대상 아님(Q-11) — ⑧이 이 자산에서는 요구하지 않는다.
   */
  householdNoPresaleRightsConfirmed: boolean;
  /**
   * OH-34 레거시 표식 — **저장 당시 스칼라가 명부와 어긋난 이력**을 복원했을 때 켜진다.
   *
   * 켜져 있으면 ④·⑧이 `householdHousingCount`(저장 당시 값)로 계산한다 — P7-2 이후
   * 비과세·장특 표2 판정도 명부를 쓰게 바뀌어, 그대로 재계산하면 세액이 달라지기 때문이다
   * (계획서 OH-33·OH-34 「기존 이력 세액 보존」).
   *
   * 끄는 경로는 **「명부 기준으로 전환」 버튼 하나뿐**이다. 명부를 편집해도 꺼지지 않는다
   * (`housesPatchWithDerivedCount`가 이 표식을 보고 스칼라 동기화를 건너뛴다) — 보완하는
   * 도중에 저장 당시 값이 덮이면 「전환할 때만 명부로 센다」는 약속이 깨진다.
   *
   * ⚠️ 새 계산에는 **생기지 않는다**. 명부를 편집하면 스칼라가 함께 갱신돼 애초에 어긋나지 않는다.
   * ⚠️ 엔진은 이 필드를 모른다 — ④가 도출값만 싣는다(UI·변환 층 메타).
   */
  legacyHouseCountPrecedence?: boolean;
  /**
   * 세대 보유 조합원입주권 수 (양도일 현재).
   * §89①4호 가목 1세대1입주권 비과세 판단 — "1" 고정 (사례 36).
   * right_to_move_in 자산 유형에서만 의미. 기본값 "0".
   */
  householdRightCount: string;
  residencePeriodMonths: string;
  isRegulatedArea: boolean;
  wasRegulatedAtAcquisition: boolean;
  /** 조정대상지역 토글 수동 조작 여부 (UI 전용 — API 미전송). true면 자동판별 결과를 재반영하지 않음 */
  isRegulatedAreaTouched: boolean;
  wasRegulatedAtAcquisitionTouched: boolean;
  /**
   * §104①4호 단서(영 §167의6 1호) 확인 — 양도 당시 세대가 **다른** 분양권(주택의 입주자로
   * 선정된 지위)을 보유하지 않습니다. `presale_right` 자산 + 2018.1.1~2021.5.31 양도 +
   * 조정대상지역 + 「세대 보유 주택 수 0채」조합에서만 의미가 있다(별건 5, 계획서 §4-4).
   *
   * - `false`(기본값) — 미확인. §104①4호 50% 단일세율이 그대로 적용된다(모름 = 혜택 불성립).
   * - `true` — 확인. 아래 `presaleRightAgeOrSpouseMet`과 「세대 보유 주택 수 0채」가 함께
   *   확인돼야 비로소 단서가 성립한다.
   */
  presaleRightNoOtherRight: boolean;
  /**
   * §104①4호 단서(영 §167의6 2호) 확인 — 양도자가 30세 이상이거나 배우자가 있습니다
   * (미성년자는 제외하며, 배우자가 사망·이혼한 경우를 포함한다). 위 `presaleRightNoOtherRight`와 짝.
   */
  presaleRightAgeOrSpouseMet: boolean;
  /** 양도 자산 법정동코드(10자리 — AddressSearch PNU 앞10). 제공 시 정밀 판정, 미제공 시 boolean fallback */
  regionCode?: string;
  isUnregistered: boolean;
  temporaryTwoHouseSpecial: boolean;
  // 종전주택 취득일은 별도 필드를 두지 않고 양도 자산(assets[0])의 acquisitionDate를 단일소스로 사용(§155① 종전주택 = 양도주택).
  newHouseAcquisitionDate: string;
  /** §155⑯ 공공기관·법인 지방이전 — 처분기한 3년→5년 + 1년 요건 면제 (효과 둘) */
  publicInstitutionRelocation: boolean;
  /** §155⑯ 이전한 기관 소재지 지번주소 (연접 판정용) */
  relocatedInstitutionJibun: string;
  /** §155⑯ 이전한 기관 시·군 코드 (행안부 10자리) */
  relocatedSigunguCode: string;
  /** §155⑯ 신규주택 소재지 지번주소 */
  newHouseJibun: string;
  /** §155⑯ 신규주택 시·군 코드 (행안부 10자리) */
  newHouseSigunguCode: string;
  // ── §155①2호 조정대상지역 일시적 2주택 (OH-01 A2b) — 판정 메뉴 ③에서 입력, 계산기는 넘겨받아 싣는다 ──
  /** 신규 주택 취득 당시 신규 주택이 조정대상지역이었나 — ""(미선택)|"yes"|"no". 명부 행 주소가 있으면 쓰지 않는다 */
  newHouseRegulatedAtAcquisition: string;
  /** 신규 주택 취득 당시 종전(양도) 주택이 조정대상지역이었나 — ""|"yes"|"no". 양도주택 주소가 있으면 쓰지 않는다 */
  prevHouseRegulatedAtNewAcquisition: string;
  /** 신규 주택 매매계약 체결·계약금 지급일 (YYYY-MM-DD) — 부칙 경과조치·공고 전 계약 제외 */
  newHouseContractDate: string;
  /** §155①2호 가목 — 신규 주택으로 세대전원 이사·전입신고를 마친 날 (YYYY-MM-DD) */
  newHouseMoveInDate: string;
  /** §155①2호 단서 — 신규 주택 취득일 현재 기존 임차인이 거주했는가 */
  newHouseExistingTenant: boolean;
  /** §155①2호 단서 — 전 소유자와 기존 임차인 사이 임대차계약 종료일 (YYYY-MM-DD) */
  newHouseTenantLeaseEndDate: string;
  /** §155⑧ 수도권 밖 부득이 주택 보유 여부 — 양도 대상은 **일반주택**이다 */
  unavoidableOutsideCapitalSpecial: boolean;
  /** §155⑧ 부득이한 사유 ("study"|"work"|"illness"|"other") */
  unavoidableOutsideCapitalReason: string;
  /** §155⑧ 사유 해소일 (YYYY-MM-DD). "" = 미해소 → 3년 기한 미기산 */
  unavoidableOutsideCapitalResolvedDate: string;
  /** §155⑦ 농어촌주택 보유 여부 — 양도 대상은 **일반주택**이다 */
  ruralHouseSpecial: boolean;
  /** §155⑦ 유형 ("inherited"|"farm_exit"|"return_to_farm") */
  ruralHouseKind: string;
  /** §155⑦ 소재 — 수도권 밖 읍(도시지역 제외)·면 */
  ruralHouseOutsideCapitalEupMyeon: boolean;
  /** §155⑦ 소재지 지번주소 — 읍·면 자동 판별용 (W-3) */
  ruralHouseJibun: string;
  /** §155⑦ 소재지 법정동코드(PNU 앞 10) — 수도권 여부 자동 판별용 */
  ruralHouseRegionCode: string;
  /** 소재 요건 토글을 사용자가 직접 조작했는지 — true면 자동 판정을 덮지 않는다 */
  ruralHouseLocationTouched: boolean;
  /** §155⑦1호 — 피상속인 거주 연수 */
  ruralHouseDecedentResidenceYears: string;
  /** §155⑦2호 — 이농인 거주 연수 */
  ruralHouseOwnerResidenceYears: string;
  /** §155⑦3호 — 귀농주택 취득일(⑦단서 5년 판정) */
  ruralHouseAcquisitionDate: string;
  /** §155⑩2호 — 취득 당시 고가주택 여부 */
  ruralHouseHighPriceAtAcquisition: boolean;
  /** §155⑩3호 — 대지면적(㎡) */
  ruralHouseLandAreaSqm: string;
  /** §155⑩5호 — 세대전원 이사·거주 */
  ruralHouseWholeHouseholdMoved: boolean;
  /** §155⑱ 처분기한 예외 사유 — "" = 해당 없음. 「3년이 되는 날 현재」 기준 */
  disposalDelayReason: string;
  // §156의2⑤ 대체주택 비과세 특례 FLAT 필드 (API에서 replacementHouse nested로 조립)
  replacementHouseSpecial: boolean;
  replBusinessApprovalDate: string;   // 사업시행계획인가일
  replCompletionDate: string;         // 신축주택 준공일
  replResidenceMonths: string;        // 대체주택 거주개월수 (숫자 문자열)
  replWillResideNewHouse: boolean;    // 신축주택 1년 이상 거주 자기선언

  /**
   * §89② 배제의 3년 초과 예외 FLAT 필드 — 「소득세법 시행령」 §156의2④·§156의3③ /
   * 「소득세법 시행규칙」 §75①. API에서 `rightThreeYearException` 판별 유니온으로 조립.
   *
   * ⚠️ `""`(미선언)과 `"none"`(해당 없음)은 **다르다** — 미선언은 판정 불가로 남고,
   *    `"none"`을 골라야 §89② 배제가 확정된다.
   */
  rightThreeYearExceptionKind: "" | "new_house" | "before_completion" | "delay" | "none";
  rightNewHouseCompletionDate: string;     // ④1호·2호 신축주택 완성일
  rightMovedInWithin3Years: boolean;       // ④1호 완성 후 3년 내 세대전원 이사
  rightResidedOneYearOrMore: boolean;      // ④1호 1년 이상 계속 거주
  rightDisposalDelayReason: "" | "kamco" | "auction" | "public_sale"; // 시행규칙 §75① 1~3호
  rightDisposedByThatMethod: boolean;      // §75① 「그 방법에 따라 양도된 경우」 — 둘째 요건

  /**
   * §89② 배제의 **합가 예외** FLAT 필드 — 「소득세법 시행령」 §156의2⑧·⑨(§156의3⑥ 준용).
   * API에서 `mergedHouseholdFirstHouse` 판별 유니온으로 조립한다.
   *
   * ⚠️ `""`(미선언)과 `"none"`(해당 없음)은 **다르다** — 미선언은 판정 불가로 남는다.
   */
  mergedHouseholdFirstHouseKind:
    | ""
    | "house_only"      // ⑧3호(⑨2호)
    | "initial_right"   // ⑧4호가목(⑨3호가목)
    | "succeeded_right" // ⑧4호나목(⑨3호나목)
    | "presale_right"   // ⑧4호다목(⑨3호다목)
    | "right_only"      // ⑧5호(⑨4호)
    | "none";
  /** ⑧4호가목 「사업시행계획 인가일 이후 취득」 — 자기선언 */
  mergedHouseholdAcquiredAfterApproval: boolean;
  /** ⑧4호가목 「취득 후 1년 이상 거주」 — 자기선언(가목은 요건이 **둘**이다) */
  mergedHouseholdResidedOneYear: boolean;
  /** ⑧4호나목·다목 「최초양도주택이 그 권리를 취득하기 전부터 소유」 — 자기선언 */
  mergedHouseholdOwnedBeforeRight: boolean;
  marriageDate: string;
  /**
   * §155⑥1호 — 지정문화유산·국가등록문화유산·천연기념물등 주택을 일반주택과 각각 1개씩 보유.
   * 2·3호가 삭제돼 요건은 boolean 하나다. §156의2⑩·§156의3⑦의 특수주택 판정에도 쓰인다.
   */
  culturalHeritageHouseSpecial: boolean;
  /** §155④⑤ 합가·혼인 세대 내 먼저 양도 주택 여부 (비과세 판정 — 먼저 양도 요건) */
  isFirstTransferredInMerge: boolean;
  /** §155② 양도(일반)주택이 상속개시 2년내 피상속인 증여분 여부 (상속주택 특례 배제 게이트) */
  generalHouseGiftedFromDecedentWithin2yr: boolean;
  /**
   * 위 증여의 **증여일**(YYYY-MM-DD) — 소급 2년 내 증여주택 제외는 2018-02-13 이후 증여분부터
   * (대통령령 제28637호 부칙 제16조 — OH-12c). 토글을 켜면 ⑧이 필수로 받는다.
   */
  generalHouseGiftDate: string;
  /**
   * §155② 괄호 — 상속개시 **후** 취득한 양도 주택이 「상속개시 당시 보유한 조합원입주권이나 분양권에 의하여
   * 사업시행 완료 후 취득한 신축주택」인가(OH-12). `""` = 미선택 — 게이트
   * (`generalHouseRightAtInheritanceVisible`)가 열리면 ⑧이 선택을 요구한다.
   */
  generalHouseRightAtInheritance: "" | "redevelopment_right" | "presale_right" | "none";
  /**
   * §156의2⑥·⑦ · §156의3④·⑤ — 양도하는 일반주택을 **상속개시 당시 이미 보유**하고 있었는가.
   * ⚠️ 긍정 선언이 있어야 상속 권리 예외를 인정한다(미선언 = 판정 불가).
   */
  generalHouseHeldAtInheritance: boolean;
  /**
   * §156의2⑮ · §156의3⑫ — 피상속인이 주택 없이 입주권과 분양권만 남긴 경우 상속인의 선택.
   * 「다른 종류의 권리 미소유」 요건**만** 면제한다.
   */
  inheritedRightChoiceWhenBothHeld: "" | "redevelopment_right" | "presale_right";
  parentalCareMergeDate: string;
  // §154① 단서 — 비과세 보유·거주 요건 면제 사유 (FLAT; API에서 oneHouseExemptionProviso로 조립)
  provisoReason:
    | ""
    | "rental_5yr_residence"
    | "expropriation"
    | "overseas_migration"
    | "overseas_residence"
    | "unavoidable"
    | "pre_designation_contract"
    | "rental_registration_4ho";
  provisoDepartureDate: string;
  provisoExpropriationDate: string;
  provisoBusinessApprovalDate: string;
  provisoPreContractNoHouse: boolean;
  /**
   * §154① 단서 삭제 전 4호(임대사업자 등록) — `provisoReason === "rental_registration_4ho"`일 때만 쓴다(OH-38).
   * 3-state 라디오는 `""`(미선택)을 두어 미입력을 판정 보류·검증 오류로 가른다(면제로 추정하지 않는다).
   * 노출 범위는 `rental4hoFieldScope`(`lib/calc/rental-4ho-proviso.ts`)가 ⑤·④·⑧ 공용으로 정한다.
   */
  proviso4hoBusinessRegDate: string;
  proviso4hoRentalRegDate: string;
  proviso4hoRegulatedOneHouse: "" | "yes" | "no";
  proviso4hoStatus: "" | "maintained" | "auto_cancelled" | "voluntary_cancelled" | "demolition_cancelled" | "other";
  proviso4hoDuringMandatory: "" | "yes" | "no";
  proviso4hoRentOver5: "" | "yes" | "no";
  proviso4hoRentOver5ContractDate: string;
  proviso4hoGiftSeparated: boolean;
  /**
   * §154⑤ 단서(2021-01-01~2022-05-09 양도) 최종 1주택 재기산 — 양도 주택을 보유하는 동안 세대가 다른 주택
   * (조합원입주권 포함)을 처분한 적이 있는가(OH-22 · I-1). `""` = 미답 → 판정 보류(재기산 없음으로 추정하지 않는다).
   * 노출·전송·검증 범위는 `lib/calc/final-house-restart.ts` 한 곳이 정한다.
   */
  finalHouseRestartHistory: "" | "yes" | "no";
  /** `finalHouseRestartHistory === "yes"`일 때의 처분 목록(구 기록엔 없다 — 읽기는 `readFinalHouseDisposals`) */
  finalHouseRestartDisposals: FinalHouseDisposalRow[];
  houses: HouseEntry[];
  /** 세대 보유 분양권·입주권 (2021.1.1 이후 취득분 주택 수 산입 — 소령 §167의11) */
  presaleRights: PresaleRightEntry[];
  /**
   * 다주택 중과세 한시 유예 조건부 판정 (소령 §167의3 중과 한시 배제 2022.5.10~2026.5.9).
   * 폼-전역 단수 객체 — undefined면 유예 윈도우 blanket 판정, 객체면 정밀 조건 판정.
   * 3-state: undefined(미입력) / 객체(입력). 날짜는 폼 문자열(YYYY-MM-DD).
   */
  gracePeriod?: {
    contractDate: string;
    /** 토지거래허가 대상 여부 — true=나목(허가신청·허가·계약금), false=다목(계약·계약금) */
    isLandPermitTarget?: boolean;
    /** 나목1) 토지거래허가 신청일 */
    permitApplicationDate?: string;
    /** 나목2) 허가 수령 여부 */
    permitGranted?: boolean;
    /** 나목3)·다목1) 계약금 수령 증빙 확인 */
    depositReceiptConfirmed?: boolean;
    /** @deprecated G3(조건C 근거 없음) — 판정 미사용, 하위호환만 */
    isLandPermitArea?: boolean;
    /** @deprecated G3 — 판정 미사용 */
    hasTenantInResidence?: boolean;
    /** @deprecated G6(regionCode 명단 판정 대체) — 판정 미사용 */
    areaDesignatedDate?: string;
  };
  /**
   * 양도(selling) 주택의 3주택+ 전용 중과배제 특례 (소령 §167의10 — 양도 주택 자체가 배제 항목 해당).
   * 양도 주택을 기술하므로 폼-전역. effectiveHouseCount≥3에서만 의미. 날짜·연수는 폼 문자열.
   */
  sellingHouseExclusion?: {
    /** 저당권 실행·채권변제 취득 (취득 후 3년 이내) */
    isMortgageExecution?: boolean;
    /** 사원용 주택 (10년 이상 무상 제공) */
    isEmployeeHousing?: boolean;
    freeProvisionYears?: string;
    /** 조세특례제한법 특례 적용 주택 */
    isTaxSpecialExemption?: boolean;
    /** 국가유산(문화재) 주택 */
    isCulturalHeritage?: boolean;
    /** 어린이집 운영 주택 (5년 이상) */
    isDayCareCenter?: boolean;
    dayCareOperationYears?: string;
    // ── 2주택 전용 (§167의10①3호·7호) — 양도 주택 자신이 그 호에 해당하는 경우 (F-16) ──
    /** 취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 주택 (§167의10①3호) */
    isUnavoidableReason?: boolean;
    unavoidableResidenceYears?: string;
    unavoidableReasonResolvedDate?: string;
    /** 「양도일 현재 사유가 해소되지 않음」 — 해소일과 택일(`two-house-exclusion-status.ts`) */
    unavoidableReasonUnresolved?: boolean;
    /** 3호의 취득 당시 기준시가 (3억 이하 요건) — `officialPrice`(양도 당시)와 다른 칸이다 */
    acquisitionOfficialPrice?: string;
    /** 소송 진행 중이거나 소송 결과로 취득한 주택 (§167의10①7호) */
    isLitigationHousing?: boolean;
    /** 소송 **확정판결일** — 취득일이 아니다. 필드명은 legacy(F-17) */
    litigationAcquisitionDate?: string;
    /** 「양도일 현재 소송 진행 중」 — 확정판결일과 택일(`two-house-exclusion-status.ts`) */
    litigationPending?: boolean;
    /**
     * §167의3①**2호** 장기임대주택 — **양도하는 주택 자신**이 등록 장기임대주택인 경우.
     *
     * 🔴 종전에는 입력 경로가 아예 없었고 ④가 `isLongTermRental: false`를 **하드코딩**했다.
     *    엔진은 양도 주택 자신의 2호를 이미 판정하는데(`multi-house-surcharge-exclusion.ts`
     *    `isSurchargeExemptRental(sellingHouse, …)`) 어댑터가 사실을 싣지 않아 잠들어 있었다 —
     *    문화유산(6호)·상속(7호)과 **같은 「어댑터 한 층만 끊긴」 결함**이다.
     *
     * 🔑 `rentalHousingException`(§155⑳ 거주주택 특례 — **다른** 집이 임대)과도, 조특법 §97
     *    계열 감면(`reductions`)과도 **다른 축**이다. 셋이 같은 낱말을 쓸 뿐이다.
     *
     * 🔑 명부 행과 **같은 타입**을 쓴다 — 9목 전부가 양도 주택에도 성립하므로(사목은 문언 자체가
     *    「양도하는 주택」) 목을 골라낼 수 없다. 상세 근거는 `RentalDeclaration` 주석.
     *
     * ⚠️ 2호는 3주택(§167의3①2호)과 2주택(§167의10①**2호** 준용) **양쪽**에서 성립한다 —
     *    노출 게이트를 3주택으로 좁히면 2주택 사용자가 선언할 화면을 잃는다.
     */
    longTermRental?: RentalDeclaration;
    /**
     * §167의3①**3호** 감면대상장기임대주택 — **양도하는 주택 자신**이 조특법 §97·§97의2·§98 감면
     * 임대주택(5년 이상 임대한 국민주택)인 경우. 2호와 같은 이유로 노출 게이트는 **2채**다
     * (§167의10①2호가 「제167조의3제1항제2호부터 제8호까지」를 준용 · 엔진 `effectiveHouseCount >= 2`).
     *
     * 🔑 §98은 감면 입력이 적격이면 엔진이 자동으로 배제한다(`resolveSurchargeExclusionByReduction`) —
     *    이 선언과 **OR**로 공존한다(어느 쪽이든 배제).
     * 🔑 「5년 이상 임대」·「국민주택」·「아파트」는 위 2호 선언이 켜져 있으면 그쪽 칸을 쓴다 —
     *    같은 주택의 같은 사실이다(`lib/calc/tax-incentive-rental-scope.ts`).
     * 부재(구 기록·stale sessionStorage) = 미선언 — 읽는 곳은 전부 `?.`로 받는다.
     */
    taxIncentiveRental?: TaxIncentiveRentalFacts;
    // ── 공고 전 매매계약 (영 §167의3①11호 · §167의4③5호 · §167의10①11호 · §167의11①10호) ──
    /**
     * 이 주택을 **양도하기 위한** 매매계약의 계약금을 **지급받은** 사실이 증빙서류로 확인되는가.
     *
     * 🔑 장기임대 선언의 `hasContractDepositProof`(아목·마목 — 취득 계약금을 **지급한** 사실)와 **다른 사실**이다
     *    (계획서 regulated-area-region-code-match D-3 · Q-3). 12의2 나·다목 `gracePeriod.depositReceiptConfirmed`와는
     *    같은 종류의 사실이지만, `gracePeriod`가 3-state라 합치면 12의2 판정이 바뀌므로 칸을 나눴다(Q-3).
     *
     * 노출·전송·검증 범위는 `lib/calc/pre-designation-contract-scope.ts` 한 곳이 정한다. 부재(구 기록·stale
     * sessionStorage) = 미입력 — 읽는 곳은 전부 `?.`로 받는다.
     */
    saleDepositReceived?: boolean;
    /** 위 양도 매매계약 체결일(YYYY-MM-DD) — `saleDepositReceived`가 켜졌을 때만 의미가 있다 */
    saleContractDate?: string;
  };

  // ── Step 4 (구 Step5): 감면·공제 ──
  /** 당해 연도 기사용 기본공제 (사람 단위, 연간 한도 250만원) */
  annualBasicDeductionUsed: string;
  /**
   * 인별 5년 합산 한도 산정용 과거 감면 이력 (조특법 §133).
   * 최근 4개 과세연도 사용분을 입력.
   */
  priorReductionUsage: PriorReductionUsageItem[];
  /** P5 모드 2 — 보유 감면주택 주택수 제외 (§89①3호 의제, 폼-전역) */
  specialHouseExclusions: SpecialHouseExclusionFormItem[];

  // ── 판정 메뉴에서 넘겨받은 사실 (P5-a) ──
  /**
   * §155의2 장기저당담보주택 · §155의3 상생임대주택 — **판정 메뉴에서 넘겨받은 사실**.
   *
   * 🔴 이 계산기에는 두 특례의 **입력 위젯이 없다**(D-4 — 새 판정 입력은 계산기에 만들지
   *    않는다). 그래서 이 필드는 사용자가 채우는 것이 아니라 `openTransferWithOneHouseFacts`가
   *    **판정 메뉴 폼에서 실어 오는** 운반 상자다. 화면에는 읽기 전용 요약으로만 보인다.
   *
   * 🔑 `undefined`(미전달)와 「전달됐으나 두 토글이 OFF」는 **다르다** — 전자는 출처 표시가
   *    아예 없고, 후자는 「판정 메뉴에서 왔지만 이 특례는 해당 없음」이다.
   *
   * 🔑 ④ 변환은 이것을 `longTermMortgageHouse`·`winWinRentalHouse` nested로 펴서 보낸다.
   *    **운반 상자 자체는 전송하지 않는다** — 엔진·Zod가 아는 이름은 nested 쪽이다.
   */
  importedOneHouseFacts?: OneHouseJudgmentExtraFields;
  /**
   * 출처 판정 이력 `CalculationRecord.id` (P5-a).
   *
   * 🔑 `history-lookup-modal` 스킬의 `sourceCalculationId`와 **같은 층위의 UI 메타**다 —
   *    엔진은 무시하고 ④ 변환에서 전송하지 않는다. staleness 비교(P5-b)가 이 id로 원본
   *    record를 되찾는다(`feedback_snapshot_copy_without_staleness_detection`).
   */
  sourceJudgmentId?: string;
  /**
   * **전달 시점** 원본 판정 record의 `inputHash` — 원본 변경 감지의 **유일한** 기준선 (P5-b-1).
   *
   * ⛔ `computeInputHash(form)`과 비교하지 말 것. 저장 시 `inputData`에 키가 덧붙고
   *   (`use-auto-save-calculation.ts`) 편집 왕복이 기본값 키를 덧붙여(`updateFormData`가
   *   `{...state.formData, ...data}`) **사용자가 아무것도 안 고쳐도 폼 해시는 바뀐다**.
   *   ⇒ 「로컬 편집함」과 「폼이 정규화됨」을 구분할 수 없어 정상 편집마다 오탐이 난다.
   *   다건 합산이 같은 규약을 쓴다(`multi-transfer-tax-store.ts` `sourceInputHash`).
   *
   * 구 세션·구 record는 `undefined` — 그때는 **「판정 불가」로 다룬다**(추측 금지).
   */
  sourceJudgmentInputHash?: string;

  // appurtenantLandRateMode 필드 제거 (사례 28 landNature 명시 입력 정책으로 대체, 2026-05-07)
  // 자산-수준 landNature("appurtenant"|"standalone")가 폼-수준 모드 결정을 대체.
  // 엔진이 자산-수준 landNature를 읽어 자동 분기 — 사용자 수동 모드 선택 불필요.

  // ── Step 5 (가산세) ──
  enablePenalty: boolean;
  filingType: "none" | "under" | "excess_refund" | "correct";
  penaltyReason: "normal" | "fraudulent" | "offshore_fraud";
  priorPaidTax: string;
  originalFiledTax: string;
  excessRefundAmount: string;
  interestSurcharge: string;
  /**
   * 부정행위로 인한 과소신고납부세액등 — 국세기본법 §47조의3①1호 **가목** base.
   * 빈 문자열이면 **전액을 부정행위분**으로 본다(종전 동작). 무신고에는 이 분해가 없다.
   */
  fraudulentPortion: string;
  /**
   * 「결정할 것을 미리 알고」 기한 후 신고 — 「국세기본법」 §48②2호·§48②3호라목 **배제 단서**.
   *
   * 🔴 G-05. 무신고(`filingType === "none"`)에서만 노출된다. 기본 false(=감면 적용) —
   * 기한 후 신고는 법이 감면을 예정한 상태이고, 배제는 예외이기 때문이다.
   * 수정신고 축의 `priorAssessmentNotified`(§48②**1호**)와 **다른 필드**다 — 두 축은
   * `amendmentMode` 로 배타이고, 한 필드를 공유하면 모드를 오갈 때 stale 값이 새 축의
   * 감면을 조용히 꺼 버린다.
   */
  lateFilingNotified: boolean;
  unpaidTax: string;
  /**
   * PEN-C(2026-09-30) — 미납세액 산정 방식. `auto` = 결정세액 전액 미납 · `manual` = `unpaidTax` 그대로
   * (**0 = 완납**). **부재는 값으로 판정**한다(0·빈칸 → auto, 양수 → manual) — 종전 저장 폼·이력의 의미
   * 그대로다. 판정은 `effectiveUnpaidTaxMode`(`lib/calc/transfer-unpaid-tax-mode.ts`) 하나만 쓴다.
   * 기본값을 두지 않는 것이 의도다 — 기본값 `auto`를 두면 병합 시 저장된 「값 입력」 폼이 자동으로 뒤집힌다.
   */
  unpaidTaxMode?: "auto" | "manual";
  paymentDeadline: string;
  actualPaymentDate: string;

  // ── 수정신고(경정) — 국세기본법 §45·§48 ──
  amendmentMode: boolean;
  /** 당초 결정세액(=당초 납부 본세) — 이력에서 자동 prefill, 수정 가능 */
  originalDeterminedTax: string;
  /** 불러온 당초 이력 id (추적용) */
  amendmentSourceId: string;
  /** 법정신고기한(YYYY-MM-DD) — 양도일 파생, 수정 가능 (소득세법 §110①) */
  statutoryFilingDeadline: string;
  /** 수정신고일(YYYY-MM-DD) — §48② 경과기간 종점 */
  amendedFilingDate: string;
  applyUnderReportingPenalty: boolean;
  underReportingReason: "normal" | "fraudulent" | "offshore_fraud";
  underReductionMode: "exempt" | "auto_48_2";
  priorAssessmentNotified: boolean;
  applyLatePaymentPenalty: boolean;
  /** 수정신고 납부(예정)일(YYYY-MM-DD) — 납부지연 경과일 종점 */
  amendedPaymentDate: string;
  // ── 경정청구(세액 감소·환급) — 국세기본법 §45의2 ──
  /** 정정 방향 (amend=수정신고 / refund_claim=경정청구) */
  correctionKind: "amend" | "refund_claim";
  /** 경정청구 사유 유형 (ordinary=일반 5년 / posterior=후발적 3개월) */
  claimReasonType: "ordinary" | "posterior";
  /** 후발적 사유 안 날(YYYY-MM-DD) — posterior 3개월 기산 (§45의2②) */
  posteriorEventDate: string;
  /** 당초 납부일(YYYY-MM-DD, 선택) — 환급가산금 기산일 안내(form-only, 엔진 미전송) */
  originalPaymentDate: string;
}
