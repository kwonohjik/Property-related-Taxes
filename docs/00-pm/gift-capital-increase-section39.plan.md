# 작업 계획서 — 증자에 따른 이익의 증여(상증법 §39) 6 계산사례 완전 구현

> 브랜치 `feat/gift-capital-increase` · 작성 2026-06-25 · **v3 (R1 13건 + R2 6건 + 디자인검토 정정)** · 근거: 교재 27장(이미지1~27) + KoreanLaw MCP 본문 대조 + 현행 엔진 vitest probe 실측
>
> **검증 표기**: `[확인]`=KoreanLaw 본문 대조 / `[교재만/통칙]`=법령 본문 부재·통칙·예규 영역 / `[검증불가]`=법제처 법령 API 비대상(NTS 통칙·예규 별도 확보) / `[probe]`=현행 엔진 실측 / `[R1]`=독립검토 정정

---

## 0. 결론 (TL;DR)

§39 증자이익 증여는 **단건(스칼라) 모드로 14지점이 연결**돼 있으나, 교재 6사례는 **cap-table 기반 다수증자·다증여자 배분 + 검증내역(zero-sum)**을 요구한다. 6사례 anchor는 독립 재계산으로 **전 항목 일치(floor drift 0)** 확인됨 `[R1-anchor]`.

핵심 갭(probe 실측):
- **유형④ 고가 재배정**: `forfeited_realloc`이 `relatedAcquiredShares`/`ratioDenomShares` 가중을 **무시**(`capital-increase.ts:77-81`) → 사례4는 weight=1.0이라 우연히 300M 일치, 실제론 버그 `[probe]`
- **유형②⑤⑥**: 분모·㉯는 정합이나 **1증여자만** 계산(부+모 분할 불가) `[probe]`
- **법령 §29②2호(저가 실권처리)의 현행 엔진 산식 자체는 정합** — 갭은 "교재 다수증자 통칙 배분(지분비율)" 미적용이지 법령 버그 아님 `[R1-legal #9]`

해법: ⓐ primitive 정밀화(④ 가중 버그 수정 + ② ㉯용 `equalIssueShares?` 1필드) + ⓑ cap-table 오케스트레이터(수증자별·증여자별 분할 + **floor 잔액 흡수** + **수증자 집계 단계 30%·3억 게이트** + 특수관계 부재 0행).

> ⚠️ **R1 주요 정정**: ① `donorWeight` 신규필드 도입 철회 → 기존 `relatedAcquiredShares`/`ratioDenomShares` 재사용(dual-truth 회피, Simplicity First). ② 신규 type은 **"격리" 아님 — `DeemedGiftType` union 멤버 추가 = META·피커·prefill 연쇄 확장**(노선 A 확정). ③ floor 잔액·집계 게이트·특수관계 0행은 **오케스트레이터 책임**으로 명문화.
>
> ⚠️ **구현 환류(Do)**: 오케스트레이터를 **equity-delta 방식**(지분 자산 증감=증여재산가액·손해비례 배분, 교재 호별 산식과 대수적 동치)으로 구현 → primitive 무변경, R1/R2 난점(floor·게이트 분모·subType dispatch·② 비대칭) 구조적 소거. 상세: engine.design.md "구현 환류" 절. **엔진+테스트(Phase 0~B) 완료: 6사례 15 anchor + gift-deemed 120/120 + tsc 0.** API 배선(C)·UI(D)·E2E(E)는 후속.

---

## 1. 목표 · 범위

### 1.1 성공 기준 (검증 가능 목표)
교재 6사례의 **모든 수증자별·증여자별 증여재산가액**을 원단위 `toBe()`로 재현하고, **6사례 전부**(사례3 포함)의 **검증내역 증감 합계 = 0**(zero-sum)을 자기일관 anchor로 보증한다. 추가로 **비정수 가중 floor 잔액 = 0**, **집계 게이트 정합**을 경계 anchor로 보증(6사례가 모두 정수분할·게이트 충족이라 6사례만으론 이 둘을 검증 못 함 `[R1-design F1·F2]`).

### 1.2 범위 (6사례 = 법령 6유형 전수)
| 교재유형 | 본문 호·목 (§39①) | 시행령 (§29②) | 법령 분모 유무 | 적용 사례 |
|---|---|---|---|---|
| ① 저가 실권주 재배정 | 1호 가목 | 1호 | 없음(직접 곱) | 사례1·사례2(재배정분) |
| ② 저가 실권주 실권처리 | 1호 나목 | 2호 | **법령 분모 없음**(다수증자 지분비율 배분=통칙) | 사례2(실권처리분) |
| ③ 저가 제3자직접배정·주주초과배정 | 1호 다·라목 | 1호 | 없음(직접 곱) | 사례3 |
| ④ 고가 실권주 재배정 | 2호 가목 | 3호 | **법령 분모 없음**(증여자별 실권주총수 배분=통칙) | 사례4 |
| ⑤ 고가 실권주 실권처리 | 2호 나목 | 4호 | **법령 분모=균등증자 증자주식총수** | 사례5 |
| ⑥ 고가 제3자직접배정·주주초과배정 | 2호 다·라목 | 5호 | **법령 분모=주주아닌자 배정신주+균등초과 인수신주 총수** | 사례6 |

> **호 매핑은 KoreanLaw 본문 대조로 전부 정확 확인 — 틀린 호 번호 0건** `[R1-legal 총평]`.

### 1.3 비범위
- **전환주식 §39①3호(영 §29②6호)** — 6호 = `가목(전환 후 §29②1~5호 이익) − 나목(발행 당시 §29②1~5호 이익)` 차감구조 `[확인, R1-legal #5]`. `convertible-stock.ts:12-13`이 `calcCapitalIncreaseGift`를 2회 호출 → **④ 가중 버그 수정이 이 경로도 통과**(donorWeight 미도입·기존 필드 재사용이므로 미입력 시 무해). convertible-stock anchor 회귀 verify 포함 `[R1-sync #5]`.
- 상장 권리락 후 2월 종가평균 자동조회 — Min/Max 골격만, 측정값 입력
- **자기주식 발행총수 제외**(재삼46014·대법2007두5363) — 6사례 입력에 자기주식 없어 영향 0, 비범위 명시 `[R1-legal #12]`
- §39② 소액주주 1인 의제 신규 — 기존 구현 유지(`small-shareholder-imputation-anchor.test.ts` **9건** 보존 `[R1 #6/#7]`)

