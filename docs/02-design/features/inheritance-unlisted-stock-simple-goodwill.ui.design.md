# UI Design — 비상장주식 간편평가(V1) 영업권(§59②) 가산

> 계획서: `docs/00-pm/inheritance-unlisted-stock-simple-goodwill.plan.md`
> 엔진 설계: `inheritance-unlisted-stock-simple-goodwill.engine.design.md`
> 대상 컴포넌트: `components/calc/UnlistedStockSimpleFields.tsx` (상속·증여 공유, `mode` prop)

## 0. 적용 정책 메모리 (사전 정독)

- [[echo-field-pattern]] — 엔진 echo(`goodwill`·`netAssetWithGoodwill`)를 산식 변경 없이 표시
- [[formula-display-builder]] — ㉯ 산출근거 6줄 변수 배지 + fine-print
- [[print-only-css-toggle]] — 산출근거 펼침 인쇄 시 CSS-only 자동 펼침
- [[feedback_ui_engine_dual_truth_avoidance]] — §55③ 배제 사유는 엔진 echo 우선, UI 재판정 금지
- [[feedback_useeffect_store_mirror_forbidden]] — 미리보기는 `useMemo`만, store 미러링 금지
- [[single-source-engine-helper]] — UI 영업권 재계산 금지, 엔진 반환 echo만 표시
- [[feedback_result_view_korean_formula]] — 변수 약어·`floor()` 금지, 한국어 풀어쓰기
- [[feedback_no_won_suffix]] — 숫자 끝 "원" 생략(미리보기 표 내부)

---

## 1. 사용자 시나리오 (5건)

1. 순손익 3년 + 순자산 입력 → 미리보기에 ㉮영업권 포함 전 순자산 / ㉯영업권 / ㉰영업권 포함 순자산 / ㉱1주당 순자산가치 노출 (이미지25 재현).
2. ㉯ "▼ 산출근거" 펼침 → 가·나·다·마·초과이익·자 6줄 표시.
3. 순손익 3년 모두 적자 → 영업권 0 + "적자법인 — 영업권 미가산(§55③ 3호 계속결손)" 통합 amber.
4. §54④ 사유(청산·부동산80%·3년미만) 선택 → 영업권 0 + 배제 사유 표시(엔진 echo).
5. 초과이익 음수(자기자본이 큼) → 영업권 0 + ㉱ = 종전 순자산가치 그대로.

---

## 2. 컴포넌트 구조 (신규 컴포넌트 없음 — 기존 확장)

`UnlistedStockSimpleFields.tsx`의 `UnlistedStockPreview` 내부만 확장. 800줄 임계 시 `UnlistedStockGoodwillBreakdown.tsx`(산출근거 6줄 펼침, ≤120줄)만 분리.

### 2-1. `UnlistedStockPreview` — 이미지25 4줄 삽입

- 위치: "1주당 순손익가치" 줄과 "가중평균(순손익×3+순자산×2 ÷5)" 줄 **사이**.
- 입력: `preview.netAssetWithGoodwill`, `preview.goodwill`(echo).

| 표기 | 라벨 | 값 | 단위 |
|---|---|---|---|
| ㉮ | 영업권 포함 전 순자산가액 | `goodwill.selfCapital` | 회사 전체 |
| ㉯ | 영업권 평가액 (§59②) `▼ 산출근거` | `goodwill.goodwillFinal` | 회사 전체 |
| ㉰ | 영업권 포함 순자산가액 | `netAssetWithGoodwill` | 회사 전체 |
| ㉱ | 1주당 순자산가치 | `perShareAssetValue` | 1주당 |

- `goodwillFinal === 0`: ㉯·㉰는 *"영업권 0 — 미가산"* 1줄로 축약, ㉱는 종전과 동일.
- 기존 "1주당 순자산가치" 단일 줄 → ㉱로 대체(영업권 포함).

### 2-2. ㉯ 산출근거 펼침 ([[formula-display-builder]] · [[echo-field-pattern]])

`▼ 산출근거` 토글(`print:block` + 토글버튼 `print:hidden`):

