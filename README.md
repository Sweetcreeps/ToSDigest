# ToSDigest

An AI-powered Chrome extension to summarize website Terms of Service on-demand.

## Features

- Detects ToS/Privacy links automatically
- On-page “Summarize ToS” banner
- Summaries powered by OpenAI models

## Installation

```bash
git clone https://github.com/your-username/ToSDigest.git
cd ToSDigest
python3 -m venv venv && source venv/bin/activate
cp .env.example .env  # fill in your API key
pip install -r requirements.txt
python summarizer_api.py
