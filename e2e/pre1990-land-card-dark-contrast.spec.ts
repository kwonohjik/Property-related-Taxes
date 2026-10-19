/**
 * E2E: 「1990.8.30. 이전 취득 토지 기준시가 환산 (§164④)」 카드 — 다크 모드 글자 대비 회귀.
 *
 * `alwaysOpen` 경로가 `<ToneCard noDark>`로 그려져 다크 모드에서도 라이트용 반투명 배경이 깔렸다.
 * 그 위의 라이트용 주황 글자(제목·경고문)와 밝기가 같아 대비가 1.00이었다.
 * 계획서: docs/00-pm/fieldcard-trailing-overflow-and-dark-contrast.plan.md §B
 *
 * 실행: E2E_PORT=3178 npx playwright test e2e/pre1990-land-card-dark-contrast.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** WCAG AA 일반 글자 기준 */
const MIN_CONTRAST = 4.5;

/** 1987 상속 토지 — 개별공시지가 최초고시(1990.8.30.) 전이라 §164④ 카드가 항상 열린다. 면적을 비워 경고문을 띄운다. */
function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "land",
            landNature: "standalone",
            assetLabel: "상속 토지",
            acquisitionCause: "inheritance",
            acquisitionDate: "1987-05-01",
            inheritanceStartDate: "1987-05-01",
            decedentAcquisitionDate: "1975-03-01",
            inheritanceAssetKind: "land",
            inheritanceValuationMethod: "supplementary",
            publishedValueAtInheritance: "50000000",
            actualSalePrice: "500000000",
          },
        ],
        transferDate: "2025-06-01",
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme} — 카드 안 글자 대비가 모두 ${MIN_CONTRAST} 이상`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm());
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);
    const title = page.getByText("1990.8.30. 이전 취득 토지 기준시가 환산 (§164④)", { exact: true });
    await title.waitFor();
    await expect(page.getByText(/취득 당시 면적을 먼저 입력하면/)).toBeVisible();

    const rows = await title.evaluate((t) => {
      let card = t.parentElement!;
      while (!(card.className.includes("rounded-lg") && card.className.includes("border"))) card = card.parentElement!;
      // 어떤 CSS 색 표기(oklch 등)든 canvas로 sRGB로 바꾼다
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d")!;
      const rgba = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const over = (top: number[], bot: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1);
      // 실제 보이는 배경 = 조상 배경을 html부터 차례로 합성
      const bgOf = (el: Element) => {
        const chain: Element[] = [];
        for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
        let c = [255, 255, 255, 1];
        for (const e of chain.reverse()) {
          const b = rgba(getComputedStyle(e).backgroundColor);
          if (b[3] > 0) c = over(b, c);
        }
        return c;
      };
      const lum = (c: number[]) => {
        const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const ratio = (a: number[], b: number[]) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      return [card, ...card.querySelectorAll<HTMLElement>("*")]
        .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => {
          const bg = bgOf(e);
          const fg = over(rgba(getComputedStyle(e).color), bg);
          return { text: (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30), ratio: Math.round(ratio(fg, bg) * 100) / 100 };
        });
    });

    expect(rows.length).toBeGreaterThan(5);
    const low = rows.filter((r) => r.ratio < MIN_CONTRAST);
    expect(low, `대비 ${MIN_CONTRAST} 미만 글자`).toEqual([]);
  });
}
