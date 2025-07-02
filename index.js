import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadDeidentificationProtocol() {
    const url = "https://raw.githubusercontent.com/DIAGNijmegen/rse-grand-challenge-dicom-de-id-procedure/refs/heads/main/dist/procedure.json";
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch protocol: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

async function loadRemotePreprocessors() {
    const url = "https://raw.githubusercontent.com/comic/grand-challenge.org/9833a8c5017e074a30ff68c5cc717e87a2a68fa1/app/grandchallenge/uploads/static/js/file_preprocessors.js";
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch preprocessors: ${res.status} ${res.statusText}`);
    }
    const js = await res.text();
    const tempPath = path.join(__dirname, "remote_file_preprocessors.js");
    await fs.writeFile(tempPath, js);
    await import(tempPath + "?update=" + Date.now()); // cache-busting for ESM
    return tempPath;
}

async function processInputFiles() {
    const inputDir = path.join(__dirname, "input");
    const outputDir = path.join(__dirname, "output");
    const logPath = path.join(outputDir, "preprocessor_logs.txt");
    try {
        await fs.access(outputDir);
    } catch {
        await fs.mkdir(outputDir);
    }
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let totalCount = 0;
    let logFileLines = [];
    const files = await fs.readdir(inputDir);
    for (const filename of files) {
        totalCount++;
        const filePath = path.join(inputDir, filename);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        const fileBuffer = await fs.readFile(filePath);
        const file = new File([fileBuffer], filename, { type: "" });
        let processed = false;
        let errorMsg = "";
        for (const preprocessorObj of globalThis.UPPY_FILE_PREPROCESSORS) {
            if (preprocessorObj.fileMatcher(file)) {
                // Capture logs during preprocessing
                const originalConsoleLog = console.log;
                const originalConsoleWarn = console.warn;
                const originalConsoleError = console.error;
                let capturedLogs = [];
                function stringifyArgs(args) {
                    return args.map(arg =>
                        typeof arg === "object" && arg !== null
                            ? JSON.stringify(arg, null, 2)
                            : String(arg)
                    ).join(" ");
                }
                console.log = (...args) => capturedLogs.push(stringifyArgs(args));
                console.warn = (...args) => capturedLogs.push(stringifyArgs(args));
                console.error = (...args) => capturedLogs.push(stringifyArgs(args));
                try {
                    const processedFile = await preprocessorObj.preprocessor(file);
                    const outPath = path.join(outputDir, filename);
                    const arrayBuffer = await processedFile.arrayBuffer();
                    await fs.writeFile(outPath, Buffer.from(arrayBuffer));
                    processed = true;
                    processedCount++;
                    logFileLines.push(`[${filename}] LOGS:\n${capturedLogs.join("\n")}\n`);
                    process.stdout.write(`✔ ${filename}\n`);
                } catch (err) {
                    errorCount++;
                    errorMsg = err && err.message ? err.message : String(err);
                    logFileLines.push(`[${filename}] ERROR: ${errorMsg}\n${capturedLogs.join("\n")}\n`);
                    process.stdout.write(`✖ ${filename} (error: ${errorMsg})\n`);
                } finally {
                    console.log = originalConsoleLog;
                    console.warn = originalConsoleWarn;
                    console.error = originalConsoleError;
                }
                break;
            }
        }
        if (!processed && !errorMsg) {
            skippedCount++;
            process.stdout.write(`- ${filename} (skipped)\n`);
        }
    }
    await fs.writeFile(logPath, logFileLines.join("\n"));
    // Summary
    process.stdout.write(
        `\nSummary: total=${totalCount}, processed=${processedCount}, skipped=${skippedCount}, errors=${errorCount}\n`
    );
}

// Main entry point
if (import.meta.url === process.argv[1] || import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        globalThis.DEIDENTIFICATION_PROTOCOL = await loadDeidentificationProtocol();
        globalThis.dcmjs = (await import("dcmjs")).default;
        await loadRemotePreprocessors();
        await processInputFiles();
        // Clean up: remove the temporary remote preprocessors file
        const tempPath = path.join(__dirname, "remote_file_preprocessors.js");
        try {
            await fs.unlink(tempPath);
        } catch {}
    })().catch(err => {
        console.error("Error processing files:", err);
    });
}
