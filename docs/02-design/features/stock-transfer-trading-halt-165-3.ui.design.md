# 거래정지·관리종목 §165③ 활성화 — UI 설계 (stock-transfer)

> 계획: `docs/00-pm/stock-transfer-trading-halt-165-3.plan.md` · 엔진 설계: `stock-transfer-trading-halt-165-3.engine.design.md` · 작성 2026-06-12

## 1. 사용자 시나리오

1. 상장(코스피·코스닥·코넥스) 주식 + 취득가액 산정 방식 "환산취득가" 선택 — 기존 흐름.
2. **거래정지 토글이 §163⑨ 입력 블록 앞에 노출**(이동·활성화). 키움 조회가 거래정지를 감지(`kiwoomTradingHalt`)했으면 amber 안내 배너가 토글 위에 표시.
3. 토글 ON → §163⑨ 블록·취득 후 상장 카드가 숨고 **비상장 보충 평가 폼**(`EstimatedUnlistedBlock`, simple 전용)이 나타남.
4. 양도연도·취득연도 NI/NA 입력 → 계산 → 결과에 비상장 평가 기반 환산취득가 + "거래정지우회" 근거 표시.

## 2. Step2.tsx — 상장 환산 분기 재구성 (⑤)

### 2.1 변경 전후 (`:352` `acquisitionMode === "estimated" && isListed` 내부)

```
[변경 전]                              [변경 후]
{!acquiredBeforeListing && (           <ToggleCard 거래정지 §165③ (신설·활성)>   ← 분기 선두 (엔진 분기 순서 일치)
  §163⑨ 블록 )}                          ON 펼침: <EstimatedUnlistedBlock simpleOnly />
<PostListingValuationCard />           </ToggleCard>
                                       {!tradingHalt && !acquiredBeforeListing && ( §163⑨ 블록 )}
                                       {(!tradingHalt || acquiredBeforeListing) && <PostListingValuationCard />}
```

- **PostListing 숨김 조건 (U1-1 데드락 방지)**: `!tradingHalt || acquiredBeforeListing` — C-3 잔존 상태(취득 후 상장 ON + 거래정지 ON)에서는 카드를 유지해 validate 차단 메시지("취득 후 상장 토글을 해제하세요")를 사용자가 실행할 수 있게 함. 신규 진입(acquiredBeforeListing OFF + 거래정지 ON)만 숨김.

### 2.2 거래정지 ToggleCard (ASCII)

```
┌─[rose]──────────────────────────────────────────────────┐
│ (kiwoomTradingHalt && !토글ON 시 amber 배너)               │
│ ⚠ 키움 조회에서 거래정지·관리종목이 감지되었습니다 —        │
│   해당 시 아래 토글을 켜세요                                │
├──────────────────────────────────────────────────────────┤
│ ◉ 양도일 거래정지·관리종목 지정 (소령 §165③)      [Switch] │
│   양도일 이전 1개월 내 거래정지·관리종목 기간이 포함되면     │
│   1개월 종가평균 대신 비상장 보충 평가로 환산합니다.         │
│   ※ 관리종목이라도 적정 시가로 정상 매매 중이면              │
│     (상증령 §52의2③ 단서) 토글을 켜지 마세요.               │
│ ── ON 펼침 ────────────────────────────────────────────── │
│  <EstimatedUnlistedBlock simpleOnly />                     │
│   (양도연도·취득연도 1주당 순손익/순자산가치 + 순자산 단독   │
│    사유 라디오 — 기존 비상장 블록 재사용)                    │
└──────────────────────────────────────────────────────────┘
```

- 기존 disabled 토글(`PostListingValuationCard.tsx:327-334`)은 **삭제** (위치 모순 G-1 — children 내부라 엔진 분기 도달 불가 조건에서만 보였음).
- 자동 ON 금지 — `kiwoomTradingHalt`는 안내만 (단서 판정은 사용자).

### 2.3 EstimatedUnlistedBlock `simpleOnly` prop

