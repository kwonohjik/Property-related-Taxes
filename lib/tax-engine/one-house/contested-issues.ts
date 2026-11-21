/**
 * 1세대1주택 판정 — **해석이 갈리는 쟁점**(양론) 표시 (P4)
 *
 * 해석이 갈리거나(국세청 해석 ↔ 조세심판원 결정, 조세심판원 결정끼리) 한쪽 입장의 직접 근거가 확인되지 않은 사실 패턴이다
 * (입장마다 근거 기관을 `source`로 밝힌다 — 2026-11 리뷰 D-82). 엔진은 한쪽 입장으로 판정하지만,
 * 판정 메뉴는 그 결론을 단언하지 않고 **두 입장으로 각각 판정한 결론**을 나란히 보여 준다
 * (사용자 결정 2026-10-06 · 2026-10-09). 판정 메뉴 전용이다 — 세액 계산기는 엔진 입장대로 계산한다.
 *
 * | id | 사실 패턴 | 엔진 입장 | 반대 입장 재판정 |
 * |---|---|---|---|
 * | `155-2-inherited-house-gifted-within-household` (C1) | 상속주택(지분)을 동일세대원에게 증여 | B — 상속주택 유지 | 그 행을 상속주택이 아닌 주택으로 |
 * | `155-3-same-household-co-inherited-minority` (C2) | 동일세대원에게서 상속받은 공동상속주택 소수지분 | A — §155② 단서 적용 | 그 행에 §155② 단서(동일세대 게이트)를 적용하지 않음 |
 * | `155-4-parental-care-merge-right-sale` (C6) | 동거봉양 합가 후 조합원입주권 양도 | B — 입주권에 §155④ 부적용 | 혼인합가와 같은 「합가 상대 쪽 1채 제외」 적용 |
 * | `155-3-co-inherited-minority-before-ranking-clause` (C7) | 2017.2.3. 전 양도 + 소수지분 공동상속주택을 제외하지 못한 행(적격 2채 이상 · 순위 부적격 선언) | A — 과세관청 해석 | 그 행들을 주택에서 빼고(소수지분 전부 제외) 판정 |
 * | `155-1-presale-holding-completion` (C8) | 종전주택 보유 중 취득한 분양권(2021.1.1. 이후)이 완공된 뒤 종전주택 양도 | A — §155① 완공일 기산 | §156의3②·③으로 판정 |
 *
 * ⚠️ C1 반대 입장은 **§155② 축만** 뒤집는다 — 명부 행의 상속 사실만 지운다. 그 주택이 §155⑦1호 상속 농어촌주택이기도 하면
 *    농어촌주택 특례(`ruralHouse`)는 그대로 둔다: 서면-2015-부동산-1363이 다룬 것은 §155②뿐이다(평가셋 E109 — 결론 같음).
 * 🔑 반대 입장의 결론은 **같은 판정 파이프라인을 한 번 더** 돌려 얻는다(route). 이 파일은 사실 패턴을 감지하고
 *    반대 입장의 입력을 만들 뿐, 요건을 따로 판정하지 않는다 — 여기서 결론을 손으로 적으면 엔진과 드리프트한다.
 * ⚠️ 혼인합가 후 입주권 양도(§155⑤)는 양론이 아니다 — 적용 쪽으로 결정했다(`right-sale-marriage-merge.ts`).
 *    이농주택으로 다시 귀농(§155⑦3호)도 뒤의 해석이 일관돼 양론으로 보지 않는다(사용자 결정 2026-10-09).
 */
import { INHERITED_HOUSE, TRANSFER } from "../legal-codes";
import { isBeforeCoInheritedRankingClause } from "../data/co-inherited-ranking-clause-era";
import {
  isHeirInheritedHouse,
  passesHouseholdGate,
  resolveInheritedHouseExclusionForJudgment,
  resolveInheritedHouseExclusionFromInput,
  type InheritedHouseExclusionResult,
} from "../transfer-inheritance-exclusion";
import { withoutRosterRows } from "./without-roster-rows";
import type { HouseInfo } from "../types/multi-house-surcharge.types";
import type { TransferTaxInput } from "../types/transfer.types";
import { isHoldingPresaleOrigin } from "./new-house-origin";
import type { OneHouseJudgment } from "./types";