---

## 2. 현황 진단 (4축 분석 요약)

| 축 | 결론 | 근거 |
|---|---|---|
| 법령 | 호 매핑 전부 정확. ②④의 다수증자/증여자 배분은 **법령 본문 부재 → 통칙·재산-60 위임** `[검증불가]` | 상증법 MST 276123 / 상증령 MST 283637 |
| 엔진 | ④ 가중 버그 실재 / ②⑤⑥ 단건 한정 / **②의 법령 산식 자체는 정합** | `capital-increase.ts:77-81` probe |
| 14동기화 | 단건 모드 연결. **신규 type 추가는 엔진-타입 union+META 연쇄 확장**(격리 불가) | `types.ts:9-29,280-300`·`shared.tsx:338` |
| 테스트 | 6사례 독립 재계산 전 항목 일치·floor drift 0 | `[R1-anchor 총평]` |

### 2.1 현행 엔진 유형별 판정 (probe 실측)
| 유형 | 현행 매핑 | 법령 산식 정합 | 교재 다수증자 배분 | 근거 file:line |
|---|---|---|---|---|
| ① | `low`+`forfeited_realloc` | ✅ 정합 | 1수증자 한정 | `capital-increase.ts:28` |
| ② | `low`+`no_realloc` | **✅ 법령 정합**(gain×실권주수+게이트) | ❌ 지분비율 배분(통칙) 미적용 | `capital-increase.ts:32-36` |
| ③ | `low`+`third_party`/`excess` | ✅ 정합 | 1수증자 한정 | `capital-increase.ts:38-39` |
| ④ | `high`+`forfeited_realloc` | ⚠️ **가중 버그**(related 필드 무시) | 증여자 분할 불가 | `capital-increase.ts:77-81` |
| ⑤ | `high`+`no_realloc` | ✅ 분모·㉯ 정합(갑분 187.5M) | 1증여자만 | `capital-increase.ts:83-91` |
| ⑥ | `high`+`excess`/`third_party` | ✅ 분모 정합(갑분 80M) | 1증여자만 | `capital-increase.ts:92-95` |

> ②의 "❌ 미구현" 표현은 과대주장이라 정정 — **법령 §29②2호 산식은 현행 정합**, 갭은 교재 다수증자 통칙 배분뿐 `[R1-legal #9, feedback_numeric_impact_verify_before_bug_claim]`.

---

## 3. 법령 정합 (산식 + 법령 vs 통칙 분리)

### 3.1 유형별 산식 — **법령 요소 vs 통칙 귀속 분리** `[R1-legal #1·#2]`
㉮=증자전 1주당 평가, ㉯=증자후 1주당 평가, ㉰=신주 1주당 인수가.

**㉯ 산식(비상장)** `[확인]` — 전 유형 동일, `computeWeightedPerShare`(BigInt floor):
```
㉯ = [(㉮ × 증자전 발행주식총수) + (㉰ × 증가주식수)] ÷ (증자전 발행주식총수 + 증가주식수)
```
- 증가주식수 = **실제 증자결과 기준**(② 균등가정 ㉯는 후술 통칙). 상장: 저가 Min·고가 Max(영 §29②가목 단서) `[확인]`, 측정 통칙 39-29…2 `[검증불가]`

| 유형 | 법령 산식(수증자 1인 귀속 이익) | 증여자별 배분(증여세 과세단위) | 법령 분모 | 30%·3억 |
|---|---|---|---|---|
| ① | (㉯−㉰)×배정받은 실권주수 | — | 없음 `[확인]` | 무관 `[확인]` |
| ② | (㉯−㉰)×실권주수 | **수증자별 지분비율 배분 = 통칙** `[교재만/통칙]` | 없음 `[확인]` | **적용** `[확인]` |
| ③ | (㉯−㉰)×직접배정·균등초과 신주수 | — | 없음 `[확인]` | 무관 `[확인]` |
| ④ | (㉰−㉯)×신주포기자 실권주수 | **증여자별 (인수실권주÷실권주총수) = 통칙** `[교재만/통칙]` | 없음 `[확인]` | 무관 `[확인]` |
| ⑤ | (㉰−㉯)×포기자실권주수×(특수관계인 인수신주÷**균등증자총수**) | **법령 분모가 곧 증여자 귀속** | 균등증자 증자주식총수 `[확인]` | **적용** `[확인]` |
| ⑥ | (㉰−㉯)×미달신주×(특수관계인 인수신주÷**주주아닌자배정+균등초과총수**) | **법령 분모가 곧 증여자 귀속** | 주주아닌자배정+균등초과 `[확인]` | 무관 `[확인]` |

> **핵심 구분 `[R1-legal #1·#2]`**: ⑤⑥은 증여자 귀속 분수가 **법령 본문에 명문**(분모=균등증자총수/초과총수)이라 법령 산식이 곧 per-donor. **②④는 법령이 수증자 1인 귀속 "총이익"만 규정**하고(분모 없음), 수증자별(②)·증여자별(④) 추가 배분은 **통칙·재산-60 영역**이다. 따라서 ②④의 배분 분모(②=실권주총수×지분비율, ④=실권주총수)는 법령 산식 요소가 아니라 통칙 귀속 도구임을 anchor 주석에 명기.

