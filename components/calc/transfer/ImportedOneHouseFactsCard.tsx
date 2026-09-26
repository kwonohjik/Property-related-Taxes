"use client";

/**
 * 판정 메뉴에서 **넘겨받은 사실** — 계산기 ⑤ 읽기 전용 요약 (P5-a)
 *
 * 계획서 §5.3 「계산기 안에서 넘겨받은 **특례 사실**은 읽기 전용이다 — 수정은 「판정 메뉴에서 수정」」.
 *
 * ## 🔑 왜 읽기 전용인가
 *
 * §155의2·§155의3은 계산기에 **입력 위젯을 만들지 않기로 했다**(D-4). 여기서 편집하게 하면
 * 그 결정이 뒤집히고, 같은 특례를 두 화면에서 서로 다르게 입력할 수 있게 된다.
 *
 * ## 🔑 이 카드는 **판정 결과를 말하지 않는다**
 *
 * 「상생임대 요건 충족」 같은 결론을 여기 쓰면 계산기가 판정을 두 번 하는 셈이 된다. 보여 주는
 * 것은 **사용자가 판정 메뉴에 넣은 사실**뿐이고, 결론은 결과 화면이 엔진 값으로 말한다
 * (`feedback_aggregate_display_rederives_engine_value`).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { OneHouseJudgmentExtraFields } from "@/lib/stores/one-house-extra-fields.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

/**
 * 계산기에서 **편집 위젯이 사라진** §89② 권리 예외 13필드 (P6-a).
 *
 * 🔴 이 필드들은 `TransferFormData` **flat**이고 ④가 계속 읽는다. 위젯만 없앴으므로 값은
 *    살아서 세액을 바꾼다 — 화면이 말하지 않으면 **보이지 않는 값이 세액을 바꾸는** 상태가 된다.
 */
export type ImportedRightsSlice = Pick<
  TransferFormData,
  | "rightThreeYearExceptionKind"
  | "rightNewHouseCompletionDate"
  | "rightMovedInWithin3Years"
  | "rightResidedOneYearOrMore"
  | "rightDisposalDelayReason"
  | "rightDisposedByThatMethod"
  | "generalHouseHeldAtInheritance"
  | "generalHouseGiftedFromDecedentWithin2yr"
  | "inheritedRightChoiceWhenBothHeld"
  | "mergedHouseholdFirstHouseKind"
  | "mergedHouseholdAcquiredAfterApproval"
  | "mergedHouseholdResidedOneYear"
  | "mergedHouseholdOwnedBeforeRight"
>;

const R3Y_KIND: Record<string, string> = {
  new_house: "신축주택 완성 후 3년 내 전입",
  before_completion: "완성 전 양도",
  delay: "처분 지연 사유",
  none: "해당 없음",
};
const MERGED_KIND: Record<string, string> = {
  house_only: "주택만",
  initial_right: "원조합원 입주권",
  succeeded_right: "승계조합원 입주권",
  presale_right: "분양권",
  right_only: "권리만",
  none: "해당 없음",
};
const INHERITED_CHOICE: Record<string, string> = {
  redevelopment_right: "조합원입주권",
  presale_right: "분양권",
};

/**
 * 계산기에서 **편집 위젯이 사라진** ③ 특례 필드 (P6-b).
 *
 * 🔴 권리 13필드와 같은 이유로 필요하다 — flat 필드라 ④가 계속 읽는다. 특히 P6-b **이전에**
 *    저장한 이력은 이 값들을 갖고 있고, 다시 열면 화면 어디에도 나타나지 않은 채 세액을
 *    바꾼다(OH-21).
 *
 * 🔑 §155⑧·합가는 **넣지 않는다** — 계산기에 편집 칸이 그대로 있다. 읽기 전용 요약에 또
 *    적으면 같은 값이 두 번 보이고, 어느 쪽이 정본인지 알 수 없게 된다.
 */
