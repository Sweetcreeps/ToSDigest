# ToSDigest

An AI-powered Chrome extension to summarize website Terms of Service on-demand.

## Features

- Detects ToS/Privacy links automatically
- On-page “Summarize ToS” banner
- Summaries powered by OpenAI models

## Installation

1. **Download from GitHub**  
   - Navigate to your repository on GitHub.  
   - Click **Code → Download ZIP**.  
   - Unzip the downloaded archive to a folder on your computer.

2. **Load as an unpacked extension**  
   - Open Chrome and go to `chrome://extensions/`. or go to the extensions manager tab on your choosen web broweser. 
   - Toggle **Developer mode** on (normally found at the top).  
   - Click **Load unpacked** and select the folder you unzipped (the one containing `manifest.json`).


## Usage

- **Automatic Mode**  
  Runs on pages whose URL matches `*login*`, `*signup*` or `*register*`. The banner appears without clicking.

- **Manual Mode**  
  Click the ToSDigest toolbar icon on any page to inject the “Summarize” banner.

