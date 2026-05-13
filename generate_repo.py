import os
import json
import hashlib
import zipfile
import subprocess
from datetime import datetime, timezone

# --- CONFIGURATION ---
GITHUB_USER = "GameProductions"
REPO_NAME = "jelltogether"
VERSION = "1.2.1.0"
TARGET_ABI = "10.11.8.0"
GUID = "f9e1e2d3-a4b5-4c6d-8e9f-0a1b2c3d4e5f"
# ---------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLISH_DIR = os.path.join(BASE_DIR, "bin", "Release", "net9.0", "publish")
ZIP_NAME = f"jelltogether_{VERSION}.zip"
ZIP_PATH = os.path.join(BASE_DIR, ZIP_NAME)
REPO_JSON_PATH = os.path.join(BASE_DIR, "repository.json")
MANIFEST_JSON_PATH = os.path.join(BASE_DIR, "manifest.json")
CHANGELOG = "Fix Jellyfin plugin listing settings navigation so it opens global settings instead of the companion."

def run_command(cmd):
    print(f"Running: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

def calculate_md5(file_path):
    md5_hash = hashlib.md5()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            md5_hash.update(byte_block)
    return md5_hash.hexdigest().upper()

def create_zip(source_dir, output_path):
    print(f"Creating ZIP: {output_path}")
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                if file.endswith(".dll") or file in {"manifest.json", "logo.png", "banner.png"}:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, source_dir)
                    zipf.write(file_path, arcname)

def plugin_manifest_entry(checksum, timestamp, image_key, image_value):
    source_url = f"https://github.com/{GITHUB_USER}/{REPO_NAME}/releases/download/v{VERSION}/{ZIP_NAME}"
    return {
        "guid": GUID,
        "name": "JellTogether",
        image_key: image_value,
        "description": "The ultimate social watch party plugin for Jellyfin.",
        "overview": "Host high-fidelity watch parties with virtual cinema seats, theory boards, and synchronized playback.",
        "owner": GITHUB_USER,
        "category": "Social",
        "versions": [
            {
                "version": f"{VERSION}",
                "changelog": CHANGELOG,
                "targetAbi": TARGET_ABI,
                "sourceUrl": source_url,
                "checksum": checksum,
                "timestamp": timestamp
            }
        ]
    }

def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

def generate_metadata_json(checksum):
    print("Generating manifest metadata...")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    image_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO_NAME}/main/banner.png"

    repo_data = [
        plugin_manifest_entry(checksum, timestamp, "imageUrl", image_url)
    ]

    manifest_data = [
        {
            **plugin_manifest_entry(checksum, timestamp, "imagePath", "logo.png"),
            "imageUrl": image_url
        }
    ]

    write_json(REPO_JSON_PATH, repo_data)
    write_json(MANIFEST_JSON_PATH, manifest_data)
    print(f"Success! {REPO_JSON_PATH} and {MANIFEST_JSON_PATH} created.")

def write_package_manifest(path):
    print("Writing package manifest...")
    image_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO_NAME}/main/banner.png"
    package_data = [
        {
            **plugin_manifest_entry("", "", "imagePath", "logo.png"),
            "imageUrl": image_url
        }
    ]
    write_json(path, package_data)

def main():
    try:
        # 1. Build the project
        run_command("dotnet publish -c Release")
        
        # 2. Write package metadata. The repository metadata below carries the
        # real archive checksum; the package manifest avoids a stale self-checksum.
        dest_manifest = os.path.join(PUBLISH_DIR, "manifest.json")
        write_package_manifest(dest_manifest)
        
        # 3. Create the ZIP
        create_zip(PUBLISH_DIR, ZIP_PATH)
        
        # 4. Calculate Checksum
        checksum = calculate_md5(ZIP_PATH)
        print(f"MD5: {checksum}")
        
        # 5. Generate repository metadata
        generate_metadata_json(checksum)
        
        print("\n--- NEXT STEPS ---")
        print(f"1. Create or update a GitHub Release named 'v{VERSION}'.")
        print(f"2. Upload '{ZIP_NAME}' to the release assets.")
        print("3. Add your raw 'repository.json' URL to Jellyfin > Dashboard > Plugins > Repositories.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
