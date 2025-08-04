def process_data(raw):
    # Apply simple transformation
    return {
        "flexion": raw["flexion"],
        "valgus": raw["valgus"],
        "rotation": raw["rotation"],
        "timestamp": raw["timestamp"],
        "risk_score": int(abs(raw["valgus"]) > 7 or abs(raw["rotation"]) > 15)
    }