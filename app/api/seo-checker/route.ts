import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

interface SeoMetrics {
  statusCode: number;
  titleLength: number;
  descriptionLength: number;
  h1Count: number;
  h2Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  canonical: string;
  robotsFound: boolean;
  sitemapFound: boolean;
  viewportFound: boolean;
  noindexFound: boolean;
  structuredDataCount: number;
  wordCount: number;
  phoneLinkCount: number;
  emailLinkCount: number;
  ctaTextCount: number;
}

interface CheckItem {
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
  problem: string;
  recommendation: string;
  howToFix: string[];
  examples: string[];
}

interface SeoResult {
  url: string;
  checkedAt: string;
  elapsedMs: number;
  score: number;
  grade: string;
  title: string;
  description: string;
  metrics: SeoMetrics;
  checks: CheckItem[];
  topIssues: string[];
}

function normalizeUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function calcGrade(score: number): string {
  if (score >= 85) return "좋음";
  if (score >= 60) return "보통";
  return "개선 필요";
}

function countWords($: cheerio.CheerioAPI): number {
  const bodyClone = $("body").clone();
  bodyClone.find("script, style, noscript").remove();
  const text = bodyClone.text().replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

const CTA_PATTERNS = [
  /문의/,
  /상담/,
  /예약/,
  /신청/,
  /연락/,
  /견적/,
  /시작하기/,
  /무료/,
  /지금/,
  /바로/,
  /contact/i,
  /consult/i,
  /apply/i,
];

function countCtaText($: cheerio.CheerioAPI): number {
  let count = 0;
  $("a, button").each((_, el) => {
    const text = $(el).text();
    if (CTA_PATTERNS.some((p) => p.test(text))) count += 1;
  });
  return count;
}

function getMissingAltExamples($: cheerio.CheerioAPI): string[] {
  return $("img")
    .filter((_, el) => !$(el).attr("alt"))
    .slice(0, 8)
    .map((index, el) => {
      const src = $(el).attr("src")?.trim() || "src 없음";
      const className = $(el).attr("class")?.trim();
      const id = $(el).attr("id")?.trim();
      const selector = [id ? `#${id}` : "", className ? `.${className.split(/\s+/).join(".")}` : ""]
        .filter(Boolean)
        .join("");
      return `${index + 1}. <img src="${src}"${selector ? ` (${selector})` : ""}>`;
    })
    .get();
}

async function checkFile(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  try {
    const { url: rawUrl } = await req.json();
    const url = normalizeUrl(rawUrl);

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL을 입력해주세요." },
        { status: 400 },
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: "올바른 URL을 입력해주세요." },
        { status: 400 },
      );
    }

    let html = "";
    let statusCode = 0;

    try {
      const res = await fetch(parsedUrl.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOChecker/1.0)" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      statusCode = res.status;
      html = await res.text();
    } catch {
      return NextResponse.json(
        { success: false, error: "페이지에 접근할 수 없습니다." },
        { status: 200 },
      );
    }

    const $ = cheerio.load(html);

    const titleText = $("title").first().text().trim();
    const descContent = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const canonicalHref = $('link[rel="canonical"]').attr("href")?.trim() ?? "";
    const viewportFound = !!$('meta[name="viewport"]').length;
    const robotsMeta = $('meta[name="robots"]').attr("content")?.toLowerCase() ?? "";
    const noindexFound = robotsMeta.includes("noindex");

    const h1Texts = $("h1")
      .slice(0, 5)
      .map((index, el) => `${index + 1}. ${$(el).text().replace(/\s+/g, " ").trim() || "텍스트 없음"}`)
      .get();
    const h1Count = $("h1").length;
    const h2Count = $("h2").length;
    const images = $("img");
    const imageCount = images.length;
    const imagesMissingAlt = images.filter((_, el) => !$(el).attr("alt")).length;
    const missingAltExamples = getMissingAltExamples($);
    const structuredDataCount = $('script[type="application/ld+json"]').length;
    const wordCount = countWords($);
    const phoneLinkCount = $('a[href^="tel:"]').length;
    const emailLinkCount = $('a[href^="mailto:"]').length;
    const ctaTextCount = countCtaText($);

    const origin = parsedUrl.origin;
    const [robotsFound, sitemapFound] = await Promise.all([
      checkFile(`${origin}/robots.txt`),
      checkFile(`${origin}/sitemap.xml`),
    ]);

    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
    const ogDesc = $('meta[property="og:description"]').attr("content")?.trim() ?? "";
    const ogImage = $('meta[property="og:image"]').attr("content")?.trim() ?? "";

    const metrics: SeoMetrics = {
      statusCode,
      titleLength: titleText.length,
      descriptionLength: descContent.length,
      h1Count,
      h2Count,
      imageCount,
      imagesMissingAlt,
      canonical: canonicalHref,
      robotsFound,
      sitemapFound,
      viewportFound,
      noindexFound,
      structuredDataCount,
      wordCount,
      phoneLinkCount,
      emailLinkCount,
      ctaTextCount,
    };

    const checks: CheckItem[] = [
      {
        label: "페이지 접근",
        passed: statusCode === 200,
        detail: statusCode === 200 ? "HTTP 200으로 접근됩니다." : `HTTP ${statusCode} 응답입니다.`,
        weight: 12,
        problem: `검사 URL이 HTTP ${statusCode}로 응답했습니다. 200이 아니면 검색엔진과 사용자가 안정적으로 페이지를 볼 수 없습니다.`,
        recommendation: "서버 오류, 리다이렉트 체인, 접근 제한, SSL 문제를 확인해 HTTP 200으로 응답하게 만드세요.",
        howToFix: ["브라우저와 curl로 해당 URL이 열리는지 확인", "서버/호스팅 로그에서 4xx 또는 5xx 원인 확인", "불필요한 리다이렉트나 인증 제한 제거"],
        examples: [`검사 URL: ${parsedUrl.toString()}`, `현재 상태 코드: ${statusCode}`],
      },
      {
        label: "색인 허용",
        passed: !noindexFound,
        detail: noindexFound
          ? "noindex가 감지되었습니다. 검색엔진이 이 페이지를 색인하지 않습니다."
          : "noindex가 감지되지 않았습니다.",
        weight: 12,
        problem: "meta robots에 noindex가 있으면 검색엔진 결과에 페이지가 노출되지 않을 수 있습니다.",
        recommendation: "검색 노출이 필요한 페이지라면 noindex를 제거하고 index,follow 또는 robots 메타 미설정 상태로 두세요.",
        howToFix: ["<meta name=\"robots\" content=\"noindex\"> 제거", "CMS/SEO 플러그인의 검색엔진 노출 허용 설정 확인", "robots.txt에서 해당 경로 차단 여부도 함께 확인"],
        examples: [robotsMeta ? `현재 robots meta: ${robotsMeta}` : "robots meta 없음"],
      },
      {
        label: "제목 태그",
        passed: titleText.length >= 10 && titleText.length <= 70,
        detail: titleText.length === 0 ? "title 태그가 없습니다." : `${titleText.length}자: ${titleText}`,
        weight: 10,
        problem: "title은 검색 결과 제목으로 쓰입니다. 없거나 너무 짧거나 길면 클릭률과 키워드 이해도가 떨어집니다.",
        recommendation: "핵심 키워드 + 지역/서비스명 + 브랜드를 포함해 10~70자 사이로 작성하세요.",
        howToFix: ["HTML <head> 안의 <title> 수정", "Next.js라면 metadata.title 또는 generateMetadata 수정", "중요 키워드를 앞쪽에 배치"],
        examples: [`현재 title: ${titleText || "없음"}`, `현재 길이: ${titleText.length}자`, "예: 서울 임플란트 치과 | 병원명"],
      },
      {
        label: "설명 메타",
        passed: descContent.length >= 50 && descContent.length <= 160,
        detail: descContent.length === 0 ? "meta description이 없습니다." : `${descContent.length}자`,
        weight: 10,
        problem: "meta description은 검색 결과 설명으로 사용될 수 있습니다. 없거나 길이가 부적절하면 클릭률이 낮아질 수 있습니다.",
        recommendation: "페이지 내용을 요약하고 CTA를 포함해 50~160자 사이로 작성하세요.",
        howToFix: ["<meta name=\"description\" content=\"...\"> 추가/수정", "Next.js라면 metadata.description 수정", "중복 설명 대신 페이지별 고유 문구 작성"],
        examples: [`현재 description: ${descContent || "없음"}`, `현재 길이: ${descContent.length}자`],
      },
      {
        label: "H1 구조",
        passed: h1Count === 1,
        detail: h1Count === 0 ? "H1 태그가 없습니다." : h1Count === 1 ? "1개" : `${h1Count}개 (1개 권장)`,
        weight: 8,
        problem: "H1은 페이지의 대표 제목입니다. 없거나 여러 개면 페이지 주제를 검색엔진이 이해하기 어려워질 수 있습니다.",
        recommendation: "페이지마다 핵심 주제를 담은 H1을 1개만 사용하고, 하위 제목은 H2/H3로 정리하세요.",
        howToFix: ["대표 제목 하나만 <h1>로 유지", "반복되는 로고/섹션 제목의 h1은 h2 또는 div로 변경", "페이지 핵심 키워드를 H1에 자연스럽게 포함"],
        examples: h1Texts.length ? h1Texts : ["현재 H1 없음"],
      },
      {
        label: "모바일 viewport",
        passed: viewportFound,
        detail: viewportFound ? "viewport가 있습니다." : "viewport 메타 태그가 없습니다.",
        weight: 8,
        problem: "viewport가 없으면 모바일에서 화면이 비정상적으로 축소되어 사용성과 모바일 SEO에 불리합니다.",
        recommendation: "head에 viewport 메타 태그를 추가하세요.",
        howToFix: ["<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> 추가", "Next.js App Router는 기본 viewport가 있으나 커스텀 head에서 누락되지 않았는지 확인"],
        examples: [viewportFound ? "viewport 감지됨" : "viewport 미감지"],
      },
      {
        label: "canonical",
        passed: canonicalHref.length > 0,
        detail: canonicalHref.length > 0 ? canonicalHref : "canonical이 없습니다.",
        weight: 8,
        problem: "canonical이 없으면 중복 URL이 있을 때 검색엔진이 대표 URL을 판단하기 어려울 수 있습니다.",
        recommendation: "현재 페이지의 대표 URL을 canonical로 지정하세요.",
        howToFix: ["<link rel=\"canonical\" href=\"대표 URL\"> 추가", "http/https, www/non-www, trailing slash 정책을 하나로 통일", "페이지별 canonical이 자기 자신의 대표 주소를 가리키는지 확인"],
        examples: [canonicalHref ? `현재 canonical: ${canonicalHref}` : `권장 예: ${parsedUrl.toString()}`],
      },
      {
        label: "robots.txt",
        passed: robotsFound,
        detail: robotsFound ? "robots.txt가 있습니다." : "robots.txt를 찾지 못했습니다.",
        weight: 7,
        problem: "robots.txt가 없으면 크롤러 정책과 sitemap 위치를 명확히 안내하기 어렵습니다.",
        recommendation: "도메인 루트에 robots.txt를 만들고 sitemap 주소를 포함하세요.",
        howToFix: ["/public/robots.txt 또는 호스팅 루트에 robots.txt 생성", "Sitemap: https://도메인/sitemap.xml 추가", "중요 페이지를 Disallow로 막고 있지 않은지 확인"],
        examples: [`검사 위치: ${origin}/robots.txt`, "예: User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml"],
      },
      {
        label: "sitemap.xml",
        passed: sitemapFound,
        detail: sitemapFound ? "sitemap.xml이 있습니다." : "sitemap.xml을 찾지 못했습니다.",
        weight: 7,
        problem: "sitemap.xml이 없으면 검색엔진이 중요한 페이지 목록을 빠르게 파악하기 어렵습니다.",
        recommendation: "도메인 루트에 sitemap.xml을 생성하고 robots.txt와 Search Console에 제출하세요.",
        howToFix: ["/sitemap.xml 생성", "주요 페이지 URL과 lastmod 포함", "Google Search Console에 사이트맵 제출"],
        examples: [`검사 위치: ${origin}/sitemap.xml`],
      },
      {
        label: "Open Graph",
        passed: !!(ogTitle && ogDesc && ogImage),
        detail: `title ${ogTitle ? "있음" : "없음"} / description ${ogDesc ? "있음" : "없음"} / image ${ogImage ? "있음" : "없음"}`,
        weight: 6,
        problem: "Open Graph 정보가 부족하면 카카오톡, 페이스북 등 공유 시 제목/설명/이미지가 제대로 표시되지 않습니다.",
        recommendation: "og:title, og:description, og:image를 모두 설정하세요.",
        howToFix: ["<meta property=\"og:title\" content=\"...\"> 추가", "<meta property=\"og:description\" content=\"...\"> 추가", "1200x630 권장 비율의 og:image 추가"],
        examples: [`og:title: ${ogTitle || "없음"}`, `og:description: ${ogDesc || "없음"}`, `og:image: ${ogImage || "없음"}`],
      },
      {
        label: "구조화 데이터",
        passed: structuredDataCount > 0,
        detail: structuredDataCount > 0 ? `${structuredDataCount}개의 JSON-LD가 있습니다.` : "구조화 데이터가 없습니다.",
        weight: 5,
        problem: "구조화 데이터가 없으면 검색엔진이 업체, 리뷰, FAQ, 의료/지역 비즈니스 정보를 풍부하게 이해하기 어렵습니다.",
        recommendation: "LocalBusiness, Organization, FAQPage 등 페이지 성격에 맞는 JSON-LD를 추가하세요.",
        howToFix: ["<script type=\"application/ld+json\">로 JSON-LD 추가", "업체명, 주소, 전화번호, 영업시간 등 실제 정보 입력", "Google Rich Results Test로 오류 확인"],
        examples: [`현재 JSON-LD 개수: ${structuredDataCount}`],
      },
      {
        label: "이미지 ALT",
        passed: imageCount === 0 || imagesMissingAlt === 0,
        detail: imageCount === 0 ? "이미지가 없습니다." : `이미지 ${imageCount}개 중 ALT 누락 ${imagesMissingAlt}개`,
        weight: 4,
        problem: "alt가 없는 이미지는 검색엔진과 스크린리더가 이미지 내용을 이해하기 어렵습니다.",
        recommendation: "의미 있는 이미지에는 내용을 설명하는 alt를 넣고, 장식 이미지는 alt=\"\"로 명시하세요.",
        howToFix: ["누락된 <img>에 alt 속성 추가", "키워드 나열이 아니라 이미지 내용을 자연어로 설명", "장식 목적 이미지는 alt=\"\"로 처리"],
        examples: missingAltExamples.length ? missingAltExamples : ["ALT 누락 이미지 없음"],
      },
      {
        label: "본문 콘텐츠",
        passed: wordCount >= 300,
        detail: `${wordCount}단어`,
        weight: 5,
        problem: "본문 텍스트가 너무 적으면 검색엔진이 페이지 주제와 전문성을 판단하기 어렵습니다.",
        recommendation: "서비스 설명, 장점, 절차, FAQ 등 사용자에게 필요한 정보를 충분히 추가하세요.",
        howToFix: ["핵심 서비스 설명을 300단어 이상으로 보강", "H2/H3로 주제별 섹션 구성", "실제 고객 질문을 FAQ로 추가"],
        examples: [`현재 단어 수: ${wordCount}`, "권장: 최소 300단어 이상"],
      },
      {
        label: "문의 경로",
        passed: phoneLinkCount > 0 || emailLinkCount > 0 || ctaTextCount > 0,
        detail: `전화 ${phoneLinkCount} / 이메일 ${emailLinkCount} / CTA 텍스트 ${ctaTextCount}`,
        weight: 5,
        problem: "문의 버튼이나 전화/이메일 링크가 부족하면 사용자가 다음 행동을 하기 어렵습니다.",
        recommendation: "상단, 본문, 하단에 명확한 상담/문의 CTA를 배치하세요.",
        howToFix: ["tel: 링크로 전화 버튼 추가", "mailto: 링크 또는 문의 폼 추가", "상담 신청, 예약하기, 견적 문의 같은 CTA 버튼 추가"],
        examples: [`tel 링크: ${phoneLinkCount}`, `mailto 링크: ${emailLinkCount}`, `CTA 텍스트: ${ctaTextCount}`],
      },
    ];

    const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
    const passedWeight = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
    const score = Math.round((passedWeight / totalWeight) * 100);
    const grade = calcGrade(score);
    const topIssues = checks.filter((c) => !c.passed).map((c) => c.label);

    const result: SeoResult = {
      url: parsedUrl.toString(),
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - start,
      score,
      grade,
      title: titleText,
      description: descContent,
      metrics,
      checks,
      topIssues,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
