/**
 * 양도소득세 가이드 페이지 (T-11)
 * URL: /guide/transfer-tax
 */

import Link from "next/link";
import { GuideTableOfContents, type TocItem } from "@/components/guide/GuideTableOfContents";

export const metadata = {
  title: "양도소득세 계산 방법 완전 가이드",
  description:
    "양도소득세 계산 구조, 1세대1주택 비과세 요건, 세율표, 장기보유특별공제, 다주택 중과세율, 절세 포인트까지 — 2024~2025 최신 세법 기준",
  openGraph: {
    title: "양도소득세 계산 방법 완전 가이드",
    description:
      "양도소득세 계산 구조, 1세대1주택 비과세 요건, 세율표, 장기보유특별공제, 다주택 중과세율, 절세 포인트까지 — 2024~2025 최신 세법 기준",
    type: "article",
  },
};

const TOC_ITEMS: TocItem[] = [
  { id: "intro",      label: "1. 양도소득세란?" },
  { id: "structure",  label: "2. 계산 구조" },
  { id: "exemption",  label: "3. 1세대1주택 비과세" },
  { id: "rates",      label: "4. 세율" },
  { id: "surcharge",  label: "5. 중과세율" },
  { id: "long-term",  label: "6. 장기보유특별공제" },
  { id: "tax-tips",   label: "7. 절세 포인트" },
  { id: "faq",        label: "8. 자주 묻는 질문" },
];

// ── 공통 스타일 ──
const sectionCls = "scroll-mt-20 space-y-4";
const h2Cls = "text-xl font-bold border-b pb-2";
const h3Cls = "text-base font-semibold text-primary";
const pCls = "text-sm text-muted-foreground leading-relaxed";
const tableCls = "w-full text-sm border-collapse";
const thCls = "border border-border bg-muted px-3 py-2 text-left font-semibold";
const tdCls = "border border-border px-3 py-2";
const calloutCls =
  "rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3 text-sm";
const warnCls =
  "rounded-lg border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300";

