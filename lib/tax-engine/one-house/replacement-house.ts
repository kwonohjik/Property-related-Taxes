/**
 * 「소득세법 시행령」 §156의2⑤ 대체주택 특례 — **요건 판정 단일 소스** (M5 · M6).
 *
 * 「국내에 1주택을 소유한 1세대가 그 주택에 대한 재개발사업 … 의 시행기간 동안 거주하기 위하여 다른 주택
 * (대체주택)을 취득한 경우로서 다음 각 호의 요건을 모두 갖추어 대체주택을 양도하는 때에는 이를 1세대1주택으로
 * 보아 제154조제1항을 적용한다」
 *   1. 사업시행인가일 이후 대체주택을 취득하여 1년 이상 거주
 *   2. 완성된 주택으로 세대전원 이사해 1년 이상 거주(자기선언 — §156의2⑬ 사후관리)
 *   3. 완성 전 또는 완성 후 N년 이내 대체주택 양도(N은 양도일 연혁 — `resolve1562DeadlineYears`)
 *
 * **세대 구성(M5)** — 대체주택 취득 당시 「국내에 1주택(재개발·재건축 대상)을 소유한 1세대」여야 한다.
 * 대체주택 취득일 전에 취득해 양도일까지 보유하는 명부 주택 + 조합원입주권이 **2개 이상이면** 부적용이다
 * (1개 = 그 사업 대상. 명부 없이 주택 수만 받는 계산기 입력은 0이라 막지 않는다 — 양도 전에 처분한 주택도 보이지 않는다). 상속주택은 ⑦(상속받은 주택과 일반주택·입주권)이 「일반주택과 … 조합원입주권을 소유하고 있는 것으로 보아
 * 제3항부터 제5항까지」를 적용하므로 세지 않는다. 그 밖의 주택(다른 일반주택 · 조세특례제한법 §99의4 농어촌주택 ·
 * 1+1 재건축으로 받은 두 번째 입주권)은 센다 — 기획재정부 재산세제과-1270(2023.10.23. — 대체주택 취득일 현재
 * 2주택 이상 → 부적용) · 서면-2018-법령해석재산-3798(1+1 재건축 입주권 2개 상태) · 사전-2019-법령해석재산-0584
 * (§99의4 농어촌주택을 먼저 취득) — 평가셋 G119·G124·G148.
 *
 * **양도일 현재 구성(S01-1)** — 대체주택 **취득 뒤**(같은 날 포함) 취득해 양도일까지 보유한 명부 주택·조합원입주권·분양권이
 * 있으면 부적용이다. 근거: 사전-2024-법규재산-0614(2024.11.21. — 대체주택 취득 후 분양권을 추가 취득하고 대체주택을 양도하면
 * 「제156조의2 제5항과 같은 법 시행령 156조의3 제2항을 중첩 적용하여 … 제154조 제1항을 적용할 수 없는 것」) · 서면-2024-법규재산-3166
 * (2025.3.24. — 0614 참조, 과세) · 조심2011중2759(2011.10.18. — 「양도당시 3주택을 소유한 것으로 나타나므로」 기각). 주택 수에서 빠지는 행
 * (§155②③ 상속주택·조특법 제외 — 엔진 제외 leaf `knownHouseExclusionHouseIds`)·양도일 당일 이후 취득 행은 세지 않는다.
 * 명부가 없는 입력(계산기 스칼라)은 제외 뒤 주택 수 3 이상이면 막는다 — 대체주택 + 재개발 대상 주택 + 1채 이상 더 있다는 뜻이라
 * 어느 쪽이든 양도일 현재 3주택이다(2주택은 대상 주택이 입주권인지 일반주택인지 알 수 없어 막지 않는다).
 *
 * 🔑 판정 메뉴·계산기의 비과세 분기(`checkExemption` E-5)와 §89② 배제의 예외(`resolveArticle89Clause2`)가
 *    **같은 술어**를 쓴다. 종전에는 §89②가 선언만 보고 예외를 인정해, E-5 요건이 깨지면 입주권이 주택 수에서
 *    빠진 채 일반 1주택 비과세가 났다(M6 — 평가셋 N-G125).
 */
import { isWithinDeadline } from "../civil-period";
import { resolve1562DeadlineYears } from "../data/article-156-2-completion-era";
import { isHeirInheritedHouse, isHeirInheritedRight } from "../transfer-inheritance-exclusion";
import type { TransferTaxInput } from "../types/transfer.types";

export type ReplacementHouseInput = Pick<
  TransferTaxInput,
  "acquisitionDate" | "transferDate" | "replacementHouse" | "houses" | "presaleRights" | "sellingHouseId"
