# UI 설계 — 계산 이력 비즈니스 키 dedup (사용자 체감 동작)

> 계획서: `docs/01-plan/calc-history-business-key-dedup.plan.md`
> 데이터 설계: `calc-history-business-key-dedup.engine.design.md`
> 성격: **신규 위젯·폼 변경 없음**. 저장 동작 변화에 따른 토스트·이력 목록 체감 동작 명세 + E2E.

## 1. 목표 / 비목표 (UI)

**목표**: 입력 중간에 저장 버튼을 여러 번 눌러도 같은 피상속인은 이력 1건으로 누적 없이 표시. 사용자가 "중복이 안 쌓인다"를 체감.

**비목표**: 새 입력 컴포넌트·폼 필드·결과뷰 변경. 저장 버튼 위치/모양 변경.

## 2. 사용자 시나리오

| # | 동작 | Before (현행) | After |
|---|---|---|---|
| S1 | 상속세 피상속인 입력 중 저장 버튼 ×3 | 이력에 3개 카드(이미지11) | **1개 카드**(같은 피상속인) |
| S2 | 입력 더 채우고 다시 저장 | 또 새 카드 | 같은 카드 갱신(시각 변경) |
| S3 | 계산 완료 후 결과 화면(자동저장) | 또 새 카드 | 같은 카드에 납부세액 반영 |
| S4 | 다른 피상속인으로 새 계산 | 별도 카드 | 별도 카드(정상) |
| S5 | 증여세 중간 저장 ×N | 현행 동작 | 현행 동작(폴백 — 변화 없음) |

## 3. 토스트 메시지 (기존 동작 — 무변경, 검증)

수동 저장 토스트(`save-handler-builders.ts:100` `formatSaveMessage`)는 `outcome.created`로 분기:
- `created: true`(신규 키 record) → "새 이력으로 저장되었습니다."
- `created: false`(같은 피상속인 키 매칭 update) → **"현재 시점 스냅샷으로 갱신되었습니다."**
- draft(`isDraft: true`, created:false) → "📝 미결 이력이 갱신되었습니다." / created:true → "📝 임시저장되었습니다". → 입력 중 저장하기 ×N 시 2번째부터 "미결 이력이 갱신"(같은 피상속인 키 매칭).

→ business-key 전환 후 **2번째부터 자동으로 "갱신" 토스트**가 뜸(created:false 반환). 토스트 코드 **변경 불필요** — 기존 created 분기가 그대로 올바른 메시지 출력.

자동저장 토스트(`buildAutoSaveToast`)도 `created` 분기 — "동일 입력의 기존 이력이 갱신되었습니다"가 "같은 피상속인 갱신"에 해당(문구 변경 없이 정합).

> **(선택, OOS)** 문구를 "같은 피상속인 이력이 갱신되었습니다"로 더 명확히 할 수 있으나, business-key 여부를 토스트에 노출하려면 outcome에 키 컨텍스트 전달 필요 → 범위 외. 현행 "갱신" 문구로 충분.

## 4. 이력 목록 (`/history`) — 무변경, 효과만

- `HistoryClient`는 `calculationRepository.list()` 결과를 그대로 렌더 → record가 1건이면 카드 1개. **코드 변경 없음**, 중복 카드가 사라지는 효과만.
- 의뢰인 배지(`clientMap[record.clientId]`)·세목 배지·납부세액·상속개시일 표시 모두 현행 유지.

## 5. 동기화 지점 (UI 8개)

| # | 지점 | 변경 |
|---|---|---|
| ①~⑤ 폼·위젯 | — | 무변경(저장 계층 한정) |
| ⑥ 사이드바 | — | 무변경 |
| ⑦ 결과 카드 | — | 무변경 |
| ⑧ Validation | — | 무변경 |
| (외) 토스트 | `formatSaveMessage`/`buildAutoSaveToast` | **코드 무변경** — created 분기가 갱신 메시지 자동 출력 |
| (외) 이력 목록 | `HistoryClient` | **코드 무변경** — dedup된 list 렌더 |

→ UI 코드 변경 0. 저장 동작 변화의 **체감 결과만** 사용자에게 노출.

## 6. E2E 시나리오 (브라우저 검증)

`e2e/inheritance-history-business-key-dedup.spec.ts` (신규):
- **저장 버튼**(실측): 각 입력 step에 `SaveButton` 노출(`InheritanceTaxForm:538·568·582·653`) — `getByRole("button", { name: /저장하기|현재 입력 저장/ })`. result 없는 입력 중 클릭 = draft 저장.
- H-1: 상속세 Step0에서 피상속인 주민번호 13자리 + 상속개시일 입력 → 저장하기 클릭 → 입력 일부 추가 → 저장하기 재클릭 ×2 → `/history` 이동 → **상속세 카드 1개**(중복 0). (현행이면 draft 3개 → RED)
- H-2: 다른 주민번호로 반복 → 카드 2개(정상 분리).

> [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족. 이력 카드 testid/세목 배지 텍스트로 카운트.

## 7. DoD (UI)
- [ ] S1~S4 체감: 중간 저장 ×N → 이력 1건.
- [ ] 토스트 2번째부터 "갱신" 메시지(코드 무변경 검증).
- [ ] 이력 목록 중복 카드 0(코드 무변경).
- [ ] E2E H-1·H-2 통과.
