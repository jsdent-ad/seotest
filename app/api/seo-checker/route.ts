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

    const h1Count = $("h1").length;
    const h2Count = $("h2").length;
    const images = $("img");
    const imageCount = images.length;
    const imagesMissingAlt = images.filter((_, el) => !$(el).attr("alt")).length;
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
      },
      {
        label: "색인 허용",
        passed: !noindexFound,
        detail: noindexFound
          ? "noindex가 감지되었습니다. 검색엔진이 이 페이지를 색인하지 않습니다."
          : "noindex가 감지되지 않았습니다.",
        weight: 12,
      },
      {
        label: "제목 태그",
        passed: titleText.length >= 10 && titleText.length <= 70,
        detail: titleText.length === 0 ? "title 태그가 없습니다." : `${titleText.length}자: ${titleText}`,
        weight: 10,
      },
      {
        label: "설명 메타",
        passed: descContent.length >= 50 && descContent.length <= 160,
        detail: descContent.length === 0 ? "meta description이 없습니다." : `${descContent.length}자`,
        weight: 10,
      },
      {
        label: "H1 구조",
        passed: h1Count === 1,
        detail: h1Count === 0 ? "H1 태그가 없습니다." : h1Count === 1 ? "1개" : `${h1Count}개 (1개 권장)`,
        weight: 8,
      },
      {
        label: "모바일 viewport",
        passed: viewportFound,
        detail: viewportFound ? "viewport가 있습니다." : "viewport 메타 태그가 없습니다.",
        weight: 8,
      },
      {
        label: "canonical",
        passed: canonicalHref.length > 0,
        detail: canonicalHref.length > 0 ? canonicalHref : "canonical이 없습니다.",
        weight: 8,
      },
      {
        label: "robots.txt",
        passed: robotsFound,
        detail: robotsFound ? "robots.txt가 있습니다." : "robots.txt를 찾지 못했습니다.",
        weight: 7,
      },
      {
        label: "sitemap.xml",
        passed: sitemapFound,
        detail: sitemapFound ? "sitemap.xml이 있습니다." : "sitemap.xml을 찾지 못했습니다.",
        weight: 7,
      },
      {
        label: "Open Graph",
        passed: !!(ogTitle && ogDesc && ogImage),
        detail: `title ${ogTitle ? "있음" : "없음"} / description ${ogDesc ? "있음" : "없음"} / image ${ogImage ? "있음" : "없음"}`,
        weight: 6,
      },
      {
        label: "구조화 데이터",
        passed: structuredDataCount > 0,
        detail: structuredDataCount > 0 ? `${structuredDataCount}개의 JSON-LD가 있습니다.` : "구조화 데이터가 없습니다.",
        weight: 5,
      },
      {
        label: "이미지 ALT",
        passed: imageCount === 0 || imagesMissingAlt === 0,
        detail: imageCount === 0 ? "이미지가 없습니다." : `이미지 ${imageCount}개 중 ALT 누락 ${imagesMissingAlt}개`,
        weight: 4,
      },
      {
        label: "본문 콘텐츠",
        passed: wordCount >= 300,
        detail: `${wordCount}단어`,
        weight: 5,
      },
      {
        label: "문의 경로",
        passed: phoneLinkCount > 0 || emailLinkCount > 0 || ctaTextCount > 0,
        detail: `전화 ${phoneLinkCount} / 이메일 ${emailLinkCount} / CTA 텍스트 ${ctaTextCount}`,
        weight: 5,
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
