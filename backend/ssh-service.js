import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SSH Configuration
const SSH_CONFIG = {
  host: process.env.SSH_HOST,
  port: parseInt(process.env.SSH_PORT || '22'),
  username: process.env.SSH_USERNAME,
  privateKeyPath: process.env.SSH_KEY_PATH || null,
  password: process.env.SSH_PASSWORD || null,
  readyTimeout: 30000,
  keepaliveInterval: 10000
};

const SSH_BASE_PATH = process.env.SSH_BASE_PATH || '/path/to/your/data';

// Cache directory for SSH images
const CACHE_DIR = path.join(__dirname, '..', 'data', 'ssh-cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * SSH Service for remote file operations
 */
class SSHService {
  constructor() {
    this.client = null;
    this.sftp = null;
    this.isConnected = false;
    this.connectionPromise = null;
  }

  /**
   * Connect to SSH server
   */
  async connect() {
    if (this.isConnected && this.client) {
      return;
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      this.client = new Client();

      this.client.on('ready', () => {
        console.log('✅ SSH connection established');

        // Get SFTP subsystem
        this.client.sftp((err, sftp) => {
          if (err) {
            console.error('❌ SFTP error:', err);
            reject(err);
            return;
          }

          this.sftp = sftp;
          this.isConnected = true;
          this.connectionPromise = null;
          resolve();
        });
      });

      this.client.on('error', (err) => {
        console.error('❌ SSH connection error:', err);
        this.isConnected = false;
        this.connectionPromise = null;
        reject(err);
      });

      this.client.on('close', () => {
        console.log('🔌 SSH connection closed');
        this.isConnected = false;
        this.sftp = null;
      });

      // Connect with configuration
      const config = { ...SSH_CONFIG };

      // Use either private key or password
      // If SSH is not configured, silently fail (SSH is optional for local network)
      if (!config.privateKeyPath && !config.password) {
        console.warn('⚠️  SSH not configured (optional). Set SSH_KEY_PATH or SSH_PASSWORD in .env to enable SSH features.');
        this.isConnected = false;
        this.connectionPromise = null;
        resolve(); // Resolve instead of reject - SSH is optional
        return;
      }

      if (config.privateKeyPath) {
        config.privateKey = fs.readFileSync(config.privateKeyPath);
      }
      if (!config.password) {
        delete config.password;
      }

      console.log(`🔐 Connecting to SSH: ${config.username}@${config.host}:${config.port}`);
      this.client.connect(config);
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from SSH server
   */
  disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.sftp = null;
      this.isConnected = false;
    }
  }

  /**
   * Ensure connection is active
   */
  async ensureConnected() {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  /**
   * List directories in remote path
   */
  async listDirectories(remotePath) {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }

        // Filter only directories
        const directories = list
          .filter(item => item.attrs.isDirectory())
          .map(item => item.filename)
          .filter(name => !name.startsWith('.')); // Exclude hidden directories

        resolve(directories);
      });
    });
  }

  /**
   * List files in remote path
   */
  async listFiles(remotePath, extension = '.png') {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }

        // Filter only files with specified extension
        const files = list
          .filter(item => item.attrs.isFile())
          .filter(item => !extension || item.filename.endsWith(extension))
          .map(item => item.filename)
          .sort();

        resolve(files);
      });
    });
  }

  /**
   * Check if remote path exists
   */
  async pathExists(remotePath) {
    await this.ensureConnected();

    return new Promise((resolve) => {
      this.sftp.stat(remotePath, (err) => {
        resolve(!err);
      });
    });
  }

  /**
   * Get file stats
   */
  async getStats(remotePath) {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      this.sftp.stat(remotePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stats);
      });
    });
  }

  /**
   * Download file to local cache
   */
  async downloadToCache(remotePath, localPath) {
    await this.ensureConnected();

    // Ensure cache subdirectory exists
    const localDir = path.dirname(localPath);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.sftp.fastGet(remotePath, localPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(localPath);
      });
    });
  }

  /**
   * Stream file from SSH server
   */
  async streamFile(remotePath) {
    await this.ensureConnected();

    return new Promise((resolve, reject) => {
      const stream = this.sftp.createReadStream(remotePath);

      stream.on('error', (err) => {
        reject(err);
      });

      // Return stream immediately
      resolve(stream);
    });
  }

  /**
   * Get cached file path or download if not cached
   */
  async getCachedFile(remotePath) {
    // Generate cache path
    const relativePath = remotePath.replace(SSH_BASE_PATH, '').replace(/^\//, '');
    const cachePath = path.join(CACHE_DIR, relativePath);

    // Check if file exists in cache
    if (fs.existsSync(cachePath)) {
      // Verify file is not corrupted (has size > 0)
      const stats = fs.statSync(cachePath);
      if (stats.size > 0) {
        return cachePath;
      }
    }

    // Download to cache
    console.log(`📥 Downloading to cache: ${remotePath}`);
    await this.downloadToCache(remotePath, cachePath);
    return cachePath;
  }

  /**
   * Clear cache for specific dataset or all
   */
  clearCache(datasetName = null) {
    if (datasetName) {
      const datasetCachePath = path.join(CACHE_DIR, datasetName);
      if (fs.existsSync(datasetCachePath)) {
        fs.rmSync(datasetCachePath, { recursive: true, force: true });
        console.log(`🗑️  Cleared cache for dataset: ${datasetName}`);
      }
    } else {
      if (fs.existsSync(CACHE_DIR)) {
        fs.rmSync(CACHE_DIR, { recursive: true, force: true });
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('🗑️  Cleared all SSH cache');
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (!fs.existsSync(CACHE_DIR)) {
      return { size: 0, files: 0 };
    }

    let totalSize = 0;
    let fileCount = 0;

    const walkDir = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          walkDir(filePath);
        } else {
          totalSize += stats.size;
          fileCount++;
        }
      });
    };

    walkDir(CACHE_DIR);

    return {
      size: totalSize,
      sizeFormatted: formatBytes(totalSize),
      files: fileCount
    };
  }

  /**
   * Scan datasets on SSH server
   */
  async scanDatasets() {
    await this.ensureConnected();

    console.log(`📂 Scanning SSH datasets at: ${SSH_BASE_PATH}`);

    // List all dataset directories
    const datasets = await this.listDirectories(SSH_BASE_PATH);
    console.log(`   Found ${datasets.length} datasets: ${datasets.join(', ')}`);

    const results = [];

    for (const datasetName of datasets) {
      const datasetPath = `${SSH_BASE_PATH}/${datasetName}`;

      try {
        // List subject directories
        const subjects = await this.listDirectories(datasetPath);

        let totalImages = 0;
        const samples = [];

        // Sample first few subjects to get image count pattern
        const sampleSize = Math.min(5, subjects.length);
        for (let i = 0; i < sampleSize; i++) {
          const subjectPath = `${datasetPath}/${subjects[i]}`;
          const images = await this.listFiles(subjectPath, '.png');
          totalImages += images.length;

          // Store sample info
          for (const image of images) {
            samples.push({
              subject: subjects[i],
              filename: image,
              path: `${datasetName}/${subjects[i]}/${image}`
            });
          }
        }

        // Estimate total images
        const avgImagesPerSubject = totalImages / sampleSize;
        const estimatedTotal = Math.round(avgImagesPerSubject * subjects.length);

        results.push({
          name: datasetName,
          path: datasetPath,
          subjectCount: subjects.length,
          estimatedImageCount: estimatedTotal,
          sampledImages: totalImages,
          samples: samples
        });

        console.log(`   ✅ ${datasetName}: ${subjects.length} subjects, ~${estimatedTotal} images`);
      } catch (error) {
        console.error(`   ❌ Error scanning ${datasetName}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Scan specific dataset in detail
   */
  async scanDatasetDetail(datasetName) {
    await this.ensureConnected();

    console.log(`📂 Scanning dataset in detail: ${datasetName}`);

    const datasetPath = `${SSH_BASE_PATH}/${datasetName}`;

    // Check if dataset exists
    const exists = await this.pathExists(datasetPath);
    if (!exists) {
      throw new Error(`Dataset not found: ${datasetName}`);
    }

    // List all subjects
    const subjects = await this.listDirectories(datasetPath);
    console.log(`   Found ${subjects.length} subjects`);

    const samples = [];
    let processedCount = 0;

    for (const subject of subjects) {
      const subjectPath = `${datasetPath}/${subject}`;

      try {
        const images = await this.listFiles(subjectPath, '.png');

        for (const image of images) {
          samples.push({
            subject: subject,
            filename: image,
            path: `${datasetName}/${subject}/${image}`
          });
        }

        processedCount++;
        if (processedCount % 50 === 0) {
          console.log(`   Progress: ${processedCount}/${subjects.length} subjects`);
        }
      } catch (error) {
        console.error(`   ⚠️  Error scanning subject ${subject}:`, error.message);
      }
    }

    console.log(`   ✅ Completed: ${samples.length} images from ${subjects.length} subjects`);

    return {
      name: datasetName,
      path: datasetPath,
      subjectCount: subjects.length,
      imageCount: samples.length,
      samples: samples
    };
  }

  /**
   * Test SSH connection
   */
  async testConnection() {
    try {
      await this.connect();

      // Try to list base directory
      const exists = await this.pathExists(SSH_BASE_PATH);

      if (!exists) {
        return {
          success: false,
          message: `Base path not found: ${SSH_BASE_PATH}`
        };
      }

      return {
        success: true,
        message: 'SSH connection successful',
        basePath: SSH_BASE_PATH
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Export singleton instance
const sshService = new SSHService();

export default sshService;
export { SSH_BASE_PATH, CACHE_DIR };