#!/usr/bin/env node

/**
 * Check Node.js version before proceeding with setup
 * Node.js 20.11.0 is the recommended version, but any modern Node 20+ is accepted.
 * A hard failure only occurs for Node versions older than 20.
 */

const recommendedVersion = '20.11.0';
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

const current = parseVersion(currentNodeVersion);

if (current.major < 20) {
  console.error('\n❌ Node.js version too old!\n');
  console.error(`   Required: v${recommendedVersion} (or any v20+)`);
  console.error(`   Current:  ${currentNodeVersion}\n`);
  console.error('Please install a current Node.js version:\n');
  console.error('  1. Go to https://nodejs.org/');
  console.error('  2. Download Node.js v20 or newer');
  console.error('  3. Install it (this will replace your current version)');
  console.error('  4. Restart your terminal and try again\n');
  process.exit(1);
}

if (compareVersions(currentNodeVersion, recommendedVersion) !== 0) {
  console.warn(`⚠️  Node.js ${currentNodeVersion} detected (recommended: v${recommendedVersion}).`);
  console.warn('   Proceeding — better-sqlite3 and Vite support modern Node 20+.\n');
} else {
  console.log(`✅ Node.js version correct: ${currentNodeVersion}`);
}
process.exit(0);
