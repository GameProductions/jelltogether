import os
import json
import hashlib
import zipfile
import subprocess
from datetime import datetime

# --- CONFIGURATION ---
GITHUB_USER = "GameProductions"
REPO_NAME = "jelltogether"
VERSION = "1.1.0.0"
TARGET_ABI = "10.11.8.0"
GUID = "f9e1e2d3-a4b5-4c6d-8e9f-0a1b2c3d4e5f"
# ---------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLISH_DIR = os.path.join(BASE_DIR, "bin", "Release", "net9.0", "publish")
ZIP_NAME = f"jelltogether_{VERSION}.zip"
ZIP_PATH = os.path.join(BASE_DIR, ZIP_NAME)
REPO_JSON_PATH = os.path.join(BASE_DIR, "repository.json")

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

def generate_repo_json(checksum):
    print("Generating repository.json...")
    source_url = f"https://github.com/{GITHUB_USER}/{REPO_NAME}/releases/download/v{VERSION}/{ZIP_NAME}"
    image_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO_NAME}/main/logo.png"
    
    repo_data = [
        {
            "guid": GUID,
            "name": "JellTogether",
            "imageUrl": image_url,
            "description": "The ultimate social watch party plugin for Jellyfin.",
            "overview": "Host high-fidelity watch parties with virtual cinema seats, theory boards, and synchronized playback.",
            "owner": GITHUB_USER,
            "category": "Social",
            "versions": [
                {
                    "version": f"{VERSION}",
                    "changelog": "Rename to JellTogether, harden watch party room security, refresh branding, and add Jellyfin-friendly assets.",
                    "targetAbi": TARGET_ABI,
                    "sourceUrl": source_url,
                    "checksum": checksum,
                    "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
                }
            ]
        }
    ]
    
    with open(REPO_JSON_PATH, "w") as f:
        json.dump(repo_data, f, indent=2)
    print(f"Success! {REPO_JSON_PATH} created.")

def main():
    try:
        # 1. Build the project
        run_command("dotnet publish -c Release")
        
        # 2. Copy manifest.json to publish folder if missing
        shutil_manifest = os.path.join(BASE_DIR, "manifest.json")
        dest_manifest = os.path.join(PUBLISH_DIR, "manifest.json")
        if os.path.exists(shutil_manifest):
            import shutil
            shutil.copy(shutil_manifest, dest_manifest)
        
        # 3. Create the ZIP
        create_zip(PUBLISH_DIR, ZIP_PATH)
        
        # 4. Calculate Checksum
        checksum = calculate_md5(ZIP_PATH)
        print(f"MD5: {checksum}")
        
        # 5. Generate repository.json
        generate_repo_json(checksum)
        
        print("\n--- NEXT STEPS ---")
        print(f"1. Create a GitHub Release named 'v{VERSION}'.")
        print(f"2. Upload '{ZIP_NAME}' to the release assets.")
        print(f"3. Host 'repository.json' (e.g., on GitHub Pages or as a raw file).")
        print("4. Add your 'repository.json' URL to Jellyfin > Dashboard > Plugins > Repositories.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