| 배지 | 라벨 | 값(echo) |
|---|---|---|
| 가 | 최근 3년 가중평균 순손익액 | `goodwill.weightedAvg3y` |
| 나 | 가 × 50% | `goodwill.weightedAvgHalf` |
| 다 | 자기자본 (영업권 포함 전 순자산) | `goodwill.selfCapital` |
| 마 | 다 × 이자율(10%) | `goodwill.selfCapitalRate` |
| 초과이익 | 나 − 마 (음수 시 0) | `goodwill.annualExcessProfit` |
| 자 | 영업권 평가액 = 초과이익 × 5년 연금현가 | `goodwill.goodwillFinal` |

fine-print: "5년 연금현가계수 3.7908 적용(상증령 §59② · 상증규 §19① 10%). 표 반올림으로 ±수십원 차이 가능."

---

## 3. 8 동기화 지점 (S-1~S-8)

| # | 지점 | 영향 | 내용 |
|---|---|---|---|
| S-1 폼 타입 | 없음 | 신규 입력 필드 0건 |
| S-2 initial | 없음 | — |
| S-3 normalize | 없음 | — |
| S-4 API 변환 | 없음 | estateItems 통째 전달 — 신규 전송 필드 없음 |
| S-5 UI 위젯 | **있음** | `UnlistedStockPreview` ㉮㉯㉰㉱ 4줄 + ㉯ 산출근거 펼침 + 순자산 hint 갱신 |
| S-6 사이드바 | 자동(값 변동) | `StockValuationForm` effectiveValuation·"주식 합계(예상)" 자동 증가 (코드 변경 없음, e2e 검증) |
| S-7 결과 카드 | 자동(breakdown) | `evaluateUnlistedStock` breakdown 줄 자동 렌더 — echo 미노출(IC-1) |
| S-8 validation | 없음 | 신규 입력 없음 — Zod·validate 무변경 |

> **IC-1**: 산출근거 6줄·㉮㉯㉰㉱은 **S-5 미리보기 전용**(echo 직접 소비). **S-7 결과 카드는 breakdown만** → "영업권 (§59②)" + "1주당 순자산가치(영업권 포함)" 줄 수준.

---

## 4. Cross-field 동기화 (useEffect→store 금지 선언)

- 미리보기·산출근거·배제 판정 전부 `useMemo(() => calcUnlistedStockPerShareValue(data, isRealEstateHeavy), [data, isRealEstateHeavy])` 결과(echo)에서 파생. **store 미러링 없음** ([[feedback_useeffect_store_mirror_forbidden]] · [[mirror-pattern]]).
- UI는 영업권을 **재계산하지 않는다** — `preview.goodwill` echo만 읽음 ([[single-source-engine-helper]] · [[feedback_ui_engine_dual_truth_avoidance]]).

---

## 5. Silent fallback 후보 식별

- ㉮㉯㉰ 4줄·산출근거·배제 안내는 모두 echo 표시(자동 채움 아님). 미입력 시 `preview === null`로 미표시 — 침묵 보정 0건.
- 순자산 hint만 갱신, 입력 자동 변경 없음.

---

## 6. UI 순서 = 엔진 계산 로직 순서

엔진: 1주당 순손익가치 → (영업권 가산) 순자산 → 1주당 순자산가치 → 가중평균 → 최소값 → 최종. UI 미리보기도 동일 순서 — ㉮㉯㉰㉱ 블록을 "순손익가치" 다음·"가중평균" 앞에 배치.

---

## 7. 순자산 입력 hint 갱신 (S-5)

- 기존 "총자산 − 총부채" → **"영업권 포함 전 자기자본(= 총자산 − 총부채). 영업권은 §59②에 따라 자동 산출·가산됩니다."**
- `netIncomeY1~Y3` 모두 입력 시에만 sky 안내 박스 노출(조건부): "입력 순자산은 영업권 포함 전 금액. §59② 영업권(3년 가중평균 초과이익)이 0 초과면 자동 가산."

---

## 8. §55③ 배제 표시 (amber, S-5)

