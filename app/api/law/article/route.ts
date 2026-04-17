/**
 * 국가법령정보센터 DRF Open API 프록시
 * GET /api/law/article?law={법령명}&articleNum={조문번호}
 *
 * 환경변수: KOREAN_LAW_OC — law.go.kr Open API 인증키(OC)
 */

import { NextRequest, NextResponse } from "next/server";

const DRF_BASE = "https://www.law.go.kr/DRF";

// ─── 타입 ─────────────────────────────────────────────

interface LawSearchItem {
  법령일련번호?: string;
}

interface LawSearchResponse {
  LawSearch?: {
    law?: LawSearchItem | LawSearchItem[];
  };
}

interface Ho {
  호번호?: string;
  호내용?: string;
}

interface Hang {
  항번호?: string;
  항내용?: string;
  호?: Ho | Ho[];
}

interface ArticleUnit {
  조문번호?: string;
  조문여부?: string;
  조문내용?: string;
  조문제목?: string;
  항?: Hang | Hang[];
}

interface LawFullResponse {
  법령?: {
    조문?: {
      조문단위?: ArticleUnit | ArticleUnit[];
    };
  };
}

// ─── MST 조회 (법령명 → 법령일련번호) ─────────────────

async function getLawMst(lawName: string, oc: string): Promise<string | null> {
  const params = new URLSearchParams({
    OC: oc, target: "law", query: lawName,
    display: "1", page: "1", type: "json",
  });
  try {
    const res = await fetch(`${DRF_BASE}/lawSearch.do?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: LawSearchResponse = await res.json();
    const law = data.LawSearch?.law;
    if (!law) return null;
    const item = Array.isArray(law) ? law[0] : law;
    return item?.법령일련번호 ?? null;
  } catch {
    return null;
  }
}

// ─── 조문 렌더링 ──────────────────────────────────────

function renderUnit(unit: ArticleUnit): string {
  const lines: string[] = [];
  if (unit.조문제목) lines.push(`【${unit.조문제목}】`);
  if (unit.조문내용) lines.push(unit.조문내용);

  const hangs = unit.항
    ? (Array.isArray(unit.항) ? unit.항 : [unit.항])
    : [];

  for (const hang of hangs) {
    if (hang.항내용) lines.push(hang.항내용);
    const hos = hang.호
      ? (Array.isArray(hang.호) ? hang.호 : [hang.호])
      : [];
    for (const ho of hos) {
      if (ho.호내용) lines.push(`  ${ho.호내용}`);
    }
  }

  return lines.join("\n");
}

// ─── 전체 법령에서 해당 조문 추출 ─────────────────────

async function getArticleFromLaw(
  mst: string,
  articleNum: string,
  oc: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    OC: oc, target: "law", MST: mst, type: "json",
  });
  try {
    const res = await fetch(`${DRF_BASE}/lawService.do?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: LawFullResponse = await res.json();
    const raw = data.법령?.조문?.조문단위;
    if (!raw) return null;

    const units = Array.isArray(raw) ? raw : [raw];

    // 해당 조문번호 중 실제 본문(조문여부 !== "전문") 우선
    const targets = units.filter((u) => u.조문번호 === articleNum);
    if (targets.length === 0) return null;

    const body = targets.find((u) => u.조문여부 !== "전문") ?? targets[0];
    return renderUnit(body);
  } catch {
    return null;
  }
}

// ─── GET handler ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const law        = searchParams.get("law")?.trim() ?? "";
  const articleNum = searchParams.get("articleNum")?.trim() ?? "";

  if (!law || !articleNum) {
    return NextResponse.json(
      { error: { code: "MISSING_PARAMS", message: "law, articleNum 파라미터가 필요합니다." } },
      { status: 400 },
    );
  }

  const oc = process.env.KOREAN_LAW_OC;
  if (!oc) {
    return NextResponse.json(
      { error: { code: "API_KEY_MISSING", message: "KOREAN_LAW_OC 환경변수가 설정되지 않았습니다." } },
      { status: 503 },
    );
  }

  const mst = await getLawMst(law, oc);
  if (!mst) {
    return NextResponse.json(
      { error: { code: "LAW_NOT_FOUND", message: `법령을 찾을 수 없습니다: ${law}` } },
      { status: 404 },
    );
  }

  const content = await getArticleFromLaw(mst, articleNum, oc);
  if (!content) {
    return NextResponse.json(
      { error: { code: "ARTICLE_NOT_FOUND", message: `조문을 찾을 수 없습니다: 제${articleNum}조` } },
      { status: 404 },
    );
  }

  return NextResponse.json({ law, articleNum, content });
}
