import os
import time
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

# Load API key
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("Please set OPENAI_API_KEY in your .env")

# Initialize client
client = OpenAI(api_key=api_key)

app = Flask(__name__)
CORS(app)

# Character threshold under which we do one-shot summarization
ONE_SHOT_THRESHOLD = 50000

# Maximum characters per chunk for large documents
MAX_CHARS = 15000

def chunk_text(text, max_chars=MAX_CHARS):
    """Split text into chunks no larger than max_chars, on paragraph boundaries."""
    paras = text.split("\n\n")
    chunks = []
    current = ""
    for p in paras:
        if len(current) + len(p) + 2 <= max_chars:
            current = (current + "\n\n" + p) if current else p
        else:
            chunks.append(current)
            current = p
    if current:
        chunks.append(current)
    return chunks

@app.route("/summarize", methods=["POST"])
def summarize():
    data = request.get_json() or {}
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400

    # Choose strategy based on text length
    if len(text) <= ONE_SHOT_THRESHOLD:
        # Fast path: one-shot summarization
        try:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system",
                     "content": "You are ToSDigest, an assistant that extracts the top 5 user-impact clauses from a Terms of Service document."},
                    {"role": "user",
                     "content": f"Please summarize the following Terms of Service, focusing on the 5 most important points:\n\n{text}"}
                ],
                max_tokens=300,
                temperature=0.2,
            )
            summary = resp.choices[0].message.content.strip()
            return jsonify({"summary": summary})
        except Exception as e:
            msg = str(e)
            status = 429 if "rate limit" in msg.lower() else 500
            return jsonify({"error": msg}), status

    # Otherwise, chunk & merge path
    chunks = chunk_text(text)
    chunk_summaries = []

    system_msg = {
        "role": "system",
        "content": "You are ToSDigest, an assistant that extracts the top 5 user-impact clauses from a Terms of Service document."
    }

    # Summarize each chunk with a single retry on rate limit
    for idx, chunk in enumerate(chunks, start=1):
        user_msg = {
            "role": "user",
            "content": (
                f"Chunk {idx}/{len(chunks)}: Summarize this section, focusing on key user-impact points:\n\n{chunk}"
            )
        }

        for attempt in range(2):
            try:
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[system_msg, user_msg],
                    max_tokens=300,
                    temperature=0.2,
                )
                chunk_summaries.append(resp.choices[0].message.content.strip())
                break
            except Exception as e:
                msg = str(e)
                if "rate limit" in msg.lower() and attempt == 0:
                    time.sleep(20)
                    continue
                status = 429 if "rate limit" in msg.lower() else 500
                return jsonify({"error": msg}), status

    # Combine chunk summaries if more than one
    if len(chunk_summaries) > 1:
        combined = "\n\n".join(f"Chunk {i+1} summary:\n{cs}"
                               for i, cs in enumerate(chunk_summaries))
        final_user_msg = {
            "role": "user",
            "content": (
                "Combine these chunk summaries into a concise list of the top 5 "
                "user-impact clauses from the entire Terms of Service:\n\n" + combined
            )
        }
        try:
            final_resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[system_msg, final_user_msg],
                max_tokens=300,
                temperature=0.2,
            )
            final_summary = final_resp.choices[0].message.content.strip()
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        final_summary = chunk_summaries[0]

    return jsonify({"summary": final_summary})

if __name__ == "__main__":
    app.run(debug=True)
