/**
 * 법제처 Open API 의존 E2E의 **외부 비의존화**.
 *
 * ## 왜 필요한가 — CI 실패는 우리 코드 탓이 아니었다 (2026-08-06 실측)
 *
 * 「E2E (법제처 API · 자문)」 job 48회 전수: **success 32 · failure 16 = 실패율 33%**.
 * 실패는 **러너 인스턴스에 종속된 이항(binary) 상태**다 — 같은 시각·같은 OC 키인데 갈린다.
 * `31055656433`(23:14 실패)이 도는 **중에** 시작한 `31055699662`(23:15)·`31055996368`(23:20)은
 * **둘 다 성공**했다. ⇒ 시각·동시성·키 요인이 아니다.
 *
 * 원인은 `836139a1`(2026-08-04)이다. 저장소 public 전환으로 self-hosted(**개발자 Mac = 한국 IP**)
 * → **`ubuntu-latest`(Azure = 해외 IP)** 로 환원했고, 법제처 DRF API가 Azure 대역 **일부**에서
 * 연결되지 않는다(전면 차단은 아니다 — 미국에서 `www.law.go.kr` 연결 성공 실측).
 * 증상은 `fetch failed` — HTTP 4xx/5xx가 아니라 **HTTP 레이어에 도달조차 못 한** 저수준 실패다.
 *
 * ## 그래서 mock 한다 — 이 저장소의 확립된 패턴이다
 *
 * 외부 정부 API에 의존하는 E2E **14 spec**은 이미 `page.route`로 mock한다
 * (`building-register-autofill.spec.ts:22` 등). `law-*` **16 spec만 mock 0건**인 유일한 예외였고,
 * 그래서 CI가 외부 가용성에 흔들렸다. 그 예외를 없앤다.
 *
 * ⚠️ **가용성 감시를 버리는 것이 아니다.** 실제 호출로 법제처를 확인하는 일은
 *    `.github/workflows/law-api-health.yml`(스케줄)로 **분리**했다. PR 게이트에서 뺐을 뿐이다.
 *
 * ## 쓰는 법
 *
 * ```ts
 * import { mockLawApi } from "./_helpers/law-api-mock";
 * await mockLawApi(page);      // page.goto 前에
 * await page.goto("/law");
 * ```
 *
 * ## fixture 갱신 (법제처 응답 포맷이 바뀌었을 때)
 *
 * ```bash
 * LAW_FIXTURE_CAPTURE=1 npx playwright test law-article-popup law-article-table-html \
 *   law-article-table-render law-cite-check law-impact-map
 * ```
 * 실제 API를 호출해 `e2e/_fixtures/law/`를 덮어쓴다(한국 IP에서 돌릴 것 — 해외에서는 실패한다).
 *
 * ⚠️ **fixture는 실제 응답 원문이어야 한다.** 손으로 만든 이상적인 JSON을 넣으면
 *    `restoreBoxTableLines` 같은 **파서 전처리 회귀 테스트가 무의미해진다** —
 *    법제처 실응답은 박스표가 개행 없이 한 줄로 붙어서 오고, 그것을 잡는 것이 HTML-1의 존재 이유다.
 *    (실측: 캡처된 §55 fixture는 **개행 5개 · 박스 문자 397개**. 캐시본은 개행 27개로 포맷이 다르다.)
 *
 * 🪤 **`.legal-cache/`가 검증을 오염시킨다 — 실제로 당했다(2026-08-06).**
 *    캡처는 실제 API를 호출하므로 서버가 `.legal-cache/`에 응답을 남긴다(TTL **30일**).
 *    그 상태로 "mock을 꺼도 통과하나?"를 시험하면 **캐시 덕분에 통과**해 버려,
 *    mock이 실제로 외부 호출을 막는지 **알 수 없다**. 첫 대조 실험이 이렇게 무효였다.
 *    ⇒ 대조 실험 전에는 반드시 **`rm -rf .legal-cache` + dev 서버 재시작**.
 *    (CI는 fresh checkout이고 `.gitignore:48`이라 캐시가 애초에 없다 — 로컬만의 함정이다.)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { Page } from "@playwright/test";

const FIXTURE_DIR = path.resolve(process.cwd(), "e2e/_fixtures/law");
const CAPTURE = !!process.env.LAW_FIXTURE_CAPTURE;

/**
 * 🔬 **가로채지 않고 실제 법제처 API로 나간다** — 스케줄 헬스체크(`law-api-health.yml`) 전용.
 *
 * PR 게이트에서는 **절대 켜지 않는다**. 이 경로가 바로 33% 실패의 원인이다.
 * 분리해 두는 이유는 두 가지다:
 *   ① 법제처 가용성 추이를 계속 본다(mock으로 덮어 눈을 감는 것이 아니다).
 *   ② **fixture가 stale해지면 여기서 드러난다** — 응답 포맷이 바뀌면 live만 깨진다.
 */
