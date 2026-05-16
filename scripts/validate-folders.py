#!/usr/bin/env python3

import os
import glob
from datetime import datetime

def get_expected_ids():
    ids = set()
    sites_dir = os.path.join(os.path.dirname(__file__), '..', 'sites')
    
    for file in os.listdir(sites_dir):
        if file.endswith(('.tsv', '.txt')):
            with open(os.path.join(sites_dir, file), 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and not line.startswith('Column'):
                        if file.endswith('.tsv'):
                            id_val = line.split('\t')[0]
                        else:
                            id_val = line
                        if id_val and id_val.strip():
                            ids.add(id_val.strip())
    return ids

def get_existing_folders():
    folders = set()
    images_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'images')
    
    for root, dirs, files in os.walk(images_dir):
        for d in dirs:
            if d.startswith('sub-'):
                folders.add(d[4:])  # Remove 'sub-' prefix
    return folders

def main():
    expected = get_expected_ids()
    existing = get_existing_folders()
    
    missing = expected - existing
    extra = existing - expected
    
    log_file = os.path.join(os.path.dirname(__file__), '..', 'folder-validation.log')
    
    with open(log_file, 'w') as f:
        f.write(f"Folder Validation Report - {datetime.now().isoformat()}\n")
        f.write("=" * 60 + "\n")
        f.write(f"Expected IDs: {len(expected)}\n")
        f.write(f"Existing folders: {len(existing)}\n\n")
        
        if missing:
            f.write(f"MISSING FOLDERS ({len(missing)}):\n")
            for id_val in sorted(missing):
                f.write(f"  - sub-{id_val}\n")
            f.write("\n")
        
        if extra:
            f.write(f"EXTRA FOLDERS ({len(extra)}):\n")
            for id_val in sorted(extra):
                f.write(f"  - sub-{id_val}\n")
            f.write("\n")
        
        if not missing and not extra:
            f.write("✅ All folders match expected IDs\n")
        else:
            f.write(f"❌ Found {len(missing)} missing and {len(extra)} extra folders\n")
    
    print(f"Validation complete. Log written to: {log_file}")
    if missing or extra:
        print(f"Issues found: {len(missing)} missing, {len(extra)} extra folders")
    else:
        print("✅ All folders match expected IDs")

if __name__ == "__main__":
    main()