### 3.2 정정·주의 사항
1. **②⑤ 30%·3억 게이트만** — ①③④⑥ 무관. **게이트는 수증자 집계 이익 기준**(증여자별 몫이 아님) `[R1-design F2]`. OR 조건(30%↑ 또는 3억↑) `[확인]`
2. **§39② 소액주주 1인 의제 = 저가(①②③)만** — "제1항 제1호를 적용할 때". 고가(2호)·전환(3호) 미적용 `[확인]`. §29⑤ = 발행총수 1/100 미만 AND 액면합계 3억 미만 `[확인]`
3. **②의 균등가정 ㉯·지분비율 배분은 법령 산식 아님 — 통칙** — 사례2 실권처리분 ㉯=20,000(균등 50,000 가정)·을 25%·병 12.5% 배분 전부 `[교재만/통칙]`. 법령 ㉯=실제증가(80,000→22,500). 분모(균등증자총수)·㉯ 균등가정 모두 통칙 근거 주석 필수
4. **⑤만 ㉯의 증가주식수가 실제 인수분(60,000)** — 사례5 ㉯=17,500. **⑤ 분모(균등 100,000)와 ㉯ 증가주식수(60,000)는 서로 다른 값** — Do-time 혼동 방지 대비표 필수 `[R1-legal #6]`
5. **R2 재서술 — "호 매핑 모순" 아님** `[R1-legal #1]`: 사례4는 재배정 → §39①2호 가목 → §29②3호(분모 없음)가 **정상**. 병=300M·정=100M은 `(㉰−㉯)×포기자실권주수`로 분모 없이 직접 도출. 40,000은 3호 산식 밖의 **통칙 증여자 귀속분배 분모**. → "사실관계로 3호 vs 4호 호 판정" 프레임 폐기. ④=§29②3호 확정, 증여자 배분만 통칙 별도 처리
6. **⑦(전환주식) = §29②1~5호 준용 후 차감** — `가목(전환후 1~5호 이익)−나목(발행시 1~5호 이익)`. "①~⑥ 준용"(자기참조) 표현 정정 `[R1-legal #5]`
7. **§53⑧3호 할증배제 — 현행 코드 정상**. 엔진 이미 `§53⑧` 정확 인용(`lib/tax-engine/property-valuation/max-shareholder-premium.ts:13`). 신규 표기 시 `상증령 §53⑧3호`(20% 근거 §63③). **고칠 드리프트 없음** `[확인, R1-legal #8]`

### 3.3 검증불가 — Do 전 NTS 예규 별도 확보
- ②의 수증자 지분비율 배분·④의 증여자 실권주총수 배분 + 재산-60(2010.2.1)·통칙 39-29…2 → 법제처 API 비대상 `[검증불가]`. 교재 anchor로 동결하되 근거를 "통칙/재산-60"으로 표기. **anchor 동결 ≠ 법령정합 회피** — anchor 값 자체는 교재(NTS 실무) 기준이며, 법령 본문과의 차이(②④ 배분)를 주석으로 분리 `[feedback_anchor_correction_legal_priority]`

---

## 4. 케이스 매트릭스 (6사례 전수 anchor — 동결 대상)

모든 값 원단위. **독립 재계산으로 전 항목 일치·floor drift 0 확인** `[R1-anchor]`.

### 사례1 — 저가 재배정(유형①)
증자전 50,000주@㉮30,000, ㉰10,000×50,000주. 父갑 25,000 포기 → 子을 재배정 25,000.
- ㉯=20,000. **을 = (20,000−10,000)×25,000 = 250,000,000**

### 사례2 — 저가 재배정+실권처리(①+②) · 1수증자 2-subType 합산
증자전 50,000주@30,000, ㉰10,000×50,000주. 父갑 30,000 포기 → 10,000 재배정(을), 20,000 실권처리. 증자후 80,000.
- **재배정분(①)**: ㉯=(50,000×30,000+30,000×10,000)/80,000=22,500. 을 재배정분=(22,500−10,000)×10,000=**125,000,000**
- **실권처리분(②, 통칙배분)**: ㉯(균등 50,000)=20,000. 게이트(수증자 집계): (20,000−10,000)/20,000=50%≥30% ✓
  - 을 지분비율=(30,000−10,000)/80,000=25% → 을=(20,000−10,000)×20,000×25%×(20,000/20,000)=**50,000,000**
  - 병 지분비율=10,000/80,000=12.5% → 병=(20,000−10,000)×20,000×12.5%×(20,000/20,000)=**25,000,000**
- **합계: 을 = 125,000,000+50,000,000 = 175,000,000 / 병 = 25,000,000**

### 사례3 — 저가 제3자직접배정+초과배정(③)
증자전 100,000주@30,000, ㉰10,000×100,000주. 父갑 60,000 포기 → 을 초과 20,000·병 제3자 40,000.
- ㉯=20,000. **을(초과)=200,000,000 / 병(제3자)=400,000,000**

### 사례4 — 고가 재배정(④) · 2수증자 × 2증여자 (증여자 배분=통칙)
증자전 100,000주@㉮10,000, ㉰30,000×100,000주. 子병 30,000·子정 10,000 포기 → 父갑 30,000·母을 10,000 재배정(실권주총수 40,000). 이익자=포기자(병·정), 증여자=인수자(부·모).
- ㉯=20,000. 법령 §29②3호 총이익: 병=(30,000−20,000)×30,000=**300,000,000**, 정=(30,000−20,000)×10,000=**100,000,000**(분모 없음)
- **증여자 배분(통칙 ÷실권주총수 40,000)**: 병 = 갑 (×30,000/40,000)=225,000,000 + 을 (×10,000/40,000)=75,000,000 / 정 = 갑 75,000,000 + 을 25,000,000

