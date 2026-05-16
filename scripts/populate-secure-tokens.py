#!/usr/bin/env python3
"""
Populate secure tokens and file paths for existing samples
"""

import sqlite3
import uuid
import sys

def main():
    db_path = 'data/neuroqc.db'
    
    print("=" * 60)
    print("🔒 Populating Secure Tokens")
    print("=" * 60)
    print()
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all samples that need tokens
        cursor.execute("""
            SELECT s.id, s.filename, d.image_path
            FROM samples s
            JOIN datasets d ON s.dataset_id = d.id
            WHERE s.secure_token IS NULL
        """)
        
        samples = cursor.fetchall()
        print(f"Found {len(samples)} samples to update\n")
        
        if len(samples) == 0:
            print("✅ All samples already have secure tokens")
            conn.close()
            return
        
        # Update each sample
        updated = 0
        for sample_id, filename, image_path in samples:
            secure_token = str(uuid.uuid4())
            file_path = f"{image_path}/{filename}"
            
            cursor.execute("""
                UPDATE samples 
                SET secure_token = ?, file_path = ?
                WHERE id = ?
            """, (secure_token, file_path, sample_id))
            
            updated += 1
            if updated % 100 == 0:
                print(f"Progress: {updated}/{len(samples)}")
        
        conn.commit()
        conn.close()
        
        print()
        print("=" * 60)
        print("✅ Migration completed successfully!")
        print("=" * 60)
        print(f"   Samples updated: {updated}")
        print(f"   Secure tokens generated: {updated}")
        print(f"   File paths populated: {updated}")
        print("=" * 60)
        print()
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
