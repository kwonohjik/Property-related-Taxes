# 재산세 A-3 후속 잔여 4건 구현 계획서 (Track A~D)

> **선행**: `property-tax-cap-recompute.plan.md`(A-3 §118 정밀 재산정 P1~P6 ✅PR#228 머지) §7 잔여 후속 + §100-101 범위 외.
> **작성**: 2026-06-16. 모든 file:line·세율값은 실측, 법령 인용은 KoreanLaw 본문 검증(지방세법 MST 282559 / 시행령 MST 286395, 조회기준 20260616).
> **worktree**: 미생성(계획 단계). 구현 시 **트랙별 격리 worktree**(`scripts/wt-new.sh`) — 트랙 간 파일 충돌 최소.
> **방침**: 4건은 독립 PR 가능. 권장 순서 **B → A → C → D**(§7). 각 트랙 Pre-Do anchor 우선 + 단일 응답 완주.

---

## 0. 개요 — 잔여 4건

| Track | 항목 | 성격 | 난이도 | 독립성 | 권장 |
|---|---|---|---|---|---|
| **A** | 분리과세 calc 연도화 (`separate-taxation.ts` classify 3함수 rateSet 파라미터화) | 구조 통일·회귀 | 중하 | 독립 | 2 |
| **B** | recompute 결과 표시 (엔진 result echo + 결과뷰 산식 라벨) | A-3 마무리·가치↑ | 중 | 독립 | **1** |
| **C** | 고급선박 5% (§111①4호 가목) | 신규 기능 | 중 | 독립 | 3 |
| **D** | §118 호별 (1호 나·다·라 + 2호 나·다) | 정밀 재산정 확장 | 최상 | A 후 권장 | 4(확인) |

**B 우선 이유**: recompute 모드는 이미 작동(P4)하나 결과 화면이 `taxCapRate`만 표시 → 직전연도 재산정 산식이 사용자에게 안 보이는 "반쪽 완성". 엔진 변경 최소(echo)로 즉시 가치. **D는 최대 작업 + v1 제외였던 항목** → 착수 전 실무 필요성·범위 사용자 확인.

---

## 1. 법령 근거 (KoreanLaw 본문 검증)

### §111(세율) ①4호 — 선박 [본법]
- **가목 고급선박**(§13⑤5호) — 과세표준의 **1천분의 50** (= 0.05, 5%)
- **나목 그 밖의 선박** — 과세표준의 **1천분의 3** (= 0.003)
- ①5호 항공기 — 1천분의 3 (선박 나목과 동일, 고급 구분 없음)

### §111 ①1호 다목 — 분리과세 토지 [본법]
- (1) 전·답·과수원·목장용지·임야 — **1천분의 0.7** (0.0007) → `landSeparatedLow`
- (2) 골프장용·고급오락장용 토지 — **1천분의 40** (0.04) → `landSeparatedHigh`
- (3) 그 밖의 토지 — **1천분의 2** (0.002) → `landSeparatedGeneral`

### §13⑤5호 — 고급선박 정의 [본법]
> "비업무용 자가용 선박으로서 대통령령으로 정하는 기준을 초과하는 선박" (구체 기준은 시행령 §28 위임)

### §122(세부 담의 상한) [본법]
> 산출세액이 「대통령령으로 정하는 방법에 따라 계산한 직전 연도 재산세액 상당액」의 **100분의 150**을 초과 시 150% 금액으로. **다만 주택은 적용하지 아니한다.** (1·2·3호 모두 **삭제** — 계획서 §7 "§122 각 호" 표현은 부정확, 각 호 외 본문만 유효)

### 시행령 §118(세부담 상한의 계산방법) — 직전 연도 세액상당액 [시행령]
| 호·목 | 케이스 | 현행 엔진 | Track D 대상 |
|---|---|---|---|
| **1호 가** | 토지 직전 과표 **있음** → 직전 법령·과표 재산정 (납세자·현황 일치 시 직전 과세세액) | ✅ recompute 본문 | — |
| **1호 나** | 토지 분할·합병·지목변경·신규등록·등록전환 → 직전 과표 **없음** → 직전 존재 의제 재산정. 분할·합병은 1)면적/지분 무증가=직전 세액 안분, 2)증가=안분+증가분 합산 | ❌ | **D** |
| **1호 다** | 토지 §106① 과세대상 **구분 변경** → 해당연도 구분이 직전 적용된 것으로 의제 재산정 | ❌ | **D** |
| **1호 라** | 정비사업(도시·소규모 3년 / 빈집·농어촌 5년)으로 주택 멸실→토지 과세. min(계산식, 나목) | ❌ | **D**(고난도) |
| **2호 가** | 주택·건축물 직전 과표 있음 → 재산정 (직전 과세세액 있으면 그 세액) | ✅ recompute 본문(건축물) | — |
| **2호 나** | **신축·증축** 등으로 직전 과표 없음 → 직전 존재 의제 재산정 | ❌ | **D**(건축물만) |
| **2호 다** | **용도변경** 등으로 §111①2다·3나 외 세율 적용/미적용 → 직전 동일 의제 | ❌ | **D**(건축물만) |
| 2호 라 | 주택 유사 인근 비교 조정 | — | **범위 외**(주택=세부담상한 미적용) |
| 3호 | 비과세·감면·가감세율(§111③)·세율특례(§111의2) 직전 동일 의제 | △ 감면율 곱 반영 | 보강 검토 |
| 4호 | 직전 §111의2 특례 주택이 9억 초과로 §111①3나 세율 적용 → 직전 과세세액 | — | **범위 외**(주택) |