### 사례5 — 고가 실권처리(⑤) · 2증여자 분할(법령 분모) + 특수관계 없는 자 미과세
증자전 100,000주@10,000, ㉰30,000×100,000주 예상. 子병 30,000·소액주주 10,000 포기 실권처리. 父갑·母을 인수(참여 60,000). **갑·을과 소액주주 특수관계 없음.**
- ㉯(실제 증가 **60,000**)=17,500. 게이트: (30,000−17,500)/17,500=71.4%≥30% ✓. **분모=균등증자총수 100,000(≠㉯ 증가주식수 60,000)**
- **병 = 225,000,000** = 갑 (×50,000/100,000)=187,500,000 + 을 (×10,000/100,000)=37,500,000
- **소액주주**: 산식상 `(30,000−17,500)×10,000×(60,000/100,000)`=75,000,000(부62.5M+모12.5M) 산출되나 **인수자(갑·을)와 특수관계 부재 → §39①2호 본문 특수관계인 요건 불충족 → 과세 0** `[R1-legal #7]`. (§29⑤ 소액주주 의제 무관 — 고가는 §39② 비대상)

### 사례6 — 고가 제3자직접배정+초과배정(⑥) · 2수증자 × 2증여자(법령 분모)
증자전 100,000주@10,000, ㉰20,000×100,000주. 子병·子정 인수포기(미달). 父갑 초과 20,000 + 母을(주주 아닌 제3자) 직접 30,000(참여 100,000). **분모=제3자30,000+초과20,000=50,000**(자동도출 금지·입력 또는 검증).
- ㉯=15,000. **병(미달 40,000)=200,000,000** = 갑(×20,000/50,000)=80,000,000 + 을(×30,000/50,000)=120,000,000 / **정(미달 10,000)=50,000,000** = 갑 20,000,000 + 을 30,000,000

### 검증내역 zero-sum (6사례 전부 — 사례3 포함, 증여자별 분해) `[R1-anchor #1·#2, R1-design F8]`
| 사례 | 수증(+) | 증여자 손해(−) | 합 |
|---|---|---|---|
| 1 | 을 250,000,000 | 갑 250,000,000 | 0 |
| 2 | 을175M+병25M = 200,000,000 | **갑 200,000,000**(병 손해 0) | 0 |
| 3 | 을200M+병400M = 600,000,000 | **갑 600,000,000** | 0 |
| 4 | 병300M+정100M = 400,000,000 | 갑(225M+75M)+을(75M+25M)=400,000,000 | 0 |
| 5 | 병 225,000,000 | 갑187.5M+을37.5M=225,000,000 (소액주주분 75M 양변 제외) | 0 |
| 6 | 병200M+정50M = 250,000,000 | 갑(80M+20M)+을(120M+30M)=250,000,000 | 0 |

---

## 5. 설계 — 2층 구조 (R1 정정 반영)

### 5.1 ⓐ primitive 정밀화 (`capital-increase.ts` 수정, ~150줄)
**`donorWeight` 신규필드 도입 철회** — 기존 `relatedAcquiredShares`/`ratioDenomShares` 재사용으로 dual-truth·과복잡 회피 `[R1 #3·#4, feedback_ui_engine_dual_truth_avoidance]`. 추가는 **㉯ 균등가정용 1필드만**:
```ts
export interface CapitalIncreaseInput {
  // ...현행 필드 유지 (하위호환)...
  /** ② 실권처리 ㉯ 균등증자(당초지분 유지) 가정 증자주식총수. 미입력 시 issuedShares 사용 (통칙 근거 주석) */
  equalIssueShares?: number;
  /** ②⑤ 30%·3억 게이트를 오케스트레이터가 집계단계 판정 → true면 primitive 게이트 skip(raw 반환). 미입력=현행 게이트 [디자인검토 eng#1] */
  skipThreshold?: boolean;
}
```
**수정 3건** `[R2 #5]`:
1. **④ 가중 버그 수정** — `increaseHigh` `forfeited_realloc` 분기(`capital-increase.ts:77-81`)가 `relatedAcquiredShares`/`ratioDenomShares`를 **읽도록** 수정: `value = denom>0 ? safeMultiplyThenDivide(base, numer, denom) : base`. 미입력 시 `base`(현행 동작=weight 1.0) → 하위호환 + 기존 `[CI-HIGH-A]` anchor 보존(weight 1.0 암묵 주석 보강).
2. **② 균등 ㉯** — `increaseLow` `no_realloc`에서 `㉯ = computeWeightedPerShare(…, equalIssueShares ?? issuedShares)`. 미입력 시 현행(실제) 동작.
3. **`skipThreshold?` optional** — `increaseLow`/`increaseHigh` `no_realloc`의 30%·3억 게이트(`capital-increase.ts:34-35,88-90`)를 `skipThreshold===true`면 건너뛰고 raw `base`/`weighted` 반환. 미입력=현행 게이트 유지(②⑤ 단건 anchor 회귀 보존). 게이트는 오케스트레이터가 **수증자 집계 단계**에서 단일 판정(5.2 step1).

> **유형별 가중 메커니즘 — ②④의 비대칭 명문화** `[R1-design F4, R2 #1]`: **현행 `increaseLow`(②③①)는 `relatedAcquiredShares`/`ratioDenomShares`를 구조적으로 안 읽는다**(probe 실측). 따라서 ②의 증여자 귀속은 primitive가 아니라 **오케스트레이터가 `forfeitedShares = 실권주총수 × 수증자지분비율 × (증여자실권주 ÷ 실권주총수)`로 증여자별 사전 환산**해 `increaseLow no_realloc`를 호출(통칙). 사례2는 증여자 1명(갑)이라 마지막 분수=1. 반면 ④⑤⑥(고가)은 primitive가 `relatedAcquiredShares÷ratioDenomShares`로 증여자 귀속 처리(④=÷실권주총수 통칙, ⑤=÷균등증자총수 법령, ⑥=÷초과총수 법령). **즉 ② 가중은 오케스트레이터 환산, ④⑤⑥ 가중은 primitive 필드 — 메커니즘이 비대칭이며 의도된 것**(low 분기 미수정으로 기존 단건 회귀 0). 6사례엔 다증여자 ② 없음 → §8에 **② 2증여자 경계 anchor** 1건으로 환산 경로 검증.

