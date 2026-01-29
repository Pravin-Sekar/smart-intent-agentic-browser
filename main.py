from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import numpy as np
import faiss
import hashlib
import os
from sentence_transformers import SentenceTransformer
from pypdf import PdfReader

app = Flask(__name__)
CORS(app)

# -----------------------------
# Load embedding model
# -----------------------------
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# -----------------------------
# In-memory cache
# page_hash -> (chunks, faiss_index)
# -----------------------------
page_cache = {}

# -----------------------------
# Ollama LLM call
# -----------------------------
def ask_ollama(prompt):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3.2:1b",
            "prompt": prompt,
            "stream": False
        },
        timeout=300
    )
    return response.json()["response"]

# -----------------------------
# Chunk text
# -----------------------------
def chunk_text(text, chunk_size=400):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i + chunk_size]))
    return chunks

# -----------------------------
# Build FAISS index
# -----------------------------
def build_faiss(chunks):
    embeddings = embedder.encode(chunks, show_progress_bar=False)
    embeddings = np.array(embeddings).astype("float32")

    index = faiss.IndexFlatL2(embeddings.shape[1])
    index.add(embeddings)
    return index

# -----------------------------
# Retrieve chunks
# -----------------------------
def retrieve_chunks(query, chunks, index, top_k=3):
    query_embedding = embedder.encode([query]).astype("float32")
    _, indices = index.search(query_embedding, top_k)
    return [chunks[i] for i in indices[0]]

# -----------------------------
# PDF text extraction
# -----------------------------
def extract_pdf_text(file_path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text

# -----------------------------
# Home
# -----------------------------
@app.route("/")
def home():
    return "AI backend running with RAG (Web + PDF) + Ollama"

# -----------------------------
# ASK WEBPAGE (RAG)
# -----------------------------
@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(force=True)

    question = data.get("question", "")
    page_content = data.get("page_content", "")
    action = data.get("action", "summarize")

    if not question or not page_content:
        return jsonify({"answer": "No question or page content received"})

    page_hash = hashlib.md5(page_content.encode("utf-8")).hexdigest()

    if page_hash in page_cache:
        chunks, index = page_cache[page_hash]
    else:
        chunks = chunk_text(page_content)
        index = build_faiss(chunks)
        page_cache[page_hash] = (chunks, index)

    relevant_chunks = retrieve_chunks(question, chunks, index)
    context = "\n\n".join(relevant_chunks)

    if action == "summarize":
        instruction = (
            "Summarize the content below in 5 clear bullet points. "
            "Keep it short and easy to understand."
        )
    elif action == "explain":
        instruction = (
            "Explain the content below in very simple words. "
            "Use an example if possible."
        )
    else:
        instruction = "Answer the question using the content below."

    prompt = f"""
You are an AI Agentic Browser Assistant.
{instruction}

Context:
{context}

Question:
{question}
"""

    answer = ask_ollama(prompt)
    return jsonify({"answer": answer})

# -----------------------------
# ASK PDF (RAG)
# -----------------------------
@app.route("/ask_pdf", methods=["POST"])
def ask_pdf():
    file = request.files.get("file")
    action = request.form.get("action", "summarize")

    if not file:
        return jsonify({"answer": "No PDF uploaded"})

    file_path = "temp.pdf"
    file.save(file_path)

    pdf_text = extract_pdf_text(file_path)
    os.remove(file_path)

    if not pdf_text.strip():
        return jsonify({"answer": "Could not read text from PDF"})

    chunks = chunk_text(pdf_text)
    index = build_faiss(chunks)

    relevant_chunks = retrieve_chunks("pdf content", chunks, index)
    context = "\n\n".join(relevant_chunks)

    if action == "summarize":
        instruction = "Summarize this PDF in 5 clear bullet points."
    else:
        instruction = "Explain this PDF in simple words with an example."

    prompt = f"""
You are an AI Agentic Browser Assistant.
{instruction}

Context:
{context}
"""

    answer = ask_ollama(prompt)
    return jsonify({"answer": answer})

# -----------------------------
if __name__ == "__main__":
    app.run(debug=True)
