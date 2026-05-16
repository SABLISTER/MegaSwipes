#!/usr/bin/env node

/**
 * Check Node.js version before proceeding with setup
 * This ensures the correct Node version is installed
 */

const requiredVersion = '20.11.0';
const currentNodeVersion = process.version;

function parseVersion(version) {
  // Remove 'v' prefix if present
  const cleaned = version.replace(/^v/, '');
  const parts = cleaned.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

function compareVersions(current, required) {
  const currentParts = parseVersion(current);
  const requiredParts = parseVersion(required);
  
  if (currentParts.major !== requiredParts.major) {
    return currentParts.major - requiredParts.major;
  }
  if (currentParts.minor !== requiredParts.minor) {
    return currentParts.minor - requiredParts.minor;
  }
  return currentParts.patch - requiredParts.patch;
}

const versionDiff = compareVersions(currentNodeVersion, requiredVersion);

if (versionDiff !== 0) {
  console.error('\n❌ Node.js version mismatch!\n');
  console.error(`   Required: v${requiredVersion}`);
  console.error(`   Current:  ${currentNodeVersion}\n`);
  console.error('Please install the correct Node.js version:\n');
  console.error('  1. Go to https://nodejs.org/');
  console.error('  2. Download Node.js v' + requiredVersion);
  console.error('  3. Install it (this will replace your current version)');
  console.error('  4. Restart your terminal and try again\n');
  process.exit(1);
}

console.log(`✅ Node.js version correct: ${currentNodeVersion}`);
process.exit(0);

