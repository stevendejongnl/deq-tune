from app.preset_translations import english_bank_name


def test_translates_known_model_and_speaker_type():
    assert english_bank_name("model_mazda_3", "general") == "Mazda3 — For Normal Speaker"
    assert english_bank_name("model_mazda_cx5", "carrozzeria") == "CX-5 — For Pioneer Speaker"


def test_falls_back_to_the_raw_key_for_an_unknown_model():
    assert english_bank_name("model_unknown", "general") == "model_unknown — For Normal Speaker"
