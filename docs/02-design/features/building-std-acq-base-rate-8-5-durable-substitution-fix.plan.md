# 수정 계획서 — 취득당시 건물기준시가 산정기준율 §8⑤ "내용연수 종료연도 신축연도 치환" 구현

- 영역: 건물 기준시가 엔진 · 2000.12.31 이전 취득 산정기준율(소령 §164⑤ + 국세청 고시 §8)
- 상태: **Plan (착수 전)** · 작성 2026-07-07
- 관련: [[feedback_engine_comment_vs_impl_drift]] · [[feedback_pre_anchor_verification]] · [[feedback_anchor_correction_legal_priority]] · [[feedback_korean_law_citation_verify]] · [[feedback_historical_tax_tables]] · [[project_transfer_phd_3point_batch_stdprice]]

---

## §0 증상 (사용자 재현)

3시점 건물 기준시가 일괄 계산 — 시멘트블록조·신축 1966·취득 1999·연면적 115·취득공시지가 930,000:
- 최초공시(2005) = 3,220,000 ✅ / 양도(2026) = 10,235,000 ✅
- **취득(1999) = 미산출** — 배너: `취득(2000이전): 산정기준율 미수록(그룹 III·신축 1966·취득 1999)`

## §1 근본 원인 (버그 — 설계 명세 대비 구현 누락)

산정기준율표는 각 신축연도 행의 취득연도 상한이 **`신축연도 + 내용연수`(대각선)** 에서 잘린다. 그룹 III(내용연수 20)·신축 1966 행은 취득 **1986·1985만** 수록 → 취득 1999(신축 후 33년, 내용연수 초과)는 셀 부재 → `resolveAcqBaseRate` **undefined** → `calcAcqBaseBreakdown` **throw**.

국세청 고시 §8⑤가 이 케이스를 규정한다(설계 문서 `building-standard-price.engine.design.md:322-326` 의사코드에 이미 명세):
```
acqYearEff   = acqYear ≤ 1985 ? 1985 : acqYear                    // §8① — 취득연도 의제
builtYearEff = max(builtYear, acqYearEff − 내용연수(acqGroup))    // §8⑤ — 내용연수 종료연도 치환
              // ⚠️ §8③: 신축연도를 1985로 클램프 금지 (그룹 최저행 버킷은 별개)
acqRate = resolveAcqBaseRate(acqGroup, builtYearEff, acqYearEff)
```
즉 **취득연도에서 내용연수를 역산한 종료 연도 이전 신축 건물 → 그 종료 연도(취득−내용연수)를 신축연도로 치환**. 사용자 케이스: `1999 − 20 = 1979`로 치환 → **(III, 1979, 1999) = 1.095** 존재.

**구현 실태** — `acq-base-rate.ts:171-180 resolveAcqBaseRate`:
```ts
if (acqYear > 2000) return undefined;
const bKey = builtYear <= GROUP_MIN_BUILT[group] ? GROUP_MIN_BUILT[group] : builtYear;  // §8③ 그룹최저 클램프
const aKey = acqYear <= 1985 ? 1985 : acqYear;                                          // §8① 취득 클램프
return ACQ_BASE_RATE[group][bKey]?.[aKey];
```
→ §8①(취득 클램프)·§8③(그룹최저 클램프)은 있으나 **§8⑤(내용연수 종료연도 치환)이 없음**. BSP-15(`§8⑤ 내용연수 종료연도 치환`) 테스트는 설계에서 `☐ 재검토 신규` — **작성·구현된 적 없음**.

## §2 확정 근거 (추정 아님 — 실측)

1. **현재 구현 재현**: `calcAcqBaseBreakdown(1999, {cement_block…}, 115, 1966)` → `THROW "산정기준율 미수록(그룹 III·신축 1966·취득 1999)"` (probe 실측).
2. **§8⑤ 공식 전수 검증**: `effBuilt = max(built, acqYearEff − 내용연수)` (I=40·II=30·III=20) 적용 시 —
   - 사용자 케이스: undefined → **1.095** (치환 신축 1979).
   - 전조합(취득≥신축, 그룹×신축×취득): **현재 undefined 360건 → §8⑤ 적용 후 undefined 0건** (1,848건 전부 유효 셀 안착). 이는 표의 대각선이 `신축+내용연수`로 설계됐다는 방증.