export type ImportedSpecialsSlice = Pick<
  TransferFormData,
  | "temporaryTwoHouseSpecial"
  | "newHouseAcquisitionDate"
  | "publicInstitutionRelocation"
  | "disposalDelayReason"
  | "culturalHeritageHouseSpecial"
  | "ruralHouseSpecial"
  | "ruralHouseKind"
  | "replacementHouseSpecial"
  | "replBusinessApprovalDate"
  | "replCompletionDate"
  | "replResidenceMonths"
  | "replWillResideNewHouse"
  | "provisoReason"
>;

/** ⑤ 위젯(③ 농어촌 라디오)의 value·label 그대로 — 두 벌이면 한쪽만 개정 반영된다. */
const RURAL_KIND: Record<string, string> = {
  inherited: "1호 상속",
  farm_exit: "2호 이농",
  return_to_farm: "3호 귀농",
};
/** ⑤ 위젯(`ExemptionProvisoSection` PROVISO_OPTIONS)의 value·label 그대로. */
const PROVISO_REASON: Record<string, string> = {
  expropriation: "공익사업 수용 (2호 가목)",
  overseas_migration: "해외이주 (2호 나목)",
  overseas_residence: "국외거주·취학·근무 (2호 다목)",
  unavoidable: "부득이한 사유 (3호)",
  rental_5yr_residence: "임대주택 거주 5년 (1호)",
  pre_designation_contract: "조정 공고 전 계약 (5호)",
};

/**
 * 🔑 권리 요약과 같은 규칙 — **선언된 것만** 적는다.
 */