→ **Track D 현실 범위 = 1호 나·다·라(토지) + 2호 나·다(건축물)**. 주택 전용(2호 라·4호)은 현행 §122 단서로 세부담상한 미적용 → 구현 불요(범위 외 명시).

---

## 2. 현황 실측 (file:line)

| 항목 | 현황 | 근거 |
|---|---|---|
| 분리과세 세율 | 리터럴 상수 `RATE_LOW=0.0007`·`RATE_STD=0.002`·`RATE_HEAVY=0.04` | `separate-taxation.ts:136-141` |
| 분리과세 classify 3함수 | `classifyLowRate`·`classifyStandard`·`classifyHeavy` (각 `appliedRate` 리터럴 하드코딩) | `:162` · `:217` · `:281` |
| 분리과세 통합 함수 | `classifySeparateTaxation`·`calculateSeparateTaxationTax`·`calculateSeparateTax` | `:347` · `:396` · `:468` |
| 역사표 분리 세율 (미참조) | `landSeparatedLow/General/High` **이미 정의**(0.0007/0.002/0.04) | `property-rate-history.ts:46-51·78-80` |
| 종합·별도 rateSet 파라미터화 | ✅ 완료(P3) — `calculateComprehensiveAggregateTax(taxBase, rs)`·`calculateSeparateAggregateTax(..., rs)` | `comprehensive-aggregate.ts:408` · `separate-aggregate-land.ts:421` |
| recompute 엔진 | building·vessel/aircraft·종합합산만. 별도합산·분리 = `previousYearTax ?? 0` fallback | `property-tax-recompute.ts:25-37` |
| resolveBasisTax | recompute 모드 분기 + direct fallback | `property-tax-recompute.ts:45-53`, 호출 `property-tax.ts:644·715` |
| 세부담상한 4지점 | `applyTaxCap`(분리·메인 `:350`) / `applyBurdenCap`(종합합산 `comprehensive-aggregate.ts:443`) / `applySeparateBurdenCap`(별도합산 내부 `separate-aggregate-land.ts:549`) | — |
| 선박 세율 | vessel·aircraft 단일 `getCurrentPropertyRateSet().vesselAircraft`(0.003). 고급선박 분기 **없음** | `property-tax.ts:692-700` |
| `PropertyRateSet.vesselLuxury` | **미정의** (선박 일반·항공기 공용 `vesselAircraft`만) | `property-rate-history.ts:33-52` |
| 선박 유형 입력 | `objectType="vessel"` 단일. `vesselType` 필드·enum 없음. 취득세는 `luxuryType:"luxury_vessel"` 보유 | `types/property.types.ts` · `shared.ts:53-59` · (acq) `acquisition.types.ts:337` |
| result 세부담상한 echo | `calculatedTaxBeforeCap`·`taxCapRate`·`determinedTax`만. `taxCapMode`·`basisTax`·`priorYear` echo **없음** | `types/property.types.ts:356-362` |
| 결과뷰 표시 | `세부담상한 적용 (상한율 N%)` + `determinedTax`만. recompute 산식·직전 과표·직전 세율 미노출 | `PropertyTaxResultView.tsx:477-486` |
| Step3 모드 토글 | direct/recompute RadioCardGroup + `previousYearTaxBase`·`previousYearTax` 입력 ✅완성 | `Step3.tsx:34-98`(isRecomputeTarget `:35-39`) |

---

