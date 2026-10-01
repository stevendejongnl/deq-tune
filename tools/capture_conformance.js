// Builds the conformance corpus by asking the Sound & Tune app itself.
//
// Every flow here is produced by the app's own code: `OpalParameter` for the
// DSP coefficients and `b/g/h` for the settings blob. That makes the Android
// app the oracle and deq-tune the thing under test, so the two cannot drift.
//
// Run:
//   frida -U -p <pid> -l capture_conformance.js -q -e 'setTimeout(function(){},1)'
//     | grep '^{' > conformance/flows.ndjson
//
// Each line is one flow as JSON. `tools/build-conformance.py` turns the lines
// into `conformance/flows.json`.
Java.perform(function () {
  const OpalParameter = Java.use("jp.pioneer.mle.pmg.util.OpalParameter");
  const Cutoff = Java.use("jp.pioneer.mle.pmg.util.OpalParameter$APP_FILTER_CUTOFF_FREQUENCY");
  const Slope = Java.use("jp.pioneer.mle.pmg.util.OpalParameter$APP_FILTER_SLOPE");
  const ByteArrayInputStream = Java.use("java.io.ByteArrayInputStream");
  const ByteWriter = Java.use("jp.pioneer.mle.soundtune.b.c.a");
  const UserConfiguration = Java.use("jp.pioneer.mle.soundtune.model.o");
  const ConfigurationCodec = Java.use("jp.pioneer.mle.soundtune.b.g.h");
  const SpeakerMode = Java.use("jp.pioneer.mle.soundtune.model.b.x");

  const CUTOFF_TYPE = "Ljp.pioneer.mle.pmg.util.OpalParameter$APP_FILTER_CUTOFF_FREQUENCY;";
  const SLOPE_TYPE = "Ljp.pioneer.mle.pmg.util.OpalParameter$APP_FILTER_SLOPE;";
  const builder = OpalParameter.$new();

  function toHex(buffer) {
    const out = [];
    for (let offset = 0; offset < buffer.capacity(); offset++) {
      out.push(("0" + (buffer.get(offset) & 0xff).toString(16)).slice(-2));
    }
    return out.join("");
  }

  function bytesToHex(javaBytes) {
    const out = [];
    for (let index = 0; index < javaBytes.length; index++) {
      out.push(("0" + (javaBytes[index] & 0xff).toString(16)).slice(-2));
    }
    return out.join("");
  }

  function emit(flow) {
    console.log(JSON.stringify(flow));
  }

  // --- equalizer -----------------------------------------------------------
  // CONFIG_ID 13 carries two blocks: the curve with the cancelling equalizer
  // applied, then the plain curve. Each block is one Make13BandEQ call.
  function equalizerFlow(name, cancelledGainsDb, plainGainsDb) {
    const first = builder.Make13BandEQ(Java.array("float", cancelledGainsDb));
    const second = builder.Make13BandEQ(Java.array("float", plainGainsDb));
    emit({
      name: name,
      kind: "equalizer",
      oracle: "android-library",
      input: { cancelledGainsDb: cancelledGainsDb, plainGainsDb: plainGainsDb },
      bytesHex: toHex(first.data.value) + toHex(second.data.value),
    });
  }

  // --- crossover -----------------------------------------------------------
  // The app sorts the library's blocks by their config id before it
  // concatenates them, which is what puts the subwoofer before the mid on the
  // wire. Reproduce that here.
  function crossoverFlow(name, maker, slots) {
    const cutoffs = slots.map(function (slot) { return Cutoff.valueOf(slot.cutoff); });
    const slopes = slots.map(function (slot) { return Slope.valueOf(slot.slope); });
    const result = builder[maker](
      false, Java.array(CUTOFF_TYPE, cutoffs), Java.array(SLOPE_TYPE, slopes));
    const blocks = [];
    for (let index = 0; index < result.length; index++) {
      blocks.push({ configID: result[index].configID.value, hex: toHex(result[index].data.value) });
    }
    blocks.sort(function (left, right) { return left.configID - right.configID; });
    emit({
      name: name,
      kind: "crossover",
      oracle: "android-library",
      input: { maker: maker, slots: slots },
      bytesHex: blocks.map(function (block) { return block.hex; }).join(""),
    });
  }

  // --- time alignment ------------------------------------------------------
  function timeAlignmentFlow(name, distancesMm) {
    const sendData = builder.MakeTimeAlignment(Java.array("int", distancesMm));
    emit({
      name: name,
      kind: "timeAlignment",
      oracle: "android-library",
      input: { distancesMm: distancesMm },
      bytesHex: toHex(sendData.data.value),
    });
  }

  // --- settings blob -------------------------------------------------------
  // The input is bytes rather than a field list, because building the app's
  // model through its own setters needs far more of its internals than a
  // reader does. Reading the bytes and writing them back is the stronger
  // check anyway: it proves the app agrees with every field at once.
  function blobFlow(name, candidateHex) {
    const bytes = [];
    for (let index = 0; index < candidateHex.length; index += 2) {
      let value = parseInt(candidateHex.substr(index, 2), 16);
      if (value > 127) value -= 256;
      bytes.push(value);
    }
    const configuration = UserConfiguration.$new();
    ConfigurationCodec.values()[0].a(
      ByteArrayInputStream.$new(Java.array("byte", bytes)), configuration);
    const writer = ByteWriter.$new();
    ConfigurationCodec.b.overload(
      "jp.pioneer.mle.soundtune.b.c.a",
      "jp.pioneer.mle.soundtune.model.o"
    ).call(ConfigurationCodec, writer, configuration);
    const rewritten = bytesToHex(writer.b());
    emit({
      name: name,
      kind: "blob",
      oracle: "android-codec",
      input: { bytesHex: candidateHex },
      bytesHex: rewritten,
      appAgrees: rewritten === candidateHex,
    });
  }

  function defaultBlobHex() {
    const configuration = UserConfiguration.$new();
    configuration.b().a(SpeakerMode.valueOf("STANDARD_FL_FR_RL_RR_SW"));
    const writer = ByteWriter.$new();
    ConfigurationCodec.b.overload(
      "jp.pioneer.mle.soundtune.b.c.a",
      "jp.pioneer.mle.soundtune.model.o"
    ).call(ConfigurationCodec, writer, configuration);
    return bytesToHex(writer.b());
  }

  const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  equalizerFlow("equalizer-flat", FLAT, FLAT);
  equalizerFlow("equalizer-bass-boost",
    [6, 4.5, 3, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [6, 4.5, 3, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  equalizerFlow("equalizer-cuts-and-boosts",
    [-12, -9, -6, -3, -1, 0, 1, 3, 6, 9, 12, -4.5, 7.5],
    [0, 0, 0, 0, 0, 0, 2.2, 2.2, 0, 0, 0, 0, 0.71]);
  equalizerFlow("equalizer-cancelling-differs",
    [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -3]);

  const PASS_SLOT = { cutoff: "FREQUENCY_25HZ", slope: "SLOPE_PASS" };
  function slots(overrides) {
    const all = [PASS_SLOT, PASS_SLOT, PASS_SLOT, PASS_SLOT, PASS_SLOT];
    for (const index of Object.keys(overrides)) {
      all[Number(index)] = overrides[index];
    }
    return all;
  }

  crossoverFlow("crossover-standard-all-pass", "MakeSpeakerFilterStandardMode", slots({}));
  crossoverFlow("crossover-standard-front-100-12", "MakeSpeakerFilterStandardMode",
    slots({ 0: { cutoff: "FREQUENCY_100HZ", slope: "SLOPE_12DB" } }));
  crossoverFlow("crossover-standard-full", "MakeSpeakerFilterStandardMode",
    slots({
      0: { cutoff: "FREQUENCY_80HZ", slope: "SLOPE_24DB" },
      1: { cutoff: "FREQUENCY_125HZ", slope: "SLOPE_18DB" },
      4: { cutoff: "FREQUENCY_63HZ", slope: "SLOPE_12DB" },
    }));
  crossoverFlow("crossover-standard-rear-mode", "MakeSpeakerFilterStandardRearMode",
    slots({
      0: { cutoff: "FREQUENCY_100HZ", slope: "SLOPE_6DB" },
      4: { cutoff: "FREQUENCY_50HZ", slope: "SLOPE_24DB" },
    }));
  crossoverFlow("crossover-network-all-pass", "MakeSpeakerFilterNetworkMode", slots({}));
  crossoverFlow("crossover-network-full", "MakeSpeakerFilterNetworkMode",
    slots({
      0: { cutoff: "FREQUENCY_2KHZ", slope: "SLOPE_12DB" },
      1: { cutoff: "FREQUENCY_100HZ", slope: "SLOPE_12DB" },
      2: { cutoff: "FREQUENCY_2KHZ", slope: "SLOPE_12DB" },
      3: { cutoff: "FREQUENCY_2KHZ", slope: "SLOPE_12DB" },
      4: { cutoff: "FREQUENCY_63HZ", slope: "SLOPE_24DB" },
    }));

  crossoverFlow("crossover-network-steep-mid", "MakeSpeakerFilterNetworkMode",
    slots({
      0: { cutoff: "FREQUENCY_2KHZ", slope: "SLOPE_24DB" },
      2: { cutoff: "FREQUENCY_2_5KHZ", slope: "SLOPE_24DB" },
      3: { cutoff: "FREQUENCY_3_15KHZ", slope: "SLOPE_18DB" },
    }));

  timeAlignmentFlow("time-alignment-zero", [0, 0, 0, 0, 0]);
  timeAlignmentFlow("time-alignment-stepped", [100, 200, 300, 400, 500]);
  timeAlignmentFlow("time-alignment-driver-seat", [1250, 1400, 1800, 1900, 2100]);
  timeAlignmentFlow("time-alignment-one-near", [500, 0, 0, 0, 0]);

  blobFlow("blob-default", defaultBlobHex());
  if (typeof CANDIDATE_BLOB_HEX === "string") {
    blobFlow("blob-edited", CANDIDATE_BLOB_HEX);
  }
});
