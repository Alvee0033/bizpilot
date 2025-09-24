from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
import io
import json
import numpy as np
from resemblyzer import VoiceEncoder, preprocess_wav
import soundfile as sf
from scipy.spatial.distance import cosine
import tempfile
import subprocess

# Lazy init encoder (loads on first request)
encoder = None

app = FastAPI(title="BizPilot Voice Auth")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
EMB_FILE = os.path.join(DATA_DIR, "embeddings.json")
os.makedirs(DATA_DIR, exist_ok=True)

def load_db():
    if not os.path.exists(EMB_FILE):
        return {}
    with open(EMB_FILE, "r") as f:
        try:
            return json.load(f)
        except Exception:
            return {}

def save_db(db):
    with open(EMB_FILE, "w") as f:
        json.dump(db, f)

def get_encoder():
    global encoder
    if encoder is None:
        encoder = VoiceEncoder()
    return encoder

def file_to_wav_array(upload: UploadFile) -> np.ndarray:
    data = upload.file.read()
    # Try direct decode (WAV/FLAC supported by soundfile)
    try:
        wav, sr = sf.read(io.BytesIO(data))
    except Exception:
        # Fallback: use ffmpeg to convert (handles webm/ogg/mp3)
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f_in:
            f_in.write(data)
            in_path = f_in.name
        out_path = in_path + ".wav"
        cmd = [
            "ffmpeg", "-y", "-i", in_path,
            "-ac", "1", "-ar", "16000", out_path
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            wav, sr = sf.read(out_path)
        finally:
            try:
                os.remove(in_path)
            except Exception:
                pass
            try:
                os.remove(out_path)
            except Exception:
                pass
    if wav.ndim > 1:
        wav = np.mean(wav, axis=1)
    return wav.astype(np.float32)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/voice/enroll")
async def enroll(uid: str = Form(...), audio: UploadFile = File(...)):
    try:
        wav = file_to_wav_array(audio)
        wav_pre = preprocess_wav(wav)
        enc = get_encoder()
        emb = enc.embed_utterance(wav_pre)
        db = load_db()
        db[uid] = emb.tolist()
        save_db(db)
        return {"enrolled": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Enroll failed: {e}")

class VerifyResponse(BaseModel):
    match: bool
    score: float

@app.post("/api/voice/verify", response_model=VerifyResponse)
async def verify(uid: str = Form(...), audio: UploadFile = File(...), threshold: float = Form(0.7)):
    try:
        db = load_db()
        if uid not in db:
            raise HTTPException(status_code=404, detail="User not enrolled")
        wav = file_to_wav_array(audio)
        wav_pre = preprocess_wav(wav)
        enc = get_encoder()
        emb = enc.embed_utterance(wav_pre)
        enrolled_emb = np.array(db[uid], dtype=np.float32)
        sim = 1 - cosine(emb, enrolled_emb)
        match = bool(sim >= threshold)
        return VerifyResponse(match=match, score=float(sim))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verify failed: {e}")