## 3. Track A — 분리과세 calc 연도화 (구조 통일)

**목표**: `separate-taxation.ts`의 분리과세 세율을 역사표 `PropertyRateSet.landSeparated*` 참조로 전환. 종합·별도(P3)와 동일 구조 → 미래 §111 개정 자동 추종 + 드리프트 차단. **recompute와 무관**(별도·분리는 direct 유지) — 본 트랙은 순수 구조 통일.

**법령**: §111①1호 다목 (1)0.0007 (2)0.04 (3)0.002 (§1 검증값).

**변경 범위** (실측: 종부세 직접 호출 0건 / 최종 호출부 `property-tax.ts:564` 1곳):
1. `classifyLowRate`(`:162`)·`classifyStandard`(`:217`)·`classifyHeavy`(`:281`) 시그니처에 `rateSet: PropertyRateSet = getCurrentPropertyRateSet()` 추가, 본문 `RATE_LOW/STD/HEAVY` → `rateSet.landSeparatedLow/General/High`.
2. rateSet 전파 = **5함수**: classify 3함수 + `classifySeparateTaxation`(`:347`, 3함수 호출 `:353·357·361`) + `calculateSeparateTax`(`:468`, classifySeparateTaxation 호출 `:471`). **`calculateSeparateTaxationTax`(`:396`)는 `classification.appliedRate` 재사용 → 불변**(실측). 최종 호출부 `calculateSeparateTax(sepInput)`(`property-tax.ts:564`)은 기본 인자(현행) 유지 — 무변경.
3. 리터럴 상수 `:136-141`는 역사표와의 미러 검증 대상이므로 즉시 삭제하지 말고, 역사표 단일출처로 수렴 후 제거(드리프트 anchor가 차단).

**회귀 가드**: 기본 인자 = 현행 → 기존 호출부·종부세 분리/별도 연동 동작 100% 불변. `property-rate-history-anchor.test.ts`에 분리 세율 미러 일치 이미 있으면 재사용.

**14지점**: 엔진 내부 구조 변경만 — UI·API·validate 무영향.

**anchor**: ① 분리 (1)0.0007·(2)0.04·(3)0.002 현행 산출 일치(회귀) ② `classifyHeavy(..., getPropertyRateSet(2026))` === 리터럴 경로 동일값.

**리스크**: 낮음. `calculateSeparateTax`가 종부세 토지분(분리)에서 호출되는지 grep 확인 → 호출 시 기본 인자로 무변경 보장.

**규모**: 소(小). 파일 1개 + 역사표 기존 활용. 1 PR.

---

## 4. Track B — recompute 결과 표시 (A-3 마무리)

**목표**: recompute 모드(P4 작동 중)의 직전연도 재산정 산식을 결과뷰에 표시. 현재 `taxCapRate`만 노출 → "직전연도(N−1) 과세표준 × 직전 세율 = 재산정 세액, × 150% 상한" 산식을 보여준다.

**현황**: result에 `calculatedTaxBeforeCap`·`taxCapRate`·`determinedTax`만(`types:356-362`). recompute가 쓴 직전 세액·세율·연도 echo 없음 → 결과뷰가 표시 불가.

**변경 범위**:
1. **엔진 result echo** — `PropertyTaxResult`(`types/property.types.ts`)에 optional 추가:
   - `taxCapMode?: "direct" | "recompute"`
   - `taxCapBasisTax?: number` (cap 기준 직전 세액상당액 = `resolveBasisTax` 결과)
   - `recomputeDetail?: { priorYear: number; priorTaxBase: number; appliedRate: number; recomputedTax: number }` (recompute 모드만)
2. **엔진 조립** (실측 정정) — cap 함수 3종(`applyTaxCap`·`applyBurdenCap`·`applySeparateBurdenCap`)은 모두 `{taxAfterCap/determinedTax, appliedCapRate}`만 반환(basis echo 없음) → **본문에서 `resolveBasisTax`를 변수화**해 result에 직접 담는다. 실측상 `resolveBasisTax` 호출은 **종합합산(`:644`)·메인(`:715`) 2경로뿐**, 분리과세(`:585-589` `input.previousYearTax` 직접)·별도합산(내부 동일)은 recompute 미지원:
   - **recompute echo 2경로**(메인 building·vessel·aircraft / 종합합산): result return(분리·종합합산·메인 3곳 중 종합합산·메인)에 `recomputeDetail` 채움.
   - **direct echo**(분리·별도): `taxCapMode:"direct"` + `taxCapBasisTax: input.previousYearTax`만.
   - **echo는 "recompute가 실제 사용한 세율" 추종** → Track C(고급선박) 추가 시 vessel `appliedRate` 자동 5% 반영(결합 최소화).
   - 누진 토지(종합합산)는 `appliedRate: 0`(단일 세율 없음, 실측 `:669`) → `recomputeDetail.appliedRate` optional, 산식은 `recomputedTax`만 + "직전연도 누진세율".
