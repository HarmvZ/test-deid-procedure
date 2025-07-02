import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status} ${res.statusText})`);
    return await res.json();
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status} ${res.statusText})`);
    return await res.text();
}

async function loadDeidentificationProtocol() {
    const url = "https://raw.githubusercontent.com/DIAGNijmegen/rse-grand-challenge-dicom-de-id-procedure/refs/heads/main/dist/procedure.json";
    return await fetchJson(url);
}

async function loadRemotePreprocessors(tempPath) {
    const url = "https://raw.githubusercontent.com/comic/grand-challenge.org/9833a8c5017e074a30ff68c5cc717e87a2a68fa1/app/grandchallenge/uploads/static/js/file_preprocessors.js";
    const js = await fetchText(url);
    await fs.writeFile(tempPath, js);
    await import(tempPath + "?update=" + Date.now());
}

function stringifyArgs(args) {
    return args.map(arg =>
        typeof arg === "object" && arg !== null
            ? JSON.stringify(arg, null, 2)
            : String(arg)
    ).join(" ");
}

function interceptConsoleLogs() {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    let capturedLogs = [];
    console.log = (...args) => capturedLogs.push(stringifyArgs(args));
    console.warn = (...args) => capturedLogs.push(stringifyArgs(args));
    console.error = (...args) => capturedLogs.push(stringifyArgs(args));
    return {
        getLogs: () => capturedLogs,
        restore: () => {
            console.log = original.log;
            console.warn = original.warn;
            console.error = original.error;
        }
    };
}

async function ensureDirExists(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir);
    }
}

async function processFileWithPreprocessors(file, filename, outputDir) {
    let processed = false;
    let errorMsg = "";
    let logs = [];
    for (const preprocessorObj of globalThis.UPPY_FILE_PREPROCESSORS) {
        if (preprocessorObj.fileMatcher(file)) {
            const logInterceptor = interceptConsoleLogs();
            try {
                const processedFile = await preprocessorObj.preprocessor(file);
                const outPath = path.join(outputDir, filename);
                const arrayBuffer = await processedFile.arrayBuffer();
                await fs.writeFile(outPath, Buffer.from(arrayBuffer));
                processed = true;
                logs = logInterceptor.getLogs();
                process.stdout.write(`✔ ${filename}\n`);
            } catch (err) {
                errorMsg = err && err.message ? err.message : String(err);
                logs = logInterceptor.getLogs();
                process.stdout.write(`✖ ${filename} (error: ${errorMsg})\n`);
            } finally {
                logInterceptor.restore();
            }
            break;
        }
    }
    return { processed, errorMsg, logs };
}

async function processInputFiles() {
    const inputDir = path.join(__dirname, "input");
    const outputDir = path.join(__dirname, "output");
    const logPath = path.join(outputDir, "preprocessor_logs.txt");
    await ensureDirExists(outputDir);

    let processedCount = 0, skippedCount = 0, errorCount = 0, totalCount = 0;
    let logFileLines = [];
    const files = await fs.readdir(inputDir);

    for (const filename of files) {
        totalCount++;
        const filePath = path.join(inputDir, filename);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        const fileBuffer = await fs.readFile(filePath);
        const file = new File([fileBuffer], filename, { type: "" });

        const { processed, errorMsg, logs } = await processFileWithPreprocessors(file, filename, outputDir);

        if (processed) {
            processedCount++;
            logFileLines.push(`[${filename}] LOGS:\n${logs.join("\n")}\n`);
        } else if (errorMsg) {
            errorCount++;
            logFileLines.push(`[${filename}] ERROR: ${errorMsg}\n${logs.join("\n")}\n`);
        } else {
            skippedCount++;
            process.stdout.write(`- ${filename} (skipped)\n`);
        }
    }
    await fs.writeFile(logPath, logFileLines.join("\n"));
    process.stdout.write(
        `\nSummary: total=${totalCount}, processed=${processedCount}, skipped=${skippedCount}, errors=${errorCount}\n`
    );
}

async function main() {
    globalThis.DEIDENTIFICATION_PROTOCOL = await loadDeidentificationProtocol();
    globalThis.dcmjs = (await import("dcmjs")).default;
    const tempPath = path.join(__dirname, "remote_file_preprocessors.js");
    await loadRemotePreprocessors(tempPath);
    await processInputFiles();
    try {
        await fs.unlink(tempPath);
    } catch {}
}

if (import.meta.url === process.argv[1] || import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error("Error processing files:", err);
    });
}
