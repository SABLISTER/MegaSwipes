import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const t1wToDownloadPath = path.join(projectRoot, 'data', 'ignore', 't1w-to-download.csv');
const imagesDir = path.join(projectRoot, 'data', 'images');

// SSH configuration
const SSH_HOST = process.env.SSH_USERNAME + '@' + process.env.SSH_HOST;
const NDA_2900_PATH = '/data4/asd_meganalysis/SI_test_MH/pulls_for_nda/NDA_2900';
const NDA_2400_PATH = '/data4/asd_meganalysis/SI_test_MH/pulls_for_nda/NDA_2400';

// Read t1w-to-download.csv and filter for NDA 2900 and 2400 subjects
function getNDASubjects() {
  const csvContent = fs.readFileSync(t1wToDownloadPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const header = lines[0];
  
  const nda2900 = [];
  const nda2400 = [];
  
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',').map(c => c.trim());
    if (columns.length >= 3) {
      const subject = columns[0];
      const t1wCount = columns[1];
      const subjectPath = columns[2];
      
      // Check if subject path contains NDA/2900 or NDA_2900
      if (subjectPath.includes('NDA/2900') || subjectPath.includes('NDA_2900')) {
        nda2900.push({ subject, t1wCount, subjectPath, fullLine: lines[i] });
      }
      // Check if subject path contains NDA/2400 or NDA_2400
      else if (subjectPath.includes('NDA/2400') || subjectPath.includes('NDA_2400')) {
        nda2400.push({ subject, t1wCount, subjectPath, fullLine: lines[i] });
      }
    }
  }
  
  return { nda2900, nda2400, header };
}

// Pull directory from SSH using rsync
function pullDirectoryFromSSH(remotePath, localPath, subjectId) {
  try {
    // Create local directory if it doesn't exist
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }
    
    // Determine which SSH key to use
    const homeDir = process.env.HOME || process.env.HOMEPATH;
    const sshKeyPath = fs.existsSync(`${homeDir}/.ssh/id_ed25519`) 
      ? `${homeDir}/.ssh/id_ed25519`
      : (fs.existsSync(`${homeDir}/.ssh/id_rsa`) ? `${homeDir}/.ssh/id_rsa` : null);
    
    // Use rsync to pull the directory with SSH key
    // rsync -avz --progress -e "ssh -i key" user@host:/remote/path /local/path
    let rsyncCommand;
    if (sshKeyPath) {
      rsyncCommand = `rsync -avz --progress -e "ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no" "${SSH_HOST}:${remotePath}/" "${localPath}/"`;
    } else {
      rsyncCommand = `rsync -avz --progress "${SSH_HOST}:${remotePath}/" "${localPath}/"`;
    }
    
    console.log(`  📥 Pulling ${subjectId}...`);
    console.log(`     From: ${SSH_HOST}:${remotePath}`);
    console.log(`     To: ${localPath}`);
    if (sshKeyPath) {
      console.log(`     Using SSH key: ${sshKeyPath}`);
    }
    
    execSync(rsyncCommand, { 
      stdio: 'inherit',
      encoding: 'utf-8'
    });
    
    return true;
  } catch (err) {
    console.error(`     ❌ Error pulling ${subjectId}: ${err.message}`);
    return false;
  }
}

// Main function
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Pulling NDA subjects from SSH server');
  console.log('='.repeat(60) + '\n');
  
  // Get NDA subjects
  console.log('Reading t1w-to-download.csv...');
  const { nda2900, nda2400 } = getNDASubjects();
  console.log(`Found ${nda2900.length} subjects from NDA_2900`);
  console.log(`Found ${nda2400.length} subjects from NDA_2400\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  // Pull NDA_2900 subjects
  if (nda2900.length > 0) {
    console.log('='.repeat(60));
    console.log(`Pulling ${nda2900.length} subjects from NDA_2900...`);
    console.log('='.repeat(60) + '\n');
    
    for (const { subject, subjectPath } of nda2900) {
      // Extract the subject directory name from the path
      // e.g., /data4/asd_meganalysis/7_Release/NDA/2900/sub-NDAR_INVY0KZ100T
      // We need to map this to the SSH path structure
      // Remote: /data4/asd_meganalysis/SI_test_MH/pulls_for_nda/NDA_2900/sub-NDAR_INVY0KZ100T
      const remotePath = `${NDA_2900_PATH}/${subject}`;
      
      // Local path: data/images/NDA/2900/sub-NDAR_INVY0KZ100T
      const localPath = path.join(imagesDir, 'NDA', '2900', subject);
      
      if (pullDirectoryFromSSH(remotePath, localPath, subject)) {
        successCount++;
      } else {
        failCount++;
      }
      console.log(''); // Empty line for readability
    }
  }
  
  // Pull NDA_2400 subjects
  if (nda2400.length > 0) {
    console.log('='.repeat(60));
    console.log(`Pulling ${nda2400.length} subjects from NDA_2400...`);
    console.log('='.repeat(60) + '\n');
    
    for (const { subject, subjectPath } of nda2400) {
      // Remote: /data4/asd_meganalysis/SI_test_MH/pulls_for_nda/NDA_2400/sub-NDARRF922HJP
      const remotePath = `${NDA_2400_PATH}/${subject}`;
      
      // Local path: data/images/NDA/2400/sub-NDARRF922HJP
      const localPath = path.join(imagesDir, 'NDA', '2400', subject);
      
      if (pullDirectoryFromSSH(remotePath, localPath, subject)) {
        successCount++;
      } else {
        failCount++;
      }
      console.log(''); // Empty line for readability
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  console.log(`Total subjects to pull: ${nda2900.length + nda2400.length}`);
  console.log(`Successfully pulled: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

