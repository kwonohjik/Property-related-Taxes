/**
 * 「소득세법 시행령」 §155① 후단 — **일부 수용 뒤 잔존 주택 양도 기한** 연혁 (확정 역사 데이터 · 정적 상수)
 *
 * 「종전의 주택 및 그 부수토지의 일부가 제154조제1항제2호가목에 따라 협의매수되거나 수용되는 경우로서 해당 잔존하는 주택 및
 * 그 부수토지를 그 양도일 또는 수용일부터 N년 이내에 양도하는 때에는 해당 잔존하는 주택 및 그 부수토지의 양도는 종전의 주택 및
 * 그 부수토지의 양도 또는 수용에 포함되는 것으로 본다」의 N — 양도일 기준(각 개정령 부칙 「시행 후 (최초로) 양도하는 분부터」):
 *
 * | 양도일 | N | 근거 |
 * |---|---|---|
 * | 2002-03-30 ~ 2012-06-28 | 2년 | 대통령령 제17555호(후단 신설 · MST 59031) 부칙 ② · 2012-04-15 시행본(MST 124667)도 2년 |
 * | 2012-06-29 ~ 2017-02-02 | 3년 | 대통령령 제23887호(MST 126479) 부칙 제2조 · 2017-01-20 시행본(MST 191214)도 3년 |
 * | 2017-02-03 ~ | 5년 | 대통령령 제27829호(MST 191522) 부칙 제2조② |
 *
 * 경계일 앞뒤 시행본을 KoreanLaw로 실독했다(2026-11-13 — 20020329·20020330·20120628·20120629·20170202·20170203).
 *
 * 🔴 §154①2호 후단(`expropriation-remnant-era.ts` — 2013-02-15 전 2년 · 이후 5년)과 **연혁이 다르다**. 그 함수를 쓰면
 *    2012-06-29 ~ 2013-02-14(§155 3년 · §154 2년)와 2013-02-15 ~ 2017-02-02(§155 3년 · §154 5년)가 어긋난다.
 *
 * 2002-03-30 전 양도분은 본문 괄호형(기한의 기산점 자체가 수용일)이라 구조가 다르다 — 2009.3.16. 전 양도는 범위 밖이라 다루지 않는다
 * (`undefined` = 이 후단을 적용하지 않는다).
 */
export const TT_REMNANT_2Y_TRANSFER_START = new Date("2002-03-30");
export const TT_REMNANT_3Y_TRANSFER_START = new Date("2012-06-29");
export const TT_REMNANT_5Y_TRANSFER_START = new Date("2017-02-03");

/** 수용일부터 잔존 주택을 양도해야 하는 기한(년) — 양도일 기준. 후단이 없던 때는 `undefined`. */
export function resolveTempTwoHouseRemnantYears(transferDate: Date): 2 | 3 | 5 | undefined {
  const t = transferDate.getTime();
  if (t >= TT_REMNANT_5Y_TRANSFER_START.getTime()) return 5;
  if (t >= TT_REMNANT_3Y_TRANSFER_START.getTime()) return 3;
  if (t >= TT_REMNANT_2Y_TRANSFER_START.getTime()) return 2;
  return undefined;
}
