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
    try {
        await fs.access(outputDir);
    } catch {
        await fs.mkdir(outputDir);
    }
    const files = await fs.readdir(inputDir);
    for (const filename of files) {
        const filePath = path.join(inputDir, filename);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;
        // Simulate browser File object
        const fileBuffer = await fs.readFile(filePath);
        const file = new File([fileBuffer], filename, { type: "" });
        let processed = false;
        for (const preprocessorObj of globalThis.UPPY_FILE_PREPROCESSORS) {
            if (preprocessorObj.fileMatcher(file)) {
                console.log(`Processing file: ${filename} with preprocessor...`);
                try {
                    const processedFile = await preprocessorObj.preprocessor(file);
                    const outPath = path.join(outputDir, filename);
                    const arrayBuffer = await processedFile.arrayBuffer();
                    await fs.writeFile(outPath, Buffer.from(arrayBuffer));
                    console.log(`Saved processed file to: ${outPath}`);
                    processed = true;
                } catch (err) {
                    console.log(`Error processing file ${filename} with preprocessor:`, err);
                }
                break;
            }
        }
        if (!processed) {
            console.log(`No matching preprocessor for file: ${filename}, skipping.`);
        }
    }
}

// Main entry point
if (import.meta.url === process.argv[1] || import.meta.url === `file://${process.argv[1]}`) {
    (async () => {
        globalThis.DEIDENTIFICATION_PROTOCOL = await loadDeidentificationProtocol();
        globalThis.dcmjs = (await import("dcmjs")).default;
        await loadRemotePreprocessors();
        await processInputFiles();
        console.log("All files processed.");
        // Clean up: remove the temporary remote preprocessors file
        const tempPath = path.join(__dirname, "remote_file_preprocessors.js");
        try {
            await fs.unlink(tempPath);
            console.log("Removed temporary remote preprocessors file.");
        } catch {}
    })().catch(err => {
        console.error("Error processing files:", err);
    });
}
