/**
 * I-26 판정 보류 고지 계약 — 행 형식과 공용 판정 함수(행 파일·드라이버 공용).
 *
 * 계약: 고지 id마다 「결론을 가르는 셀」에서는 고지가 나오고, 고지의 전제 사실(미입력·미확인)은 그대로인데 **다른 사유로 결론이 정해진 셀**에서는
 * 나오지 않는다(2026-11 리뷰 I-26 · D-68·D-69가 이 계약을 어긴 사례). 셀은 `baseTransferInput` 위에 덮어쓰는 엔진 입력이다.
 */
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";

export type EraContractCell = {
  input: Partial<TransferTaxInput>;
  /** `checkExemption`의 분양권 기준일(§89② — 생략하면 넘기지 않음) */
  presaleRightStartDate?: Date;
  /** 판정 기준일(판정 메뉴 — 이미 지난 기한 안내 억제). 생략하면 넘기지 않음 */
  judgmentBaseDate?: Date;
};

export type EraContractRow = {
  id: string;
  /**
   * 결론을 가르는 셀 — 고지가 나온다. 실데이터로 고지를 만들 수 없는 id(예: 표 누락이 전제인 고지)만 null — 그때는 `decidesWhy`에
   * 계약을 대신 지키는 mock anchor 파일을 적고 `silent`도 null로 둔다(행 파일은 모듈 mock을 쓸 수 없다).
   */
  decides: EraContractCell | null;
  /** 왜 결론을 가르는가(어떤 사실을 바꾸면 결론이 바뀌는가) — 한 줄 */
  decidesWhy: string;
  /**
   * 결론 불변 셀 — 같은 미입력·미확인 사실을 두고 다른 사유로 결론이 정해져 고지가 나오지 않는다.
   * 이 고지 설계상 그런 셀을 만들 수 없으면 null — `silentWhy`에 사유(예: 결론과 무관하게 늘 알리는 것으로 정한 고지 · 결정 번호).
   */
  silent: EraContractCell | null;
  /** 무엇이 결론을 고정하는가(silent가 null이면 null인 이유) — 한 줄 */
  silentWhy: string;
  /** 계산기 경고에도 같은 문장이 나오는지 보지 않는 이유(판정 기준일 의존 등). 생략 = 본다 */
  calcParitySkip?: string;
  /**
   * 계산기 대조에만 덮어쓰는 입력 — 두 경로가 같은 사실을 다른 모양으로 받는 칸(예: 판정 엔진 직접 호출은 상속주택을 뺀 뒤의 주택 수,
   * 계산기는 원래 주택 수에서 STEP 0.95로 스스로 뺀다). 생략 = `decides.input` 그대로.
   */
  calcInput?: Partial<TransferTaxInput>;
};

const RATES = makeMockRates();
const RULES = parseRatesFromMap(RATES).oneHouseSpecialRules;

export function judgeCell(cell: EraContractCell) {
  return checkExemption(
    baseTransferInput(cell.input) as OneHouseJudgeInput,
    RULES,
    cell.presaleRightStartDate,
    cell.judgmentBaseDate ? { judgmentBaseDate: cell.judgmentBaseDate } : undefined,
  );
}

export const undeterminedIds = (cell: EraContractCell) => judgeCell(cell).undetermined.map((u) => u.id);

export function calcWarnings(cell: EraContractCell): string[] {
  return calculateTransferTax(baseTransferInput(cell.input), RATES).warnings ?? [];
}
