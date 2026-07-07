# 수정 계획서 — 건물 기준시가 잔가율 "내용연수 그룹(+10)" 경계 2013 → 2016 정정

- 영역: 건물 기준시가 엔진(양도·상속·증여 공용) · 경과연수별 잔가율
- 상태: **Plan (착수 전)** · 작성 2026-07-07
- 관련: [[feedback_anchor_correction_legal_priority]] · [[feedback_engine_comment_vs_impl_drift]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_historical_tax_tables]] · [[project_transfer_phd_3point_batch_stdprice]]

---

## §0 확정 (국세청 홈택스 3개 데이터 포인트로 검증)

경과 1년(신축 다음해) 잔가율 실측:
| 평가연도 | 철근콘크리트 | 연와조 | 정답 그룹 | era |
|---|---|---|---|---|
| **2015** | **0.980** | **0.970** | 철근 Ⅱ(40)·연와 Ⅲ(30) | **era-B** |
| **2016** | **0.982** | **0.9775** | 철근 Ⅰ(50)·연와 Ⅱ(40) | **era-C** |
| **2026** | **0.982** | **0.9775** | 철근 Ⅰ(50)·연와 Ⅱ(40) | **era-C** |

→ **내용연수 그룹 "+10" 개정 경계 = 2016년** (2015는 아직 era-B, 2016부터 era-C). 잔존율 개정(0.2→0.1)과 **동일한 2016년 개정**.

## §1 근본 원인

우리 엔진은 **잔존율 경계는 2016**(`residual-rate.ts:residualMinByDurable`, 정확)인데 **내용연수 그룹 경계만 2013**(`structure-group-map.ts:128`)으로 3년 이르게 잡혀 있음:
```ts
// structure-group-map.ts:127-129 (resolveResidualGroupForYear)
if (valuationYear <= 2002) return resolveResidualGroup2001(structureKey);
if (valuationYear <= 2012) return resolveResidualGroupEraB(structureKey);  // ← 2012
return resolveResidualGroup(structureKey);                                  // era-C: 2013+
```
→ **2013·2014·2015 평가연도**가 잘못 era-C(+10)로 계산됨. 구조에 따라 내용연수가 한 그룹 길어져(예: 철근 40→50, 연와 30→40) **잔가율 과대 → 건물기준시가 과대**. (경과 0년은 모든 그룹 1.000이라 신축 당해연도 취득은 영향 없음 — 차이는 경과 1년부터.)

유래: `residual-rate.ts:14` 주석 "2013~2026 era-C(+10)". PDF 실측 시 **개정연도를 2013으로 오인**(실제 2016). era-B/era-C 매핑 정의 자체는 **정확**(2015=era-B·2016=era-C 검증 완료) — 경계만 틀림.

**보강 근거(자가검토)**: `structure-index.ts`의 구조지수표도 **"8행 체계(2012~2015)" ↔ "11행 체계(2016~2026)"** 로 **2016에서 블록이 바뀝니다**(`:158`·`:68`). 즉 국세청 2016 개정에서 구조지수 체계·내용연수 멤버십·잔존율이 **함께** 바뀐 것 — 잔가율 멤버십만 2013 경계로 어긋난 게 명백. (2013·2014도 2012~2015 블록에 속하므로 era-B 확정.)

**수정 완결성(자가검토)**: `resolveResidualGroup`(era-C, 무연도)은 `structure-group-map.ts` 내부(era-B 도출·2001 fallback)에서만 building-block으로 쓰이고, 엔진 계산은 전부 `resolveResidualGroupForYear`(연도인식) 경유(`building-standard-price-helpers.ts:151` 단일 진입). → **경계 1줄 수정으로 전 경로 커버**(우회 없음).

## §2 수정 (엔진 1줄 + 주석)

1. **`structure-group-map.ts:128`**: `valuationYear <= 2012` → **`valuationYear <= 2015`**.
   → 2003~2015 = era-B, 2016~ = era-C. (era-B 매핑·era-C 매핑은 무변경.)
2. **주석 갱신**(정합):
   - `structure-group-map.ts:99·101·117·124` "era-B(2003~2012)" → "era-B(2003~2015)", "2013~ era-C" → "2016~ era-C".
   - `residual-rate.ts:9-15` era 설명 블록 동일 갱신(era-B 2003~2015 / era-C 2016~2026). "+10 경계 = 2016(잔존율 개정과 동일)" 명시.
   - `ERA_B_DURABLE_FIXED`·`durableEraB` 주석의 "2003~2012" → "2003~2015".

## §3 anchor 갱신 (틀린 고정값 정정 — [[feedback_anchor_correction_legal_priority]])

### 3-A. `residual-eras.test.ts` — 멤버십 시대 경계(틀린 2013) 정정
| 라인 | 현재(틀림) | 정정 |
|---|---|---|
| `:23` rc | 2013→"I"(era-C) | 2013·**2015→"II"**(era-B), **2016→"I"**(era-C) |
| `:34` brick | 2013→"II" | **2015→"III"**, **2016→"II"** (경계 bracket) |
| `:39` cement_block | 2013→"III" | **2015→"IV"**, **2016→"III"** |
| `:105-120` rc 복합값 | `2013 era-C I(50)·경과23=0.632` | **`2015 era-B II(40)·경과23 = 0.54`**(1−23×0.02) + `2016 era-C I(50)·경과25 = 0.55`(1−25×0.018) |
| describe/주석 `:5·19·31·36` | "2013~2026 era-C" | "2016~2026 era-C" |

**무변경(정확)**: `:54-67` 잔존율 anchor(2016 경계) · **`:70-102` `calcResidualRate(그룹레터,…)` 값 anchor** — 이건 그룹 레터의 값(멤버십 아님)이라 수정 무관(예 `:77` `calcResidualRate("I",1,2014)=0.984` 유지).