const LIVE = !!process.env.LAW_E2E_LIVE;

interface LawFixture {
  /** 사람이 읽기 위한 원본 요청 (키 계산에는 쓰지 않는다) */
  request: string;
  status: number;
  contentType: string;
  body: string;
}

/**
 * 요청 → fixture 파일명.
 *
 * 쿼리 파라미터는 **정렬**해서 순서 흔들림에 견디게 한다.
 * 한글·특수문자가 그대로 파일명에 들어가면 OS별로 깨지므로 **경로 slug + sha1 앞 10자**로 만든다.
 */
function keyOf(rawUrl: string, method: string, postData: string | null): string {
  const u = new URL(rawUrl);
  const qs = [...u.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = `${method} ${u.pathname}?${qs}${postData ? ` ${postData}` : ""}`;
  const slug = u.pathname.replace(/^\/api\/law\/?/, "").replace(/[^A-Za-z0-9-]/g, "-") || "root";
  const hash = crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 10);
  return `${slug}-${hash}`;
}

/**
 * `/api/law/**` 를 전부 가로챈다.
 *
 * 🔴 **fixture가 없으면 599로 실패시킨다 — 실제 호출로 새지 않는다.**
 *    `route.continue()`로 흘려보내면 "mock 했다고 믿는데 사실은 외부 의존"이라는
 *    가장 나쁜 상태가 된다. 빠진 요청은 테스트 실패로 즉시 드러나야 한다.
 */
export async function mockLawApi(page: Page): Promise<void> {
  // live 헬스체크는 가로채지 않는다. (캡처는 가로채야 저장할 수 있으므로 CAPTURE가 우선)
  if (LIVE && !CAPTURE) return;

  await page.route("**/api/law/**", async (route) => {
    const req = route.request();
    const key = keyOf(req.url(), req.method(), req.postData());
    const file = path.join(FIXTURE_DIR, `${key}.json`);

    if (CAPTURE) {
      const res = await route.fetch();
      const body = await res.text();
      const fixture: LawFixture = {
        request: `${req.method()} ${new URL(req.url()).pathname}${new URL(req.url()).search}`,
        status: res.status(),
        contentType: res.headers()["content-type"] ?? "application/json",
        body,
      };
      fs.mkdirSync(FIXTURE_DIR, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
      await route.fulfill({ status: res.status(), headers: res.headers(), body });
      return;
    }

    if (!fs.existsSync(file)) {
      const miss = `${req.method()} ${new URL(req.url()).pathname}${new URL(req.url()).search}`;
      await route.fulfill({
        status: 599,
        contentType: "application/json",
        body: JSON.stringify({
          error: "law fixture 없음",
          request: miss,
          expectedFile: `e2e/_fixtures/law/${key}.json`,
          hint: "LAW_FIXTURE_CAPTURE=1 로 재캡처할 것 (한국 IP에서)",
        }),
      });
      return;
    }

    const fixture = JSON.parse(fs.readFileSync(file, "utf8")) as LawFixture;
    await route.fulfill({
      status: fixture.status,
      contentType: fixture.contentType,
      body: fixture.body,
    });
  });
}
