#!/usr/bin/env python3
"""
Real (non-mocked) inference + evaluation of xavriley/midi-transcription-models'
guitar checkpoints (guitar-gaps.pth by default, guitar-fl.pth optionally)
against the same 12-track deterministic GuitarSet v1.1 subset used for the
Basic Pitch evaluation (see ../scripts/select-subset.mjs /
../data/selected-subset.json), reusing the same cached audio/annotations
under ../.cache/.

Ground truth is parsed directly from the real .jams files (same format the
Node harness uses) so both models are scored with an identical methodology.
Onset F1@50ms / onset+offset F1 / FP / FN are computed here in Python
(mirroring ../scripts/metrics.mjs's greedy nearest-onset matching) rather
than round-tripping through Node, to keep this script self-contained and
runnable independent of the npm install.

Usage:
    source .venv/bin/activate
    HF_HOME=$(cd .. && pwd)/.cache/huggingface python run_gaps_eval.py \
        --instrument guitar_gaps --revision 689e773723bcafd8c81015b10c03f12675ce16ec
"""
import argparse
import json
import resource
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # tools/guitar-model-spike/
ONSET_TOL_SEC = 0.05
OFFSET_TOL_MIN_SEC = 0.05
OFFSET_TOL_RATIO = 0.2


def parse_ground_truth_notes(jams_path: Path):
    doc = json.loads(jams_path.read_text())
    notes = []
    for ann in doc["annotations"]:
        if ann["namespace"] != "note_midi":
            continue
        for ev in ann["data"]:
            if ev.get("value") is None or ev.get("time") is None or ev.get("duration") is None:
                continue
            notes.append(
                {
                    "onsetSec": ev["time"],
                    "offsetSec": ev["time"] + ev["duration"],
                    "midi": round(ev["value"]),
                }
            )
    notes.sort(key=lambda n: n["onsetSec"])
    return notes


def greedy_match(gt_notes, pred_notes, is_match):
    candidates = []
    for i, gt in enumerate(gt_notes):
        for j, pred in enumerate(pred_notes):
            if is_match(gt, pred):
                candidates.append((abs(gt["onsetSec"] - pred["onsetSec"]), i, j))
    candidates.sort(key=lambda c: c[0])
    gt_used = [False] * len(gt_notes)
    pred_used = [False] * len(pred_notes)
    matched = 0
    for _, i, j in candidates:
        if gt_used[i] or pred_used[j]:
            continue
        gt_used[i] = True
        pred_used[j] = True
        matched += 1
    return matched


def prf(matched, gt_count, pred_count):
    precision = matched / pred_count if pred_count else 0.0
    recall = matched / gt_count if gt_count else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return precision, recall, f1


