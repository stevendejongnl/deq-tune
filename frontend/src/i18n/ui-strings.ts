import type { Locale } from "./locale.ts";

export interface UiStrings {
  factoryPresets: string;
  myProfiles: string;
  duplicate: string;
  delete: string;
  duplicateHint: string;
  selectProfilePrompt: string;
  readOnlyHint: string;
  speakers: string;
  speakerColumn: string;
  levelColumn: string;
  timeAlignmentColumn: string;
  phaseColumn: string;
  speakerFrontLeft: string;
  speakerFrontRight: string;
  speakerRearLeft: string;
  speakerRearRight: string;
  connectDevice: string;
  connecting: string;
  usbUnsupported: string;
  connectHint: string;
  couldNotConnect: string;
  languageLabel: string;
  eqStyleTitle: string;
  liveSimulationTitle: string;
  applauseLabel: string;
  dspDeviceHint: string;
  profilesButton: string;
  closeLabel: string;
  tabEq: string;
  tabStyle: string;
  frequencyResponseTitle: string;
  legendYours: string;
  legendFactory: string;
  zoneNames: readonly string[];
  zoneHints: readonly string[];
  factoryValuePrefix: string;
  resetBand: string;
  gainSliderLabel: string;
  lowerGainLabel: string;
  raiseGainLabel: string;
}

const EN: UiStrings = {
  factoryPresets: "Factory presets",
  myProfiles: "My profiles",
  duplicate: "Duplicate",
  delete: "Delete",
  duplicateHint: "Duplicate a factory preset to start your own.",
  selectProfilePrompt: "Select a profile to see and edit its EQ.",
  readOnlyHint: "Factory preset — duplicate it in the list to edit.",
  speakers: "Speakers",
  speakerColumn: "Speaker",
  levelColumn: "Level (dB)",
  timeAlignmentColumn: "Time alignment (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Front Left",
  speakerFrontRight: "Front Right",
  speakerRearLeft: "Rear Left",
  speakerRearRight: "Rear Right",
  connectDevice: "Connect DEQ device",
  connecting: "Connecting…",
  usbUnsupported: "USB connect needs Chrome or Edge",
  connectHint: "Pairing only for now — reading/writing EQ over USB isn't implemented yet.",
  couldNotConnect: "Could not connect to device",
  languageLabel: "Language",
  eqStyleTitle: "EQ Style",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applause",
  dspDeviceHint: "Takes effect once a DEQ device is connected.",
  profilesButton: "Profiles",
  closeLabel: "Close",
  tabEq: "EQ",
  tabStyle: "Style",
  frequencyResponseTitle: "Frequency response",
  legendYours: "Yours",
  legendFactory: "Factory",
  zoneNames: ["Sub-bass", "Bass", "Low mids", "Mids", "Presence", "Air"],
  zoneHints: [
    "Felt more than heard: rumble and the weight of a kick drum.",
    "Body and punch of bass lines. Too much turns muddy.",
    "Warmth. Too much sounds boomy or boxy in a small cabin.",
    "Where vocals and most instruments live.",
    "Clarity and attack. Too much gets harsh on long drives.",
    "Cymbals, detail and sense of space.",
  ],
  factoryValuePrefix: "factory",
  resetBand: "Reset band",
  gainSliderLabel: "Gain for selected band",
  lowerGainLabel: "Lower by 0.5 dB",
  raiseGainLabel: "Raise by 0.5 dB",
};