- `simpleOnly === true` 시: `unlistedValuationMode` 라디오 숨김(simple 고정) + 사례 49 `acqFaceValueOnly` 토글 숨김 — api 게이트 unlisted 한정(silent 미반영 차단, 엔진 설계 D1-1·2).
- 기존 비상장 호출처(`Step2.tsx:389-391`)는 prop 미전달(기본 false) — **동작 불변**.

### 2.4 부수 정정

`Step2.tsx:367·375` placeholder `"50,000"`·`"30,000"` → 한국어 설명("양도일 직전 1개월 종가평균 (1주당)" 등) — placeholder 숫자 예시 금지 정책.

## 3. 결과 카드 (⑦)

- 비상장 평가 표시 경로(`StockTransferTaxResultViewHelpers.tsx` — `valuationDetail.method === "weighted_avg"`)는 기존 존재(실측). **P0에서 상장 marketType 조합의 라벨 자연스러움 확인** — 필요 시 "거래정지우회" appliedRules 감지로 사유 1줄("양도일 거래정지·관리종목 — §165③에 따라 비상장 보충 평가 적용") 추가.
- 신규 result 필드 0 — 기존 echo(`valuationDetail`·`appliedRules`)만 사용.

## 4. 동기화 지점 (UI 측)

신규 입력 필드 **0** — `tradingHaltAtTransfer` ①~⑭ 기배선(계획서 §4 실측). 본 PR:

| # | 파일 | 작업 |
|---|---|---|
| ⑤ | `Step2.tsx` | 토글 신설(이동)·배너·§163⑨/PostListing 숨김 게이트 |
| ⑤ | `PostListingValuationCard.tsx` | disabled 토글 삭제 |
| ⑤ | `EstimatedUnlistedBlock.tsx` | `simpleOnly` prop |
| ⑦ | `StockTransferTaxResultViewHelpers.tsx` | P0 확인 후 사유 1줄(조건부) |
| ⑧ | `stock-transfer-tax-validate-step2.ts` | G-6 분모 면제 + C-6 차단(추출 함수 공유) + G-5 확대 |

## 5. E2E — `e2e/stock-transfer-trading-halt.spec.ts` (신규)

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | kosdaq·환산모드 | 거래정지 토글 visible (§163⑨ 블록 앞) |
| E-2 | 토글 ON | §163⑨ 블록 숨김 + 비상장 평가 폼 노출 + 모드 라디오 **비노출**(simpleOnly — 라디오 라벨 텍스트는 Do에서 `EstimatedUnlistedBlock:201~` 실측 후 확정) |
| E-3 | 토글 ON + 평가 입력 + 계산 | 결과 도달 + 환산취득가 25,000,000 (A-TH-1 동일 입력) |

- ToggleCard 클릭은 **제목 텍스트 클릭**(switch role 이중토글 회피 — §81④ PR 학습). 포트 충돌 시 `E2E_PORT=3200`.
- **Do deviation (E2E)**: 비상장 평가 simple 라벨이 "1주당 순손익가치/순자산가치"로 **양도·취득 2섹션 공통** → `fillByLabel` 단일 불가, `.nth(0)`=양도/`.nth(1)`=취득 인덱스 사용(거래정지 ON이라 §163⑨·PostListing 숨김 → 해당 라벨은 비상장 4필드만). E-1·2·3 전부 통과(3.0m 첫 실행은 dev 서버 빌드 포함).

## 6. UI 자가 점검 (Do 완료 조건)

- [ ] 토글 OFF에도 rose tone 배경 유지
- [ ] 거래정지 ON ↔ validate 통과 모순 없음 (분모 면제 G-6 + 평가 필수 C-6 동시)
- [ ] 기존 비상장 경로(`!isListed`) EstimatedUnlistedBlock 동작 불변 (prop 기본값)
- [ ] placeholder 숫자 예시 0건 (부수 정정 포함)
- [ ] E2E 3건 + 전체 회귀