3. **내용연수 값 확정**: `acq-base-rate.ts:7` 헤더 "그룹 I(40년)/II(30년)/III(20년)". §8⑤ 치환이 이 값에서만 360건 전부 안착 → 값 자체가 교차 검증됨.
4. **§8⑤ 출처**: 국세청 「건물 기준시가 계산방법」 고시 p.301 (설계 BSP-15·L322-326). ※ 산정기준율 산식은 법령 조문이 아닌 고시 본문 → KoreanLaw 검증 불가, PDF 대조가 유일 출처(설계 §15 명시). 표 구조(360건 정합)가 독립 방증.
5. **§8⑤ 정당성 증명 (실제신축 base2001 × 치환신축 rate = 정확)**: 산정기준율 = (취득당시 기준시가)/(2001 기준시가)이고, 우리는 이 율을 **실제 신축연도(1966)로 산출한 base2001**에 곱한다. 표의 율은 **치환 신축연도(1979) 기준**인데, 두 신축연도의 **2001 기준시가가 동일**하므로 곱셈이 정확하다:
   §8⑤ 발동 조건 = `취득 − 신축 > 내용연수` ⟹ `2001 − 신축 ≥ 취득 − 신축 > 내용연수` ⟹ **2001 시점에 실제신축·치환신축 둘 다 내용연수 초과 = 잔가율 최저(동일)**. 잔가율이 flat(최저)이라 base2001(1966) ≡ base2001(1979). 즉 근사가 아니라 **정확**. (내용연수 이내 취득이면 §8⑤ 미발동 → 치환 없음.)

## §3 수정 (엔진 1곳 — surgical)

**`acq-base-rate.ts` `resolveAcqBaseRate` §8⑤ 치환 추가.** `acqYearEff`(§8①) 먼저 산출 → `builtYearEff`(§8⑤) → 그룹최저(§8③) 순.

```ts
const DURABLE_BY_GROUP: Readonly<Record<AcqBaseRateGroup, number>> = { I: 40, II: 30, III: 20 };

export function resolveAcqBaseRate(group, builtYear, acqYear): number | undefined {
  if (acqYear > 2000) return undefined;
  const aKey = acqYear <= 1985 ? 1985 : acqYear;                          // §8① 취득연도 의제
  const builtEff = Math.max(builtYear, aKey - DURABLE_BY_GROUP[group]);   // §8⑤ 내용연수 종료연도 치환
  const bKey = builtEff <= GROUP_MIN_BUILT[group] ? GROUP_MIN_BUILT[group] : builtEff;  // §8③(그룹최저; 1985 클램프 아님)
  return ACQ_BASE_RATE[group][bKey]?.[aKey];
}
```
- **주석 정합**: 헤더(`:11`)·JSDoc(`:167-170`)의 "값 없는 셀 = 미수록 → undefined"를 §8⑤ 치환 후 잔여 미수록(취득<신축 등)만 undefined로 갱신.

**단일 진입점 확인**: 산정기준율 조회는 전부 `resolveAcqBaseRate` 경유 →
`building-standard-price-helpers.ts:453`(단건 취득), `:495-496`(공동주택 환산 최초공시·취득), `building-standard-price.ts:203`(복합 취득). **한 곳 수정으로 4경로 전부 커버.**

**2001 기저는 무변경**: `calcAcqBaseBreakdown`의 `base2001 = calcPointBreakdown(2001, …, builtYear)`은 **실제 신축연도(1966)** 로 2001 잔가율 산출 → 치환은 산정기준율 조회에만 국한. (설계 L319-320 일치.)

## §4 회귀 영향 (순수 가산 — 기존 통과 케이스 무변화)

- **치환 대상 = 내용연수 초과 취득(현재 전부 throw)**. built > acqYearEff − 내용연수인 정상 케이스는 `max`가 built 그대로 → **결과 불변**.
- 실증: 현재 360건은 전부 undefined(→throw)라 **어떤 기존 테스트도 이들의 값을 단언하지 않음** → 회귀 0, 순수 커버리지 확대.
- §8③ 그룹최저 클램프는 §8⑤의 특수해(acqYearEff=1985일 때 `1985−내용연수 = 그룹최저`)로 흡수됨 — 동작 동일, 안전망 유지.
- **기존 `data.test.ts` anchor 전수 불변 검증(실측)**: `:225-240`(대각선·클램프 anchor) 전부 §8⑤ 수정 후 동일값. 특히 `:238 (I,1940,1980)=1.215`은 `aKey`(1985 클램프) 우선 후 `1985−40=1945` 정합. `:246 (I,2000,1999)=undefined`는 §8④(취득<신축) 케이스로 치환 후에도 `ACQ.I[2000][1999]` 부재 → undefined 유지. **회귀 0 확정.**

## §5 anchor (Pre-Do 우선 작성 — [[feedback_pre_anchor_verification]])