> &
  // 양도일 현재 구성(S01-1) — 엔진 경로는 항상 채우고, 명부·주택 수가 없는 부분 입력은 막지 않는다.
  Partial<Pick<TransferTaxInput, "householdHousingCount" | "knownHouseExclusionHouseIds">>;

type RosterHouse = NonNullable<ReplacementHouseInput["houses"]>[number];

/**
 * 취득 선후를 가리는 날짜 — 기존주택의 연장인 행(원조합원 기존주택·자가 재건축)은 완공일이 아니라 기존주택 취득일이다(결정 #43).
 * 그 신축주택은 대체주택 취득 당시 이미 보유한 재개발·재건축 대상이고, 대체주택 「뒤」에 취득한 주택이 아니다.
 */
const acquiredOn = (h: RosterHouse): Date => h.predecessorHouseAcquisitionDate ?? h.acquisitionDate;

/** 대체주택 취득 당시 세대가 보유한 재개발·재건축 대상(명부 주택 + 조합원입주권) 수 — 상속주택 제외 */
export function replacementHouseHeldUnits(input: ReplacementHouseInput): number {
  const acq = input.acquisitionDate.getTime();
  const houses = (input.houses ?? []).filter(
    (h) => h.id !== input.sellingHouseId && !isHeirInheritedHouse(h) && acquiredOn(h).getTime() < acq,
  ).length;
  const rights = (input.presaleRights ?? []).filter(
    (r) => r.type === "redevelopment_right" && r.acquisitionDate.getTime() < acq,
  ).length;
  return houses + rights;
}

/**
 * 대체주택 취득 **뒤**(같은 날 포함) 취득해 양도일 현재 보유하는 명부 주택·조합원입주권·분양권 수 (S01-1).
 * 대체주택 취득 당시에는 「소유한」 주택이 아니라 위 술어에 들지 않지만 양도일 현재 세대 구성에는 든다.
 *
 * 빼는 것: 양도 주택(대체주택 자신) · 주택 수 제외 행(엔진 STEP 0.9가 정한 `knownHouseExclusionHouseIds`) ·
 * 양도일 당일 이후 취득(「동일자 취득 = 양도 후 취득」) · 상속받은 권리(§156의2⑦ — 불리하게 세지 않는다).
 */
export function replacementHouseHeldAfterAcquisitionUnits(input: ReplacementHouseInput): number {
  const acq = input.acquisitionDate.getTime();
  const transfer = input.transferDate.getTime();
  const excluded = new Set(input.knownHouseExclusionHouseIds ?? []);
  const heldAfter = (d: Date) => d.getTime() >= acq && d.getTime() < transfer;
  const houses = (input.houses ?? []).filter(
    (h) =>
      h.id !== input.sellingHouseId &&
      !excluded.has(h.id) &&
      acquiredOn(h).getTime() >= acq &&
      h.acquisitionDate.getTime() < transfer,
  ).length;
  const rights = (input.presaleRights ?? []).filter((r) => !isHeirInheritedRight(r) && heldAfter(r.acquisitionDate)).length;
  return houses + rights;
}

/** §156의2⑤ 요건을 모두 갖췄는가 — 선언이 없으면 false */
export function meetsReplacementHouse(input: ReplacementHouseInput): boolean {
  const rh = input.replacementHouse;
  if (!rh) return false;
  const meetsAcquisition =
    input.acquisitionDate >= rh.businessApprovalDate && Math.floor(rh.replacementResidenceMonths / 12) >= 1;
  // 3호 「완성되기 전 또는 완성된 후 N년 이내」 — 전단은 완성 전 양도 **선언**이면 완성일 비교가 없다(S15-4). 완성일도 선언도 없으면 불성립.
  const meetsTransferTiming =
    rh.soldBeforeCompletion === true ||
    (rh.completionDate !== undefined &&
      (input.transferDate < rh.completionDate ||
        isWithinDeadline(rh.completionDate, resolve1562DeadlineYears(input.transferDate), input.transferDate)));
  // 명부가 없는 입력(계산기 — 주택 수만 입력)은 0이다. 2개 이상이 **보일 때만** 막는다.
  // S01-1 — 양도일 현재 구성: 대체주택 뒤 취득분이 있거나 제외 뒤 주택 수가 3 이상이면 막는다.
  return (
    meetsAcquisition &&
    meetsTransferTiming &&
    rh.willResideNewHouse === true &&
    replacementHouseHeldUnits(input) <= 1 &&
    replacementHouseHeldAfterAcquisitionUnits(input) === 0 &&
    (input.householdHousingCount ?? 0) < 3
  );
}
