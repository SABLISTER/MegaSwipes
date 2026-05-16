
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000/api';

// 1. Create a dummy CSV file
const csvContent = `filename,euler
test_file_1.png,100.5
test_file_2.png,200.5
sub-99999,300.5`;

const csvPath = path.join(__dirname, 'temp_euler_upload.csv');
fs.writeFileSync(csvPath, csvContent);

async function runTest() {
    console.log('🧪 Starting Verification Test...');

    // Login to get token
    let token;
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@example.com',
            password: 'admin123'
        });
        token = res.data.token;
        console.log('✅ Login successful');
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        process.exit(1);
    }

    // 2. Upload CSV
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(csvPath));

        const res = await axios.post(`${BASE_URL}/admin/upload/euler`, form, {
            headers: {
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders()
            }
        });
        console.log('✅ Upload response:', res.data);
    } catch (error) {
        console.error('❌ Upload failed:', error.response ? error.response.data : error.message);
    }

    // 3. Check advanced stats
    try {
        const res = await axios.get(`${BASE_URL}/admin/stats/advanced`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const stats = res.data;
        if (stats.eulerVsPassRate !== undefined && stats.sitePassRates !== undefined) {
            console.log('✅ Advanced stats contain new keys (eulerVsPassRate, sitePassRates)');
        } else {
            console.error('❌ Advanced stats missing new keys!');
        }
    } catch (error) {
        console.error('❌ Get stats failed:', error.message);
    }

    // Cleanup
    fs.unlinkSync(csvPath);
    console.log('✨ Verification complete.');
}

runTest();
