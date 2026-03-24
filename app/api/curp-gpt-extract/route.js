import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { logAudit } from "../shared";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

function isPdf(contentType, url) {
    return (
        /pdf/i.test(contentType) ||
        /\.pdf(\?|#|$)/i.test(url)
    );
}

async function fetchFileBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    return { buf, contentType };
}

async function pdfBufferToImageBufferWithPuppeteer(pdfBuffer) {
    const tmpDir = os.tmpdir();
    const tmpPdfPath = path.join(tmpDir, "puppdf-" + crypto.randomBytes(8).toString("hex") + ".pdf");
    let browser = null;
    try {
        await fs.writeFile(tmpPdfPath, pdfBuffer);
        browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-gpu"]
        });
        const page = await browser.newPage();
        await page.goto("file://" + tmpPdfPath, { waitUntil: "networkidle2" });
        let buffer = null;
        let found = false;
        try {
            const pdfFrame = await page.$("embed,iframe");
            if (pdfFrame) {
                buffer = await pdfFrame.screenshot({ type: "png" });
                found = true;
            }
        } catch {}
        if (!found) {
            buffer = await page.screenshot({ type: "png", fullPage: true });
        }
        await page.close();
        await browser.close();
        await fs.unlink(tmpPdfPath).catch(() => {});
        return buffer;
    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        await fs.unlink(tmpPdfPath).catch(() => {});
        throw err;
    }
}

const extractPrompt = `
Return in JSON {"nombres":"", "apellidoPaterno":"", "apellidoMaterno":""}
`;

export async function POST(req) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
        }
        const { buf, contentType } = await fetchFileBuffer(imageUrl);

        let imgBuf, imgType;
        if (isPdf(contentType, imageUrl)) {
            imgBuf = await pdfBufferToImageBufferWithPuppeteer(buf);
            imgType = "png";
        } else {
            imgBuf = buf;
            imgType = /jpe?g/i.test(contentType) || /\.jpe?g$/i.test(imageUrl)
                ? "jpeg"
                : /png/i.test(contentType) || /\.png$/i.test(imageUrl)
                ? "png"
                : "jpeg";
        }

        const b64 = imgBuf.toString("base64");
        const dataUrl = `data:image/${imgType};base64,${b64}`;
        const response = await openai.chat.completions.create({
            model: "gpt-4.1",
            max_tokens: 1024,
            temperature: 0,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: extractPrompt },
                        { type: "image_url", image_url: { url: dataUrl } }
                    ]
                }
            ]
        });

        const content = response?.choices?.[0]?.message?.content ?? "";
        let extracted;
        try {
            const match = content.match(/\{[\s\S]*?\}/m);
            extracted = match ? JSON.parse(match[0]) : JSON.parse(content);
        } catch (e) {
            await logAudit(session.user, "GPT_EXTRACT_CURP", imageUrl, "OPENAI", "ERROR", { error: "No valid JSON in reply", raw: content });
            return NextResponse.json({ error: "No valid JSON in reply", raw: content }, { status: 500 });
        }
        if (!("nombres" in extracted) || !("apellidoPaterno" in extracted) || !("apellidoMaterno" in extracted)) {
            await logAudit(session.user, "GPT_EXTRACT_CURP", imageUrl, "OPENAI", "ERROR", { error: "Missing fields", raw: extracted });
            return NextResponse.json({ error: "Missing fields", raw: extracted }, { status: 500 });
        }

        await logAudit(session.user, "GPT_EXTRACT_CURP", imageUrl, "OPENAI", "SUCCESS", { extracted });

        return NextResponse.json({
            nombres: extracted.nombres ?? "",
            apellidoPaterno: extracted.apellidoPaterno ?? "",
            apellidoMaterno: extracted.apellidoMaterno ?? "",
            raw: content
        });
    } catch (err) {
        await logAudit(session?.user, "GPT_EXTRACT_CURP", null, "OPENAI", "ERROR", { error: String(err?.message || err) });
        return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
    }
}