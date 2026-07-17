# Archive Index — 2026-07

| Feature | Phase | Match Rate | 완료일 | 경로 |
|---------|-------|-----------|--------|------|
| law-research-v2 | archived | 97% | 2026-04-19 | [law-research-v2/](./law-research-v2/) |

## 아카이브 요약

### law-research-v2 (`/law` 법령 리서치 고도화 — korean-law-mcp 수준 정제)
- **Match Rate**: 97% (Critical 100%)
- **Success Criteria**: 10/10 (100%) — SC-10(CLAUDE.md 갱신)은 report 작성 시점 ⚠ Partial이었으나 후속 세션에서 완료되어 archive 시 Met으로 정정
- **테스트**: 1222개 전체 통과 (46 파일, 신규 40개 — `ref-parser.test.ts` 14 + `query-router.test.ts` 26)
- **아키텍처**: Option B — Clean Architecture (파서·라우터 레이어 분리 + 기존 `client.ts` 하위호환 유지)
- **주요 구현**: 구조화 참조조문 파서(`parsers/ref-parser.ts` — `LawRef[]`·`PrecedentRef[]`) + Query Router 12종 패턴(`router/query-router.ts`) + 체인 시나리오 8종(`scenarios/`) + 법제처 API `ancYd`/`efYd`/`sort` 풀활용 + 판례 6구간 아코디언·참조조문 칩·하이라이트 UI
- **PDCA 기간**: 2026-04-18 ~ 2026-04-19 (1.5일, PM 단계 생략)
- **아카이브 일시**: 2026-07-16

> 참고: archive 이후 `/law`는 v4.4로 추가 확장됨(행위시법 `applicable-law.ts`, 신구대조 `time-travel.ts`, 현행성 라벨 `CurrentLawBadge`). 이는 law-research-v2 설계 범위 밖의 후속 작업으로, 본 아카이브 문서에는 반영돼 있지 않음. 현행 사양은 루트 `CLAUDE.md`의 `법령 리서치 (/law)` 섹션 참조.
