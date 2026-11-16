# CI 워크플로 편집 규칙

- 신규 워크플로는 `runs-on: ubuntu-latest`. self-hosted는 pre-push가 차단한다(`scripts/check-workflow-runner.sh` — public 저장소라 fork PR이 개발자 Mac에서 코드를 실행할 수 있다). 저장소를 비공개로 되돌리면 이 방향부터 재검토.
- 샤드 수를 바꾸면 `ci.yml`의 `--shard=N/분모`도 함께 바꾸고, 샤드 합집합 = 전체(누락·중복 0)를 한 리포터(json)로 대조한다 — 어긋나면 일부 테스트가 조용히 실행되지 않는다. `--reporter=dot` 요약은 적게 집계하므로 json과 섞지 말 것.
- `timeout-minutes`는 호스팅 러너 실측으로만 갱신(Mac 수치 금지). Playwright 타임아웃은 CI 60초 / 로컬 30초 — 로컬은 올리지 않는다.
- job 레벨 `continue-on-error`는 체크를 초록으로 만들지 않는다(conclusion은 `failure` 그대로).
- 배경·실측 이력: [docs/00-pm/ci-pipeline.md](../docs/00-pm/ci-pipeline.md).