function specialsRows(f: ImportedSpecialsSlice, replacementHouseApplies: boolean): Row[] {
  const rows: Row[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  if (f.temporaryTwoHouseSpecial) {
    push("일시적 2주택 특례 (§155①)", "선언함");
    push("신규 주택 취득일", f.newHouseAcquisitionDate);
    if (f.publicInstitutionRelocation) push("공공기관·법인 지방이전 (§155⑯)", "예");
    push("처분기한 예외 사유 (§155⑱)", f.disposalDelayReason ? "선언함" : undefined);
    /**
     * 🔑 §154① 단서는 **`temporary_two_house` 맥락일 때만** 적는다. `one_house` 맥락의 같은
     *    카드는 계산기 섹션②에 **그대로 있다** — 조건 없이 적으면 1주택 사용자에게 같은 값이
     *    편집 칸과 읽기 전용 요약 두 곳에 보인다(`provisoGate`가 맥락을 가르는 기준과 동일).
     */
    push("§154① 단서 사유", PROVISO_REASON[f.provisoReason]);
  }
  if (f.culturalHeritageHouseSpecial) push("문화유산 주택 보유 (§155⑥1호)", "예");
  if (f.ruralHouseSpecial) push("농어촌주택 보유 (§155⑦)", RURAL_KIND[f.ruralHouseKind] ?? "예");
  if (f.replacementHouseSpecial) {
    /**
     * 🔑 ④와 같은 게이트(`calcReplacementHouseApplies`, OH-05)가 닫혀 있으면 **계산에 쓰지 않는다** —
     *    화면이 「선언함」만 적으면 전송되지 않는 사실을 적용되는 것처럼 보이게 한다.
     */
    push(
      "대체주택 특례 (§156의2⑤)",
      replacementHouseApplies
        ? "선언함"
        : "선언함 — 현재 세대 구성(2주택 미만·조합원입주권 없음)에서는 성립하지 않아 계산에 쓰지 않습니다",
    );
    push("사업시행계획 인가일", f.replBusinessApprovalDate);
    push("신축주택 준공일", f.replCompletionDate);
    push("대체주택 거주기간", f.replResidenceMonths ? `${f.replResidenceMonths}개월` : undefined);
    if (f.replWillResideNewHouse) push("신축주택 1년 이상 거주 예정", "예");
  }
  return rows;
}

/**
 * 🔑 **선언된 것만 보여 준다.** 13필드를 전부 나열하면 「아니오」가 10줄 쌓여 실제 선언이 묻힌다.
 *    빈 문자열·false는 「선언하지 않음」이고, 그것은 말할 가치가 없다.
 */
function rightsRows(r: ImportedRightsSlice): Row[] {
  const rows: Row[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  push("3년 초과 예외", R3Y_KIND[r.rightThreeYearExceptionKind]);
  push("신축주택 완성일", r.rightNewHouseCompletionDate);
  if (r.rightMovedInWithin3Years) push("완성 후 3년 내 전입", "예");
  if (r.rightResidedOneYearOrMore) push("1년 이상 거주", "예");
  push("처분 지연 사유", r.rightDisposalDelayReason ? "선언함" : undefined);
  if (r.rightDisposedByThatMethod) push("그 방법으로 양도됨", "예");
  if (r.generalHouseHeldAtInheritance) push("상속개시 당시 보유한 주택", "예");
  if (r.generalHouseGiftedFromDecedentWithin2yr) push("상속개시 2년 내 피상속인 증여분", "예");
  push("상속받은 권리 선택", INHERITED_CHOICE[r.inheritedRightChoiceWhenBothHeld]);
  push("합가 세대 먼저 양도 자산", MERGED_KIND[r.mergedHouseholdFirstHouseKind]);
  if (r.mergedHouseholdAcquiredAfterApproval) push("사업시행계획 인가일 이후 취득", "예");
  if (r.mergedHouseholdResidedOneYear) push("취득 후 1년 이상 거주", "예");
  if (r.mergedHouseholdOwnedBeforeRight) push("권리 취득 전부터 보유", "예");
  return rows;
}

type Row = { label: string; value: string };

function mortgageRows(f: OneHouseJudgmentExtraFields): Row[] {
  return [
    { label: "계약체결일", value: f.longTermMortgageContractDate || "—" },
    { label: "계약체결일 현재 가입자 나이", value: f.longTermMortgageBorrowerAge ? `${f.longTermMortgageBorrowerAge}세` : "—" },
    { label: "계약기간", value: f.longTermMortgageContractYears ? `${f.longTermMortgageContractYears}년` : "—" },
    { label: "만기 일시상환 계약조건", value: f.longTermMortgageMaturityLumpSum ? "예" : "아니오" },
    { label: "계약기간 만료 전 양도", value: f.longTermMortgageTransferredBeforeMaturity ? "예" : "아니오" },
    { label: "양도 대상이 담보주택", value: f.longTermMortgageIsTransferredHouseMortgaged ? "예" : "아니오" },
    { label: "동거봉양 합가로 2주택", value: f.longTermMortgageParentalCareMerge ? "예" : "아니오" },
  ];
}

function winWinRows(f: OneHouseJudgmentExtraFields): Row[] {
  return [
    { label: "상생임대차계약 체결일", value: f.winWinRentalContractDate || "—" },
    { label: "직전임대차 대비 증가율", value: f.winWinRentalIncreaseRatePct ? `${f.winWinRentalIncreaseRatePct}%` : "—" },
    { label: "직전임대차 임대기간", value: f.winWinRentalPriorLeaseMonths ? `${f.winWinRentalPriorLeaseMonths}개월` : "—" },
    { label: "상생임대차 임대기간", value: f.winWinRentalLeaseMonths ? `${f.winWinRentalLeaseMonths}개월` : "—" },
  ];
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * @param facts `undefined`면 **아무것도 렌더하지 않는다** — 판정 메뉴를 거치지 않은 사용자에게
 *              「넘겨받은 사실 없음」 카드를 띄우면, 쓰지 않는 조문으로 화면만 길어진다.
 */
export function ImportedOneHouseFactsCard({
  facts,
  rights,
  specials,
  replacementHouseApplies = true,
}: {
  facts: OneHouseJudgmentExtraFields | undefined;
  /** 계산기에서 편집 위젯이 사라진 §89② 권리 예외 값 (P6-a). */
  rights?: ImportedRightsSlice;
  /** 계산기에서 편집 위젯이 사라진 ③ 특례 값 (P6-b). */
  specials?: ImportedSpecialsSlice;
  /** §156의2⑤ 게이트 — ④(`calcReplacementHouseApplies`)와 같은 값을 호출부가 넘긴다(OH-05). */
  replacementHouseApplies?: boolean;
}) {
  const rRows = rights ? rightsRows(rights) : [];
  const sRows = specials ? specialsRows(specials, replacementHouseApplies) : [];
  /**
   * 🔑 **둘 중 하나만 있어도 렌더한다.** P6 이전에 저장한 이력은 `importedOneHouseFacts`가
   *    없는데 권리 값은 갖고 있다 — `facts`만 보고 숨기면 그 값이 세액을 바꾸는 채로
   *    화면에서 사라진다(OH-21).
   */
  if (!facts && rRows.length === 0 && sRows.length === 0) return null;
  const hasMortgage = !!facts?.longTermMortgageSpecial;
  const hasWinWin = !!facts?.winWinRentalSpecial;

  return (
    /*
     * 🔑 `data-testid`는 **래퍼에 건다** — `ToneCard`는 임의 props를 전달하지 않는다
     *    (`feedback_shared_card_testid_not_forwarded`). 카드에 직접 걸면 DOM에 나타나지 않고
     *    E2E가 「렌더되지 않았다」로 읽는다.
     */
    <div data-testid="imported-one-house-facts">
    <ToneCard tone="violet" title="판정 메뉴에서 넘겨받은 사실" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        아래는 <b>1세대1주택 비과세 판정</b> 메뉴에서 입력한 값입니다. 이 화면에서는 수정할 수
        없습니다 — 고치려면 판정 메뉴로 돌아가 다시 판정하세요.
      </p>

      {hasMortgage && (
        <div className="space-y-1" data-testid="imported-long-term-mortgage">
          <p className="text-xs font-semibold text-violet-700">
            장기저당담보주택 특례 <LawArticleModal legalBasis="소득세법 시행령 §155의2" />
          </p>
          <RowList rows={mortgageRows(facts)} />
        </div>
      )}

      {hasWinWin && (
        <div className="space-y-1" data-testid="imported-win-win-rental">
          <p className="text-xs font-semibold text-violet-700">
            상생임대주택 특례 <LawArticleModal legalBasis="소득세법 시행령 §155의3" />
          </p>
          <RowList rows={winWinRows(facts)} />
        </div>
      )}

      {sRows.length > 0 && (
        <div className="space-y-1" data-testid="imported-temp-two-house-specials">
          <p className="text-xs font-semibold text-violet-700">
            2주택 이상 비과세 특례{" "}
            <LawArticleModal legalBasis="소득세법 시행령 §155" label="영 §155·§156의2" />
          </p>
          <RowList rows={sRows} />
        </div>
      )}

      {rRows.length > 0 && (
        <div className="space-y-1" data-testid="imported-right-exceptions">
          <p className="text-xs font-semibold text-violet-700">
            권리 관련 판정 사실 <LawArticleModal legalBasis="소득세법 §89 ②" label="법 §89②" />
          </p>
          <RowList rows={rRows} />
        </div>
      )}

      {/*
        🔑 **「전달됐으나 두 토글이 OFF」도 말해 준다.** 아무 말도 하지 않으면 사용자는
           「내가 판정 메뉴에서 켠 특례가 사라졌나」를 의심한다 — 사실은 켠 적이 없는 것이다.
      */}
      {facts && !hasMortgage && !hasWinWin && rRows.length === 0 && sRows.length === 0 && (
        <p className="text-sm" data-testid="imported-one-house-facts-none">
          판정 메뉴에서 <b>장기저당담보(§155의2)·상생임대(§155의3)</b> 특례를 선언하지 않았습니다.
          나머지 판정 사실(명부·일시적 2주택 등)은 아래 입력란에 그대로 채워져 있습니다.
        </p>
      )}
    </ToneCard>
    </div>
  );
}
