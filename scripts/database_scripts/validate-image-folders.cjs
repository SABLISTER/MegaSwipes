#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SITES_DIR = path.join(__dirname, '../sites');
const IMAGES_DIR = path.join(__dirname, '../data/images');
const LOG_FILE = path.join(__dirname, '../folder-validation.log');

function extractIdsFromFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ids = new Set();
    
    if (filePath.endsWith('.txt')) {
        // Text files have one ID per line
        content.split(/\r?\n/).forEach(line => {
            const id = line.trim();
            if (id && !id.startsWith('#')) {
                ids.add(id);
            }
        });
    } else if (filePath.endsWith('.tsv')) {
        // TSV files have ID in first column
        content.split(/\r?\n/).forEach(line => {
            const id = line.split('\t')[0].trim();
            if (id && !id.startsWith('#')) {
                ids.add(id);
            }
        });
    }
    
    return ids;
}

function getAllExpectedIds() {
    const allIds = new Set();
    const files = fs.readdirSync(SITES_DIR);
    
    files.forEach(file => {
        if (file.endsWith('.tsv') || file.endsWith('.txt')) {
            const filePath = path.join(SITES_DIR, file);
            const ids = extractIdsFromFile(filePath);
            ids.forEach(id => allIds.add(id));
        }
    });
    
    return allIds;
}

function getAllExistingFolders() {
    const folders = new Set();
    
    function scanDirectory(dir) {
        if (!fs.existsSync(dir)) return;
        
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            if (fs.statSync(itemPath).isDirectory()) {
                if (item.startsWith('sub-')) {
                    const id = item.replace('sub-', '');
                    folders.add(id);
                } else {
                    scanDirectory(itemPath);
                }
            }
        });
    }
    
    scanDirectory(IMAGES_DIR);
    return folders;
}

function main() {
    const expectedIds = getAllExpectedIds();
    const existingFolders = getAllExistingFolders();
    
    const missingFolders = [...expectedIds].filter(id => !existingFolders.has(id));
    const extraFolders = [...existingFolders].filter(id => !expectedIds.has(id));
    
    const logEntries = [];
    logEntries.push(`Folder Validation Report - ${new Date().toISOString()}`);
    logEntries.push('='.repeat(60));
    logEntries.push(`Expected IDs: ${expectedIds.size}`);
    logEntries.push(`Existing folders: ${existingFolders.size}`);
    logEntries.push('');
    
    if (missingFolders.length > 0) {
        logEntries.push(`MISSING FOLDERS (${missingFolders.length}):`);
        missingFolders.sort().forEach(id => {
            logEntries.push(`  - sub-${id}`);
        });
        logEntries.push('');
    }
    
    if (extraFolders.length > 0) {
        logEntries.push(`EXTRA FOLDERS (${extraFolders.length}):`);
        extraFolders.sort().forEach(id => {
            logEntries.push(`  - sub-${id}`);
        });
        logEntries.push('');
    }
    
    if (missingFolders.length === 0 && extraFolders.length === 0) {
        logEntries.push('✅ All folders match expected IDs from TSV/TXT files');
    } else {
        logEntries.push(`❌ Found ${missingFolders.length} missing and ${extraFolders.length} extra folders`);
    }
    
    const logContent = logEntries.join('\n');
    fs.writeFileSync(LOG_FILE, logContent);
    
    console.log(logContent);
    console.log(`\nLog written to: ${LOG_FILE}`);
}

if (require.main === module) {
    main();
}