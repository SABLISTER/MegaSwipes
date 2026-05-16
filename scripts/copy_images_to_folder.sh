#!/bin/bash

# Base directory containing all site folders
BASE_DIR="/home/mhouse/MegaSwipes/data/MH"
NEW_DIR="/home/mhouse/MegaSwipes/data/images/missing_vote_data_12-5-25/MH"

# File with subject IDs to keep (numbers only)
SUBS_FILE="/home/mhouse/MegaSwipes/scripts/missing_vote_data_12-5-25.txt"

# Copy listed images 
while IFS= read -r img; do
    cp $BASE_DIR/$img* "$NEW_DIR"
done < $SUBS_FILE
