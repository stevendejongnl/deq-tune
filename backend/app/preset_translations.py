"""English names for the bundled presets' car models and speaker types.

The preset JSON only carries Japanese display text (`header.bankName`).
The Android app resolves the real, localized text at run time from
Android string resources, keyed by `header.carModelStringsKey` and by
speaker type. These tables copy the English values for that same key
set from the decompiled APK's `res/values/strings.xml` (the default,
English, locale)."""

from __future__ import annotations

MODEL_DISPLAY_NAMES: dict[str, str] = {
    "model_mazda_2": "Mazda2",
    "model_mazda_3": "Mazda3",
    "model_mazda_6": "Mazda6",
    "model_mazda_cx3": "CX-3",
    "model_mazda_cx5": "CX-5",
    "model_mazda_cx8": "CX-8",
    "model_mazda_mx5": "Mazda MX-5",
}

SPEAKER_TYPE_LABELS: dict[str, str] = {
    "general": "For Normal Speaker",
    "carrozzeria": "For Pioneer Speaker",
}


def english_bank_name(car_model_strings_key: str, speaker_type: str | None) -> str:
    model_name = MODEL_DISPLAY_NAMES.get(car_model_strings_key, car_model_strings_key)
    speaker_label = SPEAKER_TYPE_LABELS.get(speaker_type or "", speaker_type or "")
    return f"{model_name} — {speaker_label}"