export type OneHouseContestedIssueId =
  | "155-2-inherited-house-gifted-within-household"
  | "155-3-same-household-co-inherited-minority"
  | "155-3-co-inherited-minority-before-ranking-clause"
  | "155-4-parental-care-merge-right-sale"
  | "155-1-presale-holding-completion";

export type ContestedPositionKey = "A" | "B";
export type ContestedVerdict = "exempt" | "partial" | "taxable";

export type OneHouseContestedPosition = {
  key: ContestedPositionKey;
  /** 입장 요지 — 이 입장이 그 사실을 어떻게 보는가 */
  summary: string;
  /** 근거 문서번호(결정·회신일) */
  authorities: string[];
  /** 근거 기관 — 이 입장이 어느 기관의 해석·결정에 기대는가(직접 근거가 없으면 그렇다고 적는다 · D-82) */
  source: string;
  /** 이 입장으로 판정한 결론 — 엔진 입장은 본 판정, 반대 입장은 재판정 결과 */
  verdict: ContestedVerdict;
};

export type OneHouseContestedIssue = {
  id: OneHouseContestedIssueId;
  title: string;
  legalBasis: string;
  /** 본 판정(화면 아래 판정 내역·세액 계산기)이 따른 입장 */
  enginePosition: ContestedPositionKey;
  /** [A, B] 순서 고정 */
  positions: [OneHouseContestedPosition, OneHouseContestedPosition];
  /** 두 입장의 결론이 다르면 true — 판정 배지가 결론을 단언하지 않는다 */
  conclusionsDiffer: boolean;
  /**
   * 반대 입장 재판정에서 §155① 짝을 다시 만들지 않아 그 입장의 결론을 단정할 수 없는 경우의 안내(2026-11 리뷰 D-79 최소 안전망) —
   * 있으면 화면이 「두 입장의 결론이 같습니다」를 쓰지 않는다.
   */
  otherPositionUnresolved?: string;
  /** 쟁점이 걸린 명부 행 id(입주권 쟁점은 빈 배열) */
  houseIds: string[];
};

type PositionText = { summary: string; authorities: string[]; source: string };
type IssueSpec = {
  title: string;
  legalBasis: string;
  enginePosition: ContestedPositionKey;
  A: PositionText;
  B: PositionText;
  /** 두 결론이 갈릴 때만 카드를 보인다 — C8(결정 #43 D 「그 갈래에서 결론이 갈릴 때만 함께 표시」 · 결정 Q-30 (a) · 2026-11 리뷰 D-89) */
  shownOnlyWhenConclusionsDiffer?: boolean;
};