### 5.2 ⓑ cap-table 오케스트레이터 (함수는 `capital-increase-allocation.ts` 신규 ~280줄, **타입은 types.ts co-locate**)
"primitive를 N회 호출하는 reduce" — **자체 세법로직 재구현 금지**(dual-truth 회피). 책임: **집계 게이트 → 증여자 enumerate → primitive 호출 → floor 잔액 흡수 → 특수관계 0행 → zero-sum 검증**.

> **타입 배치 결정 `[R2 #3]`**: 기존 20개 deemed union input은 **전부 `types.ts`에 co-locate**되고 엔진 파일이 단방향 import(역import 없음). 따라서 `CapitalIncreaseAllocationInput`·`CapShareholder`·`DonationSplit`·`CapitalIncreaseAllocationResult`도 **`types.ts`에 정의**, `capital-increase-allocation.ts`엔 **함수만**. `DonationSplit.subType`이 `CapitalIncreaseInput["subType"]`를 참조하므로 같은 파일(types.ts) 내 완결 → T2 union·T3 판별자 **순환 import 없음**.

```ts
export interface CapShareholder {
  id: string; name?: string;
  preShares: number;          // 증자 전 보유
  entitledShares: number;     // 균등(당초지분) 배정 신주수
  subscribedShares: number;   // 실제 인수 신주수
  reallocatedShares?: number; // 재배정받은 실권주수(① 직접배정·초과 포함)
  relatedTo?: string[];       // 특수관계인 주주 id (없으면 해당 증여자분 0행 — 사례5 미과세 판정 단일원)
  // isSmallShareholder 제거 [디자인검토 integ#2]: §39② 소액주주 1인 의제는 cap-table 모드 비범위
  //   (기존 단건 capital_increase + small-shareholder-imputation 9건이 §39② 담당). smallShareholderImputed 항상 false.
}
export interface CapitalIncreaseAllocationInput {
  direction: "low" | "high";
  preIssuePrice: number; preIssueShares: number;
  newSharePrice: number; issuedShares: number;       // 실제 증가주식수(㉯ ①④⑤⑥, ⑤도 실제인수분)
  equalIssueShares: number;                           // 균등증자 가정 총수(② ㉯·⑤ 분모)
  excessDenominator?: number;                         // ⑥ 분모(제3자배정+초과). 행 합으로 결정적 도출 가능 — 5.3 참조
  shareholders: CapShareholder[];
}
export interface DonationSplit {
  beneficiaryId: string; donorId: string;
  subType: NonNullable<CapitalIncreaseInput["subType"]>;  // (증여자 × subType) 카르테시안
  value: number;
  excludedReason?: string;   // 특수관계 부재 등 → value 0
}
export interface CapitalIncreaseAllocationResult {
  type: "capital_increase_allocation";              // 판별자 (DeemedGiftInput union)
  perBeneficiary: Array<{ beneficiaryId: string; total: number; byDonor: DonationSplit[] }>;
  /** 교재 검증내역 = 주주별 증자전·후 평가·증감 (UI ⑦ 바인딩 단일원) [디자인검토 Critical integ#1·ui#1] */
  byShareholder: Array<{ id: string; name?: string; preValuation: number; paidIn: number; postValuation: number; delta: number }>;
  smallShareholderImputed: boolean;                 // cap-table 모드 항상 false (§39② 비범위)
  reconciliation: { totalGain: number; totalLoss: number; balanced: boolean };  // Σ(+delta)=totalGain, Σ(−delta)=totalLoss
  splits: DonationSplit[];
}
```
- **검증내역 데이터 모델 통일** `[디자인검토 Critical]`: 교재 검증내역(이미지: 갑 증자전750M→증자후500M=−250M, 을 +250M)은 **주주별 지분 전후평가** 표다 → 엔진 result `byShareholder`로 노출. `preValuation = preShares×㉮`, `paidIn = subscribedShares×㉰`, `postValuation = (preShares+인수신주)×㉯`, `delta = postValuation − preValuation − paidIn`. **Σdelta = 0**(zero-sum). `reconciliation`은 byShareholder delta에서 도출(증여재산가액 = +delta = 수증, −delta = 증여자 손해). UI 검증내역 표는 `byShareholder` 바인딩.
- **결과 타입 전부 array/object** — Map 금지(`feedback_engine_result_map_json_loss`). optional 중첩객체 최소화(undefined JSON 소실 회피) `[R1-design F10·F11]`.

**오케스트레이터 알고리즘(R1 4대 결함 해소)**:
1. **수증자 집계 게이트(②⑤)** `[R1-design F2]`: 수증자별 총 base(전 증여자 합)로 30%·3억 1회 판정 → 통과 시에만 증여자 분배. primitive엔 `skipThreshold` 전달(게이트는 오케스트레이터 단일 책임).
2. **floor 잔액 흡수** `[R1-design F1, feedback_floor_residual_absorption]`: 수증자 raw 총이익을 먼저 정수 확정 → 증여자별 floor 분배, **마지막 증여자 = raw_total − Σ(앞 증여자 floor분)**. 비정수 가중에서 1원 부족 차단.
3. **특수관계 부재 0행(사례5)** `[R1-design F3]`: 증여자(인수자) `relatedTo`에 수증자(포기자) 없으면 `{value:0, excludedReason:"특수관계 부재(§39①2호)"}` 0행 생성(누락 아님). reconciliation에서 0행은 양변 제외.
4. **1수증자 다-subType dispatch(사례2)** `[R1-design F5]`: 같은 수증자가 재배정분(①)+실권처리분(②)에 동시 귀속 시 subType별 호출 → `byDonor`에 (증여자×subType) 행 누적 → `total=Σ`.