### 3-B. `anchor.test.ts` BSP-06 — 취득 2015 rc 값 정정 (핵심)
`:115-134` 취득 2015·rc·built 2010·경과 5 — 현재 era-C(Ⅰ/50)로 고정됨:
| 라인 | 현재(틀림) | 정정 |
|---|---|---|
| `:130` residualRate | `0.92` (Ⅰ/50 step0.016·경과5) | **`0.90`** (Ⅱ/40 step0.02·경과5) |
| `:131` standardPrice | `82,200,000` | **`80,400,000`** (893,750×0.90=804,375→804,000×100) |
| `:116-118` 주석 | "2015 50년버킷" | "2015 era-B 40년(Ⅱ)" |
- 양도 2025(era-C) 부분(`:132`)·BSP-07(2001표)·다른 BSP는 **무변경**.

### 3-C. 무영향 확인(수정 불요)
- `phd-3point-batch.anchor.test.ts`(취득 2014): `toBeGreaterThan(0)`만 — 하드코딩 값 없음 → 안전.
- `nts-cases.test.ts`·`nts-cases-2023.test.ts`(builtYear 2015): **valuationYear 2023=era-C**, 그룹은 평가연도로 결정 → 안전.
- self-consistency 테스트(`phd-batch-snapshots`·`phd-building-std-batch-mixed`·`building-std-report-phd-section`): 엔진 vs 엔진 등가 → 안전(값만 변동, 단언 유지).

## §4 회귀 영향 (2013~2015 평가연도만)

- **직접**: 2013~2015 평가연도의 건물기준시가 잔가율(경과 1년↑). 2016~·2012↓·경과 0년은 무변화.
- **공용 엔진**: 양도(§164⑤ PHD·환산취득가·다필지·겸용 Case A/B)·상속·증여 건물평가. 2013~2015 시점을 쓰는 계산 결과가 바뀜.
- **self-consistency 테스트는 안전**: `phd-batch-snapshots.test`·`phd-building-std-batch-mixed.test`·`building-std-report-phd-section.test`는 `directComposite`/재유도 등가(엔진 vs 엔진)라, 엔진이 바뀌어도 등가 유지 → 깨지지 않음. (단 값이 바뀌므로 로그만 변동.)
- **하드코딩 값 anchor(자가검토 전수 완료)**: 실제 값이 바뀌는 건 **`anchor.test.ts` BSP-06 1건**(§3-B). 나머지(nts-cases 2023 era-C·phd-3point-batch toBeGreaterThan·residual-eras 그룹레터값)는 무영향(§3-C).
- ⚠️ Do 착수 시 **최종 확인 grep**: `nts-report-cases.test.ts`·`data.test.ts`·`building-std-price-form.test.ts`에 valuationYear/transferYear/acquisitionYear = 2013·2014·2015 인 하드코딩 값이 추가로 있으면 정정(현재까지 미발견).

## §5 검증 계획

- **anchor(정정+신규)**: `residual-eras.test.ts`에 §0 3포인트 고정 —
  `resolveResidualGroupForYear("rc",2015)="II"`·`("rc",2016)="I"`·`("brick",2015)="III"`·`("brick",2016)="II"`;
  `calcResidualRate("II",1,2015)=0.98`·`calcResidualRate("III",1,2015)=0.97`·`calcResidualRate("I",1,2016)=0.982`·`calcResidualRate("II",1,2016)=0.9775`.
  (홈택스 실측값과 일치.)
- **회귀**: `npx vitest run __tests__/tax-engine/building-standard-price/` → 전체 `npm test`. 깨진 2013~2015 하드코딩 anchor는 **정답(era-B)으로 정정**(틀린 값 유지 금지).
- **엔진 무변경 확인**: era-B/era-C 매핑 함수(`resolveResidualGroupEraB`·`resolveResidualGroup`)·잔존율(`residualMinByDurable`)은 손대지 않음 — 경계 조건 1줄만.

## §6 리스크

- **R1 (숨은 anchor)**: 2013~2015 평가연도 기대값을 가진 다른 테스트가 회귀로 빨개짐 → 전부 정답으로 정정(§4 grep). 회귀 허용치 0.
- **R2 (경계 정확성) — 낮음**: 2016 확정(홈택스 3포인트: 2015 era-B / 2016·2026 era-C). 2013·2014 개별 홈택스값은 없으나 (i) era-B 매핑이 2015에서 검증됐고, (ii) 구조지수표 "2012~2015 블록"에 2013·2014가 포함(§1 보강근거), (iii) 개정이 단일 2016 → 2013·2014도 era-B 확정. (원하면 2013·2014 홈택스 값 1개씩 추가 확인 가능.)
- **R3 (실무 영향)**: 과거 2013~2015 취득/양도 계산 결과가 바뀜(기준시가↓ 방향 — 잔가율이 낮아지므로). 납세자 유·불리 아닌 **법령 정합** 정정.

## §7 Definition of Done

- [ ] `resolveResidualGroupForYear` 경계 2012→2015 (2013~2015 = era-B)
- [ ] 3포인트 anchor green: 2015=0.980/0.970 · 2016=0.982/0.9775 · 2026 유지
- [ ] `residual-eras.test.ts` 틀린 anchor 정정 + 주석 갱신
- [ ] 숨은 2013~2015 하드코딩 anchor 전수 정정
- [ ] 주석(structure-group-map·residual-rate) era 라벨 2016 경계로 갱신
- [ ] tsc 0 · vitest 전체 green(회귀 0) · 코드 품질 게이트
