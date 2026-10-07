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
 * 🔑 판정 메뉴·계산기의 비과세 분기(`checkExemption` E-5)와 §89② 배제의 예외(`resolveArticle89Clause2`)가
 *    **같은 술어**를 쓴다. 종전에는 §89②가 선언만 보고 예외를 인정해, E-5 요건이 깨지면 입주권이 주택 수에서
 *    빠진 채 일반 1주택 비과세가 났다(M6 — 평가셋 N-G125).
 */
import { isWithinDeadline } from "../civil-period";
import { resolve1562DeadlineYears } from "../data/article-156-2-completion-era";
import type { TransferTaxInput } from "../types/transfer.types";

export type ReplacementHouseInput = Pick<
  TransferTaxInput,
  "acquisitionDate" | "transferDate" | "replacementHouse" | "houses" | "presaleRights" | "sellingHouseId"
>;

/** 대체주택 취득 당시 세대가 보유한 재개발·재건축 대상(명부 주택 + 조합원입주권) 수 — 상속주택 제외 */
export function replacementHouseHeldUnits(input: ReplacementHouseInput): number {
  const acq = input.acquisitionDate.getTime();
  const houses = (input.houses ?? []).filter(
    (h) => h.id !== input.sellingHouseId && !h.isInherited && h.acquisitionDate.getTime() < acq,
  ).length;
  const rights = (input.presaleRights ?? []).filter(
    (r) => r.type === "redevelopment_right" && r.acquisitionDate.getTime() < acq,
  ).length;
  return houses + rights;
}

/** §156의2⑤ 요건을 모두 갖췄는가 — 선언이 없으면 false */
export function meetsReplacementHouse(input: ReplacementHouseInput): boolean {
  const rh = input.replacementHouse;
  if (!rh) return false;
  const meetsAcquisition =
    input.acquisitionDate >= rh.businessApprovalDate && Math.floor(rh.replacementResidenceMonths / 12) >= 1;
  const meetsTransferTiming =
    input.transferDate < rh.completionDate ||
    isWithinDeadline(rh.completionDate, resolve1562DeadlineYears(input.transferDate), input.transferDate);
  // 명부가 없는 입력(계산기 — 주택 수만 입력)은 0이다. 2개 이상이 **보일 때만** 막는다.
  return (
    meetsAcquisition && meetsTransferTiming && rh.willResideNewHouse === true && replacementHouseHeldUnits(input) <= 1
  );
}