const SPECS: Record<OneHouseContestedIssueId, IssueSpec> = {
  "155-2-inherited-house-gifted-within-household": {
    title: "상속주택(지분)을 동일세대원에게 증여한 경우",
    legalBasis: INHERITED_HOUSE.EXEMPTION_SOLE_BASIS,
    enginePosition: "B",
    A: {
      summary:
        "증여한 주택에는 상속주택 특례(§155②)가 적용되지 않습니다 — 그 주택을 §155② 상속주택에서 빼고(주택 수에 넣고) 판정했습니다.",
      authorities: ["서면-2015-부동산-1363 (2015.09.21.)"],
      source: "국세청 해석",
    },
    B: {
      summary:
        "동일세대원 사이의 증여는 세대가 보유한 주택 수를 바꾸지 않아 상속주택의 실질이 유지됩니다 — 상속주택으로 보고 판정했습니다.",
      authorities: ["조심-2023-서-10059 (2024.07.09.)"],
      source: "조세심판원 결정",
    },
  },
  "155-3-same-household-co-inherited-minority": {
    title: "동일세대원에게서 상속받은 공동상속주택 소수지분",
    legalBasis: INHERITED_HOUSE.EXEMPTION_CO_INHERITED_BASIS,
    enginePosition: "A",
    A: {
      summary:
        "§155② 단서(동일세대원으로부터 상속받은 주택 배제)가 소수지분에도 적용됩니다 — 동거봉양 합가 전부터 피상속인이 보유한 주택이 아니면 주택 수에서 빼지 않고 판정했습니다.",
      authorities: [
        "서면-2021-법규재산-0843 (2023.09.08.)",
        "사전-2021-법령해석재산-0199 (2021.05.31.)",
        "조심-2009-서-3229 (2010.03.10., 조세심판관합동회의)",
      ],
      source: "국세청 해석 · 조세심판관합동회의(2010)",
    },
    B: {
      summary:
        "소수지분권자에게는 §155② 단서를 적용하지 않습니다 — §155③에 따라 공동상속주택 소수지분을 주택 수에서 빼고 판정했습니다.",
      authorities: ["조심-2018-중-0424 (2018.04.19.)", "조심-2023-중-7006 (2024.04.22.)"],
      source: "조세심판원 결정",
    },
  },
  "155-3-co-inherited-minority-before-ranking-clause": {
    title: "2017.2.3. 전 양도 — 소수지분 공동상속주택이 2채 이상이거나 순위 부적격으로 선언한 경우",
    legalBasis: INHERITED_HOUSE.EXEMPTION_CO_INHERITED_BASIS,
    enginePosition: "A",
    A: {
      summary:
        "소수지분 공동상속주택 중 1채를 특정할 수 없으면(적격 2채 이상) 어느 것도 주택 수에서 빼지 않고, 순위 부적격으로 선언한 행도 빼지 않고 판정했습니다. " +
        "근거는 두 독법으로 나뉩니다 — ① 일반주택 1채와 소수지분 공동상속주택 2채를 보유한 세대의 일반주택 양도에 1세대1주택 비과세를 적용하지 않은 국세청 해석, " +
        "② §155② 순위에 따른 1주택만 주택 수에서 빼고 나머지는 소수지분이어도 주택 수에 넣어야 한다는 처분청 의견(조세심판원 결정에 인용 — 심판원은 받아들이지 않음).",
      authorities: [
        "① 재산세과-2922 (2008.09.24.) · 서면인터넷방문상담4팀-813 (2008.03.27.) — 소수지분 2채 사안",
        "② 조심-2010-서-0825 (2011.02.11.)의 처분청 의견 — 순위에 따른 1주택만 제외",
      ],
      source: "국세청 해석 · 처분청 의견",
    },
    B: {
      summary:
        "공동상속주택이 모두 소수지분이면 일반주택 양도 시 그 소수지분은 보유주택 수에 포함되지 않습니다 — 이 양도 당시 §155③에는 「선순위 1주택」 한정이 없었으므로(2017.2.3. 신설) 해당 행을 모두 주택 수에서 빼고 판정했습니다. 2017.2.3. 이후 양도분은 조세심판원도 선순위 1주택만 뺍니다(조심-2018-중-0793).",
      authorities: [
        "조심-2010-서-0825 (2011.02.11.)",
        "조심-2016-서-2720 (2017.03.03.)",
        "조심-2017-서-3603 (2017.10.30.)",
        "조심-2019-서-2002 (2019.08.22.)",
      ],
      source: "조세심판원 결정",
    },
  },
  "155-4-parental-care-merge-right-sale": {
    title: "동거봉양 합가 후 조합원입주권 양도",
    legalBasis: TRANSFER.PARENTAL_CARE_MERGE_EXEMPT,
    enginePosition: "B",
    A: {
      summary:
        "비과세 요건을 갖춘 종전주택의 입주권을 합가일부터 기한 이내에 먼저 양도하면 §155④를 적용합니다 — 합가 전 직계존속 쪽 주택 1채를 다른 주택에서 빼고 §89①4호로 판정했습니다.",
      authorities: ["국심-2006-서-3136 (2006.12.04.)"],
      source: "국세심판원 결정(2006 · 현 조세심판원)",
    },
    B: {
      summary: "주택에 대한 특례(§155②·④)를 입주권에 유추 적용할 수 없습니다 — §89①4호 요건만으로 판정했습니다.",
      authorities: ["조심-2021-서-1117 (2022.08.10.)"],
      source: "조세심판원 결정(2022 · 처분청 의견과 같음)",
    },
  },
  "155-1-presale-holding-completion": {
    title: "종전주택 보유 중 취득한 분양권이 완공된 뒤 종전주택 양도",
    legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}①`,
    enginePosition: "A",
    shownOnlyWhenConclusionsDiffer: true,
    A: {
      summary:
        "완공된 신규 주택을 일시적 2주택(§155①)의 신규 주택으로 보고 완공일부터 처분기한을 셉니다 — 분양권 상태가 아니라 주택을 취득한 것으로 판정했습니다.",
      authorities: [
        "서면-2021-법규재산-0407 (2022.02.24.) · 사전-2024-법규재산-0670 (2024.10.22.) · 사전-2025-법규재산-0584 (2025.07.16.) (2021.1.1. 전 취득 분양권의 완공일 기산 — 이 갈래에 §155①을 병용할 수 있다고 직접 밝힌 해석은 확인하지 못함)",
      ],
      source: "직접 근거 없음 — 2021.1.1. 전 분양권 해석의 유추(현행 엔진)",
    },
    B: {
      summary:
        "완공 뒤 양도도 분양권 규정(§156의3②·③)으로 판정합니다 — 종전주택 취득 후 1년이 지난 뒤 분양권을 취득하고 그 취득일부터 3년 이내에 양도하거나, 3년이 지나면 완성 후 세대전원 이사·1년 거주 등 §156의3③ 요건을 갖춰야 합니다.",
      authorities: ["사전-2024-법규재산-0833 (2024.11.27.)", "사전-2025-법규재산-1241 (2026.01.27.)", "서면-2024-법규재산-3770 (2024.12.18.)"],
      source: "국세청 해석",
    },
  },
};

/** 감지된 쟁점 — 반대 입장으로 재판정할 입력을 함께 싣는다. */
export type DetectedContestedIssue = {
  id: OneHouseContestedIssueId;
  houseIds: string[];
  /** 반대 입장 재판정 입력 — 이 쟁점 하나만 뒤집는다(2017.2.3. 전 C2·C7이 겹치면 두 B를 함께 — D-88) */
  otherPositionInput: TransferTaxInput;
  /** 반대 입장을 겹쳐 적용했을 때 B 요지에 붙이는 문장(D-88) */
  otherPositionNote?: string;
  /** 반대 입장의 §155① 짝을 다시 만들지 않아 결론을 단정할 수 없다(D-79) */
  otherPositionUnresolved?: string;
};

/**
 * D-79 최소 안전망 — 반대 입장이 주택을 빼 2주택이 됐는데 §155① 짝이 없고, 양도 주택보다 나중에 취득한 행이 정확히 1채면 그 행이 신규 주택일 수 있다.
 * 판정 메뉴 화면은 ④가 반대 입장 짝을 다시 도출해 보내므로(`contestedTemporaryTwoHouse` · 안 A) 이 안전망을 거치지 않는다 — 그 키 없이 오는 입력
 * (직접 API·중과 메뉴)에서만 그 입장의 결론을 단정하지 않는다.
 */
function otherPositionPairUnresolved(input: TransferTaxInput, other: TransferTaxInput): string | undefined {
  if (input.temporaryTwoHouse || other.temporaryTwoHouse) return undefined;
  if (other.householdHousingCount !== 2 || input.householdHousingCount <= other.householdHousingCount) return undefined;
  const later = (other.houses ?? []).filter(
    (h) => h.id !== other.sellingHouseId && h.acquisitionDate.getTime() > other.acquisitionDate.getTime(),
  );
  if (later.length !== 1) return undefined;
  return (
    "반대 입장에서는 남은 다른 주택이 일시적 2주택(소득세법 시행령 §155①)의 신규 주택일 수 있는데, 이 판정은 그 특례를 다시 따져 보지 않아 " +
    "반대 입장의 결론을 단정하지 않습니다 — 확인이 필요합니다."
  );
}

/** 2017.2.3. 전 양도에서 C2·C7 반대 입장을 겹쳐 적용했을 때의 B 요지 보충(결정 #10 조건 형식 · 2026-11 리뷰 D-88). */
const C2_C7_COMBINED_NOTE =
  "2017. 2. 3. 전 양도라 공동상속주택 소수지분을 모두 주택 수에서 빼고 판정했습니다 — 동일세대 소수지분과 다른 소수지분이 한 사건에 함께 나온 결정은 확인하지 못했습니다(확인 필요).";

function otherInheritedRows(input: TransferTaxInput): HouseInfo[] {
  return (input.houses ?? []).filter((h) => isHeirInheritedHouse(h) && h.id !== input.sellingHouseId);
}

function withRows(input: TransferTaxInput, ids: string[], patch: (h: HouseInfo) => HouseInfo): TransferTaxInput {
  return { ...input, houses: (input.houses ?? []).map((h) => (ids.includes(h.id) ? patch(h) : h)) };
}

/**
 * 판정 메뉴 엔진 입력(명부에서 주택 수를 도출한 뒤)에서 양론 사실 패턴을 찾는다.
 * 상속주택 쟁점(C1·C2)은 **주택 양도**일 때만 — 입주권 양도는 §155②③을 「다른 주택」에서 빼지 않는다(G065).
 */
export function detectContestedIssues(
  input: TransferTaxInput,
  /**
   * STEP 0.95의 정본 상속주택 제외 결과(echo — `exemptionJudgeInput.inheritedHouseExclusionDetail`). 조특법으로 먼저 뺀 행을 「제외하지 못한
   * 소수지분」으로 세지 않게 한다(NH-13 · 2026-11 리뷰 D-87). 입력에 펼치지 않는다 — 반대 입장 입력에 낡은 결과가 실려 재판정으로 새지 않게.
   */
  opts: { inheritedExclusion?: InheritedHouseExclusionResult } = {},
): DetectedContestedIssue[] {
  const out: DetectedContestedIssue[] = [];
  /**
   * D-79 안 A — 판정 메뉴 ④가 반대 입장의 제외 결과로 §155① 짝을 다시 도출해 보낸다(`contestedTemporaryTwoHouse`). 받았으면 C2·C7 반대 입장 입력의
   * 짝을 그 값으로 바꾼다(엔진 입장의 짝은 그대로). 보내지 않은 입력(직접 API·중과 메뉴)은 종전 동작 — 짝을 다시 만들지 않았으니 결론을 단정하지 않는
   * 최소 안전망을 둔다.
   */
  const withUnresolved = (d: DetectedContestedIssue) => {
    if (input.contestedTemporaryTwoHouse !== undefined) {
      d.otherPositionInput = { ...d.otherPositionInput, temporaryTwoHouse: input.contestedTemporaryTwoHouse ?? undefined };
      return;
    }
    const note = otherPositionPairUnresolved(input, d.otherPositionInput);
    if (note) d.otherPositionUnresolved = note;
  };

  if (input.propertyType === "housing") {
    // C1 — 엔진(B)은 상속주택 그대로. 반대(A)는 그 행을 상속주택이 아닌 주택으로.
    const gifted = otherInheritedRows(input)
      .filter((h) => h.inheritedGiftedToHouseholdMember === true)
      .map((h) => h.id);
    if (gifted.length > 0) {
      out.push({
        id: "155-2-inherited-house-gifted-within-household",
        houseIds: gifted,
        otherPositionInput: withRows(input, gifted, (h) => ({
          ...h,
          isInherited: false,
          inheritedDate: undefined,
          isCoInherited: undefined,
          isLargestCoInheritedShareholder: undefined,
          decedentSameHouseholdAtInheritance: undefined,
          decedentHouseholdUnconfirmed: undefined,
          parentalCareMergeInheritedHouse: undefined,
          reInheritedFromSeparateHousehold: undefined,
          isRankingDisqualifiedInheritedHouse: undefined,
          inheritedGiftedToHouseholdMember: undefined,
        })),
      });
    }

    // C2 — 엔진(A)은 소수지분에도 동일세대 게이트. 반대(B)는 그 행의 게이트를 열어(동일세대 아님과 같은 입력) 판정.
    const minority = otherInheritedRows(input)
      .filter(
        // 동일세대로 답한 행만 — 모름·미답(`decedentHouseholdUnconfirmed`)은 같은 세대라는 사실이 아니라 확인 필요라 양론 대상이 아니다(#42-2)
        (h) =>
          h.isCoInherited === true &&
          h.isLargestCoInheritedShareholder !== true &&
          h.decedentSameHouseholdAtInheritance === true &&
          !passesHouseholdGate(h),
      )
      .map((h) => h.id);
    if (minority.length > 0) {
      const flipped = withRows(input, minority, (h) => ({ ...h, decedentSameHouseholdAtInheritance: false }));
      // D-88 — 2017.2.3. 전 양도면 게이트를 연 뒤에도 「제외하지 못한 소수지분」(2채 이상 → 제외 0 · #172)이 남을 수 있다. 그 행은 C7의 B 입장으로
      //   빼야 C2의 B 결론이 C7의 A 규칙에 묶이지 않는다. 낡은 결과(echo)를 지우고 정본으로 다시 센다.
      const stillMinority = isBeforeCoInheritedRankingClause(input.transferDate)
        ? resolveInheritedHouseExclusionFromInput(flipped).unexcludedCoMinorityHouseIds
        : [];
      out.push({
        id: "155-3-same-household-co-inherited-minority",
        houseIds: minority,
        otherPositionInput:
          stillMinority.length > 0 ? withoutRosterRows({ ...flipped, inheritedHouseExclusionDetail: undefined }, stillMinority, true) : flipped,
        ...(stillMinority.length > 0 ? { otherPositionNote: C2_C7_COMBINED_NOTE } : {}),
      });
      withUnresolved(out[out.length - 1]);
    }

    // C7 — 2017.2.3. 전 양도(「선순위 1주택」 한정 신설 전). 엔진(A)은 소수지분을 제외하지 못한 행을 주택 수에 남긴다.
    //   반대(B)는 그 행들을 명부에서 빼고 주택 수를 다시 구해 판정. 감지 집합은 엔진 정본(`unexcludedCoMinorityHouseIds`)이 낸다.
    //   같은 피상속인으로 한정하지 않는다(부부가 각자 받은 소수지분도 개정 전 양도분이면 대상). C2(동일세대)는 게이트 통과 행만 센다.
    if (isBeforeCoInheritedRankingClause(input.transferDate)) {
      // STEP 0.95의 정본 결과(echo)를 이어받는다 — 조특법으로 이미 뺀 행을 「주택 수에 남은 소수지분」으로 세지 않는다(NH-13).
      const ids = (opts.inheritedExclusion ?? resolveInheritedHouseExclusionForJudgment(input)).unexcludedCoMinorityHouseIds;
      if (ids.length > 0) {
        // D-88 — 대칭으로 C2 대상(동일세대 소수지분 · 게이트 불통과)도 함께 뺀다. 그 행이 남으면 C7의 B가 C2의 A 규칙에 묶인다.
        const sameHouseholdMinority = minority.filter((id) => !ids.includes(id));
        out.push({
          id: "155-3-co-inherited-minority-before-ranking-clause",
          houseIds: ids,
          // 행과 함께 그 행에 연결된 조특 제외·감면 선언도 걷는다 — 남기면 빼낸 주택을 한 번 더 뺀다(D-87 · D-59와 같은 leaf).
          otherPositionInput: withoutRosterRows(input, [...ids, ...sameHouseholdMinority], true),
          ...(sameHouseholdMinority.length > 0 ? { otherPositionNote: C2_C7_COMBINED_NOTE } : {}),
        });
        withUnresolved(out[out.length - 1]);
      }
    }
  }

  // C8 — 엔진(A)은 종전주택 보유 중 취득한 분양권이 완공된 갈래에 §155①(완공일 기산)을 적용. 반대(B)는 §156의3②·③으로 판정(결정 #43).
  const tth = input.temporaryTwoHouse;
  if (input.propertyType === "housing" && tth?.newHouseOrigin && isHoldingPresaleOrigin(tth)) {
    out.push({
      id: "155-1-presale-holding-completion",
      houseIds: [],
      otherPositionInput: {
        ...input,
        temporaryTwoHouse: { ...tth, newHouseOrigin: { ...tth.newHouseOrigin, holdingPresalePosition: "156_3" } },
      },
    });
  }

  // C6 — 엔진(B)은 입주권에 §155④ 부적용. 반대(A)는 동거봉양 합가에도 합가 상대 쪽 1채 제외.
  if (input.propertyType === "right_to_move_in" && input.parentalCareMerge && !input.marriageMerge) {
    out.push({
      id: "155-4-parental-care-merge-right-sale",
      houseIds: [],
      otherPositionInput: { ...input, contestedRightSaleParentalCareMergeApply: true },
    });
  }

  return out;
}

/** §155① 짝을 반대 입장 기준으로 다시 도출하는 쟁점 — 반대 입장이 주택 수에서 빼는 행이 달라지는 것(D-79). */
const PAIR_REDERIVED_ISSUES: ReadonlySet<OneHouseContestedIssueId> = new Set([
  "155-3-same-household-co-inherited-minority",
  "155-3-co-inherited-minority-before-ranking-clause",
]);

/**
 * C2·C7 반대 입장이 주택 수에서 빼는 명부 행 id — 반대 입장 입력에서 걷어 낸 행 ∪ 그 입력의 상속주택 제외 행(D-79 안 A).
 * 판정 메뉴 ④가 §155① 신규 주택 후보에서 이 행들을 더 빼고 짝을 다시 도출한다. 감지·반대 입장 입력은 `detectContestedIssues` 한 곳에서 만든다 —
 * 화면이 술어를 다시 쓰지 않는다(single-source). 쟁점이 없으면 빈 배열.
 */
export function contestedPairPositionExcludedRowIds(
  input: TransferTaxInput,
  opts: { inheritedExclusion?: InheritedHouseExclusionResult; specialActHouseIds?: ReadonlySet<string> } = {},
): string[] {
  const ids = new Set<string>();
  for (const d of detectContestedIssues(input, { inheritedExclusion: opts.inheritedExclusion })) {
    if (!PAIR_REDERIVED_ISSUES.has(d.id)) continue;
    const kept = new Set((d.otherPositionInput.houses ?? []).map((h) => h.id));
    for (const h of input.houses ?? []) if (!kept.has(h.id)) ids.add(h.id);
    const other = { ...d.otherPositionInput, inheritedHouseExclusionDetail: undefined };
    for (const e of resolveInheritedHouseExclusionFromInput(other, opts.specialActHouseIds).excludedHouses) ids.add(e.houseId);
  }
  return [...ids];
}

export function contestedVerdictOf(j: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt">): ContestedVerdict {
  return j.isExempt ? "exempt" : j.isPartialExempt ? "partial" : "taxable";
}

/** 본 판정 결론과 반대 입장 재판정 결론으로 화면용 쟁점을 만든다. */
/** 결과에 카드를 싣는가 — route가 한 곳에서 거른다(결과뷰·이력·중과 요약은 그대로 route 값을 읽는다 · D-89). */
export function isContestedIssueShown(issue: Pick<OneHouseContestedIssue, "id" | "conclusionsDiffer">): boolean {
  return !SPECS[issue.id].shownOnlyWhenConclusionsDiffer || issue.conclusionsDiffer;
}

export function buildContestedIssue(
  detected: Pick<DetectedContestedIssue, "id" | "houseIds" | "otherPositionNote" | "otherPositionUnresolved">,
  engineVerdict: ContestedVerdict,
  otherVerdict: ContestedVerdict,
): OneHouseContestedIssue {
  const spec = SPECS[detected.id];
  const verdictOf = (key: ContestedPositionKey) => (key === spec.enginePosition ? engineVerdict : otherVerdict);
  // 반대 입장 보충 문장(D-88)은 엔진 입장이 아닌 쪽 요지에 잇는다.
  const noteFor = (key: ContestedPositionKey) =>
    key !== spec.enginePosition && detected.otherPositionNote ? { summary: `${spec[key].summary} ${detected.otherPositionNote}` } : {};
  return {
    id: detected.id,
    title: spec.title,
    legalBasis: spec.legalBasis,
    enginePosition: spec.enginePosition,
    positions: [
      { key: "A", ...spec.A, ...noteFor("A"), verdict: verdictOf("A") },
      { key: "B", ...spec.B, ...noteFor("B"), verdict: verdictOf("B") },
    ],
    conclusionsDiffer: engineVerdict !== otherVerdict,
    ...(detected.otherPositionUnresolved && engineVerdict === otherVerdict ? { otherPositionUnresolved: detected.otherPositionUnresolved } : {}),
    houseIds: detected.houseIds,
  };
}