const JA: UiStrings = {
  factoryPresets: "純正プリセット",
  myProfiles: "マイプロファイル",
  duplicate: "複製",
  delete: "削除",
  duplicateHint: "純正プリセットを複製して自分用に編集できます。",
  selectProfilePrompt: "プロファイルを選ぶとEQを編集できます。",
  readOnlyHint: "純正プリセットは編集できません。複製してください。",
  speakers: "スピーカー",
  speakerColumn: "スピーカー",
  levelColumn: "レベル (dB)",
  timeAlignmentColumn: "タイムアライメント (cm)",
  phaseColumn: "位相",
  speakerFrontLeft: "フロント左",
  speakerFrontRight: "フロント右",
  speakerRearLeft: "リア左",
  speakerRearRight: "リア右",
  connectDevice: "DEQデバイスに接続",
  connecting: "接続中…",
  usbUnsupported: "USB接続にはChromeまたはEdgeが必要です",
  connectHint: "現在はペアリングのみ対応です。USB経由のEQ読み書きは未実装です。",
  couldNotConnect: "デバイスに接続できませんでした",
  languageLabel: "言語",
  eqStyleTitle: "EQスタイル",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "拍手・歓声",
  dspDeviceHint: "DEQデバイス接続後に反映されます。",
  profilesButton: "プロファイル",
  closeLabel: "閉じる",
  tabEq: "EQ",
  tabStyle: "スタイル",
  frequencyResponseTitle: "周波数特性",
  legendYours: "あなたの設定",
  legendFactory: "純正",
  zoneNames: ["超低音", "低音", "中低音", "中音", "存在感", "高音"],
  zoneHints: [
    "聞こえるというより感じる音。地鳴りやキックドラムの重さ。",
    "ベースラインの厚みと締まり。上げすぎると濁ります。",
    "温かみ。上げすぎると車内でこもった音になります。",
    "ボーカルと多くの楽器がある帯域。",
    "明瞭さと立ち上がり。上げすぎると長時間の運転で耳が疲れます。",
    "シンバル、細部、空間の広がり。",
  ],
  factoryValuePrefix: "純正",
  resetBand: "バンドをリセット",
  gainSliderLabel: "選択したバンドのゲイン",
  lowerGainLabel: "0.5 dB下げる",
  raiseGainLabel: "0.5 dB上げる",
};

const DE: UiStrings = {
  factoryPresets: "Werkspresets",
  myProfiles: "Meine Profile",
  duplicate: "Duplizieren",
  delete: "Löschen",
  duplicateHint: "Dupliziere ein Werkspreset, um ein eigenes zu erstellen.",
  selectProfilePrompt: "Wähle ein Profil aus, um dessen EQ zu bearbeiten.",
  readOnlyHint: "Werkspreset — zum Bearbeiten in der Liste duplizieren.",
  speakers: "Lautsprecher",
  speakerColumn: "Lautsprecher",
  levelColumn: "Pegel (dB)",
  timeAlignmentColumn: "Zeitausrichtung (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Vorne links",
  speakerFrontRight: "Vorne rechts",
  speakerRearLeft: "Hinten links",
  speakerRearRight: "Hinten rechts",
  connectDevice: "DEQ-Gerät verbinden",
  connecting: "Verbindung wird hergestellt…",
  usbUnsupported: "USB-Verbindung benötigt Chrome oder Edge",
  connectHint: "Derzeit nur Kopplung — EQ per USB lesen/schreiben ist noch nicht implementiert.",
  couldNotConnect: "Verbindung zum Gerät fehlgeschlagen",
  languageLabel: "Sprache",
  eqStyleTitle: "EQ-Stil",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Beifall",
  dspDeviceHint: "Wird erst nach Verbindung mit einem DEQ-Gerät wirksam.",
  profilesButton: "Profile",
  closeLabel: "Schließen",
  tabEq: "EQ",
  tabStyle: "Stil",
  frequencyResponseTitle: "Frequenzgang",
  legendYours: "Deine",
  legendFactory: "Werk",
  zoneNames: ["Subbass", "Bass", "Untere Mitten", "Mitten", "Präsenz", "Luft"],
  zoneHints: [
    "Mehr gefühlt als gehört: Grollen und das Gewicht einer Bassdrum.",
    "Körper und Druck von Basslinien. Zu viel klingt matschig.",
    "Wärme. Zu viel klingt dröhnend oder kastig im kleinen Innenraum.",
    "Hier liegen Gesang und die meisten Instrumente.",
    "Klarheit und Attack. Zu viel wird auf langen Fahrten hart.",
    "Becken, Details und Raumgefühl.",
  ],
  factoryValuePrefix: "Werk",
  resetBand: "Band zurücksetzen",
  gainSliderLabel: "Pegel des gewählten Bands",
  lowerGainLabel: "Um 0,5 dB senken",
  raiseGainLabel: "Um 0,5 dB anheben",
};