3. **결과뷰** — `PropertyTaxResultView.tsx:477-486` 분기:
   - recompute 모드: "세부담상한 기준 = 직전연도(N−1) 재산정 — 직전 과세표준 A × 직전 세율(또는 누진) = B, 당해 산출세액 vs B×150% 중 작은 값" 풀어쓰기(약어·`floor` 금지, [[feedback_result_view_korean_formula]]).
   - direct 모드: 기존 "전년도 부과세액 직접입력" 유지.

**14지점**: ⑦결과 카드(주 변경). result 타입 변경이나 **Record/number 직렬화 안전**(Map 아님, [[feedback_engine_result_map_json_loss]] 해당 없음). ④ API 변환·⑧ validate 무영향(입력 불변).

**anchor**: ① recompute 모드 result의 `recomputeDetail.recomputedTax` === `resolveBasisTax` 값 ② 건축물 C-2(375,000 등 P4 anchor)에서 echo 필드 채워짐 ③ direct 모드는 `recomputeDetail` undefined ④ 결과뷰 textContent에 "직전연도" 산식 렌더([[feedback_result_expand_toggle_standard]] 직접 렌더 테스트).

**리스크**: 누진 토지(종합합산)는 단일 세율 표기 불가 → `appliedRate` optional, 누진은 `recomputedTax`만. 결과뷰 산식이 objectType별로 달라짐(건축물=단일율, 토지=누진) → 분기 명확화. **result echo 명명은 §110③ 과세표준상한 기존 필드(`priorYearTaxBaseEquivalent`·`taxBaseCapRate`, 실측 `types/property.types.ts:340-348`)와 혼동 금지** → §122 세부담상한 echo는 `taxCapMode`·`taxCapBasisTax`·`recomputeDetail` 네임스페이스로 구분.

**규모**: 중. 엔진 echo(헬퍼 분리, §8-4) + 결과뷰 + anchor. 1 PR.

---

## 5. Track C — 고급선박 5% (§111①4호 가목)

**목표**: 고급선박(§13⑤5호) 과세표준 5%(1천분의 50) 분기. 현재 선박 일괄 0.3%.

**법령**: §111①4가 0.05 / 4나 0.003(§1 검증). §13⑤5호 정의.

**변경 범위**:
1. **types**: `PropertyTaxInput`(`types/property.types.ts`)에 `vesselType?: "general" | "luxury"`(기본 general). `objectType="vessel"` 전용.
2. **역사표**: `PropertyRateSet`에 `vesselLuxury: number` 추가, `RATE_SET_2005.vesselLuxury = 0.05`. `vesselAircraft`(0.003)는 일반선박·항공기 공용 유지. 항공기는 고급 구분 없음(§111①5호) — vessel만 분기.
3. **엔진**: `property-tax.ts:692-700` vessel/aircraft 공용 `case` 분리:
   - `case "vessel"`: `input.vesselType === "luxury" ? rs.vesselLuxury : rs.vesselAircraft`.
   - `case "aircraft"`: `rs.vesselAircraft` 유지.
   - **legal-codes 상수 정정**: 기존 `VESSEL_AIRCRAFT_RATE = "지방세법 §111①4호"`(실측 `legal-codes/property.ts:60-61`)는 호목 미구분 → 일반선박 `§111①4호 나목`·항공기 `§111①5호`로 세분 + 고급선박 신규 `VESSEL_LUXURY_RATE = "지방세법 §111①4호 가목"`. legalBasis는 objectType·vesselType별 push(recompute `:28-30`도 동일 분기).
4. **recompute**: `property-tax-recompute.ts:28-30` vessel 분기에 `vesselType` 반영(`rs.vesselLuxury` / `rs.vesselAircraft`) — aircraft는 분리. → Track B echo가 자동으로 고급 세율 표시.
5. **소방분(§146③)**: 고급선박도 일반선박과 동일 소방분(시가표준액 누진, A-1 완료분 `property-tax-surtax.ts`). **별도 중과 없음** — 화재위험 중과(§146③2호)는 건축물 전용. 변경 불요(확인만).
6. **UI(14지점)**: `objectType="vessel"` 선택 시 `vesselType` RadioCardGroup(일반/고급) 노출. `shared.ts` `VESSEL_TYPE_LABELS` + FormState `vesselType` + INITIAL("general") + API 변환 + validate. 고급선박 판정 기준은 FieldCard `hint`(§13⑤5호 비업무용 자가용 + 시행령 §28 기준) + `LawArticleModal` 배지.

