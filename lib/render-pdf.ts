/**
 * HTML → PDF renderer (headless Chromium) for the employment contract.
 *
 * Renders the exact HTML the user edited in the "Preview & Edit" step so that free-typed
 * edits persist into the signed PDF, and header/footer/margins/alignment come from CSS.
 *
 * Chromium binary resolution:
 *   • LOCAL / CI (this container): a full Chromium ships at $PLAYWRIGHT_BROWSERS_PATH
 *     (symlink .../chromium). Set LOCAL_CHROMIUM_PATH to override explicitly.
 *   • Vercel serverless: puppeteer-core + @sparticuz/chromium.
 *
 * Signature anchors: after layout, every embedded marker (.sig-anchor[data-role]) is
 * measured with getBoundingClientRect and mapped to Zoho Sign page-index + point coords.
 * There are three: one `company` (CEO block) and two `employee` (the mid-doc "Verified and
 * Accepted" block and the final "UNDERSTOOD & ACCEPTED" block). Both employee anchors belong
 * to the SAME recipient and are returned in document order,
 * using the shared LAYOUT geometry. The renderer's viewport width is set to the printed
 * content-box width so the measured on-screen layout matches the paginated print layout.
 */
import fs from 'fs';
import { LAYOUT, PT_PER_PX, contentWidthPx, headerTemplateHtml, footerTemplateHtml } from './contract-layout';

export interface RenderedAnchor {
  role: 'company' | 'employee';
  page: number; // 0-based page index
  xFromLeft: number; // PDF points from the left edge of the page
  yFromTop: number; // PDF points from the top edge of the page
}

export interface RenderResult {
  pdf: Buffer;
  anchors: RenderedAnchor[];
}

