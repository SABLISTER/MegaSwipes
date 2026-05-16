import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const t1wCountsPath = path.join(projectRoot, 'data', 't1w_counts.csv');
const imagesDir = path.join(projectRoot, 'data', 'images');

// SSH configuration
const SSH_HOST = process.env.SSH_USERNAME + '@' + process.env.SSH_HOST;
const ABIDE_REMOTE_BASE_PATH = '/ocean/projects/bio250034p/rgesue/projects/mega_analysis/swipes_registration/reg_results/ABIDE';

// Read t1w_counts.csv and filter for ABIDE subjects
function getABIDESubjects() {
  const csvContent = fs.readFileSync(t1wCountsPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const header = lines[0];
  
  const abideSubjects = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const columns = line.split(',').map(c => c.trim());
    if (columns.length >= 3) {
      const subject = columns[0];
      const t1wCount = columns[1];
      const subjectPath = columns[2];
      
      // Check if subject path contains ABIDE
      if (subjectPath.includes('ABIDE')) {
        // Extract site name from path
        // Examples:
        // /data4/asd_meganalysis/7_Release/ABIDE_Combined/USM_1/sub-29498 -> USM_1
        // /data4/asd_meganalysis/7_Release/ABIDE_I/YALE/sub-50577 -> YALE
        // /data4/asd_meganalysis/7_Release/ABIDE_II/EMC_1/sub-29909 -> EMC_1
        
        const pathParts = subjectPath.split('/');
        let site = null;
        
        // Find the site name (the part after ABIDE_Combined, ABIDE_I, or ABIDE_II)
        for (let j = 0; j < pathParts.length; j++) {
          if (pathParts[j].includes('ABIDE')) {
            if (j + 1 < pathParts.length) {
              site = pathParts[j + 1];
              break;
            }
          }
        }
        
        if (site) {
          abideSubjects.push({ 
            subject, 
            t1wCount, 
            subjectPath, 
            site,
            fullLine: line 
          });
        }
      }
    }
  }
  
  return { abideSubjects, header };
}

// Check if subject directory exists locally
function subjectExistsLocally(site, subject) {
  const localPath = path.join(imagesDir, 'ABIDE', site, subject);
  return fs.existsSync(localPath) && fs.statSync(localPath).isDirectory();
}

// Get SSH configuration for rsync
function getSSHConfig() {
  const homeDir = process.env.HOME || process.env.HOMEPATH;
  const sshKeyPath = fs.existsSync(`${homeDir}/.ssh/id_ed25519`) 
    ? `${homeDir}/.ssh/id_ed25519`
    : (fs.existsSync(`${homeDir}/.ssh/id_rsa`) ? `${homeDir}/.ssh/id_rsa` : null);
  
  // Ensure .ssh directory exists for control socket
  const sshDir = `${homeDir}/.ssh`;
  if (!fs.existsSync(sshDir)) {
    fs.mkdirSync(sshDir, { mode: 0o700 });
  }
  
  // Build SSH options
  const sshOptions = [
    '-o StrictHostKeyChecking=no',
    '-o ControlMaster=auto',
    `-o ControlPath=${sshDir}/control-%r@%h:%p`,
    '-o ControlPersist=10m', // Keep connection alive for 10 minutes
  ];
  
  if (sshKeyPath) {
    sshOptions.push(`-i ${sshKeyPath}`);
  }
  
  // Check if SSH agent is running (SSH_AUTH_SOCK is set)
  if (process.env.SSH_AUTH_SOCK) {
    sshOptions.push(`-o ForwardAgent=yes`);
  }
  
  return {
    sshKeyPath,
    sshOptions: sshOptions.join(' ')
  };
}

// Test SSH connectivity
function testSSHConnection() {
  console.log('Testing SSH connection...');
  const { sshOptions } = getSSHConfig();
  const testCommand = `ssh ${sshOptions} ${SSH_HOST} "echo 'Connection successful'" 2>&1`;
  
  try {
    execSync(testCommand, { 
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 10000 // 10 second timeout
    });
    console.log('✓ SSH connection successful\n');
    return true;
  } catch (err) {
    console.error('✗ SSH connection failed');
    console.error('  Error:', err.message);
    console.error('\n  Troubleshooting:');
    console.error('  1. Make sure you can SSH to the server manually:');
    console.error(`     ssh ${SSH_HOST}`);
    console.error('  2. Set up SSH key authentication to avoid password prompts:');
    console.error('     ssh-keygen -t ed25519 -C "your_email@example.com"');
    console.error(`     ssh-copy-id ${SSH_HOST}`);
    console.error('  3. Or use SSH agent to cache credentials:');
    console.error('     eval $(ssh-agent)');
    console.error(`     ssh-add ~/.ssh/id_ed25519  # or id_rsa`);
    console.error('\n');
    return false;
  }
}