**subType별 primitive 인자 매핑 `[R2 #2]`** (같은 증자이벤트에서 ㉯ 인자가 subType마다 다름 — probe: 사례2 ①㉯=22,500·②㉯=20,000, 사례5 ⑤㉯=17,500):
| subType 호출 | primitive `issuedShares` | `equalIssueShares` | `relatedAcquiredShares`/`ratioDenomShares` | `skipThreshold` |
|---|---|---|---|---|
| ① forfeited_realloc(low) | AllocInput.issuedShares(실제 증가) | — | — | — |
| ② no_realloc(low) | AllocInput.issuedShares | **AllocInput.equalIssueShares**(㉯ 균등) | (단일증여자=미입력, 다증여자=환산 forfeitedShares) | 게이트는 오케스트레이터 → true |
| ③ third_party/excess(low) | AllocInput.issuedShares | — | — | — |
| ④ forfeited_realloc(high) | AllocInput.issuedShares | — | 증여자실권주 / **실권주총수**(행 합) | — |
| ⑤ no_realloc(high) | AllocInput.issuedShares(실제 인수분) | — | 증여자인수신주 / **equalIssueShares**(균등총수) | 게이트는 오케스트레이터 → true |
| ⑥ excess/third_party(high) | AllocInput.issuedShares | — | 증여자인수신주 / **excessDenominator**(행 합) | — |
> ① 호출이 실제 증가(사례2=30,000)를 쓰는 근거: AllocInput.issuedShares=실제 증가주식수. ② ㉯만 equalIssueShares(50,000)로 분기. ⑤ ㉯는 issuedShares(실제 인수 60,000), 분모만 equalIssueShares(100,000) — **㉯ 증가주식수≠분모**(§3.2-4).

### 5.3 설계 원칙
- primitive에 다증여자 배열 금지 — 오케스트레이터가 `relatedTo`에서 증여자별 enumerate. merger·contribution 시그니처 일관.
- **분모 도출 = "명시 행의 결정적 합" (안분 아님) `[R2 #C, R1-design F6·legal #4]`**: ④ 실권주총수(40,000)·⑥ 제3자+초과(50,000)는 모두 **주주별 명시 입력**(`entitledShares`·`subscribedShares`·`reallocatedShares`)의 **결정적 합**으로 오케스트레이터가 산출 — 미입력분을 추정 채우는 "자동 안분 fallback"과 구별(`feedback_no_silent_apportion_fallback`은 미입력 추정 금지이지, 명시 행의 합산 금지가 아님). 경계: **모든 주주 행이 명시되면 합산=결정적(허용), 한 행이라도 미입력이면 검증오류(추정 금지)**.
- `excessDenominator`는 ⑥ 분모의 **선택적 명시 오버라이드**(미입력 시 행 합으로 도출). ⑧validate가 **행 합 == (명시 시)excessDenominator** 및 **배정합 == 발행수**를 cross-row 검증 — 자동 보정 없음.

---

## 6. 14 동기화 지점 + 엔진-타입 레이어 (격리 아님 — 노선 A 확정)

> ⚠️ **"신규 type 무수정 격리"는 거짓** `[R1-sync #1·#2]`. `DeemedGiftType`(types.ts:9)·`DeemedGiftInput`(types.ts:280)·`DEEMED_TYPE_META`(shared.tsx:338)·`DeemedFormState.type`(shared.tsx:48)가 **TS-강제 exhaustive** → 멤버 추가 시 연쇄 확장. **노선 A(union 정식 멤버) 확정** — 단건 `capital_increase`(기존)와 **별개 선택형 모드** `capital_increase_allocation`(cap-table) 공존.
>
> ⚠️ **단 ⑨ Zod `discriminatedUnion` 배열·`superRefine`은 TS 미강제** `[R2 #4]` — 멤버 push·분기 추가를 컴파일러가 안 잡음(⑫⑬⑭과 동일 침묵strip 계열). 10장 grep 자가점검에 ⑨ Zod 배열·superRefine 포함.

### 6.0 엔진-타입 레이어 (신설 — TS 강제, 누락 시 컴파일 에러)
| 지점 | file:line | 작업 |
|---|---|---|
| T1 `DeemedGiftType` | `types.ts:9-29` | `"capital_increase_allocation"` 멤버 추가 |
| T2 `DeemedGiftInput` union | `types.ts:280-300` | `({type:"capital_increase_allocation"} & CapitalIncreaseAllocationInput)` 추가 |
| T3 result 판별자 | `types.ts`(co-locate) | `CapitalIncreaseAllocationResult.type` 정합. 타입 4종 전부 types.ts 정의(5.2 결정) |
| T4 `DEEMED_TYPE_META` | `shared.tsx:338` | Record exhaustive — 라벨·law 엔트리 추가 |
| T5 타입 피커 UI | `shared.tsx`(피커) | 선택지 노출 |
| T6 `buildGiftWizardPrefill` | `gift-deemed-api.ts:276` | `DEEMED_TYPE_META[type].label` 참조 — prefill 분기 |

