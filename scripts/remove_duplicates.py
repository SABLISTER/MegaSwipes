import os
import re

folder = "/home/mhouse/MegaSwipes/data/MH"
subject_list_file = "/home/mhouse/MegaSwipes/scripts/remove.txt"
variant2_list_file = "/home/mhouse/MegaSwipes/scripts/variant2_files.txt"

dry_run = False  # Set to False to actually delete


# Load subjects to process
with open(subject_list_file) as f:
    subjects_to_process = set(line.strip() for line in f if line.strip())

# Regex to capture subject, optional acquisition (before or after T1w), T1w, and suffix (A1/S1)
pattern = re.compile(
    r"(sub-[^_]+)"           # subject
    r"(?:_acq-([^_]+))?"     # optional acquisition before T1w
    r"_T1w"
    r"(?:_acq-([^_]+))?"     # optional acquisition after T1w
    r"_([AS]\d)\.png$"       # suffix
)

# Collect files by subject -> acquisition -> variant
files_dict = {}  # {subject: {acq_key: {variant: [full paths]}}}

for root, dirs, files in os.walk(folder):
    for f in files:
        if not f.endswith(".png"):
            continue
        m = pattern.match(f)
        if not m:
            continue
        subject = m.group(1)
        if subject not in subjects_to_process:
            continue

        acq_pre = m.group(2)
        acq_post = m.group(3)
        acq = acq_pre or acq_post
        acq_key = acq if acq else "no_acq"
        suffix = m.group(4)
        full_path = os.path.join(root, f)

        # Determine variant type
        if acq_key != "no_acq":
            # Detect if acq comes before or after T1w in filename
            if f.startswith(f"{subject}_acq-"):
                variant_key = f"acq-{acq_key}_T1w"
            else:
                variant_key = f"T1w_acq-{acq_key}"
        else:
            variant_key = "T1w"

        files_dict.setdefault(subject, {}).setdefault(acq_key, {}).setdefault(variant_key, []).append(full_path)

# Variant priority function
def priority(variant_str):
    if variant_str.startswith("acq-") and "_T1w" in variant_str:
        return 3  # highest
    elif variant_str.startswith("T1w_acq-"):
        return 2
    elif variant_str == "T1w":
        return 1
    return 0

variant2_files = []

for subject, acqs in files_dict.items():
    print(f"DEBUG: Subject {subject} acquisitions found: {list(acqs.keys())}")

    # Delete no_acq files if any real acquisition exists
    real_acqs = [acq for acq in acqs.keys() if acq != "no_acq"]
    if real_acqs and "no_acq" in acqs:
        for variant_group in acqs["no_acq"].values():
            for path in variant_group:
                if dry_run:
                    print(f"(Dry-run) Would delete {path} (no acquisition, other acquisitions exist)")
                else:
                    os.remove(path)
        del acqs["no_acq"]

    # Process remaining acquisitions
    for acq, variants in acqs.items():
        # Sort variants by priority (highest first)
        variants_sorted = sorted(variants.keys(), key=priority, reverse=True)
        best_variant = variants_sorted[0]
        print(f"Subject {subject}, acquisition {acq}: keeping variant '{best_variant}'")

        for variant_key, files in variants.items():
            if variant_key == best_variant:
                # Collect variant 2 files
                if priority(variant_key) == 2:
                    variant2_files.extend(files)
                continue
            for f in files:
                if dry_run:
                    print(f"(Dry-run) Would delete {f}")
                else:
                    os.remove(f)

# Save variant 2 files
with open(variant2_list_file, "w") as f:
    for path in variant2_files:
        f.write(path + "\n")

print(f"Saved variant 2 files list to {variant2_list_file}")