export default function TransferTaxGuidePage() {
  return (
    <div className="lg:grid lg:grid-cols-[220px_1fr] gap-10">
      {/* ── 목차 사이드바 ── */}
      <GuideTableOfContents items={TOC_ITEMS} />

      {/* ── 본문 ── */}
      <article className="space-y-12 min-w-0">

        {/* 페이지 헤더 */}
        <header className="space-y-2 pb-4 border-b">
          <p className="text-xs text-muted-foreground">세금 가이드</p>
          <h1 className="text-2xl font-bold">양도소득세 계산 방법 완전 가이드</h1>
          <p className={pCls}>
            부동산을 팔 때 내야 하는 세금, 양도소득세. 계산 구조부터 비과세 요건·절세 전략까지
            2024~2025년 최신 세법 기준으로 정리했습니다.
          </p>
        </header>

        {/* ────────────────────────────────── */}
        {/* 섹션 1. 양도소득세란? */}
        {/* ────────────────────────────────── */}
        <section id="intro" className={sectionCls}>
          <h2 className={h2Cls}>1. 양도소득세란?</h2>
          <p className={pCls}>
            <strong>양도소득세</strong>는 토지·건물 등 부동산을 양도(매도·교환·현물출자)할 때
            발생하는 차익(양도가액 − 취득가액)에 부과하는 국세입니다.
            소득세법 제94조~제104조에 근거하며, 지방소득세 10%가 별도로 부과됩니다.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className={h3Cls}>납세 시기</p>
              <p className={pCls}>
                양도일이 속하는 달의 말일부터 <strong>2개월 이내</strong> 예정신고·납부
                (소득세법 §105)
              </p>
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-1">
              <p className={h3Cls}>과세 대상</p>
              <p className={pCls}>
                토지·건물·부동산에 관한 권리(분양권·조합원입주권 포함),
                비사업용 토지, 주식(대주주)
              </p>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 2. 계산 구조 */}
        {/* ────────────────────────────────── */}
        <section id="structure" className={sectionCls}>
          <h2 className={h2Cls}>2. 계산 구조</h2>
          <p className={pCls}>양도소득세는 아래 순서대로 단계별로 계산합니다.</p>
          <div className="rounded-lg border bg-muted/30 p-5 font-mono text-sm space-y-1 leading-relaxed">
            <p className="font-semibold text-foreground">양도가액</p>
            <p className="text-muted-foreground pl-4">- 취득가액 (취득 당시 실거래가 또는 환산취득가액)</p>
            <p className="text-muted-foreground pl-4">- 필요경비 (취득세·중개수수료·자본적지출 등)</p>
            <p className="border-t pt-1 font-semibold text-foreground">= 양도차익</p>
            <p className="text-muted-foreground pl-4">- 장기보유특별공제 (최대 80%)</p>
            <p className="border-t pt-1 font-semibold text-foreground">= 양도소득금액</p>
            <p className="text-muted-foreground pl-4">- 기본공제 250만 원 (연 1회)</p>
            <p className="border-t pt-1 font-semibold text-foreground">= 과세표준</p>
            <p className="text-muted-foreground pl-4">× 세율 (6%~45%, 중과 시 +20~30%p)</p>
            <p className="border-t pt-1 font-semibold text-foreground">= 산출세액</p>
            <p className="text-muted-foreground pl-4">- 세액공제·감면</p>
            <p className="border-t pt-1 font-bold text-primary">= 결정세액 + 지방소득세 10%</p>
          </div>
          <div className={calloutCls}>
            <strong>환산취득가액</strong>이란 취득 당시 실거래가를 알 수 없을 때
            &quot;양도가액 × (취득 당시 기준시가 ÷ 양도 당시 기준시가)&quot;로 계산하는 방법입니다.
            필요경비로 <strong>취득 당시 기준시가 × 3%</strong>가 인정됩니다.
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 3. 1세대1주택 비과세 */}
        {/* ────────────────────────────────── */}
        <section id="exemption" className={sectionCls}>
          <h2 className={h2Cls}>3. 1세대1주택 비과세</h2>
          <p className={pCls}>
            1세대가 국내에 주택 1채를 보유하고 요건을 충족하면 양도소득세가 면제됩니다
            (소득세법 §89①3호, 시행령 §154).
          </p>

          <h3 className={h3Cls}>기본 요건</h3>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>
              <strong>보유 기간 2년 이상</strong> — 취득일 다음 날부터 양도일까지
            </li>
            <li>
              <strong>조정대상지역 내 취득 주택</strong> (2017.8.3. 이후 취득분): 보유 2년 + <strong>거주 2년</strong> 추가 요건
            </li>
            <li>
              양도가액 <strong>12억 원 이하</strong> — 초과분은 비율 안분하여 과세 (고가주택)
            </li>
            <li>
              양도일 현재 <strong>1주택</strong> 보유 (일시적 2주택 특례 제외)
            </li>
          </ul>

          <h3 className={h3Cls}>일시적 2주택 특례 (시행령 §155)</h3>
          <p className={pCls}>
            새 주택을 취득한 날부터 <strong>3년 이내</strong>에 기존 주택을 양도하면
            1세대1주택으로 봅니다. 단, 조정대상지역 내 기존·신규 주택은 <strong>1년 이내</strong> 양도·전입 조건이 있습니다.
          </p>

          <h3 className={h3Cls}>고가주택 — 12억 원 초과분 과세 계산</h3>
          <div className="rounded-lg border bg-muted/30 p-4 font-mono text-sm">
            과세 양도차익 = 전체 양도차익 × (양도가액 − 12억) ÷ 양도가액
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 4. 세율 */}
        {/* ────────────────────────────────── */}
        <section id="rates" className={sectionCls}>
          <h2 className={h2Cls}>4. 세율 (소득세법 §104)</h2>

          <h3 className={h3Cls}>기본세율 — 보유 2년 이상 (일반과세)</h3>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>과세표준</th>
                  <th className={thCls}>세율</th>
                  <th className={thCls}>누진공제액</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["1,400만원 이하", "6%", "—"],
                  ["1,400만원 초과 ~ 5,000만원 이하", "15%", "126만원"],
                  ["5,000만원 초과 ~ 8,800만원 이하", "24%", "576만원"],
                  ["8,800만원 초과 ~ 1.5억원 이하", "35%", "1,544만원"],
                  ["1.5억원 초과 ~ 3억원 이하", "38%", "1,994만원"],
                  ["3억원 초과 ~ 5억원 이하", "40%", "2,594만원"],
                  ["5억원 초과 ~ 10억원 이하", "42%", "3,594만원"],
                  ["10억원 초과", "45%", "6,594만원"],
                ].map(([range, rate, deduction]) => (
                  <tr key={range} className="hover:bg-muted/20">
                    <td className={tdCls}>{range}</td>
                    <td className={`${tdCls} font-semibold text-primary`}>{rate}</td>
                    <td className={tdCls}>{deduction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className={h3Cls}>단기 세율</h3>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>보유 기간</th>
                  <th className={thCls}>주택·조합원입주권·분양권</th>
                  <th className={thCls}>토지·건물 (주택 외)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["1년 미만", "70%", "50%"],
                  ["1년 이상 ~ 2년 미만", "60%", "40%"],
                  ["2년 이상", "기본세율", "기본세율"],
                ].map(([period, housing, other]) => (
                  <tr key={period} className="hover:bg-muted/20">
                    <td className={tdCls}>{period}</td>
                    <td className={`${tdCls} font-semibold text-destructive`}>{housing}</td>
                    <td className={`${tdCls} font-semibold text-destructive`}>{other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 5. 중과세율 */}
        {/* ────────────────────────────────── */}
        <section id="surcharge" className={sectionCls}>
          <h2 className={h2Cls}>5. 중과세율</h2>
          <div className={warnCls}>
            2022.5.10.~2025.5.9. 중과세율 <strong>한시 배제</strong> (조세특례제한법 §69의2):
            이 기간 중 조정대상지역 내 다주택자도 기본세율 적용.
            2025.5.10. 이후 양도분부터 아래 중과세율 재적용 예정.
          </div>

          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>대상</th>
                  <th className={thCls}>중과세율</th>
                  <th className={thCls}>장기보유특별공제</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["조정대상지역 2주택 (개인)", "기본세율 + 20%p", "배제"],
                  ["조정대상지역 3주택 이상 (개인)", "기본세율 + 30%p", "배제"],
                  ["비사업용 토지", "기본세율 + 10%p", "배제"],
                  ["분양권 (1년 미만)", "70%", "—"],
                  ["분양권 (1년 이상)", "60%", "—"],
                ].map(([target, rate, deduction]) => (
                  <tr key={target} className="hover:bg-muted/20">
                    <td className={tdCls}>{target}</td>
                    <td className={`${tdCls} font-semibold text-destructive`}>{rate}</td>
                    <td className={tdCls}>{deduction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 6. 장기보유특별공제 */}
        {/* ────────────────────────────────── */}
        <section id="long-term" className={sectionCls}>
          <h2 className={h2Cls}>6. 장기보유특별공제 (소득세법 §95)</h2>
          <p className={pCls}>
            부동산을 <strong>3년 이상</strong> 보유하면 양도차익에서 최대 30%(일반) 또는
            80%(1세대1주택)까지 공제받을 수 있습니다.
          </p>

          <h3 className={h3Cls}>일반 공제율 (주택 외 토지·건물 포함)</h3>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>보유 기간</th>
                  <th className={thCls}>공제율</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["3년 이상 ~ 4년 미만", "6%"],
                  ["4년 이상 ~ 5년 미만", "8%"],
                  ["5년 이상 ~ 6년 미만", "10%"],
                  ["6년 이상 ~ 7년 미만", "12%"],
                  ["7년 이상 ~ 8년 미만", "14%"],
                  ["8년 이상 ~ 9년 미만", "16%"],
                  ["9년 이상 ~ 10년 미만", "18%"],
                  ["10년 이상", "20% (비주택) / 30% (토지)"],
                ].map(([period, rate]) => (
                  <tr key={period} className="hover:bg-muted/20">
                    <td className={tdCls}>{period}</td>
                    <td className={`${tdCls} font-semibold`}>{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className={h3Cls}>1세대1주택 공제율 (보유+거주 연수 합산)</h3>
          <p className="text-xs text-muted-foreground -mt-2">
            보유 연 2% + 거주 연 4% → 최대 40%+40% = 80%
          </p>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>보유 기간</th>
                  <th className={thCls}>보유 공제 (연 2%)</th>
                  <th className={thCls}>거주 기간</th>
                  <th className={thCls}>거주 공제 (연 4%)</th>
                  <th className={thCls}>합계 (최대)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["3년", "6%", "3년", "12%", "18%"],
                  ["5년", "10%", "5년", "20%", "30%"],
                  ["8년", "16%", "8년", "32%", "48%"],
                  ["10년+", "20%", "10년+", "40%", "60%"],
                  ["15년+", "30%", "10년+", "40%", "70%"],
                  ["20년+", "40%", "10년+", "40%", "80% (한도)"],
                ].map(([hold, holdRate, reside, resideRate, total]) => (
                  <tr key={hold} className="hover:bg-muted/20">
                    <td className={tdCls}>{hold}</td>
                    <td className={tdCls}>{holdRate}</td>
                    <td className={tdCls}>{reside}</td>
                    <td className={tdCls}>{resideRate}</td>
                    <td className={`${tdCls} font-semibold text-primary`}>{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={calloutCls}>
            1세대1주택 장기보유특별공제는 <strong>12억원 초과 고가주택</strong>에만 적용되며,
            12억원 이하는 비과세이므로 공제 적용 불필요.
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 7. 절세 포인트 */}
        {/* ────────────────────────────────── */}
        <section id="tax-tips" className={sectionCls}>
          <h2 className={h2Cls}>7. 절세 포인트 3가지</h2>

          <div className="space-y-4">
            {[
              {
                num: "01",
                title: "보유 기간 2년 기산 시점 확인",
                body: `취득일(잔금 지급일 또는 등기 접수일 중 빠른 날)의 \`다음 날\`부터 양도일까지 계산합니다.
예: 2022.3.31. 취득 → 2024.3.31. 양도 시 보유 기간 730일 미충족 → 세율 60%.
\`2024.4.1.\` 이후 양도해야 기본세율 적용.`,
              },
              {
                num: "02",
                title: "조정대상지역 지정·해제 시점 확인",
                body: `비과세(1세대1주택 거주 요건)는 취득일 당시 조정대상지역 여부로 판단하고,
다주택 중과세는 양도일 당시 조정대상지역 여부로 판단합니다.
지역 해제 후 양도하면 중과 적용 제외 — 해제 시점을 반드시 확인하세요.`,
              },
              {
                num: "03",
                title: "배우자 증여 후 이월과세 주의",
                body: `배우자 또는 직계존비속에게 증여받은 자산을 \`5년 이내\` 양도하면
증여 전 취득가액으로 양도차익을 계산합니다 (소득세법 §97의2 이월과세).
절세 목적의 증여 후 단기 양도는 효과가 없을 수 있습니다.`,
              },
            ].map((tip) => (
              <div key={tip.num} className="rounded-lg border bg-card p-5 flex gap-4">
                <span className="text-2xl font-black text-primary/20 leading-none mt-0.5 shrink-0">
                  {tip.num}
                </span>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{tip.title}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {tip.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* 섹션 8. FAQ */}
        {/* ────────────────────────────────── */}
        <section id="faq" className={sectionCls}>
          <h2 className={h2Cls}>8. 자주 묻는 질문</h2>

          <div className="space-y-4">
            {[
              {
                q: "상속받은 주택의 취득일은 언제인가요?",
                a: `상속에 의한 취득은 \`피상속인의 사망일(상속개시일)\`이 취득일입니다.
피상속인이 오래전에 취득했더라도, 상속인 기준 보유 기간은 상속개시일부터 계산합니다.
단, 동거봉양·상속 특례(소득세법 시행령 §155)를 적용하면 피상속인의 보유 기간을 승계받을 수 있습니다.`,
              },
              {
                q: "다가구주택과 다세대주택의 세금 차이는?",
                a: `다가구주택은 \`단독주택\` 유형으로 건물 전체를 1채로 봅니다.
1세대1주택 비과세 적용 시 유리하지만, 일부 호실 임대 시 주택 수 판단에 유의해야 합니다.
다세대주택은 \`공동주택\` 유형으로 각 호실이 개별 주택으로 인정됩니다.
다세대를 다가구로 오인하는 실수에 주의하세요.`,
              },
              {
                q: "거주 이전 후 양도해도 비과세가 가능한가요?",
                a: `가능합니다. 조정대상지역 취득 주택도 \`거주 요건 2년\`을 채운 후에는
다른 곳으로 이사해도 비과세 적용됩니다.
즉, 양도일에 거주 중일 필요는 없고, \`과거 거주 이력\`이 2년 이상이면 됩니다.
단, 거주 기간 계산 시 일시적 단절(직장·취학 사유)은 계속 거주로 인정되는 경우가 있습니다.`,
              },
              {
                q: "부부가 공동명의로 보유한 주택은 주택 수 산정 시 어떻게 되나요?",
                a: `공동명의 주택은 각 지분 보유자 모두에게 1주택으로 산정됩니다.
부부 합산으로 주택 수를 계산하므로, 부부 각자 명의의 주택을 합산한 수가
1세대 주택 수가 됩니다 (소득세법 §88 "1세대" 정의).`,
              },
            ].map((faq, i) => (
              <details key={i} className="group border rounded-lg">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none">
                  <span className="text-sm font-medium">{faq.q}</span>
                  <span className="text-muted-foreground text-lg leading-none group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <div className="px-4 pb-4 pt-1">
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────── */}
        {/* CTA */}
        {/* ────────────────────────────────── */}
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 text-center space-y-3">
          <p className="font-semibold text-lg">직접 계산해 보세요</p>
          <p className={pCls}>
            위 가이드를 바탕으로 양도소득세를 자동 계산해 드립니다.
            1세대1주택 비과세, 다주택 중과, 장기보유특별공제까지 자동 반영됩니다.
          </p>
          <Link
            href="/calc/transfer-tax"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            양도소득세 계산기 바로가기 →
          </Link>
        </div>

        {/* 면책 안내 */}
        <p className="text-xs text-muted-foreground border-t pt-4">
          본 가이드는 일반적인 세법 정보를 제공하며, 개인별 상황에 따라 세금이 달라질 수 있습니다.
          정확한 세금 계산은 세무사 상담을 권장합니다. (기준: 소득세법 2024.1.1. 개정 반영)
        </p>
      </article>
    </div>
  );
}