### 6.1 14 동기화 지점 (신규 type 기준)
| # | 지점 | 상태 | file:line | 작업 |
|---|---|---|---|---|
| ① 폼상태 | 신규 | `shared.tsx:107` | `ciAllocShareholders: CapTableRow[]` 배열 필드 |
| ② initial | 신규 | `shared.tsx:254` | **활성=type으로만 판정**(배열 length derive 금지, `feedback_three_state_optional_mode_toggle`). initial=1행 `[R1-sync #9]` |
| ③ normalize | N/A | (독립 계산기) | — |
| ④ API 변환 | 신규 | `gift-deemed-api.ts:103` | **`CapTableRow`(폼 string 필드)→`CapShareholder`(number 필드) 필드별 매핑**(`parseAmount`로 preShares·entitled·subscribed·reallocated 변환, relatedTo 그대로) `[디자인검토 integ#3]`. 명시 입력만 통과·자동 안분 없음 `[R1-legal #4]` |
| ⑤ UI 위젯 | 신규 | `capital-forms.tsx:57` | 주주 다중행 테이블+모달(상속 상속인목록 패턴) |
| ⑥ 사이드바 | N/A | (마법사 사이드바 부재) | — |
| ⑦ 결과 카드 | 신규 | `DeemedGiftResultView.tsx:48` | 수증자별·증여자별 + **검증내역 zero-sum 표** |
| ⑧ validate | 신규 | `gift-deemed-validate.ts:59` | cross-row(배정합=발행수·⑥분모 합)·빈행 정책·**자동보정 금지** |
| ⑨ Zod union | 신규 | `gift-deemed-input.ts:211` | `capitalIncreaseAllocationSchema`를 discriminatedUnion 배열에 push. superRefine(`:225`) cross-row를 ⑧validate와 **한 곳 단일진실** 결정 `[R1-sync #12]` |
| ⑩ Zod 컴패니언 | N/A | (gift-deemed 단일 input) | "N/A" 명기 `[R1-design F9]` |
| ⑪ 자산-수준 fallback | N/A | (자산 배열 없음) | "N/A" 명기 |
| ⑫ Zod 입력객체 | 신규 | `gift-deemed-input.ts:92` | `shareholders: z.array(...)` 중첩. **route.ts:58 `as unknown as` 이중캐스트가 TS 검사 우회 → 필드명 1:1 왕복 단위테스트 전수** `[R1-sync #3]` |
| ⑬ fetch body | 무변경 | `DeemedGiftCalculator.tsx:48` | 제네릭 `JSON.stringify(input)` — 분기는 ④ 귀속. 단 중첩배열 필드 보존은 ⑫(Zod)·⑭(JSON 왕복 anchor)에서 검증 `[R1-sync #8, R2 #6]` |
| ⑭ Route 매핑 | 신규 | `route.ts:42-58` | dispatch. **이중캐스트 우회 → JSON 왕복 anchor 필수** |
| 라우터 | 신규 | `router.ts:40` | `case "capital_increase_allocation"` (T1·T2 선행 필수) |

---

## 7. Phase별 실행 계획

> Do 시퀀셜. **Phase 0~B 완료 = 6사례 + 경계(floor·게이트) 수치 재현**. C~D = UI.

### Phase 0 — Pre-Do anchor (디자인 환류 게이트) ★ 최우선
`pre-do-anchor-verification`. 가장 까다로운 + **R1이 지목한 갭-노출 anchor**:
1. `[CI-S39-C5-HIGH-FORFEIT-병]` — ⑤ ㉯=17,500(issuedShares=실제 60,000), 분모=균등 100,000.
2. `[CI-S39-C6-HIGH-EXCESS-병]` — ⑥ 분모=50,000(명시), 증여자 numer 역전.
3. **`[CI-S39-FLOOR-RESIDUAL]` (신규·R1 F1)** — 비정수 가중(예 3증여자 1:1:1, base 100M) → 증여자 분할 합 === base(99,999,999 아님). 현 C5·C6은 정수분할이라 이 갭을 못 잡음.
4. **`[CI-S39-GATE-AGGREGATE]` (신규·R1 F2)** — 집계 ≥3억·증여자별 <3억·ratio 미충족 → 게이트는 집계 기준 판정(증여자별 탈락 금지).
- **verify**: 4 anchor 실행 → 실패로 primitive 시그니처·오케스트레이터 게이트/잔액 책임 확정 → 5장 환류.

### Phase A — primitive 6유형 정밀화
- `capital-increase.ts`: ④ 가중 버그 수정 + `equalIssueShares` 분기. `types.ts` optional 1필드.
- 회귀: `capital-increase-subcase-anchor.test.ts`(7건) + `capital-subcase`·`capital-transaction`·**`convertible-stock`**(④ 경유) 하위호환 보존. `[CI-HIGH-A]` weight 1.0 주석.
- **verify**: `npx vitest run __tests__/tax-engine/gift-deemed/` 통과.

### Phase B — cap-table 오케스트레이터 + 6사례 통합 anchor
- `capital-increase-allocation.ts` + `_helpers/capital-increase-fixtures.ts` + `capital-increase-case-anchor.test.ts`.
- 6사례 전 anchor(4장) + **6사례 전부 zero-sum**(사례3 포함) + 사례5 특수관계 0행 + Phase 0 경계.
- **verify**: 전 `toBe()` + `expect(수증합 − 증여합).toBe(0)` ×6 + floor·게이트 경계.

### Phase C — API·Zod·validate·엔진타입(T1~T6)
- T1~T6 + ⑨⑫ Zod(중첩배열), ④ 변환, ⑧ cross-row, ⑭ dispatch, 라우터.
- **verify**: `npx tsc --noEmit` 0건 + **AllocationResult JSON 왕복 anchor**(perBeneficiary.byDonor·splits 보존, undefined 소실 0) `[R1-sync #11]` + Zod parse 왕복 필드별 assert.

### Phase D — UI (cap-table 입력 + 검증내역)
- ⑤ 주주 다중행, ①② 폼상태(활성=type), ⑦ 수증자별·증여자별+검증내역, T4·T5 피커.
- UI 규칙: RadioCardGroup/ToggleCard·섹션번호·금액 우측정렬(`amount-column-align`)·결과 내부 id 노출 금지.
- **verify**: Playwright `e2e/gift-deemed-capital-increase.spec.ts` — 사례4 입력 → 병 300M(부225M+모75M)·정 100M·검증내역 0.

### Phase E — 회귀·정리
- 전체 `npm test` + deemed-gift E2E + `ui-engine-sync-checker` + `gap-detector`.
- **verify**: 회귀 0건. 신규 type 추가로 기존 20 deemed 유형·META·피커 영향 0 `[R1-sync #2]`.

---