const FR: UiStrings = {
  factoryPresets: "Préréglages d'usine",
  myProfiles: "Mes profils",
  duplicate: "Dupliquer",
  delete: "Supprimer",
  duplicateHint: "Dupliquez un préréglage d'usine pour créer le vôtre.",
  selectProfilePrompt: "Sélectionnez un profil pour modifier son EQ.",
  readOnlyHint: "Préréglage d'usine — dupliquez-le dans la liste pour l'éditer.",
  speakers: "Haut-parleurs",
  speakerColumn: "Haut-parleur",
  levelColumn: "Niveau (dB)",
  timeAlignmentColumn: "Alignement temporel (cm)",
  phaseColumn: "Phase",
  speakerFrontLeft: "Avant gauche",
  speakerFrontRight: "Avant droit",
  speakerRearLeft: "Arrière gauche",
  speakerRearRight: "Arrière droit",
  connectDevice: "Connecter le DEQ",
  connecting: "Connexion…",
  usbUnsupported: "La connexion USB nécessite Chrome ou Edge",
  connectHint:
    "Appairage seulement pour l'instant — lecture/écriture de l'EQ via USB pas encore implémentée.",
  couldNotConnect: "Impossible de se connecter à l'appareil",
  languageLabel: "Langue",
  eqStyleTitle: "Style EQ",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applaudissements",
  dspDeviceHint: "Prend effet une fois un appareil DEQ connecté.",
  profilesButton: "Profils",
  closeLabel: "Fermer",
  tabEq: "EQ",
  tabStyle: "Style",
  frequencyResponseTitle: "Réponse en fréquence",
  legendYours: "Vous",
  legendFactory: "Usine",
  zoneNames: ["Infra-basses", "Basses", "Bas médiums", "Médiums", "Présence", "Air"],
  zoneHints: [
    "Plus ressenti qu'entendu : le grondement et le poids d'une grosse caisse.",
    "Corps et punch des lignes de basse. Trop rend le son boueux.",
    "Chaleur. Trop sonne caverneux dans un petit habitacle.",
    "Là où vivent les voix et la plupart des instruments.",
    "Clarté et attaque. Trop devient agressif sur les longs trajets.",
    "Cymbales, détail et sensation d'espace.",
  ],
  factoryValuePrefix: "usine",
  resetBand: "Réinitialiser la bande",
  gainSliderLabel: "Gain de la bande sélectionnée",
  lowerGainLabel: "Baisser de 0,5 dB",
  raiseGainLabel: "Monter de 0,5 dB",
};

const ES: UiStrings = {
  factoryPresets: "Preajustes de fábrica",
  myProfiles: "Mis perfiles",
  duplicate: "Duplicar",
  delete: "Eliminar",
  duplicateHint: "Duplica un preajuste de fábrica para crear el tuyo.",
  selectProfilePrompt: "Selecciona un perfil para editar su EQ.",
  readOnlyHint: "Preajuste de fábrica — duplícalo en la lista para editarlo.",
  speakers: "Altavoces",
  speakerColumn: "Altavoz",
  levelColumn: "Nivel (dB)",
  timeAlignmentColumn: "Alineación temporal (cm)",
  phaseColumn: "Fase",
  speakerFrontLeft: "Frontal izquierdo",
  speakerFrontRight: "Frontal derecho",
  speakerRearLeft: "Trasero izquierdo",
  speakerRearRight: "Trasero derecho",
  connectDevice: "Conectar DEQ",
  connecting: "Conectando…",
  usbUnsupported: "La conexión USB necesita Chrome o Edge",
  connectHint:
    "Por ahora solo emparejamiento — leer/escribir el EQ por USB aún no está implementado.",
  couldNotConnect: "No se pudo conectar con el dispositivo",
  languageLabel: "Idioma",
  eqStyleTitle: "Estilo de EQ",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Aplausos",
  dspDeviceHint: "Se aplica al conectar un dispositivo DEQ.",
  profilesButton: "Perfiles",
  closeLabel: "Cerrar",
  tabEq: "EQ",
  tabStyle: "Estilo",
  frequencyResponseTitle: "Respuesta en frecuencia",
  legendYours: "Tuya",
  legendFactory: "Fábrica",
  zoneNames: ["Subgraves", "Graves", "Medios bajos", "Medios", "Presencia", "Aire"],
  zoneHints: [
    "Más sentido que oído: retumbe y el peso del bombo.",
    "Cuerpo y pegada de las líneas de bajo. Demasiado suena turbio.",
    "Calidez. Demasiado suena retumbante en un habitáculo pequeño.",
    "Donde viven las voces y la mayoría de los instrumentos.",
    "Claridad y ataque. Demasiado se vuelve áspero en viajes largos.",
    "Platos, detalle y sensación de espacio.",
  ],
  factoryValuePrefix: "fábrica",
  resetBand: "Restablecer banda",
  gainSliderLabel: "Ganancia de la banda seleccionada",
  lowerGainLabel: "Bajar 0,5 dB",
  raiseGainLabel: "Subir 0,5 dB",
};