/** Resolve a local Chromium binary if one is available (container / CI), else undefined. */
function localChromiumPath(): string | undefined {
  const candidates = [
    process.env.LOCAL_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return undefined;
}

/** True when running on Vercel / AWS Lambda. On these serverless platforms we MUST use the
 *  @sparticuz/chromium bundle and never a local/custom executablePath — a stray CHROME_PATH
 *  or PLAYWRIGHT_BROWSERS_PATH in the environment must not hijack the launch. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

async function launchBrowser() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const puppeteer = require('puppeteer-core');

  // LOCAL / CI ONLY: use a full local Chromium when one is available. Gated behind
  // !isServerless() so this branch can never fire on Vercel — where it previously risked
  // launching with a custom/undefined executablePath (the cause of the /tmp/chromium +
  // missing-libnss3.so failure) instead of the @sparticuz bundle.
  if (!isServerless()) {
    const local = localChromiumPath();
    if (local) {
      return puppeteer.launch({
        executablePath: local,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
      });
    }
  }

  // SERVERLESS (Vercel / Lambda): `await chromium.executablePath()` extracts the bundled
  // Chromium into /tmp. But @sparticuz/chromium only extracts its brotli-packed SHARED
  // LIBRARIES and sets LD_LIBRARY_PATH when it detects an AWS Lambda runtime. Vercel runs on
  // Lambda but sets NEITHER AWS_EXECUTION_ENV nor AWS_LAMBDA_JS_RUNTIME, so with no marker the
  // NSS libs are never unpacked and LD_LIBRARY_PATH is never set — the original deploy failure:
  // "/tmp/chromium: error while loading shared libraries: libnss3.so".
  //
  // Crucially, @sparticuz v131 ships TWO different NSS bundles gated on DIFFERENT detections
  // (see build/index.js + build/helper.js in node_modules):
  //   • isRunningInAwsLambda()      → extracts al2.tar.br    → /tmp/al2/lib,    LD → /tmp/al2/lib
  //   • isRunningInAwsLambdaNode20()→ extracts al2023.tar.br → /tmp/al2023/lib, LD → /tmp/al2023/lib
  // al2.tar.br is a STRICT SUBSET: it has libnss3/libnssutil3/libsoftokn3 but is MISSING
  // libnspr4/libplc4/libplds4/libfreebl3. Only al2023.tar.br carries the FULL NSS set.
  //
  // The detectors switch purely on the runtime-marker STRING, not on process.version:
  //   • isRunningInAwsLambdaNode20() → true ONLY when the marker contains the literal "20.x"
  //     or "22.x" substring.
  //   • isRunningInAwsLambda()       → true when the marker contains "nodejs" but NEITHER
  //     "20.x" NOR "22.x".
  //
  // Vercel runs Node 24. The prior fix set the marker to the ACTUAL Node major → "nodejs24.x".
  // "24.x" matches neither detector's 20.x/22.x substring, so isRunningInAwsLambda() won → the
  // al2 (subset) bundle extracted → libnss3 resolved but its dependency libnspr4 did NOT →
  // "libnspr4.so: cannot open shared object file" on every Vercel deploy.
  //
  // Fix: FORCE the runtime marker to "nodejs20.x" (a value the Node20 detector recognizes) so
  // the FULL al2023 bundle is the one that extracts and LD_LIBRARY_PATH points at /tmp/al2023/lib
  // — regardless of the actual Node version Vercel declares. Vercel/AWS today run on Amazon
  // Linux 2023, so the al2023 NSS set is the correct one. Plain `=` (NOT `??=`) is deliberate: we
  // must OVERRIDE whatever Vercel or the prior code left in these vars (e.g. "nodejs24.x") to
  // force the al2023 branch. This is inside the already-Vercel-gated serverless path, so it never
  // affects local dev or a genuine AWS Lambda. Module-load setup AND executablePath() extraction
  // are both gated on this detection, so it MUST run before the require below.
  process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';
  process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chromium = require('@sparticuz/chromium');
  return puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

/** Wrap an edited-HTML fragment (which already carries its own <style>) into a document. */
function wrapDocument(fragment: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/></head><body>${fragment}</body></html>`;
}

export async function renderContractPdf(editedHtml: string): Promise<RenderResult> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: contentWidthPx(), height: 1400, deviceScaleFactor: 1 });
    await page.setContent(wrapDocument(editedHtml), { waitUntil: 'networkidle0' });
    // Measure against PRINT styles (inline header/footer removed from flow, matching the PDF).
    await page.emulateMediaType('print');
    await page.evaluate(async () => { try { await (document as any).fonts.ready; } catch { /* ignore */ } });

    // Content-area height per printed page, in device px.
    const contentHeightPx = (LAYOUT.pageHpt - LAYOUT.marginTopPt - LAYOUT.marginBottomPt) / PT_PER_PX;

    // Measure anchor markers AND all forced-break sections in the (unpaginated) print layout.
    const measured: {
      sections: number[];
      anchors: Array<{ role: string; markerTop: number; markerLeft: number; sectionTop: number | null }>;
    } = await page.evaluate(() => {
      const yOf = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
      const sections = (Array.from(document.querySelectorAll('.sec-break')) as HTMLElement[])
        .map(yOf).sort((a, b) => a - b);
      const anchors = (Array.from(document.querySelectorAll('.sig-anchor[data-role]')) as HTMLElement[]).map(m => {
        const r = m.getBoundingClientRect();
        let sectionTop: number | null = null;
        let el: HTMLElement | null = m;
        while (el) {
          if (el.classList && el.classList.contains('sec-break')) { sectionTop = yOf(el); break; }
          el = el.parentElement;
        }
        return { role: m.getAttribute('data-role') || '', markerTop: r.top + window.scrollY, markerLeft: r.left + window.scrollX, sectionTop };
      });
      return { sections, anchors };
    });

    // Print page index of each forced-break section. Each .sec-break starts a fresh page, so
    // walking them in order and adding the pages consumed by the content between successive
    // breaks yields the true 0-based page index — robust to free-typed edits changing where
    // the earlier body paginates. (Approximation limited to auto-break slack in the flowing
    // body before the FIRST break; the live Zoho test verifies final placement.)
    const H = contentHeightPx;
    const sectionPage = new Map<number, number>();
    const secs = measured.sections;
    for (let i = 0; i < secs.length; i++) {
      if (i === 0) {
        sectionPage.set(secs[i], Math.max(0, Math.ceil(secs[i] / H)));
      } else {
        const gap = secs[i] - secs[i - 1];
        const prevPage = sectionPage.get(secs[i - 1]) as number;
        sectionPage.set(secs[i], prevPage + Math.max(1, Math.ceil(gap / H)));
      }
    }

    const pdfUint8 = await page.pdf({
      printBackground: true,
      format: 'A4',
      displayHeaderFooter: true,
      headerTemplate: headerTemplateHtml(),
      footerTemplate: footerTemplateHtml(),
      margin: {
        // Puppeteer's margin parser accepts px/in/cm/mm — not pt — so convert.
        top: `${LAYOUT.marginTopPt / PT_PER_PX}px`,
        bottom: `${LAYOUT.marginBottomPt / PT_PER_PX}px`,
        left: `${LAYOUT.marginLeftPt / PT_PER_PX}px`,
        right: `${LAYOUT.marginRightPt / PT_PER_PX}px`,
      },
    });
    const pdf = Buffer.from(pdfUint8);

    const anchors: RenderedAnchor[] = measured.anchors
      .filter(a => a.role === 'company' || a.role === 'employee')
      .map(a => {
        let pageIndex: number;
        let yWithinContentPx: number;
        if (a.sectionTop != null && sectionPage.has(a.sectionTop)) {
          pageIndex = sectionPage.get(a.sectionTop) as number;
          yWithinContentPx = a.markerTop - a.sectionTop;
        } else {
          pageIndex = Math.max(0, Math.floor(a.markerTop / H));
          yWithinContentPx = a.markerTop - pageIndex * H;
        }
        const yFromTop = LAYOUT.marginTopPt + yWithinContentPx * PT_PER_PX;
        const xFromLeft = LAYOUT.marginLeftPt + a.markerLeft * PT_PER_PX;
        return { role: a.role as 'company' | 'employee', page: pageIndex, xFromLeft, yFromTop };
      });

    return { pdf, anchors };
  } finally {
    await browser.close();
  }
}