- 엔진 echo `preview.goodwill.excludedByLaw` **우선** → 한국어 사유 매핑:
  | excludedByLaw | 문구 |
  |---|---|
  | `liquidation` | 청산·해산·합병 (§55③ 1호) |
  | `real_estate_80` | 부동산 80% 이상 (§55③ 1호) |
  | `lt3y` | 사업개시 3년 미만 (§55③ 2호) |
  | `continuous_loss_3y` | 직전 3년 계속 결손 (§55③ 3호) |
- echo 없을 때만 UI 3호 독립 fallback (3년 ≤0).
- **R2-6 중첩 방지**: `continuous_loss_3y`는 기존 "적자법인 — 순손익가치 0" amber와 동시 발생 → **한 박스 안에 통합 한 줄**("적자법인 — 순손익가치 0 · 영업권 미가산(§55③ 3호)"). 별도 amber 박스 쌓기 금지.

---

## 9. 사이드바 합계 표시 (S-6)

- `StockValuationForm` effectiveValuation·"주식 합계(예상)"은 `perShareFinalValue × ownedShares`로 자동 증가(영업권 포함). 코드 변경 없음 — e2e GW-8로 검증.

---

## 10. 케이스 인벤토리 (Engine Design §케이스 인벤토리 동기화)

엔진 V1-GW-1~10에 대응하는 UI 표시 확인:
- V1-GW-1 → ㉮ 60,000,000 / ㉯ 31,747,839 / ㉰ 91,747,839 / ㉱ 4,587 노출.
- V1-GW-2·6 → ㉯ "영업권 0 — 미가산", V1-GW-6은 amber 통합 줄.
- V1-GW-3·4·5 → §55③ amber 배제 사유.

---

## 11. 브라우저 e2e (`e2e/inheritance-unlisted-simple-goodwill.spec.ts` — [[feedback_browser_verify_with_playwright]])

| # | 시나리오 | 검증 |
|---|---|---|
| GW-1 | 순손익 3년 양수 + 순자산 입력 | ㉯ 영업권 줄 > 0, ㉱ 4,587 노출 |
| GW-2 | ㉯ "▼ 산출근거" 클릭 | 가·나·다·마·초과이익·자 6줄 노출 |
| GW-3 | 순자산 hint | "영업권 포함 전 자기자본" 텍스트 |
| GW-4 | 3년 입력 완료 | sky 안내 박스 노출 |
| GW-5 | 3년 모두 적자 | amber 통합 줄 "영업권 미가산(§55③ 3호)" |
| GW-6 | 초과이익 음수 | ㉱ = 종전 순자산가치 동일 |
| GW-7 | 영업권 > 0 | ㉰ > 입력 순자산 |
| GW-8 | 부동산과다보유 토글 ON | 사이드바 합계 영업권 포함 반영 |

---

## 12. 후속 PR (UI 범위 한정)

- 결과 카드(S-7)에 6줄 산출근거 표시 필요 시 → `evaluateUnlistedStock` breakdown 확장(별도 PR, IC-1).
- `UnlistedStockSimpleFields.tsx` 800줄 초과 시 `UnlistedStockGoodwillBreakdown.tsx` 분리.

---

## 13. UI senior 작업 시작 전 사전 점검 체크리스트

- [ ] 엔진 echo(`goodwill`·`netAssetWithGoodwill`) 반환 타입 머지 확인 (엔진 senior 선행)
- [ ] Pre-Do V1-GW-1 GREEN 후 UI 착수
- [ ] `UnlistedStockSimpleFields.tsx` 현행 줄 수 확인 → 800줄 임계 시 분리 골격
- [ ] ㉮㉯㉰㉱ 단위(회사 전체 vs 1주당) 라벨 명확 — 혼선 금지(R2-5)
- [ ] amber 중첩 방지(R2-6) — 적자+계속결손 한 줄 통합
- [ ] `useMemo`만 사용, store 미러링 0건
- [ ] 산출근거 펼침 `print:block` / 토글버튼 `print:hidden`
- [ ] e2e GW-1~8 spec 작성·통과