const NL: UiStrings = {
  factoryPresets: "Fabriekspresets",
  myProfiles: "Mijn profielen",
  duplicate: "Dupliceren",
  delete: "Verwijderen",
  duplicateHint: "Dupliceer een fabriekspreset om je eigen profiel te maken.",
  selectProfilePrompt: "Kies een profiel om de EQ ervan te bewerken.",
  readOnlyHint: "Fabriekspreset — dupliceer deze in de lijst om te bewerken.",
  speakers: "Luidsprekers",
  speakerColumn: "Luidspreker",
  levelColumn: "Niveau (dB)",
  timeAlignmentColumn: "Tijdsuitlijning (cm)",
  phaseColumn: "Fase",
  speakerFrontLeft: "Voor links",
  speakerFrontRight: "Voor rechts",
  speakerRearLeft: "Achter links",
  speakerRearRight: "Achter rechts",
  connectDevice: "DEQ-apparaat verbinden",
  connecting: "Verbinden…",
  usbUnsupported: "USB-verbinding vereist Chrome of Edge",
  connectHint: "Voorlopig alleen koppelen — EQ lezen/schrijven via USB is nog niet geïmplementeerd.",
  couldNotConnect: "Kan geen verbinding maken met het apparaat",
  languageLabel: "Taal",
  eqStyleTitle: "EQ-stijl",
  liveSimulationTitle: "Live Simulation",
  applauseLabel: "Applaus",
  dspDeviceHint: "Wordt actief zodra een DEQ-apparaat is verbonden.",
  profilesButton: "Profielen",
  closeLabel: "Sluiten",
  tabEq: "EQ",
  tabStyle: "Stijl",
  frequencyResponseTitle: "Frequentiebereik",
  legendYours: "Die van jou",
  legendFactory: "Fabriek",
  zoneNames: ["Sublaag", "Laag", "Laag midden", "Midden", "Presence", "Lucht"],
  zoneHints: [
    "Meer gevoeld dan gehoord: gerommel en het gewicht van een kickdrum.",
    "Body en punch van baslijnen. Te veel wordt modderig.",
    "Warmte. Te veel klinkt dreunend of hol in een kleine cabine.",
    "Hier zitten zang en de meeste instrumenten.",
    "Helderheid en aanzet. Te veel wordt scherp op lange ritten.",
    "Bekkens, detail en ruimtegevoel.",
  ],
  factoryValuePrefix: "fabriek",
  resetBand: "Band herstellen",
  gainSliderLabel: "Versterking van de gekozen band",
  lowerGainLabel: "0,5 dB omlaag",
  raiseGainLabel: "0,5 dB omhoog",
};

const UI_STRINGS: Record<Locale, UiStrings> = { en: EN, ja: JA, de: DE, fr: FR, es: ES, nl: NL };

export function uiStrings(locale: Locale): UiStrings {
  return UI_STRINGS[locale];
}
