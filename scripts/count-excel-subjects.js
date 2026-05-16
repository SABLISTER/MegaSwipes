#!/usr/bin/env node

import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const excelFile = join(__dirname, 'S4S_sublist.xlsx');
const workbook = XLSX.readFile(excelFile);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

const counts = { RG: 0, SP: 0, MH: 0, BC: 0 };
const uniqueIds = { RG: new Set(), SP: new Set(), MH: new Set(), BC: new Set() };

for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    // RG: column 1
    if (row[1]) {
        const id = String(row[1]).trim().toLowerCase();
        if (id) {
            counts.RG++;
            uniqueIds.RG.add(id);
        }
    }

    // SP: column 3
    if (row[3]) {
        const id = String(row[3]).trim().toLowerCase();
        if (id) {
            counts.SP++;
            uniqueIds.SP.add(id);
        }
    }

    // MH: column 5
    if (row[5]) {
        const id = String(row[5]).trim().toLowerCase();
        if (id) {
            counts.MH++;
            uniqueIds.MH.add(id);
        }
    }

    // BC: column 7
    if (row[7]) {
        const id = String(row[7]).trim().toLowerCase();
        if (id) {
            counts.BC++;
            uniqueIds.BC.add(id);
        }
    }
}

console.log('Subject IDs in Excel by folder:');
console.log('='.repeat(60));
console.log('RG:', counts.RG, 'entries,', uniqueIds.RG.size, 'unique subjects');
console.log('SP:', counts.SP, 'entries,', uniqueIds.SP.size, 'unique subjects');
console.log('MH:', counts.MH, 'entries,', uniqueIds.MH.size, 'unique subjects');
console.log('BC:', counts.BC, 'entries,', uniqueIds.BC.size, 'unique subjects');
console.log('='.repeat(60));
console.log('Total entries:', counts.RG + counts.SP + counts.MH + counts.BC);
console.log('Total unique subjects:', uniqueIds.RG.size + uniqueIds.SP.size + uniqueIds.MH.size + uniqueIds.BC.size);

