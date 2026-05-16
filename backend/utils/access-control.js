/**
 * Access Control Utilities
 * 
 * Common functions for checking dataset and user access
 */

import db from '../database.js';

/**
 * Check if user has access to a dataset
 * @param {string} datasetId - Dataset ID
 * @param {string} userId - User ID
 * @returns {boolean} - True if user has access
 */
export function checkDatasetAccess(datasetId, userId) {
  const dataset = db.prepare('SELECT is_public FROM datasets WHERE id = ?').get(datasetId);
  if (!dataset) return false;
  if (dataset.is_public) return true;
  
  const access = db.prepare('SELECT 1 FROM user_dataset_access WHERE dataset_id = ? AND user_id = ?').get(datasetId, userId);
  return !!access;
}

/**
 * Check if user is admin
 * @param {string} userId - User ID
 * @returns {boolean} - True if user is admin
 */
export function isUserAdmin(userId) {
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
  return user && user.is_admin === 1;
}

