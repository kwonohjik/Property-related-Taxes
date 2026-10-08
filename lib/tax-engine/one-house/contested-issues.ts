/**
 * 1세대1주택 판정 — **해석이 갈리는 쟁점**(양론) 표시 (P4)
 *
 * 국세청 해석과 조세심판원 결정이 서로 다른 결론을 낸 사실 패턴이다. 엔진은 한쪽 입장으로 판정하지만,
 * 판정 메뉴는 그 결론을 단언하지 않고 **두 입장으로 각각 판정한 결론**을 나란히 보여 준다
 * (사용자 결정 2026-10-06 · 2026-10-09). 판정 메뉴 전용이다 — 세액 계산기는 엔진 입장대로 계산한다.
 *
 * | id | 사실 패턴 | 엔진 입장 | 반대 입장 재판정 |
 * |---|---|---|---|
 * | `155-2-inherited-house-gifted-within-household` (C1) | 상속주택(지분)을 동일세대원에게 증여 | B — 상속주택 유지 | 그 행을 상속주택이 아닌 주택으로 |
 * | `155-3-same-household-co-inherited-minority` (C2) | 동일세대원에게서 상속받은 공동상속주택 소수지분 | A — §155② 단서 적용 | 그 행에 §155② 단서(동일세대 게이트)를 적용하지 않음 |
 * | `155-4-parental-care-merge-right-sale` (C6) | 동거봉양 합가 후 조합원입주권 양도 | B — 입주권에 §155④ 부적용 | 혼인합가와 같은 「합가 상대 쪽 1채 제외」 적용 |
 *
 * ⚠️ C1 반대 입장은 **§155② 축만** 뒤집는다 — 명부 행의 상속 사실만 지운다. 그 주택이 §155⑦1호 상속 농어촌주택이기도 하면
 *    농어촌주택 특례(`ruralHouse`)는 그대로 둔다: 서면-2015-부동산-1363이 다룬 것은 §155②뿐이다(평가셋 E109 — 결론 같음).
 * 🔑 반대 입장의 결론은 **같은 판정 파이프라인을 한 번 더** 돌려 얻는다(route). 이 파일은 사실 패턴을 감지하고
 *    반대 입장의 입력을 만들 뿐, 요건을 따로 판정하지 않는다 — 여기서 결론을 손으로 적으면 엔진과 드리프트한다.
 * ⚠️ 혼인합가 후 입주권 양도(§155⑤)는 양론이 아니다 — 적용 쪽으로 결정했다(`right-sale-marriage-merge.ts`).
 *    이농주택으로 다시 귀농(§155⑦3호)도 뒤의 해석이 일관돼 양론으로 보지 않는다(사용자 결정 2026-10-09).
 */
import { INHERITED_HOUSE, TRANSFER } from "../legal-codes";
import { passesHouseholdGate } from "../transfer-inheritance-exclusion";
import type { HouseInfo } from "../types/multi-house-surcharge.types";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

export type OneHouseContestedIssueId =
  | "155-2-inherited-house-gifted-within-household"
  | "155-3-same-household-co-inherited-minority"
  | "155-4-parental-care-merge-right-sale";

export type ContestedPositionKey = "A" | "B";
export type ContestedVerdict = "exempt" | "partial" | "taxable";

export type OneHouseContestedPosition = {
  key: ContestedPositionKey;
  /** 입장 요지 — 이 입장이 그 사실을 어떻게 보는가 */
  summary: string;
  /** 근거 문서번호(결정·회신일) */
  authorities: string[];
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
  /** 쟁점이 걸린 명부 행 id(입주권 쟁점은 빈 배열) */
  houseIds: string[];
};

