#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = 'http://localhost:5000';
const UPLOAD_ENDPOINT = '/upload-image';

// Color codes for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

/**
 * Extract SAP IDs from filename
 * Supports formats like: sapid1.png, sapid1-sapid2-sapid3.png
 * @param {string} filename - The image filename
 * @returns {string[]} Array of SAP IDs
 */
function extractSapIds(filename) {
    // Remove file extension
    const nameWithoutExt = path.parse(filename).name;

    // Split by dash and filter out non-numeric values
    const sapIds = nameWithoutExt.split('-')
        .map(part => part.trim())
        .filter(part => /^\d+$/.test(part)); // Only numeric values

    return sapIds;
}

/**
 * Upload image for a specific SAP ID
 * @param {string} imagePath - Path to the image file
 * @param {string} sapId - SAP ID to upload for
 * @returns {Promise<Object>} Upload result
 */
async function uploadImageForSap(imagePath, sapId) {
    try {
        const form = new FormData();
        const imageBuffer = fs.readFileSync(imagePath);
        const filename = path.basename(imagePath);

        form.append('image', imageBuffer, {
            filename: filename,
            contentType: getContentType(filename)
        });

        const response = await fetch(`${SERVER_URL}${UPLOAD_ENDPOINT}/${sapId}`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        const result = await response.json();

        if (response.ok) {
            return { success: true, data: result, sapId };
        } else {
            return { success: false, error: result.error || 'Unknown error', sapId };
        }
    } catch (error) {
        return { success: false, error: error.message, sapId };
    }
}

/**
 * Get content type based on file extension
 * @param {string} filename - The filename
 * @returns {string} Content type
 */
function getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff'
    };
    return contentTypes[ext] || 'image/jpeg';
}

/**
 * Check if file is a supported image format
 * @param {string} filename - The filename
 * @returns {boolean} True if supported image format
 */
function isSupportedImageFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'].includes(ext);
}

/**
 * Process all images in a folder
 * @param {string} folderPath - Path to the folder containing images
 * @param {Object} options - Processing options
 */
async function processImageFolder(folderPath, options = {}) {
    const {
        concurrent = 3,
        verbose = true,
        skipErrors = true
    } = options;

    console.log(`${colors.bold}${colors.blue}Starting batch upload process...${colors.reset}`);
    console.log(`${colors.blue}Folder: ${folderPath}${colors.reset}`);
    console.log(`${colors.blue}Server: ${SERVER_URL}${colors.reset}`);
    console.log(`${colors.blue}Concurrent uploads: ${concurrent}${colors.reset}\n`);

    try {
        // Check if folder exists
        if (!fs.existsSync(folderPath)) {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }

        // Get all files in the folder
        const files = fs.readdirSync(folderPath)
            .filter(file => {
                const filePath = path.join(folderPath, file);
                return fs.statSync(filePath).isFile() && isSupportedImageFormat(file);
            });

        if (files.length === 0) {
            console.log(`${colors.yellow}No supported image files found in ${folderPath}${colors.reset}`);
            return;
        }

        console.log(`${colors.green}Found ${files.length} image files${colors.reset}\n`);

        // Process each file
        const results = {
            total: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        for (const file of files) {
            const imagePath = path.join(folderPath, file);
            const sapIds = extractSapIds(file);

            if (sapIds.length === 0) {
                console.log(`${colors.yellow}⚠ Skipping ${file} - no SAP IDs found in filename${colors.reset}`);
                results.skipped++;
                continue;
            }

            if (verbose) {
                console.log(`${colors.bold}Processing: ${file}${colors.reset}`);
                console.log(`  SAP IDs found: ${sapIds.join(', ')}`);
            }

            // Upload for each SAP ID found in the filename
            const uploadPromises = sapIds.map(sapId => uploadImageForSap(imagePath, sapId));

            // Process uploads in batches based on concurrent setting
            for (let i = 0; i < uploadPromises.length; i += concurrent) {
                const batch = uploadPromises.slice(i, i + concurrent);
                const batchResults = await Promise.all(batch);

                for (const result of batchResults) {
                    results.total++;

                    if (result.success) {
                        results.successful++;
                        if (verbose) {
                            console.log(`  ${colors.green}✓ SAP ${result.sapId}: Upload successful (Image ID: ${result.data.imageId})${colors.reset}`);
                        }
                    } else {
                        results.failed++;
                        results.errors.push({
                            file: file,
                            sapId: result.sapId,
                            error: result.error
                        });

                        if (verbose) {
                            console.log(`  ${colors.red}✗ SAP ${result.sapId}: ${result.error}${colors.reset}`);
                        }

                        if (!skipErrors) {
                            console.log(`${colors.red}Stopping due to error (use --skip-errors to continue)${colors.reset}`);
                            process.exit(1);
                        }
                    }
                }
            }

            if (verbose) {
                console.log(''); // Empty line between files
            }
        }

        // Print summary
        console.log(`${colors.bold}${colors.blue}=== Upload Summary ===${colors.reset}`);
        console.log(`${colors.green}Total uploads attempted: ${results.total}${colors.reset}`);
        console.log(`${colors.green}Successful: ${results.successful}${colors.reset}`);
        console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
        console.log(`${colors.yellow}Skipped files: ${results.skipped}${colors.reset}`);

        if (results.errors.length > 0) {
            console.log(`\n${colors.bold}${colors.red}Errors encountered:${colors.reset}`);
            results.errors.forEach(error => {
                console.log(`  ${colors.red}${error.file} (SAP ${error.sapId}): ${error.error}${colors.reset}`);
            });
        }

    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
${colors.bold}Batch Image Upload Tool${colors.reset}

Usage: node batch-upload.js [folder_path] [options]

Arguments:
  folder_path    Path to folder containing images (default: ./images)

Options:
  --concurrent, -c <num>    Number of concurrent uploads (default: 3)
  --verbose, -v             Enable verbose output (default: true)
  --quiet, -q               Disable verbose output
  --skip-errors             Continue processing even if some uploads fail
  --server <url>            Server URL (default: http://localhost:5000)
  --help, -h                Show this help message

Image Naming Convention:
  Images should be named with SAP IDs:
  - Single SAP: 123456.png
  - Multiple SAPs: 123456-789012-345678.png

Examples:
  node batch-upload.js ./images
  node batch-upload.js /path/to/images --concurrent 5 --quiet
  node batch-upload.js ./products --server http://192.168.1.100:5000
        `);
        process.exit(0);
    }

    // Parse arguments
    const folderPath = args[0] || './images';
    const options = {
        concurrent: 3,
        verbose: true,
        skipErrors: false
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--concurrent':
            case '-c':
                options.concurrent = parseInt(args[++i]) || 3;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--quiet':
            case '-q':
                options.verbose = false;
                break;
            case '--skip-errors':
                options.skipErrors = true;
                break;
            case '--server':
                // Override SERVER_URL if provided
                break;
        }
    }

    await processImageFolder(folderPath, options);
}

// Run the script if called directly
if (process.argv[1] === __filename) {
    main().catch(error => {
        console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
        process.exit(1);
    });
}

export { processImageFolder, extractSapIds, uploadImageForSap };