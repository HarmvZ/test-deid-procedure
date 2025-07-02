# DICOM De-identification Batch Processor

This tool batch-processes DICOM files in a directory tree, de-identifies them according to a configurable protocol, and saves the results (with logs) in a mirrored output directory structure.

## Features

- Recursively traverses the `input/` directory for DICOM files (including nested folders).
- Applies de-identification using the protocol from [DIAGNijmegen/rse-grand-challenge-dicom-de-id-procedure](https://github.com/DIAGNijmegen/rse-grand-challenge-dicom-de-id-procedure).
- Uses the latest file preprocessors from [comic/grand-challenge.org](https://github.com/comic/grand-challenge.org).
- Saves processed files to the `output/` directory, preserving the input folder structure.
- Logs all actions and errors to `output/preprocessor_logs.txt`.

## Requirements

- Node.js v18+ (for native `File` and ESM support)
- Internet connection (to fetch protocol and preprocessors)
- `dcmjs` and `node-fetch` installed as dependencies

## Installation

1. Clone this repository or copy the files to your project directory.
2. Navigate to the directory and install dependencies:

   ```sh
   npm i
   ```

## Usage

1. Place your DICOM files (and any nested folders) inside the `input/` directory.
2. Run the processor:

   ```sh
   node index.js
   ```

   - The script will:
     - Download the latest de-identification protocol and preprocessors.
     - Recursively process all files in `input/`.
     - Save de-identified files to `output/`, preserving the directory structure.
     - Write logs to `output/preprocessor_logs.txt`.

3. Check the `output/` directory for results and logs.

## Notes

- Only files matching the DICOM file extension (e.g., `.dcm`, `.dicom`) will be processed.
- Errors and processing logs for each file are written to `output/preprocessor_logs.txt`.
- The script downloads and temporarily saves the remote preprocessor JS file on each run; it is deleted after processing.

## Updating

- The de-identification protocol is always fetched fresh from their respective repositories, so you always use the latest version.
- The preprocessor is fetched from the grand challenge repository but it is pinned using the commit hash. Update that to get a new version.

## Troubleshooting

- If you encounter errors about missing modules, ensure you have run `npm install dcmjs node-fetch`.
- If you see permission errors, check that you have write access to the `output/` directory.

## License

See the respective upstream repositories for licensing of the protocol and preprocessors.
