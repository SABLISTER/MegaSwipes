#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define script categories and their files
const scripts = {
    'Database Maintenance': [
        { name: 'Backup Database', file: 'database_scripts/backup-database.js', description: 'Create a backup of the SQLite database' },
        { name: 'Fix Foreign Keys', file: 'database_scripts/fix-foreign-keys.js', description: 'Fix foreign key constraints in database' },
        { name: 'Migrate SSH Schema', file: 'database_scripts/migrate-ssh-schema.js', description: 'Update database schema for SSH support' },
        { name: 'Add Secure Tokens', file: 'database_scripts/add-secure-tokens.js', description: 'Generate secure tokens for samples' }
    ],
    'Import/Export': [
        { name: 'Import New Directories (Unassigned)', file: 'database_scripts/import-unassigned-directories.js', description: 'Import new directories from data/images to unassigned dataset (recursive)' },
        { name: 'Import QC Datasets', file: 'database_scripts/import-qc-datasets.js', description: 'Import datasets from QC folders' },
        { name: 'Import SSH Datasets', file: 'database_scripts/import-ssh-datasets.js', description: 'Import datasets via SSH' },
        { name: 'Import BC2 Dataset', file: 'database_scripts/import-bc2-dataset.js', description: 'Import BC2 specific dataset' },
        { name: 'Register BIDS Images', file: 'database_scripts/register-bids-images.js', description: 'Register existing BIDS images to a dataset' },
        { name: 'Pull Vote Stats', file: 'database_scripts/0_pull_vote_stats.js', description: 'Export vote statistics' },
        { name: 'Import Local Images', file: 'database_scripts/import-local-images.js', description: 'Scan and import images from data/images' }
    ],
    'User Management': [
        // Add deployment-specific user management scripts here
    ],
    'File Operations': [
        { name: 'Check Node Version', file: 'database_scripts/check-node-version.js', description: 'Verify Node.js environment' },
        { name: 'Validate Image Folders', file: 'database_scripts/validate-image-folders.cjs', description: 'Check for missing or invalid images' },
        { name: 'Sync T1w Images', file: 'database_scripts/sync-t1w-with-images.js', description: 'Sync T1w files with database' }
    ]
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function clearScreen() {
    console.clear();
}

function printHeader() {
    console.log('='.repeat(60));
    console.log('MegaSwipes Management Tool');
    console.log('='.repeat(60));
    console.log();
}

function showMainMenu() {
    clearScreen();
    printHeader();
    console.log('Select a category:');
    const categories = Object.keys(scripts);
    categories.forEach((cat, index) => {
        console.log(`${index + 1}. ${cat}`);
    });
    console.log('0. Exit');
    console.log();

    rl.question('Enter choice: ', (answer) => {
        const choice = parseInt(answer);
        if (choice === 0) {
            console.log('Goodbye!');
            rl.close();
            return;
        }

        if (choice > 0 && choice <= categories.length) {
            showCategoryMenu(categories[choice - 1]);
        } else {
            showMainMenu();
        }
    });
}

function showCategoryMenu(category) {
    clearScreen();
    printHeader();
    console.log(`Category: ${category}`);
    console.log('-'.repeat(60));

    const categoryScripts = scripts[category];
    categoryScripts.forEach((script, index) => {
        console.log(`${index + 1}. ${script.name}`);
        console.log(`   description: ${script.description}`);
    });
    console.log('0. Back to Main Menu');
    console.log();

    rl.question('Select script to run: ', (answer) => {
        const choice = parseInt(answer);
        if (choice === 0) {
            showMainMenu();
            return;
        }

        if (choice > 0 && choice <= categoryScripts.length) {
            runScript(categoryScripts[choice - 1]);
        } else {
            showCategoryMenu(category);
        }
    });
}

function runScript(script) {
    clearScreen();
    console.log(`Running: ${script.name} (${script.file})`);
    console.log('='.repeat(60));
    console.log();

    const scriptPath = path.join(__dirname, script.file);

    // Determine if it's a node script or python script based on extension
    const ext = path.extname(script.file);
    const cmd = ext === '.py' ? 'python3' : 'node';

    // Pause our readline so child process can use stdin
    rl.pause();
    process.stdin.setRawMode && process.stdin.setRawMode(false);

    const child = spawn(cmd, [scriptPath], {
        stdio: 'inherit',
        env: process.env
    });

    child.on('close', (code) => {
        // Resume our readline
        rl.resume();
        
        console.log();
        console.log('='.repeat(60));
        console.log(`Script finished with code ${code}`);
        console.log();

        rl.question('Press Enter to continue...', () => {
            showCategoryMenu(Object.keys(scripts).find(cat => scripts[cat].includes(script)));
        });
    });
}

// Start the application
showMainMenu();