def evaluate_notes(gt_notes, pred_notes):
    onset_only_matched = greedy_match(
        gt_notes,
        pred_notes,
        lambda gt, pred: gt["midi"] == pred["midi"]
        and abs(gt["onsetSec"] - pred["onsetSec"]) <= ONSET_TOL_SEC,
    )

    def onset_offset_match(gt, pred):
        if gt["midi"] != pred["midi"]:
            return False
        if abs(gt["onsetSec"] - pred["onsetSec"]) > ONSET_TOL_SEC:
            return False
        tol = max(OFFSET_TOL_MIN_SEC, OFFSET_TOL_RATIO * (gt["offsetSec"] - gt["onsetSec"]))
        return abs(gt["offsetSec"] - pred["offsetSec"]) <= tol

    onset_offset_matched = greedy_match(gt_notes, pred_notes, onset_offset_match)

    p1, r1, f1_1 = prf(onset_only_matched, len(gt_notes), len(pred_notes))
    p2, r2, f1_2 = prf(onset_offset_matched, len(gt_notes), len(pred_notes))

    return {
        "groundTruthNoteCount": len(gt_notes),
        "predictedNoteCount": len(pred_notes),
        "onsetOnly": {
            "precision": p1,
            "recall": r1,
            "f1": f1_1,
            "truePositives": onset_only_matched,
            "falsePositives": len(pred_notes) - onset_only_matched,
            "falseNegatives": len(gt_notes) - onset_only_matched,
        },
        "onsetAndOffset": {
            "precision": p2,
            "recall": r2,
            "f1": f1_2,
            "truePositives": onset_offset_matched,
            "falsePositives": len(pred_notes) - onset_offset_matched,
            "falseNegatives": len(gt_notes) - onset_offset_matched,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--instrument", default="guitar_gaps", choices=["guitar_gaps", "guitar_fl"])
    ap.add_argument(
        "--revision",
        default="689e773723bcafd8c81015b10c03f12675ce16ec",
        help="pinned xavriley/midi-transcription-models commit",
    )
    args = ap.parse_args()

    from hf_midi_transcription import MidiTranscriptionModel

    # NOTE: deliberately using the plain constructor, not
    # MidiTranscriptionModel.from_pretrained(...). from_pretrained() goes
    # through PyTorchModelHubMixin, which (a) hit a real version-skew bug
    # against huggingface-hub>=1.0 in this spike (see docs report) and (b)
    # does a full *repo snapshot* download (~700MB, every instrument's
    # checkpoint) instead of just the one file needed. The plain
    # constructor's internal _download_model_if_needed() calls
    # hf_hub_download() for exactly one file, which is what a real
    # integration should do too.
    t0 = time.time()
    model = MidiTranscriptionModel(instrument=args.instrument)
    model_load_s = time.time() - t0
    print(f"model load: {model_load_s:.2f}s", flush=True)

    subset = json.loads((ROOT / "data" / "selected-subset.json").read_text())
    per_track = []
    tmp_midi = ROOT / "python" / "_tmp_pred.mid"

    for t in subset["tracks"]:
        track_id = t["trackId"]
        wav_path = ROOT / ".cache" / "audio" / f"{track_id}_mic.wav"
        jams_path = ROOT / ".cache" / "annotations" / f"{track_id}.jams"
        if not wav_path.exists() or not jams_path.exists():
            per_track.append({"trackId": track_id, "status": "UNVERIFIED_MISSING_INPUT"})
            print(f"SKIP {track_id}: missing cached input", flush=True)
            continue

        gt_notes = parse_ground_truth_notes(jams_path)

        import soundfile as sf

        info = sf.info(str(wav_path))
        audio_duration_sec = info.frames / info.samplerate

        t0 = time.time()
        _, result = model.transcribe(str(wav_path), str(tmp_midi), activations=True)
        inference_s = time.time() - t0

        pred_notes = [
            {
                "onsetSec": ev["onset_time"],
                "offsetSec": ev["offset_time"],
                "midi": ev["midi_note"],
            }
            for ev in result["est_note_events"]
        ]

        metrics = evaluate_notes(gt_notes, pred_notes)
        rtf = inference_s / audio_duration_sec

        per_track.append(
            {
                "trackId": track_id,
                "player": t["player"],
                "part": t["part"],
                "status": "MEASURED",
                "audioDurationSec": audio_duration_sec,
                "inferenceSec": inference_s,
                "realTimeFactor": rtf,
                "predictedNoteCount": len(pred_notes),
                "groundTruthNoteCount": len(gt_notes),
                "metrics": metrics,
            }
        )
        print(
            f"MEASURED {track_id}: RTF={rtf:.3f} "
            f"onsetF1={metrics['onsetOnly']['f1']:.3f} "
            f"onsetOffsetF1={metrics['onsetAndOffset']['f1']:.3f} "
            f"(gt={len(gt_notes)} pred={len(pred_notes)})",
            flush=True,
        )

    if tmp_midi.exists():
        tmp_midi.unlink()

    measured = [r for r in per_track if r["status"] == "MEASURED"]
    peak_rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # bytes->KB on macOS

    summary = (
        {
            "tracksMeasured": len(measured),
            "tracksTotal": len(per_track),
            "meanOnsetF1": sum(r["metrics"]["onsetOnly"]["f1"] for r in measured) / len(measured),
            "meanOnsetOffsetF1": sum(r["metrics"]["onsetAndOffset"]["f1"] for r in measured)
            / len(measured),
            "meanRealTimeFactor": sum(r["realTimeFactor"] for r in measured) / len(measured),
            "totalFalsePositives": sum(
                r["metrics"]["onsetOnly"]["falsePositives"] for r in measured
            ),
            "totalFalseNegatives": sum(
                r["metrics"]["onsetOnly"]["falseNegatives"] for r in measured
            ),
        }
        if measured
        else {"tracksMeasured": 0, "tracksTotal": len(per_track)}
    )

    out = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "instrument": args.instrument,
        "revision": args.revision,
        "modelLoadSec": model_load_s,
        "peakRssKb": peak_rss_kb,
        "summary": summary,
        "perTrack": per_track,
    }

    out_path = ROOT / "results" / f"results.gaps-{args.instrument}.json"
    out_path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\nWrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
