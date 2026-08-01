/**
 * **폐지된** 시·군·구 코드 목록 생성 — `lib/geo/abolished-sigungu-codes.json`.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md (Y-5)
 *
 * ## 출처 — 행정안전부 「법정동코드 전체자료」
 *
 * `https://www.code.go.kr/etc/codeFullDown.do?codeseId=00002` (**무인증** · ZIP · CP949 TSV)
 * 컬럼은 `법정동코드(10) · 법정동명 · 폐지여부` 세 개뿐이고 **폐지된 코드가 전량 보존**돼 있다
 * (2026-08-01 실측 53,388행). Y-5가 찾던 「연혁 코드」가 바로 이것이다.
 *
 * ⚠️ 한계: **폐지 코드 → 후속 코드 매핑은 없다.** 「무엇이 되었는가」는 알 수 없고
 * 「그 코드가 한때 무엇이었는가」만 알 수 있다. 그래서 별칭 테이블
 * (`lib/geo/sigungu-code-alias.ts`)을 이 자료로 대체할 수는 없다.
 *
 * ## 왜 뽑는가 — **허용이 아니라 진단**이다
 *
 * 코드 리터럴 감사(`sigungu-code-literal-audit.anchor.test.ts`)에서 낯선 코드를 만났을 때
 * 두 경우를 구분하기 위해서다:
 *
 *   · 「한때 실재했으나 폐지된 코드」  → 개편을 따라가지 못한 것 (D-1·D-5·D-7~D-9)
 *   · 「어느 시점에도 없던 코드」      → 손으로 잘못 적은 것
 *
 * 🔴 **폐지 코드를 감사 허용 목록에 넣으면 안 된다.** D-6의 `41810`은 실재했던 코드
 * (폐지된 「경기도 포천군」)라 허용하면 그대로 통과해 버린다 — 연천군(`41800`) 자리에
 * 포천군 코드가 적혀 있던 결함을 놓친다. 판정은 엄격하게 두고 **실패 메시지만** 풍부하게 한다.
 *
 * 실행: npx tsx scripts/build-abolished-sigungu-codes.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const SOURCE_URL = "https://www.code.go.kr/etc/codeFullDown.do?codeseId=00002";
const OUT_PATH = path.join(process.cwd(), "lib/geo/abolished-sigungu-codes.json");

/** ZIP(단일 엔트리, deflate) 최소 파서 — 의존성 추가를 피한다. */
function readSingleZipEntry(buf: Buffer): Buffer {
  const sig = buf.readUInt32LE(0);
  if (sig !== 0x04034b50) throw new Error(`ZIP 로컬 헤더가 아니다: 0x${sig.toString(16)}`);
  const method = buf.readUInt16LE(8);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const body = buf.subarray(start);
  if (method === 0) return body;
  if (method === 8) return zlib.inflateRawSync(body);
  throw new Error(`지원하지 않는 압축 방식: ${method}`);
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.code.go.kr/stdcode/regCodeL.do" },
  });
  if (!res.ok) throw new Error(`다운로드 실패: HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  if (zip.length < 1000) throw new Error(`응답이 너무 작다(${zip.length}B) — 삭제/이동 안내 페이지일 수 있다.`);

  // 원본은 CP949. Node는 기본 지원하지 않아 TextDecoder("euc-kr")로 읽는다.
  const text = new TextDecoder("euc-kr").decode(readSingleZipEntry(zip));
  const lines = text.split(/\r?\n/).slice(1).filter((l) => l.trim());
  console.log(`법정동코드 전체자료 ${lines.length}행 수신`);

  /** 시·군·구 레벨(뒤 5자리가 `00000`) 중 폐지된 것. 시·도 레벨(뒤 8자리 0)은 제외. */
  const abolished: Record<string, string> = {};
  const alive = new Set<string>();
  for (const line of lines) {
    const [code, name, state] = line.split("\t");
    if (!code || code.length !== 10 || !code.endsWith("00000")) continue;
    if (code.endsWith("0000000")) continue; // 시·도 레벨
    const five = code.slice(0, 5);
    if (state?.trim() === "폐지") abolished[five] ??= name.trim();
    else alive.add(five);
  }
  // 같은 5자리가 살아 있으면 폐지 목록에서 뺀다(코드 재사용 방지 — 현행이 우선).
  for (const five of alive) delete abolished[five];

  const sorted = Object.fromEntries(Object.entries(abolished).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`폐지 시·군·구 ${Object.keys(sorted).length}건 → ${OUT_PATH}`);
  // 결함 사례 자가 확인 — D-6의 41810이 「포천군」으로 잡혀야 한다.
  console.log(`  검증 41810 → ${sorted["41810"] ?? "(없음)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