type PositionText = { summary: string; authorities: string[] };
type IssueSpec = {
  title: string;
  legalBasis: string;
  enginePosition: ContestedPositionKey;
  A: PositionText;
  B: PositionText;
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
    },
    B: {
      summary:
        "동일세대원 사이의 증여는 세대가 보유한 주택 수를 바꾸지 않아 상속주택의 실질이 유지됩니다 — 상속주택으로 보고 판정했습니다.",
      authorities: ["조심-2023-서-10059 (2024.07.09.)"],
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
    },
    B: {
      summary:
        "소수지분권자에게는 §155② 단서를 적용하지 않습니다 — §155③에 따라 공동상속주택 소수지분을 주택 수에서 빼고 판정했습니다.",
      authorities: ["조심-2018-중-0424 (2018.04.19.)", "조심-2023-중-7006 (2024.04.22.)"],
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
    },
    B: {
      summary: "주택에 대한 특례(§155②·④)를 입주권에 유추 적용할 수 없습니다 — §89①4호 요건만으로 판정했습니다.",
      authorities: ["조심-2021-서-1117 (2022.08.10.)"],
    },
  },
};

/** 감지된 쟁점 — 반대 입장으로 재판정할 입력을 함께 싣는다. */
export type DetectedContestedIssue = {
  id: OneHouseContestedIssueId;
  houseIds: string[];
  /** 반대 입장 재판정 입력 — 이 쟁점 하나만 뒤집는다 */
  otherPositionInput: TransferTaxInput;
};

function otherInheritedRows(input: TransferTaxInput): HouseInfo[] {
  return (input.houses ?? []).filter((h) => h.isInherited === true && h.id !== input.sellingHouseId);
}

function withRows(input: TransferTaxInput, ids: string[], patch: (h: HouseInfo) => HouseInfo): TransferTaxInput {
  return { ...input, houses: (input.houses ?? []).map((h) => (ids.includes(h.id) ? patch(h) : h)) };
}

/**
 * 판정 메뉴 엔진 입력(명부에서 주택 수를 도출한 뒤)에서 양론 사실 패턴을 찾는다.
 * 상속주택 쟁점(C1·C2)은 **주택 양도**일 때만 — 입주권 양도는 §155②③을 「다른 주택」에서 빼지 않는다(G065).
 */
export function detectContestedIssues(input: TransferTaxInput): DetectedContestedIssue[] {
  const out: DetectedContestedIssue[] = [];

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
          parentalCareMergeInheritedHouse: undefined,
          reInheritedFromSeparateHousehold: undefined,
          isRankingDisqualifiedInheritedHouse: undefined,
          inheritedGiftedToHouseholdMember: undefined,
        })),
      });
    }

    // C2 — 엔진(A)은 소수지분에도 동일세대 게이트. 반대(B)는 그 행의 게이트를 열어(동일세대 아님과 같은 입력) 판정.
    const minority = otherInheritedRows(input)
      .filter((h) => h.isCoInherited === true && h.isLargestCoInheritedShareholder !== true && !passesHouseholdGate(h))
      .map((h) => h.id);
    if (minority.length > 0) {
      out.push({
        id: "155-3-same-household-co-inherited-minority",
        houseIds: minority,
        otherPositionInput: withRows(input, minority, (h) => ({ ...h, decedentSameHouseholdAtInheritance: false })),
      });
    }
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

export function contestedVerdictOf(j: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt">): ContestedVerdict {
  return j.isExempt ? "exempt" : j.isPartialExempt ? "partial" : "taxable";
}

/** 본 판정 결론과 반대 입장 재판정 결론으로 화면용 쟁점을 만든다. */
export function buildContestedIssue(
  detected: Pick<DetectedContestedIssue, "id" | "houseIds">,
  engineVerdict: ContestedVerdict,
  otherVerdict: ContestedVerdict,
): OneHouseContestedIssue {
  const spec = SPECS[detected.id];
  const verdictOf = (key: ContestedPositionKey) => (key === spec.enginePosition ? engineVerdict : otherVerdict);
  return {
    id: detected.id,
    title: spec.title,
    legalBasis: spec.legalBasis,
    enginePosition: spec.enginePosition,
    positions: [
      { key: "A", ...spec.A, verdict: verdictOf("A") },
      { key: "B", ...spec.B, verdict: verdictOf("B") },
    ],
    conclusionsDiffer: engineVerdict !== otherVerdict,
    houseIds: detected.houseIds,
  };
}