신규 `transfer-pre2001.test.ts`(BSP-15) 또는 `residual-eras.test.ts`에 추가:

1. **함수 단위(§8⑤ 치환)**:
   - `resolveAcqBaseRate("III", 1966, 1999) === 1.095`  (치환 신축 1979)
   - `resolveAcqBaseRate("III", 1979, 1999) === 1.095`  (치환 불필요 — 동일값, 등가성)
   - `resolveAcqBaseRate("I", 1959, 2000) === 1.047`  (그룹 I 대각 컷: 1959<2000−40=1960 → 치환 1960, 실측 확정)
   - `resolveAcqBaseRate("III", 1990, 2000) === (III,1990,2000 원값)`  (내용연수 이내 — 치환 없음 회귀가드)
   - **§8④ 회귀가드**: `resolveAcqBaseRate("I", 2000, 1999) === undefined` (취득<신축 — 치환 후에도 부재, `data.test.ts:246` 유지)
   - 전수 가드: `for group×built×acq(취득≥신축)` 미수록 0건 (§2-2 재현).
2. **엔진 통합(사용자 케이스)**: `calcAcqBaseBreakdown(1999, {cement_block, usageNo, 930000}, 115, 1966)` →
   - `acqBaseRate === 1.095`, `standardPrice > 0` (throw 아님).
   - 정확값은 실제 usageNo(단독주택 용도지수)로 Do 시 확정 후 고정. (probe usageNo=1 예시: pricePerM2 48,000 × 115 × 1.095 = **6,044,400** — usageNo=1은 아파트라 단독주택 값과 다름, placeholder.)
   - ⭐ **gold anchor(최우선)**: 이 계산기의 목적은 국세청 홈택스 일치. Do 착수 시 동일 입력(시멘트블록조·1966·1999·115·930,000)의 **홈택스 취득 건물 기준시가 실측값**을 확보해 원단위 `toBe()` 고정. 홈택스 값 확보 불가 시 산식 손계산(pricePerM2_2001 × 면적 × 1.095)으로 대체하되, acq(1999)와 최초공시(2005)·양도(2026)의 상대 크기 정합성(역전 원인)도 손계산으로 설명.
3. **경계 §8④(취득<신축, 완공 전 취득)**: **본 수정 범위 밖**. 현재도 미수록→undefined. §8④(검증 차단 금지)는 별개 이슈로 분리(scope out) — 오검출 방지 위해 anchor로 현행 동작만 문서화, 수정 안 함.

## §6 리스크

- **R1 (정확값 usageNo 의존 + 홈택스 대조)**: 최종 standardPrice는 단독주택 용도지수 의존. Do 시 실제 usageNo로 산출·고정. acq(1999)>최초공시(2005) 역전이 반직관 → **홈택스 실측값과 대조**해 산식 정합 확인(§5-2 gold anchor). — 낮음(치환율 1.095는 확정, 역전은 산정기준율>1 + 연도별 구조지수/잔가율 차이로 설명 가능).
- **R2 (§8⑤ 해석)**: 설계 의사코드 L322-326 + 표 구조 360건 정합으로 확정. 다른 해석은 표를 미수록으로 남김(모순). — 낮음.
- **R3 (실무 영향)**: 그동안 내용연수 초과 취득분(2000이전)이 **전부 미산출(에러)** 이던 것이 정상 산출로 전환 → 기능 복구(회귀 아님). 2000이전·내용연수 초과 취득 케이스 전반 영향(그룹 III 20년 초과가 최다).

## §7 Definition of Done

- [ ] `resolveAcqBaseRate` §8⑤ 치환 구현(`builtEff = max(built, acqYearEff − 내용연수)`)
- [ ] `DURABLE_BY_GROUP` 상수(I=40·II=30·III=20) 추가
- [ ] 주석(헤더·JSDoc) §8⑤ 치환 반영 정합
- [ ] anchor: `resolveAcqBaseRate("III",1966,1999)=1.095` + `("I",1959,2000)=1.047` + 전수 미수록 0건 가드 + 회귀가드(치환 없는 정상) + §8④ 가드(`("I",2000,1999)=undefined`)
- [ ] anchor: 사용자 케이스 `calcAcqBaseBreakdown` throw→값 산출(실 usageNo 정확값 고정, 가능 시 홈택스 gold anchor)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/building-standard-price/` 통과 · 전체 `npm test` 회귀 0
- [ ] 브라우저 수동 확인(3시점 모달: 취득시 건물 기준시가 산출 + "모두 적용")
- [ ] 코드 품질 정적 검토 게이트
