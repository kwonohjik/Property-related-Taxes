# 거래정지·관리종목 §165③ 활성화 — 엔진 설계 (stock-transfer)

> 계획: `docs/00-pm/stock-transfer-trading-halt-165-3.plan.md` · 작성 2026-06-12
> 법령: §99①3 → 시행령 §165③ → 상증령 §52의2③ 준용 + "전후 2개월"→"양도일·취득일 이전 1개월" 치환 (KoreanLaw 축자, MST 286211·283637)
>
> **본 PR은 엔진 변경 0 (순수 활성화)** — 엔진 우회 분기·평가 모듈·14지점 배선 전부 기구현(실측). 본 문서는 기존 엔진 동작의 anchor 고정 명세 + validate 로직 설계.

## 1. 케이스 인벤토리

| # | 케이스 | 엔진 경로 (실측) | 변경 | anchor |
|---|---|---|---|---|
| C-1 | 상장·estimated·거래정지 OFF | `calcListedValuation` §163⑨ (`stock-valuation-listed.ts:67~`) | 없음 | 기존 listed-estimated-conversion |
| C-2 | 상장·estimated·거래정지 ON | `stock-transfer-tax.ts:275-297` → `calcUnlistedValuation` 우회 + "거래정지우회" + 개산공제 base = 취득기준시가 총액 | 없음 — **수치 anchor 신설** | A-TH-1 |
| C-2f | C-2 + 80% 하한 | `stock-valuation-unlisted.ts:383-396` 하한 발동 | 없음 | A-TH-2 |
| C-3 | acquiredBeforeListing ON + 거래정지 ON | 엔진은 post-listing 우선(`:247` 분기 선행) — 거래정지 무시 | 없음 — **validate 차단으로 도달 방지** | A-TH-3 (validate) |
| C-6 | C-2 + 평가 필드 미입력 | 엔진 방어 0원 (`:409-419` 가드) | 없음 — validate 1차 차단 | A-TH-4 (validate) |
| C-8 | C-2 + §163⑨ 분모 미입력 | 분모 미사용 (우회 분기는 `calcUnlistedValuation`만 호출) | 없음 — validate 면제 | A-TH-5 (validate) |

## 2. 기존 엔진 산식 (실측 — anchor 고정 대상)

```
// stock-valuation-unlisted.ts 본칙 경로 (거래정지 우회가 호출)
양도기준시가 per-share = floor(NI×3/5 + NA×2/5)          // 가중치 시기별·부동산과다 반전
  ※ 80% 하한: floor(NA×0.8) > 가중평균이면 하한 채택 (:383-396)
취득기준시가 per-share = floor(acqNI×3/5 + acqNA×2/5)     // 하한 미적용 (:423-431)
acquisitionStdPriceTotal = 취득per-share × shareCount      // 개산공제 §163⑥4 base
환산취득가 = floor(BigInt(양도가 × 취득per-share) ÷ 양도per-share)  // :433-445
```

## 3. anchor 사전 계산 (원단위 toBe — 공통: kosdaq 대주주·estimated·halt ON·양도가 50,000×1,000주 = 50,000,000)

| # | 입력 | 중간값 | 기대값 |
|---|---|---|---|
| A-TH-1 | tNI 30,000/tNA 10,000 · aNI 15,000/aNA 5,000 | 양도std 22,000(하한 8,000 미발동) · 취득std 11,000 | 환산취득가 = floor(50,000,000×11,000/22,000) = **25,000,000** · appliedRules "거래정지우회" · 개산공제 base = 11,000,000 |
| A-TH-2 | tNI 5,000/tNA 30,000 (가중 15,000 < 하한 24,000) | 양도std **24,000** · `netAssetFloorApplied=true` | 환산취득가 = floor(50,000,000×11,000/24,000) = **22,916,666** · "80%하한" |

※ A-TH-3·4·5는 validate 테스트(`__tests__/calc/stock-transfer/`) — §4.

## 4. validate 설계 (⑧ — `stock-transfer-tax-validate-step2.ts`)