## 8. 테스트 · anchor 설계
파일: `capital-increase-subcase-anchor.test.ts`(기존 유지) + `capital-increase-case-anchor.test.ts`(신규 6사례) + `_helpers/capital-increase-fixtures.ts`.
- 3층 동결(㉯→수증자별→증여자별) + 증여자 개별호출 합 === 전체 `toBe()`(잔액 자기일관).
- 경계: 30%·3억(②⑤만, **집계 기준**) PASS/FAIL + 3억 단독 + **floor 비정수 가중** + 사례5 `[CI-S39-C5-...-NO-RELATED-PARTY-EXCLUDED]`(특수관계 부재→0, §39①2호 근거·§29⑤ 인용 금지) `[R1-legal #7]`.
- **`[CI-S39-LOW-NR-MULTI-DONOR]` (신규·R2 #1)** — ② 저가 실권처리에 증여자 2명(부·모) 케이스: 오케스트레이터 환산 경로(`forfeitedShares=실권주총수×수증자지분×(증여자실권주÷실권주총수)`)가 증여자별로 정확 분할하는지(6사례엔 없는 ②비대칭 경로 검증). 합 === 단일 집계값 `toBe()`.
- §39② 고가 비대상 `[CI-S39-C4-IMPUTATION-NA]` — 고가 input은 imputation 필드 미사용(타입상 low 경로 전용) `[R1 #11]`. 기존 의제 **9건** 중복 금지 `[R1 #6]`.
- zero-sum **6사례 전부**(사례3 포함).

---

## 9. 리스크 · 미해결
| # | 항목 | 대응 |
|---|---|---|
| R1 | ②④ 배분 분수·재산-60 통칙 `[검증불가]` | 교재 anchor 동결, 근거 "통칙/재산-60" 표기. NTS 예규 원문 확보 권고 |
| R2 | ~~호 매핑 충돌~~ → **해소**: ④=§29②3호(분모없음), 증여자 배분만 통칙 별도 | 5.1·3.2-5 반영 완료 |
| R3 | ⑤ ㉯ 증가주식수(60,000) ≠ 분모(100,000) | 사례5 대비표 + Phase 0 anchor 선검증 |
| R4 | floor 잔액·집계 게이트가 6사례로 미검증 | Phase 0 신규 anchor 2건(F1·F2)으로 강제 노출 |
| R5 | 신규 type 연쇄 확장(META·피커·prefill) | 노선 A 확정·T1~T6 enumerate. 전체 E2E 회귀 |
| R6 | route.ts:58 이중캐스트 침묵strip | JSON 왕복 + Zod 필드별 왕복 단위테스트 |
| R7 | ②④ 가중 메커니즘 비대칭(② 오케스트레이터 환산 / ④⑤⑥ primitive 필드) `[R2 #1]` | 의도된 비대칭(low 미수정=회귀0). 5.1 명문화 + § 8 ② 2증여자 경계 anchor로 환산 경로 검증 |

---

## 10. Definition of Done 체크리스트
- [ ] 케이스 매트릭스 6사례 enumerate (4장 — 완료)
- [ ] Pre-Do anchor 4건(C5·C6·FLOOR·GATE) 우선 실행 → 환류
- [ ] primitive 수정 3건(④ 가중 버그 + ② `equalIssueShares` + `skipThreshold`) 하위호환(미입력=현행), `donorWeight` 미도입
- [ ] 6사례 `toBe()` + zero-sum ×6(사례3 포함) + floor·게이트·② 다증여자 경계 anchor 통과
- [ ] 엔진-타입 T1~T6(타입 4종 types.ts co-locate) + 14지점(⑩⑪ N/A 명기, ⑨ Zod 배열·superRefine·⑫⑬⑭ grep)
- [ ] ④ 어댑터 명시입력만·자동안분 0 / ⑧validate cross-row
- [ ] 결과 array/object only + JSON 왕복 anchor
- [ ] `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/gift-deemed/` 통과 / convertible-stock 회귀
- [ ] Playwright E2E(사례4)
- [ ] `ui-engine-sync-checker` + `gap-detector` matchRate ≥ 90% / 전체 `npm test` 회귀 0

---

## 부록 A — 핵심 파일 경로
| 역할 | 경로 |
|---|---|
| primitive(수정) | `lib/tax-engine/gift-deemed/capital-increase.ts` |
| 헬퍼 | `lib/tax-engine/gift-deemed/capital-helpers.ts` |
| 타입 | `lib/tax-engine/gift-deemed/types.ts` (L9·L144·L280) |
| 오케스트레이터(신규) | `lib/tax-engine/gift-deemed/capital-increase-allocation.ts` |
| 라우터·배럴 | `lib/tax-engine/gift-deemed/router.ts:40`·`index.ts` |
| 전환주식(영향) | `lib/tax-engine/gift-deemed/convertible-stock.ts:12-13` |
| 법령 상수 | `lib/tax-engine/legal-codes/inheritance-gift.ts:128`·`property-valuation/max-shareholder-premium.ts:13`(§53⑧) |
| API 변환·prefill | `lib/calc/gift-deemed-api.ts:103-119,276` |
| Zod | `lib/validators/gift-deemed-input.ts:92-104,211,225` |
| validate | `lib/calc/gift-deemed-validate.ts:59-65` |
| 폼상태·META·피커 | `components/calc/deemed-gift/shared.tsx:48,107,254,338` |
| UI 위젯 | `components/calc/deemed-gift/capital-forms.tsx:57-112` |
| 결과뷰 | `components/calc/results/DeemedGiftResultView.tsx:48-61` |
| Route | `app/api/calc/gift-deemed/route.ts:42-58` |
| 기존 anchor | `capital-increase-subcase-anchor.test.ts`(7건)·`small-shareholder-imputation-anchor.test.ts`(**9건**) |

## 부록 B — KoreanLaw 검증 출처
- 상증법 MST 276123(2026.01.02) · 상증령 MST 283637(2026.02.27)
- §39①1·2·3호 ↔ 영 §29②1~6호 매핑(전부 정확)·§29⑤·§39②"제1항제1호"·영 §53⑧3호·§63③(20%)·영 §29②가목 단서(Min/Max) — 본문 직접 대조 `[확인]`
- ②④ 배분 분수·통칙 39-29…2·재산-60 — 법제처 API 비대상 `[검증불가]`