**anchor**: ① 고급선박 50,000,000 × 0.05 = 2,500,000 산출 ② 일반선박 0.003 회귀(기존 vessel-surtax-anchor 등) ③ recompute 고급선박(직전 과표 × 0.05) ④ aircraft는 항상 0.003.

**리스크**: `vesselAircraft` 명칭이 "선박+항공기 공용"이므로 고급선박 분기 후에도 일반선박·항공기 경로 불변 확인. 역사표 신규 필드 → 미러 anchor 추가.

**규모**: 중. 1 PR. 14지점 전체.

---

## 6. Track D — §118 호별 (1호 나·다·라 + 2호 나·다)

**목표**: 직전연도 현황 재구성 재산정. **v1 제외였던 최고난도 항목** — 직전연도 과세표준이 없는(분할·합병·신축 등) 경우 직전 현황을 의제 재구성.

**법령**: 시행령 §118 1호 나·다·라 + 2호 나·다(§1 검증 표). 주택 전용(2호 라·4호)은 범위 외.

**현황**: recompute는 §118 본문(1호 가·2호 가 재산정)만. 나·다·라·4호 입력·로직 전무.

**변경 범위(개념 — 착수 시 세부 설계)**:
1. **types**: `PropertyTaxInput`에 직전현황 입력 — 예:
   - `priorYearStatus?: "same" | "split_merge" | "category_change" | "use_change" | "new_construction" | "redevelopment"`
   - 분할·합병: `priorParcelTax?`(분할 전 세액)·`priorAreaRatio?`(소유 면적/지분 비율)·`areaIncreased?`(증가 여부) → 1)2) 분기
   - 정비사업: `redevelopmentType?: "urban_small" | "vacant_rural"`(3년/5년)·`constructionStartDate?`
2. **recompute 분기 확장**(`property-tax-recompute.ts`): `priorYearStatus`별 직전 과표·세율 재구성. 분할·합병 면적/지분 floor 안분 헬퍼([[feedback_floor_residual_absorption]] 잔액 흡수).
3. **UI(14지점 대량)**: Step3에 직전현황 입력 폼(`priorYearStatus` RadioCardGroup + 조건부 필드). 입력 복잡 → 단계 분할 권장.

**단계 분할 제안**:
- **D1**: 1호 나·다(토지 분할·합병·지목변경·구분변경) — 직전 과표 의제 + 분할·합병 안분.
- **D2**: 2호 나·다(건축물 신축·증축·용도변경).
- **D3**: 1호 라(정비사업 멸실 토지, 3년/5년 + min(계산식, 나목)) — 최고난도, 별도.

**anchor**: 각 `priorYearStatus`·분할/합병 1)2)·정비사업 3년/5년 케이스별.

**리스크**:
- **입력 복잡도** — 사용자가 직전연도 필지 현황(면적·지분·세액)을 정확히 알아야 함 → 실무 적용성·UX 검토 필수.
- **자동 안분 fallback 금지**([[feedback_no_silent_apportion_fallback]]) — 미입력은 검증 오류.
- v1 제외였던 만큼 **착수 전 실무 필요성·우선순위 사용자 확인**(D 전체를 할지, D1만 할지).

**규모**: 대. 2~3 PR(D1/D2/D3). 별도 plan-design-self-review-loop 권장.

---

## 7. 우선순위·의존성·권장 순서

```
B (recompute 결과 표시)  ──①  엔진 echo 최소, 즉시 가치, A-3 마무리
   │  (echo는 "recompute 실제 세율" 추종 → C 자동 반영)
A (분리과세 연도화)      ──②  구조 통일·회귀 안전·짧음, 독립
C (고급선박 5%)          ──③  독립 신규 기능, B echo와 자동 결합
D (§118 호별)            ──④  최대·복잡·v1 제외 → 실무 확인 후 단계 분할
```

