#!/usr/bin/env python3

import os
import shutil
import random

def main():
    source_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'images', 'pulls_for_abide')
    dest_dir = os.path.join(os.path.dirname(__file__), '..', 'random_30_subjects')
    
    # Find all sub- folders
    sub_folders = []
    for root, dirs, files in os.walk(source_dir):
        for d in dirs:
            if d.startswith('sub-'):
                sub_folders.append(os.path.join(root, d))
    
    # Select 30 random subjects
    selected = random.sample(sub_folders, min(30, len(sub_folders)))
    
    # Create destination directory
    os.makedirs(dest_dir, exist_ok=True)
    
    # Copy selected folders
    for i, folder in enumerate(selected, 1):
        folder_name = os.path.basename(folder)
        dest_path = os.path.join(dest_dir, folder_name)
        shutil.copytree(folder, dest_path)
        print(f"{i}/30: Copied {folder_name}")
    
    print(f"\nCopied 30 random subjects to: {dest_dir}")

if __name__ == "__main__":
    main()