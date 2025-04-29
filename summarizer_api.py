import os, time
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI

# Load environment variables from .env (expects OPENAI_API_KEY)
load_dotenv()
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    # Fail fast if the API key is missing
    raise RuntimeError("Please set OPENAI_API_KEY in your .env")

# Initialize the OpenAI client with API key
client = OpenAI(api_key=api_key)

# Create a Flask application and enable CORS so the extension can call it
app = Flask(__name__)
CORS(app)

# Threshold above which we split the document into chunks
ONE_SHOT_THRESHOLD = 80000
# Maximum characters per chunk
MAX_CHARS = 15000

def chunk_text(text, max_chars=MAX_CHARS):
    """
    Splits the given text into chunks no longer than max_chars.
    We break on double-newline paragraphs to avoid cutting sentences abruptly.
    """
    paras = text.split("\n\n")
    chunks, current = [], ""
    for p in paras:
        # If adding this paragraph stays under the limit, append it
        if len(current) + len(p) + 2 <= max_chars:
            current = (current + "\n\n" + p) if current else p
        else:
            # Otherwise, save the current chunk and start a new one
            chunks.append(current)
            current = p
    if current:
        # Don't forget the final chunk
        chunks.append(current)
    return chunks

# The "system" prompt gives the model detailed instructions and definitions.
# Note how each category includes a brief description to guide the AI.
system_msg = {
    "role": "system",
    "content": """
You are ToSDigest, an assistant that analyzes a website’s Terms of Service and produces a 
privacy-focused dashboard in plain text (no JSON).

Divide your output into 6 categories with these icons:

  🔒 Personal Info  
    (description): Data that directly identifies the user, such as name, email address, phone 
    number, home or billing address, date of birth, and any other fields where the user has 
    provided personal details.

  🧠 Behavioral Data  
    (description): Information about how the user uses the site or services such as clicks, page 
    views, search queries, browsing history, device and location signals, app usage patterns, IP 
    address, device type, browser type, and any other information that can be used to track 
    user behavior.

  🤝 Third-Party Sharing  
    (description): Data shared with third parties, including advertisers, partners, or affiliates. 
    This includes any data that is sold, rented, or otherwise shared with external entities.

  ⏳ Data Retention  
    (description): How long the data is kept, including any retention policies or practices. This 
    includes indefinite retention, deletion policies, and any other relevant information about how 
    the data is stored.

  🤖 Profiling  
    (description): Automated decision-making or profiling based on user data. This includes any 
    algorithms, machine learning models, or other automated processes that use user data to make 
    decisions about the user.

  🔧 User Controls  
    (description): User controls over their data, including opt-out options, data access, deletion 
    requests, and any other relevant information about how users can manage their data.

**For each category**, output exactly one Summary View line, formatted as:

  [ICON] Category Title  •  [STATUS_SYMBOL]  micro-headline (10 words max)

Where STATUS_SYMBOL is ✓ (good), ⚠️ (warning) or ✗ (bad) depending on how they may affect 
the user and their privacy/rights. Prioritize information that could impact the user negatively, 
and write all descriptions in plain language without technical jargon.

Choose STATUS_SYMBOL based on risk level:
  ✓ (Good)   = minimal or essential data practices, e.g. only name & email, session cookies, 
                anonymized analytics  
  ⚠️ (Warning) = optional or borderline practices, e.g. sharing for marketing, payment details 
                storage, moderate profiling  
  ✗ (Bad)    = high-risk or unethical practices, e.g. selling data, indefinite retention, invasive 
                tracking, unexpected third-party sharing

IMPORTANT: Do not make assumptions about the ToS. Only use accurate information provided in the 
text.
"""
}

@app.route("/summarize", methods=["POST"])
def summarize():
    """
    Endpoint: /summarize
    Expects JSON { "text": "<full Terms of Service text>" }.
    Returns JSON { "summary": "<dashboard-style summary>" } or { "error": "<message>" }.
    """
    data = request.get_json() or {}
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text provided"}), 400

    # 1) If the document is under the threshold, do a single-shot request
    if len(text) <= ONE_SHOT_THRESHOLD:
        try:
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    system_msg,
                    {
                        "role": "user",
                        "content": (
                            f"Here is the full Terms of Service text:\n\n{text}\n\n"
                            "Generate the Summary View lines exactly as described."
                        )
                    }
                ],
                max_tokens=300,
                temperature=0.2,
            )
            # Return the AI’s response
            return jsonify({"summary": resp.choices[0].message.content.strip()})

        except Exception as e:
            # Handle rate limits vs other errors
            msg = str(e)
            code = 429 if "rate limit" in msg.lower() else 500
            return jsonify({"error": msg}), code

    # 2) Otherwise, split into chunks and summarize each
    chunks = chunk_text(text)
    chunk_summaries = []

    for idx, chunk in enumerate(chunks, start=1):
        prompt_user = {
            "role": "user",
            "content": (
                f"Chunk {idx}/{len(chunks)}:\n\n{chunk}\n\n"
                "Generate the Summary View lines exactly as described above."
            )
        }
        # Retry once on rate-limit errors
        for attempt in range(2):
            try:
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[system_msg, prompt_user],
                    max_tokens=300,
                    temperature=0.2,
                )
                chunk_summaries.append(resp.choices[0].message.content.strip())
                break

            except Exception as e:
                m = str(e)
                if "rate limit" in m.lower() and attempt == 0:
                    time.sleep(20)  # Wait and retry
                    continue
                code = 429 if "rate limit" in m.lower() else 500
                return jsonify({"error": m}), code

    # 3) Combine all chunk summaries into exactly six final lines
    combined = "\n\n".join(chunk_summaries)
    final_prompt = {
        "role": "user",
        "content": (
            "Below are the Summary View lines extracted from each chunk:\n\n"
            f"{combined}\n\n"
            "Now consolidate and dedupe these into exactly six Summary View lines—"
            "one per category—formatted exactly as:\n\n"
            "[ICON] Category Title  •  [STATUS_SYMBOL]  micro-headline (2–5 words)"
        )
    }
    try:
        final_resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[system_msg, final_prompt],
            max_tokens=300,
            temperature=0.2,
        )
        return jsonify({"summary": final_resp.choices[0].message.content.strip()})

    except Exception as e:
        # Return any unexpected errors as a 500
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Run the Flask app on http://localhost:5000 in debug mode
    app.run(debug=True)