**의존성**:
- B·A·C 상호 독립(파일 거의 안 겹침: B=property-tax.ts result+ResultView, A=separate-taxation.ts, C=types+역사표+vessel case+UI).
- **C → B 결합 최소화**: B의 echo `appliedRate`를 recompute가 실제 사용한 세율로 설계하면, C에서 vessel 고급 분기 추가 시 결과뷰가 자동으로 5% 표시. → B 설계 시 이 추종 구조를 명시(§4-2).
- **D는 A 후 권장**: D의 토지 재산정이 분리과세 연도화(A) 구조를 재사용할 수 있음. 단 핵심은 직전현황 재구성이라 A와 강결합은 아님.

**병합**: 각 트랙 격리 worktree → 독립 PR. master 충돌 0 목표(B의 property-tax.ts result return 영역과 C의 vessel case는 다른 라인 — 동일 worktree 동시 작업 시만 주의).

---

## 8. 공통 회귀 전략·리스크

1. **회귀 0 최우선**: calc 시그니처 변경(A·C)은 **기본 인자 = 현행**으로 기존 호출부 무변경. **실측: `comprehensive*.ts`는 분리/별도/종합 calc 세율 함수를 직접 호출하지 않음**(grep 0건) → A 회귀 범위는 재산세 자체 test 중심. 종부세가 `calculatePropertyTax`를 간접 호출하더라도 기본 인자(현행)로 무변경. 재산세→종부세 단방향 의존 원칙 유지([[lib/tax-engine/CLAUDE.md]] 서브엔진 규칙).
2. **역사표 단일출처**: 신규 세율(C `vesselLuxury`)은 `property-rate-history-anchor.test.ts` 미러 일치 anchor로 드리프트 차단. 리터럴(A `RATE_*`)은 역사표 수렴 후 제거.
3. **법령 정확성**([[feedback_tax_calculation_principle.md]]): 절감·유불리 표현 금지. 산식·세율은 §1 검증값 직접 인용.
4. **800줄 정책**(실측): `separate-taxation.ts` 473줄(여유) / **`property-tax.ts` 774줄 — 800 임박**. B(result echo 3곳)+C(vessel 분기) 라인 추가 시 초과 → echo 조립을 **헬퍼 분리**(예: `property-tax-cap-echo.ts`의 `buildCapEcho(input, basisTax, priorYear)` → return spread). D의 직전현황 재구성도 신규 헬퍼 파일.
5. **Pre-Do anchor**([[feedback_pre_anchor_verification]]): 각 트랙 핵심 anchor 1건 우선 실행 → 실패 확보 → 구현. "현행 일치 예상" 금지.
6. **3중 패턴**(C UI): `vesselType` 기본값 "general"을 factory·normalize·UI display fallback 3 layer 일치([[feedback_store_default_vs_ui_display_fallback]]).

---

## 9. Definition of Done (트랙별)

**공통**: `tsc --noEmit` 0 / 전체 `vitest` 통과(종부세 연동 포함) / 격리 worktree 독립 PR / 커밋 메시지 한국어.

- **A**: 분리 세율 역사표 참조(5함수) + 현행 산출 회귀 anchor + **종부세 직접 호출 0건 grep 재확인**(`comprehensive*.ts`).
- **B**: result echo(`taxCapMode`·`taxCapBasisTax`·`recomputeDetail`) + 결과뷰 recompute/direct 산식 분기 + **recompute 2경로(종합합산·메인) echo + direct 2경로(분리·별도)** + **`property-tax.ts` 800줄 이하(echo 헬퍼 분리)** + 결과뷰 렌더 anchor + **브라우저/E2E**(recompute 모드 산식 노출).
- **C**: `vesselType` 14지점 전부(⑫⑬⑭ grep 자가점검) + **legal-codes 상수 정정(일반선박 §4호 나목·항공기 §5호·고급 §4호 가목)** + 고급선박 5% anchor + 일반선박·항공기 회귀 + recompute 고급 반영 + 소방분 불변 확인 + **브라우저/E2E**.
- **D**: (착수 시 별도 plan-design-self-review-loop) D1/D2/D3 단계별 + `priorYearStatus` 케이스 anchor + 안분 잔액 흡수 + 실무 UX 검토.

---

## 10. 범위 외 (명시)

- §118 2호 라목(주택 유사 인근 비교)·4호(9억 전환 주택) — 현행 §122 단서로 주택 세부담상한 미적용 → 구현 불요.
- §111② 과밀억제권역 공장 신·증설 500% 중과(5년) — 별도 갭(본 4건과 무관).
- §111③ 지자체 조례 가감세율(±50%) — 입력 정책 별도.
- 항공기 고급 구분 — §111①5호 단일세율, 법령상 구분 없음.
