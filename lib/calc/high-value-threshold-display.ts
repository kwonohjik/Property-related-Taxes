/**
 * 입력 화면 안내용 고가주택 기준금액 — 폼의 양도(예정)일 문자열에서 고른다 (OH-65).
 *
 * 🔑 판정은 하지 않는다 — 엔진과 같은 단일 소스 `resolveHighValueHouseThreshold`를 부를 뿐이다.
 *    안내 문구가 「12억」을 리터럴로 적으면 2021-12-07 이전 양도분(9억)에서 입력 화면은
 *    「12억까지 비과세」라 하고 결과 화면은 9억 초과분을 과세해 서로 모순된다.
 *
 * 양도일이 비었거나 읽을 수 없으면 현행 기준(12억)을 돌려준다 — 안내 전용이며,
 * 세액은 계산 시 엔진이 양도일로 다시 정한다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  formatHighValueThresholdLabel,
  resolveHighValueHouseThreshold,
} from "@/lib/tax-engine/one-house/threshold";

const CURRENT_THRESHOLD = 1_200_000_000;

export function highValueThresholdForDisplay(transferDate: string | undefined): {
  amount: number;
  label: string;
} {
  const d = toOptionalDate(transferDate);
  const amount = d ? resolveHighValueHouseThreshold(d) : CURRENT_THRESHOLD;
  return { amount, label: formatHighValueThresholdLabel(amount) };
}