// Pull directory from SSH using rsync
function pullDirectoryFromSSH(remotePath, localPath, subjectId) {
  try {
    // Create local directory if it doesn't exist
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }
    
    const { sshKeyPath, sshOptions } = getSSHConfig();
    
    // Use rsync to pull the directory with SSH options
    const rsyncCommand = `rsync -avz --progress -e "ssh ${sshOptions}" "${SSH_HOST}:${remotePath}/" "${localPath}/"`;
    
    console.log(`  📥 Pulling ${subjectId}...`);
    console.log(`     From: ${SSH_HOST}:${remotePath}`);
    console.log(`     To: ${localPath}`);
    if (sshKeyPath) {
      console.log(`     Using SSH key: ${sshKeyPath}`);
    }
    if (process.env.SSH_AUTH_SOCK) {
      console.log(`     Using SSH agent (credentials cached)`);
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
  // Parse command line arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  
  console.log('\n' + '='.repeat(60));
  console.log('Pulling ABIDE subjects from SSH server');
  if (dryRun) {
    console.log('DRY RUN MODE - No files will be pulled');
  }
  if (force) {
    console.log('FORCE MODE - Will pull all subjects (even if they exist locally)');
  }
  console.log('='.repeat(60) + '\n');
  
  // Test SSH connection first (unless dry run)
  if (!dryRun) {
    if (!testSSHConnection()) {
      console.error('Cannot proceed without SSH connection. Please fix authentication issues first.');
      process.exit(1);
    }
  }
  
  // Get ABIDE subjects
  console.log('Reading t1w_counts.csv...');
  const { abideSubjects } = getABIDESubjects();
  console.log(`Found ${abideSubjects.length} ABIDE subjects in CSV\n`);
  
  // Check which ones are missing locally
  console.log('Checking which subjects are missing locally...');
  const missingSubjects = [];
  const existingSubjects = [];
  
  for (const { subject, site } of abideSubjects) {
    if (subjectExistsLocally(site, subject)) {
      existingSubjects.push({ subject, site });
    } else {
      missingSubjects.push({ subject, site });
    }
  }
  
  console.log(`Found ${existingSubjects.length} subjects already present locally`);
  console.log(`Found ${missingSubjects.length} subjects missing locally\n`);
  
  // Determine which subjects to pull
  const subjectsToPull = force ? abideSubjects : missingSubjects;
  
  if (subjectsToPull.length === 0) {
    console.log('All ABIDE subjects are already present locally. Nothing to pull.');
    console.log('Use --force to pull all subjects anyway.');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // Pull subjects
  console.log('='.repeat(60));
  console.log(`${dryRun ? 'Would pull' : 'Pulling'} ${subjectsToPull.length} ABIDE subject${subjectsToPull.length !== 1 ? 's' : ''}...`);
  console.log('='.repeat(60) + '\n');
  
  for (const { subject, site } of subjectsToPull) {
    // Remote path: /ocean/projects/.../ABIDE/{SITE}/{subject}
    const remotePath = `${ABIDE_REMOTE_BASE_PATH}/${site}/${subject}`;
    
    // Local path: data/images/ABIDE/{SITE}/{subject}
    const localPath = path.join(imagesDir, 'ABIDE', site, subject);
    
    if (dryRun) {
      console.log(`  [DRY RUN] Would pull ${subject}...`);
      console.log(`     From: ${SSH_HOST}:${remotePath}`);
      console.log(`     To: ${localPath}`);
      successCount++;
    } else {
      if (pullDirectoryFromSSH(remotePath, localPath, subject)) {
        successCount++;
      } else {
        failCount++;
      }
    }
    console.log(''); // Empty line for readability
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  console.log(`Total ABIDE subjects in CSV: ${abideSubjects.length}`);
  console.log(`Already present locally: ${existingSubjects.length}`);
  console.log(`Missing subjects: ${missingSubjects.length}`);
  if (dryRun) {
    console.log(`Would pull: ${successCount}`);
  } else {
    console.log(`Successfully pulled: ${successCount}`);
    console.log(`Failed: ${failCount}`);
  }
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