```
estimated && isListed 블록 (:142~):
  // G-6: 분모 검증(direct :145-153 / daily :154-167) 전체를 가드로 감쌈
  if (!form.tradingHaltAtTransfer) { …기존 분모 검증… }

  // :170 분자 면제 게이트 — 현행 유지 (이미 !tradingHalt 포함)

  // G-5: :184 차단 조건 — detailMode 조건 제거 (모드 무관)
  if (form.acquiredBeforeListing && form.tradingHaltAtTransfer) {
    error: "거래정지 + 취득 후 상장 조합은 지원하지 않습니다.
            거래정지 토글을 해제하거나 취득 후 상장 토글을 해제하세요."
  }

  // C-6: 거래정지 ON + 비(취득후상장) → 비상장 평가 필수 (추출 함수 공유)
  if (form.tradingHaltAtTransfer && !form.acquiredBeforeListing) {
    validateUnlistedSimpleFields(form, errors)   // 신규 추출 — 기존 :216~ 비상장 simple 검증과 단일 소스
  }
```

- `validateUnlistedSimpleFields(form, errors)`: 기존 비상장 블록의 simple 모드 검증(transferYear NI/NA — `netAssetOnlyReason` 시 NI 면제 · acquisitionYear NI/NA — `acqFaceValueOnly` 시 면제)을 함수로 추출, 비상장 본칙·거래정지 양 분기에서 호출. **기대 동작 불변**(추출 전후 비상장 검증 동일 — 회귀 anchor로 보장).
- **거래정지 조합은 simple 전용 (D1-1·D1-2 — Critical)**: api.ts의 full(V2) reduce 게이트(:506)·사례 49 acqFaceValueOnly 게이트(:486)가 모두 `marketType === "unlisted"` 한정(실측) — 상장+거래정지에서 full/사례49 선택 시 **silent 미반영**. → `EstimatedUnlistedBlock`에 `simpleOnly?: boolean` prop 신설: 모드 라디오·사례 49 토글 숨김 + simple 고정. 거래정지 분기 validate도 simple 검증만. full(V2)·사례 49 확장은 스코프 외(§계획서 10).
- ④ API 비상장 4필드(tyNI~ayNA)는 estimated 분기에서 **marketType 무관 무조건 전송**(api.ts:427-438 실측) — 상장+거래정지 simple 경로의 API 변환 갭 없음(작업 0).

## 5. 재산정·회귀 (기존 테스트 실측)

| 대상 | 현행 기대 | PR 후 |
|---|---|---|
| PL-VALIDATE-6 (`post-listing-validate.test.ts:121-131`) | 차단 + `toContain("후속 PR")` | 차단 유지 + **신규 문구로 갱신** |
| PL-VALIDATE-7 (`:133-143`) | simple 조합 **통과** | **차단으로 반전** (G-5 모드 무관) |
| C18-1 (`case-12-18-20-22-24.test.ts:150-162`) | "거래정지우회" 포함 | 불변 |
| 비상장 본칙·사례 48·listed-estimated | — | 불변 (validate 추출은 동작 불변) |

## 6. 파일·줄수

| 파일 | 변경 | 비고 |
|---|---|---|
| 엔진 (`stock-transfer-tax.ts` 등) | **0줄** | 798줄 동결 유지 |
| `stock-transfer-tax-validate-step2.ts` (실측 373줄) | +~40줄 (가드 + 추출 함수 + 차단) | 800 여유 |
| anchor | `case-12-18-20-22-24.test.ts`에 A-TH-1·2 추가 + `post-listing-validate.test.ts` 재산정 2·신규 3 | |

## 7. 확인 필요 (Pre-Do)

- 상증칙 단서(정상 매매 제외) 조문 — KoreanLaw 1회 (UI hint 문구용)
- 결과 카드 `weighted_avg` 표시가 상장 marketType 조합에서 자연스러운지 (`StockTransferTaxResultViewHelpers.tsx`)
- A-TH-1·2를 작성·실행해 **현행 엔진 실측값으로 고정** (수정 아닌 고정 — 통과 확인이 Pre-Do 완료 조건)
